/**
 * DocuSign integration service (Authorization Code Grant + refresh token).
 *
 * All credentials come from environment variables — never hard-code secrets.
 * The refresh token is stored AES-256-GCM encrypted in the `docusign_auth` Mongo
 * collection so background approval auto-send works with no user present.
 *
 * This module is provider-agnostic about the rest of the app: the caller passes
 * `db`, PDF bytes and signer/field data; this module talks to the DocuSign REST API.
 */
const axios = require('axios');
const crypto = require('crypto');

function stripSlash(s) {
  return String(s || '').replace(/\/+$/, '');
}
function stripProto(s) {
  return String(s || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function cfg() {
  return {
    clientId: process.env.DOCUSIGN_CLIENT_ID || '',
    clientSecret: process.env.DOCUSIGN_CLIENT_SECRET || '',
    accountId: process.env.DOCUSIGN_ACCOUNT_ID || '',
    // REST API base, e.g. https://demo.docusign.net/restapi (demo) or https://<region>.docusign.net/restapi (prod)
    basePath: stripSlash(process.env.DOCUSIGN_BASE_PATH || 'https://demo.docusign.net/restapi'),
    // OAuth host, e.g. account-d.docusign.com (demo) or account.docusign.com (prod)
    oauthBasePath: stripProto(process.env.DOCUSIGN_OAUTH_BASE_PATH || 'account-d.docusign.com'),
    redirectUri: process.env.DOCUSIGN_REDIRECT_URI || 'http://localhost:5173/auth/docusign/callback',
    scopes: process.env.DOCUSIGN_SCOPES || 'signature',
    connectHmacKey: process.env.DOCUSIGN_CONNECT_HMAC_KEY || '',
    // Reuse the e-sign signature key if a dedicated one isn't set.
    tokenEncKey: process.env.DOCUSIGN_TOKEN_ENCRYPTION_KEY || process.env.ESIGN_SIGNATURE_ENCRYPTION_KEY || '',
  };
}

/** Is DocuSign the active e-sign provider? Defaults to true (docusign) unless explicitly set otherwise. */
function isProviderDocusign() {
  return String(process.env.ESIGN_PROVIDER || 'docusign').toLowerCase() === 'docusign';
}

/** Are the minimum credentials present to talk to DocuSign at all? */
function isConfigured() {
  const c = cfg();
  return !!(c.clientId && c.clientSecret && c.accountId);
}

// ---------------------------------------------------------------------------
// Refresh-token encryption at rest (AES-256-GCM)
// ---------------------------------------------------------------------------
function encKey() {
  const raw = (cfg().tokenEncKey || '').trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  try {
    const b = Buffer.from(raw, 'base64');
    if (b.length === 32) return b;
  } catch (_) { /* ignore */ }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}
function encrypt(text) {
  const key = encKey();
  if (!key) throw new Error('Set DOCUSIGN_TOKEN_ENCRYPTION_KEY (or ESIGN_SIGNATURE_ENCRYPTION_KEY) to store DocuSign tokens.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return { ciphertext: enc.toString('base64'), iv: iv.toString('base64'), auth_tag: cipher.getAuthTag().toString('base64') };
}
function decrypt(blob) {
  const key = encKey();
  if (!key) throw new Error('DocuSign token encryption key missing.');
  const iv = Buffer.from(blob.iv, 'base64');
  const tag = Buffer.from(blob.auth_tag, 'base64');
  const ct = Buffer.from(blob.ciphertext, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

async function storeAuth(db, refreshToken, meta = {}) {
  const blob = encrypt(refreshToken);
  await db.collection('docusign_auth').updateOne(
    { _id: 'main' },
    { $set: {
      _id: 'main',
      ...blob,
      account_id: meta.account_id || cfg().accountId || null,
      base_path: meta.base_path || cfg().basePath || null,
      connected_by: meta.connected_by || null,
      connected_at: new Date(),
    } },
    { upsert: true }
  );
}
async function loadAuth(db) {
  const row = await db.collection('docusign_auth').findOne({ _id: 'main' });
  if (!row || !row.ciphertext) return null;
  try {
    return {
      refresh_token: decrypt(row),
      account_id: row.account_id,
      base_path: row.base_path,
      connected_by: row.connected_by,
      connected_at: row.connected_at,
    };
  } catch (_) {
    return null;
  }
}
async function getConnection(db) {
  const row = await db.collection('docusign_auth').findOne({ _id: 'main' });
  return {
    connected: !!(row && row.ciphertext),
    account_id: (row && row.account_id) || null,
    base_path: (row && row.base_path) || null,
    connected_at: (row && row.connected_at) || null,
    connected_by: (row && row.connected_by) || null,
  };
}

// ---------------------------------------------------------------------------
// OAuth (Authorization Code Grant)
// ---------------------------------------------------------------------------
function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** PKCE: DocuSign integration keys can require code_challenge/code_verifier on the Auth Code flow. */
function generatePkce() {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

function getConsentUrl(state, codeChallenge) {
  const c = cfg();
  const params = new URLSearchParams({
    response_type: 'code',
    scope: c.scopes,
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
  });
  if (state) params.set('state', state);
  if (codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }
  return `https://${c.oauthBasePath}/oauth/auth?${params.toString()}`;
}

/**
 * Start a PKCE consent flow: generate a verifier + challenge, persist the verifier keyed by
 * `state` (so the callback can retrieve it), and return the consent URL to redirect to.
 */
async function beginConsent(db) {
  const state = crypto.randomBytes(16).toString('hex');
  const { codeVerifier, codeChallenge } = generatePkce();
  await db.collection('docusign_pkce').updateOne(
    { _id: state },
    { $set: { _id: state, code_verifier: codeVerifier, created_at: new Date() } },
    { upsert: true }
  );
  return { url: getConsentUrl(state, codeChallenge), state };
}

async function tokenRequest(params) {
  const c = cfg();
  const auth = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64');
  const resp = await axios.post(`https://${c.oauthBasePath}/oauth/token`, params.toString(), {
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return resp.data;
}
async function exchangeCodeForTokens(code, codeVerifier) {
  const params = new URLSearchParams({ grant_type: 'authorization_code', code });
  if (codeVerifier) params.set('code_verifier', codeVerifier);
  return tokenRequest(params);
}
async function refreshAccessToken(refreshToken) {
  return tokenRequest(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }));
}
async function getUserInfo(accessToken) {
  const c = cfg();
  const resp = await axios.get(`https://${c.oauthBasePath}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return resp.data;
}

/** One-time admin connect: exchange the consent code (with PKCE verifier), derive account + base_uri, store the refresh token. */
async function connectFromCode(db, code, state, connectedBy) {
  let codeVerifier = null;
  if (state) {
    const row = await db.collection('docusign_pkce').findOne({ _id: state });
    if (row) codeVerifier = row.code_verifier;
  }
  const tok = await exchangeCodeForTokens(code, codeVerifier);
  if (state) {
    try { await db.collection('docusign_pkce').deleteOne({ _id: state }); } catch (_) { /* ignore */ }
  }
  if (!tok.refresh_token) {
    throw new Error('DocuSign did not return a refresh token. Ensure the integration key uses Authorization Code Grant.');
  }
  let accountId = cfg().accountId;
  let basePath = cfg().basePath;
  try {
    const info = await getUserInfo(tok.access_token);
    const accounts = info.accounts || [];
    const acct = accounts.find((a) => a.is_default) || accounts[0];
    if (acct) {
      accountId = acct.account_id || accountId;
      if (acct.base_uri) basePath = `${stripSlash(acct.base_uri)}/restapi`;
    }
  } catch (_) { /* fall back to env-configured account/base */ }
  await storeAuth(db, tok.refresh_token, { account_id: accountId, base_path: basePath, connected_by: connectedBy });
  _tokenCache = { accessToken: tok.access_token, expiresAt: Date.now() + (tok.expires_in || 3600) * 1000, accountId, basePath };
  return { connected: true, account_id: accountId, base_path: basePath };
}

// ---------------------------------------------------------------------------
// Access-token cache + retrieval (for API calls)
// ---------------------------------------------------------------------------
let _tokenCache = { accessToken: null, expiresAt: 0, accountId: null, basePath: null };

async function getAccessToken(db) {
  const c = cfg();
  if (_tokenCache.accessToken && Date.now() < _tokenCache.expiresAt - 60000) {
    return { accessToken: _tokenCache.accessToken, accountId: _tokenCache.accountId || c.accountId, basePath: _tokenCache.basePath || c.basePath };
  }
  const stored = await loadAuth(db);
  if (!stored || !stored.refresh_token) {
    throw new Error('DocuSign is not connected. An administrator must connect DocuSign first.');
  }
  const tok = await refreshAccessToken(stored.refresh_token);
  const accountId = stored.account_id || c.accountId;
  const basePath = stored.base_path || c.basePath;
  _tokenCache = { accessToken: tok.access_token, expiresAt: Date.now() + (tok.expires_in || 3600) * 1000, accountId, basePath };
  // DocuSign rotates refresh tokens — persist the new one so the next refresh works.
  if (tok.refresh_token && tok.refresh_token !== stored.refresh_token) {
    await storeAuth(db, tok.refresh_token, { account_id: accountId, base_path: basePath, connected_by: stored.connected_by });
  }
  return { accessToken: tok.access_token, accountId, basePath };
}

// ---------------------------------------------------------------------------
// Field → DocuSign tab mapping (absolute positioning)
// ---------------------------------------------------------------------------
function clamp01(n) { return Math.max(0, Math.min(1, n)); }

/** Normalized (0..1, top-left origin) x/y for a placed signature_fields record, or null. */
function normXY(f) {
  const num = (v) => typeof v === 'number' && isFinite(v);
  if (num(f.xNorm) && num(f.yNorm)) return { x: clamp01(f.xNorm), y: clamp01(f.yNorm) };
  if (num(f.xPct) && num(f.yPct)) return { x: clamp01(f.xPct / 100), y: clamp01(f.yPct / 100) };
  return null;
}

async function getPdfPageSizes(pdfBuffer) {
  try {
    const { PDFDocument } = require('pdf-lib');
    const pdf = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    return pdf.getPages().map((p) => ({ w: p.getWidth(), h: p.getHeight() }));
  } catch (_) {
    return [{ w: 612, h: 792 }];
  }
}

/** Build a DocuSign `tabs` object for one signer from their placed fields. */
function buildTabs(fields, pageSizes) {
  const signHereTabs = [], fullNameTabs = [], titleTabs = [], dateSignedTabs = [], textTabs = [];
  let labelSeq = 0;
  for (const f of fields || []) {
    const page = Number(f.page) || 1;
    const size = pageSizes[page - 1] || pageSizes[0] || { w: 612, h: 792 };
    const norm = normXY(f);
    if (!norm) continue; // no positional data we can map; skip rather than mis-place
    const base = {
      documentId: '1',
      pageNumber: String(page),
      xPosition: String(Math.max(0, Math.round(norm.x * size.w))),
      yPosition: String(Math.max(0, Math.round(norm.y * size.h))),
    };
    const type = f.type || 'signature';
    if (type === 'signature') signHereTabs.push(base);
    else if (type === 'name') fullNameTabs.push(base);
    else if (type === 'title') titleTabs.push({ ...base, tabLabel: `title_${++labelSeq}` });
    else if (type === 'date') dateSignedTabs.push(base);
    else textTabs.push({ ...base, tabLabel: `text_${++labelSeq}`, value: f.prefill ? String(f.prefill) : '', locked: f.prefill ? 'true' : 'false' });
  }
  const tabs = {};
  if (signHereTabs.length) tabs.signHereTabs = signHereTabs;
  if (fullNameTabs.length) tabs.fullNameTabs = fullNameTabs;
  if (titleTabs.length) tabs.titleTabs = titleTabs;
  if (dateSignedTabs.length) tabs.dateSignedTabs = dateSignedTabs;
  if (textTabs.length) tabs.textTabs = textTabs;
  return Object.keys(tabs).length ? { tabs } : {};
}

// ---------------------------------------------------------------------------
// Envelope operations
// ---------------------------------------------------------------------------
/**
 * Create + send an envelope.
 * @param {{db:any, pdfBuffer:Buffer, fileName:string, emailSubject:string,
 *          signers:Array<{email:string,name:string,recipientId:string,routingOrder:string,fields:any[]}>}} args
 * @returns {Promise<{envelopeId:string, status:string}>}
 */
async function createAndSendEnvelope({ db, pdfBuffer, fileName, emailSubject, signers, emailBlurb = '', expireAfterDays = 0 }) {
  const { accessToken, accountId, basePath } = await getAccessToken(db);
  const buf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  const pdfBase64 = buf.toString('base64');
  const pageSizes = await getPdfPageSizes(buf);

  const dsSigners = signers.map((s) => ({
    email: s.email,
    name: s.name,
    recipientId: s.recipientId,
    routingOrder: s.routingOrder || s.recipientId,
    ...buildTabs(s.fields, pageSizes),
  }));

  const subject = String(emailSubject || `Please sign: ${fileName || 'Agreement'}`).slice(0, 100);
  const body = {
    emailSubject: subject,
    documents: [{
      documentBase64: pdfBase64,
      name: fileName || 'Agreement.pdf',
      fileExtension: 'pdf',
      documentId: '1',
    }],
    recipients: { signers: dsSigners },
    status: 'sent',
  };

  // DocuSign's default email template has no expiry line and cannot be edited via the API,
  // so the only way to show the date to the recipient is emailBlurb (the message body).
  // Cap at DocuSign's 10,000-character limit for this field.
  if (emailBlurb && String(emailBlurb).trim()) {
    body.emailBlurb = String(emailBlurb).trim().slice(0, 10000);
  }

  // Make the advertised date real: without this the envelope never expires and the blurb
  // would be a promise nothing enforces. useAccountDefaults must be false or the account-level
  // expiration settings win and expireAfter is ignored.
  const days = Number(expireAfterDays);
  if (Number.isFinite(days) && days > 0) {
    body.notification = {
      useAccountDefaults: 'false',
      expirations: {
        expireEnabled: 'true',
        expireAfter: String(Math.round(days)),
        // Warn 2 days out, but never schedule the warning on/after expiry for short windows.
        expireWarn: String(Math.max(0, Math.min(2, Math.round(days) - 1))),
      },
    };
  }

  const url = `${basePath}/v2.1/accounts/${accountId}/envelopes`;
  const resp = await axios.post(url, body, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  return { envelopeId: resp.data.envelopeId, status: resp.data.status };
}

async function getEnvelope(db, envelopeId) {
  const { accessToken, accountId, basePath } = await getAccessToken(db);
  const resp = await axios.get(`${basePath}/v2.1/accounts/${accountId}/envelopes/${envelopeId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return resp.data;
}

/** Per-recipient status (so "X of N signed" is accurate before the whole envelope completes). */
async function getEnvelopeRecipients(db, envelopeId) {
  const { accessToken, accountId, basePath } = await getAccessToken(db);
  const resp = await axios.get(`${basePath}/v2.1/accounts/${accountId}/envelopes/${envelopeId}/recipients`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return resp.data; // { signers: [...], carbonCopies: [...], ... }
}

/** DocuSign recipient status → local esign_recipients.status. */
function mapRecipientStatusToLocal(s) {
  switch (String(s || '').toLowerCase()) {
    case 'completed':
    case 'signed': return 'signed';
    case 'declined': return 'denied';
    case 'delivered': return 'viewed';
    case 'sent':
    case 'created':
    case 'autoresponded':
    default: return 'pending';
  }
}

async function downloadCombinedDocument(db, envelopeId) {
  const { accessToken, accountId, basePath } = await getAccessToken(db);
  const resp = await axios.get(`${basePath}/v2.1/accounts/${accountId}/envelopes/${envelopeId}/documents/combined`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    responseType: 'arraybuffer',
  });
  return Buffer.from(resp.data);
}

async function voidEnvelope(db, envelopeId, reason) {
  const { accessToken, accountId, basePath } = await getAccessToken(db);
  const resp = await axios.put(`${basePath}/v2.1/accounts/${accountId}/envelopes/${envelopeId}`,
    { status: 'voided', voidedReason: String(reason || 'Voided by sender').slice(0, 200) },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );
  return resp.data;
}

// ---------------------------------------------------------------------------
// Status mapping + webhook verification
// ---------------------------------------------------------------------------
/** DocuSign envelope status → local esign_documents.status. */
function mapEnvelopeStatusToDoc(s) {
  switch (String(s || '').toLowerCase()) {
    case 'created': return 'draft';
    case 'sent': return 'sent';
    case 'delivered': return 'sent';
    case 'completed': return 'completed';
    case 'declined': return 'denied';
    case 'voided': return 'voided';
    default: return 'sent';
  }
}

/** Verify a DocuSign Connect HMAC signature over the raw request body. */
function verifyConnectHmac(rawBody, signatureHeader) {
  const key = cfg().connectHmacKey;
  if (!key) return { ok: false, reason: 'no-key' };
  if (!signatureHeader) return { ok: false, reason: 'no-signature' };
  const computed = crypto.createHmac('sha256', key).update(rawBody).digest('base64');
  const a = Buffer.from(computed);
  const b = Buffer.from(String(signatureHeader));
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { ok, reason: ok ? '' : 'mismatch' };
}

module.exports = {
  cfg,
  isProviderDocusign,
  isConfigured,
  getConsentUrl,
  beginConsent,
  connectFromCode,
  getConnection,
  getAccessToken,
  createAndSendEnvelope,
  getEnvelope,
  getEnvelopeRecipients,
  mapRecipientStatusToLocal,
  downloadCombinedDocument,
  voidEnvelope,
  mapEnvelopeStatusToDoc,
  verifyConnectHmac,
};
