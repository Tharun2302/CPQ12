'use strict';

// Configuration for the optional Zoho Sign provider. Kept out of server.cjs so the data-centre
// table, the enable flag and the missing-key report can be unit tested without booting the
// server, and so nothing else in the codebase reads a ZOHO_SIGN_* variable directly.
//
// Every resolver here takes an env object, so a test never has to mutate process.env.

/**
 * Zoho runs region-specific instances and a token minted on one accounts domain is rejected by
 * every other Sign domain, so the base URL is data rather than a constant. UK is absent on
 * purpose: Zoho publishes accounts.zoho.uk but no Sign root for it — ZOHO_SIGN_API_BASE is the
 * escape hatch for that gap.
 */
const ZOHO_SIGN_DATA_CENTRES = Object.freeze({
  us: Object.freeze({ apiBase: 'https://sign.zoho.com/api/v1', accountsBase: 'https://accounts.zoho.com' }),
  eu: Object.freeze({ apiBase: 'https://sign.zoho.eu/api/v1', accountsBase: 'https://accounts.zoho.eu' }),
  in: Object.freeze({ apiBase: 'https://sign.zoho.in/api/v1', accountsBase: 'https://accounts.zoho.in' }),
  jp: Object.freeze({ apiBase: 'https://sign.zoho.jp/api/v1', accountsBase: 'https://accounts.zoho.jp' }),
  au: Object.freeze({ apiBase: 'https://sign.zoho.com.au/api/v1', accountsBase: 'https://accounts.zoho.com.au' }),
  ca: Object.freeze({ apiBase: 'https://sign.zohocloud.ca/api/v1', accountsBase: 'https://accounts.zohocloud.ca' }),
  sa: Object.freeze({ apiBase: 'https://sign.zoho.sa/api/v1', accountsBase: 'https://accounts.zoho.sa' }),
});

/** Without all three, not one Zoho call can be authenticated. Reported by name, never by value. */
const REQUIRED_ZOHO_SIGN_KEYS = Object.freeze([
  'ZOHO_SIGN_CLIENT_ID',
  'ZOHO_SIGN_CLIENT_SECRET',
  'ZOHO_SIGN_REFRESH_TOKEN',
]);

const DEFAULT_ZOHO_SIGN_DC = 'us';
const DEFAULT_POLL_INTERVAL_MS = 300000;
const DEFAULT_POLL_BATCH = 20;
const DEFAULT_MIN_REFRESH_MS = 30000;

// Floors stop a typo turning the poller into a rate-limit incident: Zoho allows 50 calls/minute
// and one tick costs one call per document in the batch.
const MIN_POLL_INTERVAL_MS = 30000;
const MAX_POLL_BATCH = 40;
const MIN_POLL_BATCH = 1;

const ZOHO_SIGN_COORD_ORIGINS = Object.freeze(['top', 'bottom']);
const ZOHO_SIGN_COORD_UNITS = Object.freeze(['pt', 'px']);
const DEFAULT_COORD_ORIGIN = 'top';
const DEFAULT_COORD_UNIT = 'pt';

const TRUTHY_FLAG_VALUES = Object.freeze(['1', 'true', 'yes', 'on']);

function readString(env, key) {
  const raw = env && env[key];
  if (raw === undefined || raw === null) return '';
  return String(raw).trim();
}

/** Blank means off. Only an explicit affirmative turns a feature on. */
function isTruthyFlag(value) {
  return TRUTHY_FLAG_VALUES.includes(String(value == null ? '' : value).trim().toLowerCase());
}

function readInt(env, key, fallback, min, max) {
  const raw = readString(env, key);
  if (raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return fallback;
  if (typeof min === 'number' && parsed < min) return min;
  if (typeof max === 'number' && parsed > max) return max;
  return parsed;
}

function readEnum(env, key, allowed, fallback) {
  const raw = readString(env, key).toLowerCase();
  return allowed.includes(raw) ? raw : fallback;
}

function stripTrailingSlash(url) {
  return url.replace(/\/+$/, '');
}

/** Env names that are set but empty, so the boot warning can name exactly what to fill in. */
function zohoSignMissingKeys(env) {
  return REQUIRED_ZOHO_SIGN_KEYS.filter((key) => readString(env, key) === '');
}

/**
 * Resolve the data-centre pair. Explicit ZOHO_SIGN_API_BASE / ZOHO_SIGN_ACCOUNTS_BASE always win
 * so an unlisted region (or a Zoho URL change) never needs a code deploy. An unknown DC with no
 * override is a configuration error rather than a silent fall back to US — sending a US-minted
 * token to an EU account fails in a way that is very hard to read from the error alone.
 */
function resolveZohoSignBases(env) {
  const dc = (readString(env, 'ZOHO_SIGN_DC') || DEFAULT_ZOHO_SIGN_DC).toLowerCase();
  const apiOverride = readString(env, 'ZOHO_SIGN_API_BASE');
  const accountsOverride = readString(env, 'ZOHO_SIGN_ACCOUNTS_BASE');
  const entry = Object.prototype.hasOwnProperty.call(ZOHO_SIGN_DATA_CENTRES, dc)
    ? ZOHO_SIGN_DATA_CENTRES[dc]
    : null;

  const apiBase = apiOverride || (entry ? entry.apiBase : '');
  const accountsBase = accountsOverride || (entry ? entry.accountsBase : '');

  let error = null;
  if (!entry && !(apiOverride && accountsOverride)) {
    error = `Unknown ZOHO_SIGN_DC "${dc}". Known values: ${Object.keys(ZOHO_SIGN_DATA_CENTRES).join(', ')}. `
      + 'Set ZOHO_SIGN_API_BASE and ZOHO_SIGN_ACCOUNTS_BASE to use an unlisted data centre.';
  }

  return {
    dc,
    apiBase: apiBase ? stripTrailingSlash(apiBase) : '',
    accountsBase: accountsBase ? stripTrailingSlash(accountsBase) : '',
    knownDc: !!entry,
    error,
  };
}

/**
 * Full configuration from an env-shaped object. Frozen: nothing downstream may mutate it, and
 * the secret-bearing fields exist only so zoho-sign-auth and the redaction guard can read them.
 * Never serialise this object — use zohoSignConfigReport() for anything user-facing.
 */
function resolveZohoSignConfig(env) {
  const source = env || {};
  const bases = resolveZohoSignBases(source);
  const enabled = isTruthyFlag(source.ZOHO_SIGN_ENABLED);
  const missingKeys = zohoSignMissingKeys(source);
  const webhookSecret = readString(source, 'ZOHO_SIGN_WEBHOOK_SECRET');

  return Object.freeze({
    enabled,
    dc: bases.dc,
    apiBase: bases.apiBase,
    accountsBase: bases.accountsBase,
    dcError: bases.error,

    clientId: readString(source, 'ZOHO_SIGN_CLIENT_ID'),
    clientSecret: readString(source, 'ZOHO_SIGN_CLIENT_SECRET'),
    refreshToken: readString(source, 'ZOHO_SIGN_REFRESH_TOKEN'),
    webhookSecret,

    missingKeys: Object.freeze(missingKeys),
    configured: enabled && missingKeys.length === 0 && bases.error === null,
    webhookConfigured: webhookSecret !== '',

    pollEnabled: isTruthyFlag(source.ZOHO_SIGN_POLL_ENABLED),
    pollIntervalMs: readInt(source, 'ZOHO_SIGN_POLL_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS, MIN_POLL_INTERVAL_MS),
    pollBatch: readInt(source, 'ZOHO_SIGN_POLL_BATCH', DEFAULT_POLL_BATCH, MIN_POLL_BATCH, MAX_POLL_BATCH),
    minRefreshMs: readInt(source, 'ZOHO_SIGN_MIN_REFRESH_MS', DEFAULT_MIN_REFRESH_MS, 0),

    coordOrigin: readEnum(source, 'ZOHO_SIGN_COORD_ORIGIN', ZOHO_SIGN_COORD_ORIGINS, DEFAULT_COORD_ORIGIN),
    coordUnit: readEnum(source, 'ZOHO_SIGN_COORD_UNIT', ZOHO_SIGN_COORD_UNITS, DEFAULT_COORD_UNIT),
  });
}

/** The single gate the routes, the UI flag and the poller all ask. */
function zohoSignEnabled(config) {
  return !!config && config.enabled === true;
}

/** Enabled AND usable. Enabled-but-unconfigured is a 503 with a named-keys message, not a crash. */
function zohoSignConfigured(config) {
  return !!config && config.configured === true;
}

/**
 * Safe projection for GET /api/zoho-sign/status and for the boot log. Contains no secret and no
 * prefix of one — `missingKeys` is a list of variable NAMES.
 */
function zohoSignConfigReport(config) {
  if (!config) {
    return { enabled: false, configured: false, dc: null, api_base: null, missing_keys: REQUIRED_ZOHO_SIGN_KEYS.slice() };
  }
  return {
    enabled: config.enabled,
    configured: config.configured,
    dc: config.dc,
    api_base: config.apiBase || null,
    accounts_base: config.accountsBase || null,
    missing_keys: config.missingKeys.slice(),
    config_error: config.dcError,
    webhook_configured: config.webhookConfigured,
    polling: {
      enabled: config.pollEnabled,
      interval_ms: config.pollIntervalMs,
      batch: config.pollBatch,
    },
    coordinates: { origin: config.coordOrigin, unit: config.coordUnit },
  };
}

/**
 * One plain-English line for the boot log when the feature is switched on but cannot run.
 * Returns null when there is nothing to say, so the caller logs at most once and never
 * logs a value.
 */
function zohoSignBootWarning(config) {
  if (!zohoSignEnabled(config)) return null;
  if (config.dcError) return `Zoho Sign is enabled but not configured: ${config.dcError}`;
  if (config.missingKeys.length > 0) {
    return `Zoho Sign is enabled but not configured. Missing .env values: ${config.missingKeys.join(', ')}`;
  }
  return null;
}

let cachedConfig = null;

/** Process-wide config, read from process.env once. Tests use resolveZohoSignConfig instead. */
function getZohoSignConfig() {
  if (!cachedConfig) cachedConfig = resolveZohoSignConfig(process.env);
  return cachedConfig;
}

/** Test-only escape hatch; production reads the cache. */
function resetZohoSignConfigCache() {
  cachedConfig = null;
}

module.exports = {
  ZOHO_SIGN_DATA_CENTRES,
  REQUIRED_ZOHO_SIGN_KEYS,
  ZOHO_SIGN_COORD_ORIGINS,
  ZOHO_SIGN_COORD_UNITS,
  DEFAULT_ZOHO_SIGN_DC,
  isTruthyFlag,
  zohoSignMissingKeys,
  resolveZohoSignBases,
  resolveZohoSignConfig,
  zohoSignEnabled,
  zohoSignConfigured,
  zohoSignConfigReport,
  zohoSignBootWarning,
  getZohoSignConfig,
  resetZohoSignConfigCache,
};
