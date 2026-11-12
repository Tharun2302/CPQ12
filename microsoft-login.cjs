'use strict';

// Kept out of server.cjs so the Microsoft sign-in rules are testable without a database or Microsoft.
// Graph, the users collection, env, clock and logger are injected; nothing here touches the network.

const crypto = require('crypto');
const technicalApproverGuard = require('./technical-approver-guard.cjs');

const GRAPH_ME_URL = 'https://graph.microsoft.com/v1.0/me';
const GRAPH_TIMEOUT_MS = 8000;
const GRAPH_MAX_ATTEMPTS = 2;

// The one place the allowed sign-in domain is named; ALLOWED_LOGIN_DOMAINS overrides it.
const DEFAULT_ALLOWED_LOGIN_DOMAIN = 'cloudfuze.com';

const MAX_EMAIL_LENGTH = 320;
const MAX_NAME_LENGTH = 200;
const MAX_ID_LENGTH = 200;
// Real Graph tokens are 1-3 KB; the cap only stops oversized junk.
const MAX_ACCESS_TOKEN_LENGTH = 8192;

const MESSAGES = {
  invalid: 'Invalid sign-in request',
  unauthorized: 'Microsoft sign-in failed',
  forbidden: 'Microsoft sign-in is not permitted for this account',
  notConfigured: 'Microsoft sign-in is not configured',
  unavailable: 'Microsoft sign-in is temporarily unavailable',
};

const deny = (status, key, reason) => ({ ok: false, status, reason, body: { success: false, message: MESSAGES[key] } });

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

// A leading '$' is how a Mongo operator would arrive as a string.
const isSafeString = (value, maxLength) => typeof value === 'string' && value.length <= maxLength && !value.startsWith('$');

function validateBodyShape(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const { id, name, email, accessToken } = body;
  if (!isNonEmptyString(email) || !isSafeString(email, MAX_EMAIL_LENGTH)) return false;
  if (id !== undefined && !isSafeString(id, MAX_ID_LENGTH)) return false;
  if (name !== undefined && !isSafeString(name, MAX_NAME_LENGTH)) return false;
  // A missing token is an unauthenticated request, not a malformed one.
  if (accessToken !== undefined && accessToken !== null && !isSafeString(accessToken, MAX_ACCESS_TOKEN_LENGTH)) return false;
  return true;
}

function allowedDomains(env) {
  const parsed = String((env && env.ALLOWED_LOGIN_DOMAINS) || '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [DEFAULT_ALLOWED_LOGIN_DOMAIN];
}

function isAllowedDomain(address, domains) {
  if (typeof address !== 'string') return false;
  const parts = address.trim().toLowerCase().split('@');
  return parts.length === 2 && parts[0] !== '' && domains.includes(parts[1]);
}

const trimmedEnv = (env, key) => String((env && env[key]) || '').trim();

const UNVERIFIED_ALLOWED_ENVS = ['development', 'test'];

// Azure treats app ids as case-insensitive GUIDs.
const normalizeId = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

function readConfig(env) {
  return {
    tenantId: trimmedEnv(env, 'AZURE_TENANT_ID'),
    clientId: trimmedEnv(env, 'AZURE_CLIENT_ID') || trimmedEnv(env, 'VITE_MSAL_CLIENT_ID'),
    // Anything but an explicit dev or test environment, including unset, behaves as production.
    allowUnverified: UNVERIFIED_ALLOWED_ENVS.includes(trimmedEnv(env, 'NODE_ENV').toLowerCase())
      && trimmedEnv(env, 'ALLOW_UNVERIFIED_MS_LOGIN') === 'true',
  };
}

/**
 * Default Graph fetcher for the server: GET /me with an 8s timeout. Rejects on non-2xx and on network
 * errors (axios default), so the caller can tell a rejected token (error.response) from an outage.
 */
function createGraphFetcher(axiosInstance) {
  return (accessToken) => axiosInstance.get(GRAPH_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: GRAPH_TIMEOUT_MS,
  });
}

// One retry, only for a network error or a 5xx; a 4xx means Graph rejected the token and retrying cannot help.
async function fetchGraphProfile(graphGet, accessToken) {
  for (let attempt = 1; attempt <= GRAPH_MAX_ATTEMPTS; attempt += 1) {
    let status;
    try {
      const res = await graphGet(accessToken);
      status = res && res.status;
      if (status === 200) return { kind: 'ok', data: res.data };
    } catch (error) {
      status = error && error.response && error.response.status;
    }
    const transient = !status || status >= 500;
    if (!transient) return { kind: status === 429 ? 'unavailable' : 'rejected' };
  }
  return { kind: 'unavailable' };
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Exact match first so existing records are matched as stored; the case-insensitive pass avoids a duplicate user for a casing difference.
async function findUserByEmail(users, address) {
  const exact = await users.findOne({ email: address });
  if (exact) return exact;
  return users.findOne({ email: { $regex: `^${escapeRegex(address)}$`, $options: 'i' } });
}

function pickVerifiedAddress(graphUser, postedEmail, tenantMatches) {
  const target = technicalApproverGuard.normalizeEmail(postedEmail);
  const upn = graphUser.userPrincipalName;
  if (typeof upn === 'string' && technicalApproverGuard.normalizeEmail(upn) === target) return upn;
  const mail = graphUser.mail;
  if (tenantMatches && typeof mail === 'string' && technicalApproverGuard.normalizeEmail(mail) === target) return mail;
  return null;
}

function createMicrosoftLogin({ graphGet, getUsers, env = {}, now = Date.now, logger, randomId = () => crypto.randomUUID() } = {}) {
  const log = logger || { warn() {}, error() {} };
  let notConfiguredLogged = false;

  function checkConfig(config) {
    if (config.tenantId && config.clientId) return { mode: 'verify' };
    if (config.allowUnverified) {
      log.warn('ALLOW_UNVERIFIED_MS_LOGIN is on: Microsoft sign-in identity is NOT being verified. Never enable this in production.', { source: 'microsoft-login' });
      return { mode: 'unverified' };
    }
    if (!notConfiguredLogged) {
      notConfiguredLogged = true;
      log.error('AZURE_TENANT_ID and AZURE_CLIENT_ID (or VITE_MSAL_CLIENT_ID) must be set; Microsoft sign-in is refused until they are', { source: 'microsoft-login' });
    }
    return { mode: 'refuse' };
  }

  // Returns { address, graphId, displayName, msClaims } or a deny result; reads nothing from the database.
  async function verifyIdentity(body, config) {
    const tokenPayload = technicalApproverGuard.decodeJwtPayload(body.accessToken);
    if (!isNonEmptyString(body.accessToken) || !tokenPayload) return deny(401, 'unauthorized', 'NO_REAL_TOKEN');

    const profile = await fetchGraphProfile(graphGet, body.accessToken);
    if (profile.kind === 'unavailable') return deny(503, 'unavailable', 'GRAPH_UNAVAILABLE');
    const graphUser = profile.data;
    if (profile.kind !== 'ok' || !graphUser || typeof graphUser !== 'object') return deny(401, 'unauthorized', 'GRAPH_REJECTED');

    const tenantMatches = typeof tokenPayload.tid === 'string' && tokenPayload.tid.toLowerCase() === config.tenantId.toLowerCase();
    const address = pickVerifiedAddress(graphUser, body.email, tenantMatches);
    if (!address || !isNonEmptyString(graphUser.id)) return deny(401, 'unauthorized', 'IDENTITY_MISMATCH');
    if (!tenantMatches) return deny(403, 'forbidden', 'WRONG_TENANT');

    const issuedTo = normalizeId(tokenPayload.appid || tokenPayload.azp);
    if (issuedTo === '' || issuedTo !== normalizeId(config.clientId)) return deny(403, 'forbidden', 'WRONG_CLIENT');
    if (tokenPayload.acct === 1) return deny(403, 'forbidden', 'PERSONAL_ACCOUNT');
    if (!isAllowedDomain(address, allowedDomains(env))) return deny(403, 'forbidden', 'DOMAIN_NOT_ALLOWED');

    const msClaims = technicalApproverGuard.verifiedClaimsFromGraph({
      graphUser, email: address, tokenPayload, clientId: config.clientId, now: now(),
    });
    if (!msClaims) return deny(403, 'forbidden', 'CLAIMS_REJECTED');
    return { address, graphId: graphUser.id, displayName: msClaims.msName, msClaims };
  }

  // Dev-only escape hatch: the posted address is trusted, so only the domain rule still applies.
  function unverifiedIdentity(body) {
    const address = body.email.trim();
    if (!isAllowedDomain(address, allowedDomains(env))) return deny(403, 'forbidden', 'DOMAIN_NOT_ALLOWED');
    return { address, graphId: null, displayName: '', msClaims: {} };
  }

  const hasUsableId = (user) => typeof user.id === 'string' && user.id.trim() !== '';

  // Backfilling an id would be a database write, so a record without one is refused instead.
  async function signInExisting(users, existing, name, stamp) {
    if (!hasUsableId(existing)) return { denied: deny(401, 'unauthorized', 'EXISTING_USER_WITHOUT_ID') };
    // Only accounts created through Microsoft are Microsoft-managed; password accounts keep their name and provider.
    if (existing.provider !== 'microsoft') return { user: existing };
    const set = name ? { name, updated_at: stamp } : { updated_at: stamp };
    await users.updateOne(existing._id !== undefined ? { _id: existing._id } : { email: existing.email }, { $set: set });
    return { user: { ...existing, ...set } };
  }

  // Returns { user } or { denied }.
  async function upsertUser(identity, body) {
    const users = getUsers();
    const name = identity.displayName || (typeof body.name === 'string' ? body.name.trim() : '');
    const existing = await findUserByEmail(users, identity.address);
    const stamp = new Date(now());

    if (existing) return signInExisting(users, existing, name, stamp);

    // The id always comes from Graph (or is generated), never from the request body.
    const user = {
      id: identity.graphId || `microsoft_${randomId()}`,
      name: name || identity.address,
      email: identity.address,
      provider: 'microsoft',
      role: 'viewer',
      created_at: stamp,
      updated_at: stamp,
    };
    try {
      await users.insertOne(user);
    } catch (error) {
      if (!error || error.code !== 11000) throw error;
      // A parallel first sign-in won the insert; sign in as the record it created.
      const winner = await findUserByEmail(users, identity.address);
      if (!winner) throw error;
      return signInExisting(users, winner, name, stamp);
    }
    return { user };
  }

  /**
   * Returns { ok: true, user, jwtPayload } or { ok: false, status, body }.
   * Order: body shape, config, Graph identity, and only then the database.
   */
  return async function authenticateMicrosoftLogin(body) {
    if (!validateBodyShape(body)) return deny(400, 'invalid', 'BAD_SHAPE');

    const config = readConfig(env);
    const gate = checkConfig(config);
    if (gate.mode === 'refuse') return deny(503, 'notConfigured', 'NOT_CONFIGURED');

    const identity = gate.mode === 'verify' ? await verifyIdentity(body, config) : unverifiedIdentity(body);
    if (identity.ok === false) {
      log.warn('Microsoft sign-in refused', { source: 'microsoft-login', reason: identity.reason });
      return identity;
    }

    const { user, denied } = await upsertUser(identity, body);
    if (denied) {
      log.warn('Microsoft sign-in refused', { source: 'microsoft-login', reason: denied.reason });
      return denied;
    }
    return { ok: true, user, jwtPayload: { userId: user.id, email: user.email, ...identity.msClaims } };
  };
}

module.exports = {
  DEFAULT_ALLOWED_LOGIN_DOMAIN,
  GRAPH_ME_URL,
  GRAPH_TIMEOUT_MS,
  MESSAGES,
  allowedDomains,
  createGraphFetcher,
  createMicrosoftLogin,
};
