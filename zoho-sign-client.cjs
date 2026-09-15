'use strict';

// The Zoho Sign REST client: one function per call the design names, plus the three things
// every one of them needs — retry with backoff, a normalised error, and a redaction guard.
// Kept out of server.cjs so all of it can be unit tested against a fake transport; this file
// opens no socket of its own.
//
// Injected contract (same shape zoho-sign-auth uses):
//   httpRequest({ method, url, headers, body, responseType }) -> { status, headers, body }
//     responseType 'buffer' asks for a Buffer body; anything else yields a string.
//
// Nothing here ever logs a credential, and nothing here ever returns Zoho's raw response body
// to a caller: routes must surface `error.message`, which is written to be shown to a user.

const {
  ZOHO_ERROR_CODES,
  zohoSignError,
  isZohoAuthFailure,
} = require('./zoho-sign-auth.cjs');

const ZOHO_AUTH_SCHEME = 'Zoho-oauthtoken';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_BASE_MS = 500;
const DEFAULT_BACKOFF_MAX_MS = 8000;
const MAX_RETRY_AFTER_MS = 30000;

// Zoho signals success as code 0 on an HTTP 200. A 200 with any other code is a failure that
// would otherwise be read as success.
const ZOHO_SUCCESS_CODE = 0;
const ZOHO_NOT_FOUND_CODE = 9004;
const ZOHO_RATE_LIMIT_CODE = 2955;

// ---- Redaction guard ------------------------------------------------------

// Runtime tokens never appear in config, so they cannot be matched by value. These patterns
// catch the shapes they travel in.
const TOKEN_SHAPED_PATTERNS = Object.freeze([
  /(Zoho-oauthtoken\s+)[^\s"'&]+/gi,
  /(Bearer\s+)[^\s"'&]+/gi,
  /("(?:access_token|refresh_token|client_secret|id_token)"\s*:\s*")[^"]*/gi,
  /((?:access_token|refresh_token|client_secret|code)=)[^&\s"']+/gi,
]);

/** True when a known secret VALUE appears anywhere in the text. */
function containsSecret(text, secrets) {
  const haystack = String(text == null ? '' : text);
  if (haystack === '') return false;
  return (secrets || []).some((secret) => typeof secret === 'string' && secret.length >= 8 && haystack.includes(secret));
}

/** Mask token-shaped values so a log line keeps its diagnostic value without the credential. */
function redactTokenShapes(text) {
  let out = String(text == null ? '' : text);
  for (const pattern of TOKEN_SHAPED_PATTERNS) {
    out = out.replace(pattern, (match, prefix) => `${prefix}[REDACTED]`);
  }
  return out;
}

/**
 * The guard the design asks for: a line carrying a configured secret is DROPPED, not masked,
 * because a partial match means our masking missed something and a half-redacted secret is
 * still a secret. Everything else is masked and allowed through.
 *
 * @returns {Function} (text) => string | null   null means "do not log this"
 */
function createRedactor(secrets) {
  const list = (secrets || []).filter((s) => typeof s === 'string' && s.length >= 8);
  return function redact(text) {
    if (containsSecret(text, list)) return null;
    return redactTokenShapes(text);
  };
}

// ---- Backoff --------------------------------------------------------------

/**
 * Exponential backoff with jitter. Jitter matters more than the exponent here: without it every
 * document in a poll batch that hit the same 429 retries on the same millisecond and trips the
 * limit again.
 */
function computeBackoffDelayMs(attempt, options) {
  const opts = options || {};
  const base = typeof opts.baseMs === 'number' ? opts.baseMs : DEFAULT_BACKOFF_BASE_MS;
  const max = typeof opts.maxMs === 'number' ? opts.maxMs : DEFAULT_BACKOFF_MAX_MS;
  const random = typeof opts.random === 'function' ? opts.random : Math.random;
  const exponential = Math.min(base * Math.pow(2, Math.max(0, Number(attempt) || 0)), max);
  const jittered = Math.round(exponential * (0.5 + random()));
  return Math.max(0, Math.min(jittered, max));
}

/** Zoho may say exactly how long to wait; believe it, but never for longer than half a minute. */
function retryAfterMs(headers) {
  if (!headers) return 0;
  const raw = headers['retry-after'] != null ? headers['retry-after'] : headers['Retry-After'];
  if (raw == null) return 0;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(Math.round(seconds * 1000), MAX_RETRY_AFTER_MS);
}

// ---- Error normalisation --------------------------------------------------

function parseJsonBody(body) {
  if (body == null) return null;
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

const FRIENDLY_MESSAGES = Object.freeze({
  [ZOHO_ERROR_CODES.AUTH_FAILED]: 'Zoho Sign rejected our credentials. The Zoho connection needs to be re-authorised.',
  [ZOHO_ERROR_CODES.RATE_LIMITED]: 'Zoho Sign is rate limiting us. The document was left untouched — try again shortly.',
  [ZOHO_ERROR_CODES.NOT_FOUND]: 'Zoho Sign does not have this signature request any more.',
  [ZOHO_ERROR_CODES.SERVER_ERROR]: 'Zoho Sign is having trouble on their side. The document was left untouched.',
  [ZOHO_ERROR_CODES.NETWORK_ERROR]: 'Could not reach Zoho Sign. Check connectivity and try again.',
  [ZOHO_ERROR_CODES.API_ERROR]: 'Zoho Sign refused the request.',
});

/**
 * Turn any Zoho answer into one of our codes. `zohoCode`/`zohoMessage` are attached for the
 * retry decision and for the stored `zoho_last_error` — they are NOT for the browser, which
 * only ever gets `message` (Zoho's raw body can carry account detail).
 */
function normalizeZohoResponse(status, body, context) {
  const payload = parseJsonBody(body);
  const zohoCode = payload && payload.code != null ? payload.code : null;
  const zohoMessage = payload && payload.message != null ? String(payload.message) : '';
  const where = context ? ` (${context})` : '';

  const attach = (code) => zohoSignError(code, `${FRIENDLY_MESSAGES[code] || FRIENDLY_MESSAGES[ZOHO_ERROR_CODES.API_ERROR]}${where}`, {
    status,
    zohoCode,
    zohoMessage,
    retryable: code === ZOHO_ERROR_CODES.RATE_LIMITED || code === ZOHO_ERROR_CODES.SERVER_ERROR,
  });

  // 401 only. A 403 is a scope or plan problem, and refreshing the token cannot fix it — routing
  // it through the auth-retry path would spend a refresh call to fail identically.
  if (status === 401) return attach(ZOHO_ERROR_CODES.AUTH_FAILED);
  if (status === 429 || zohoCode === ZOHO_RATE_LIMIT_CODE) return attach(ZOHO_ERROR_CODES.RATE_LIMITED);
  if (status >= 500) return attach(ZOHO_ERROR_CODES.SERVER_ERROR);
  if (status === 404 || zohoCode === ZOHO_NOT_FOUND_CODE) return attach(ZOHO_ERROR_CODES.NOT_FOUND);

  // A 200 whose body carries an invalid-token marker is still an auth failure.
  if (isZohoAuthFailure({ status, zohoCode, zohoMessage })) return attach(ZOHO_ERROR_CODES.AUTH_FAILED);
  return attach(ZOHO_ERROR_CODES.API_ERROR);
}

/** Success is HTTP 2xx AND code 0 — Zoho returns 200 with a failure code often enough to matter. */
function isZohoSuccess(status, payload) {
  if (!(status >= 200 && status < 300)) return false;
  if (payload && typeof payload === 'object' && payload.code != null) {
    return Number(payload.code) === ZOHO_SUCCESS_CODE;
  }
  return true;
}

// ---- Request-id hygiene ---------------------------------------------------

/** Ids go straight into a URL path, so anything path-shaped is rejected before it gets there. */
function assertZohoId(value, label) {
  const id = String(value == null ? '' : value).trim();
  if (id === '' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw zohoSignError(ZOHO_ERROR_CODES.INVALID_INPUT, `Invalid ${label || 'Zoho id'}`);
  }
  return id;
}

function buildMultipartBody(files, data, extraFields) {
  if (typeof FormData !== 'function' || typeof Blob !== 'function') {
    throw zohoSignError(ZOHO_ERROR_CODES.INVALID_INPUT, 'This Node runtime has no FormData/Blob; Node 20+ is required');
  }
  const form = new FormData();
  for (const file of files) {
    form.append('file', new Blob([file.buffer], { type: file.contentType || 'application/pdf' }), file.fileName);
  }
  form.append('data', JSON.stringify(data));
  // Escape hatch for parameters Zoho names in prose but not in the endpoint reference — `testing`
  // is the one that matters (it is how a trial account probes the API without spending a
  // document), and its placement is undocumented, so the caller decides rather than this module.
  for (const [key, value] of Object.entries(extraFields || {})) {
    if (value === undefined || value === null) continue;
    form.append(key, String(value));
  }
  return form;
}

/**
 * Zoho Sign client.
 *
 * @param {object} deps
 * @param {object} deps.config       resolved zoho-sign-config object
 * @param {object} deps.auth         zoho-sign-auth instance (withAccessToken)
 * @param {Function} deps.httpRequest transport, see the header contract
 * @param {Function} [deps.sleep]    injected for tests so backoff costs no real time
 * @param {Function} [deps.random]   injected for deterministic jitter in tests
 * @param {Function} [deps.logger]   (message) => void; receives redacted text only
 */
function createZohoSignClient(deps) {
  const { config, auth, httpRequest } = deps || {};
  const sleep = (deps && deps.sleep) || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = (deps && deps.random) || Math.random;
  const logger = deps && typeof deps.logger === 'function' ? deps.logger : null;
  const maxAttempts = (deps && deps.maxAttempts) || DEFAULT_MAX_ATTEMPTS;

  if (typeof httpRequest !== 'function') {
    throw zohoSignError(ZOHO_ERROR_CODES.INVALID_INPUT, 'createZohoSignClient requires an httpRequest function');
  }
  if (!config || !config.apiBase) {
    throw zohoSignError(ZOHO_ERROR_CODES.NOT_CONFIGURED, 'Zoho Sign has no API base URL configured');
  }
  if (!auth || typeof auth.withAccessToken !== 'function') {
    throw zohoSignError(ZOHO_ERROR_CODES.INVALID_INPUT, 'createZohoSignClient requires a zoho-sign-auth instance');
  }

  const redact = createRedactor([config.clientSecret, config.refreshToken, config.webhookSecret]);

  function warn(message) {
    if (!logger) return;
    const safe = redact(message);
    if (safe === null) return;
    logger(safe);
  }

  function buildUrl(path, query) {
    const url = `${config.apiBase}${path}`;
    if (!query) return url;
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      search.set(key, String(value));
    }
    const qs = search.toString();
    return qs ? `${url}?${qs}` : url;
  }

  async function sendOnce(spec, token) {
    const headers = Object.assign({ Authorization: `${ZOHO_AUTH_SCHEME} ${token}` }, spec.headers || {});
    try {
      return await httpRequest({
        method: spec.method,
        url: spec.url,
        headers,
        body: spec.body,
        responseType: spec.responseType || 'text',
      });
    } catch (e) {
      throw zohoSignError(ZOHO_ERROR_CODES.NETWORK_ERROR, FRIENDLY_MESSAGES[ZOHO_ERROR_CODES.NETWORK_ERROR], { retryable: true });
    }
  }

  /**
   * One Zoho call, with backoff. Auth failures are thrown straight out rather than retried here
   * — zoho-sign-auth owns the refresh-once-retry-once decision, and retrying a stale token with
   * a longer sleep only wastes the rate-limit budget.
   */
  async function callWithBackoff(spec, token) {
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await sendOnce(spec, token).catch((err) => err);

      if (response instanceof Error) {
        lastError = response;
      } else {
        const wantsBuffer = spec.responseType === 'buffer';
        const payload = wantsBuffer ? null : parseJsonBody(response.body);
        if (isZohoSuccess(response.status, payload)) {
          return wantsBuffer
            ? { status: response.status, buffer: response.body, headers: response.headers || {} }
            : { status: response.status, data: payload, headers: response.headers || {} };
        }
        lastError = normalizeZohoResponse(response.status, response.body, spec.context);
        lastError.retryAfterMs = retryAfterMs(response.headers);
      }

      if (!lastError.retryable || attempt === maxAttempts - 1) break;
      warn(`Zoho Sign ${spec.context || spec.method} failed with ${lastError.code}; retrying (attempt ${attempt + 1}/${maxAttempts})`);
      const wait = lastError.retryAfterMs || computeBackoffDelayMs(attempt, { random });
      await sleep(wait);
    }
    throw lastError;
  }

  function call(spec) {
    return auth.withAccessToken((token) => callWithBackoff(spec, token));
  }

  // ---- The nine calls -----------------------------------------------------

  /** Step 1 of a send: upload the PDF and the recipient actions. Returns Zoho's `requests` object. */
  async function createRequest(options) {
    const opts = options || {};
    const files = Array.isArray(opts.files) ? opts.files : [];
    if (files.length === 0) throw zohoSignError(ZOHO_ERROR_CODES.INVALID_INPUT, 'createRequest needs at least one file');
    if (!opts.data || typeof opts.data !== 'object') throw zohoSignError(ZOHO_ERROR_CODES.INVALID_INPUT, 'createRequest needs a data payload');

    const result = await call({
      method: 'POST',
      url: buildUrl('/requests', opts.query),
      body: buildMultipartBody(files, opts.data, opts.extraFields),
      context: 'create request',
    });
    return result.data && result.data.requests ? result.data.requests : result.data;
  }

  /** Step 2 of a send: place the fields on each action and hand the request to Zoho to deliver. */
  async function submitRequest(requestId, data) {
    const id = assertZohoId(requestId, 'Zoho request id');
    if (!data || typeof data !== 'object') throw zohoSignError(ZOHO_ERROR_CODES.INVALID_INPUT, 'submitRequest needs a data payload');
    const body = new URLSearchParams({ data: JSON.stringify(data) }).toString();
    const result = await call({
      method: 'POST',
      url: buildUrl(`/requests/${encodeURIComponent(id)}/submit`),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      context: 'submit request',
    });
    return result.data && result.data.requests ? result.data.requests : result.data;
  }

  /** Status of one request. The poller's whole job, one call per document. */
  async function getRequest(requestId) {
    const id = assertZohoId(requestId, 'Zoho request id');
    const result = await call({
      method: 'GET',
      url: buildUrl(`/requests/${encodeURIComponent(id)}`),
      context: 'get request',
    });
    return result.data && result.data.requests ? result.data.requests : result.data;
  }

  /** Paged list. Zoho documents no status filter, so this is for diagnostics, not the poller. */
  async function listRequests(options) {
    const opts = options || {};
    const pageContext = {
      row_count: Number(opts.rowCount) > 0 ? Number(opts.rowCount) : 10,
      start_index: Number(opts.startIndex) > 0 ? Number(opts.startIndex) : 1,
      sort_column: opts.sortColumn || 'created_time',
      sort_order: opts.sortOrder || 'DESC',
    };
    const result = await call({
      method: 'GET',
      url: buildUrl('/requests', { data: JSON.stringify({ page_context: pageContext }) }),
      context: 'list requests',
    });
    return result.data;
  }

  /** CPQ's "void" for a Zoho document: recipients can no longer open or sign it. */
  async function recall(requestId) {
    const id = assertZohoId(requestId, 'Zoho request id');
    const result = await call({
      method: 'POST',
      url: buildUrl(`/requests/${encodeURIComponent(id)}/recall`),
      context: 'recall request',
    });
    return result.data;
  }

  /** Zoho sends the reminder email, not CPQ. */
  async function remind(requestId) {
    const id = assertZohoId(requestId, 'Zoho request id');
    const result = await call({
      method: 'POST',
      url: buildUrl(`/requests/${encodeURIComponent(id)}/remind`),
      context: 'remind recipients',
    });
    return result.data;
  }

  /** Completed PDF. `with_coc` + `merge` give one file containing document and certificate. */
  async function downloadPdf(requestId, options) {
    const id = assertZohoId(requestId, 'Zoho request id');
    const opts = options || {};
    const result = await call({
      method: 'GET',
      url: buildUrl(`/requests/${encodeURIComponent(id)}/pdf`, {
        with_coc: opts.withCoc === false ? 'false' : 'true',
        merge: opts.merge === false ? 'false' : 'true',
      }),
      responseType: 'buffer',
      context: 'download signed PDF',
    });
    return { buffer: result.buffer, contentType: (result.headers && (result.headers['content-type'] || result.headers['Content-Type'])) || 'application/pdf' };
  }

  /** The audit trail, stored separately so the UI can offer it as its own download. */
  async function downloadCertificate(requestId) {
    const id = assertZohoId(requestId, 'Zoho request id');
    const result = await call({
      method: 'GET',
      url: buildUrl(`/requests/${encodeURIComponent(id)}/completioncertificate`),
      responseType: 'buffer',
      context: 'download completion certificate',
    });
    return { buffer: result.buffer, contentType: (result.headers && (result.headers['content-type'] || result.headers['Content-Type'])) || 'application/pdf' };
  }

  /**
   * Embedded-signing URL. Valid for two minutes and single use, so it is minted immediately
   * before the iframe loads and the result is never persisted, cached or logged.
   */
  async function embedToken(requestId, actionId, options) {
    const id = assertZohoId(requestId, 'Zoho request id');
    const action = assertZohoId(actionId, 'Zoho action id');
    const opts = options || {};
    if (!opts.host) throw zohoSignError(ZOHO_ERROR_CODES.INVALID_INPUT, 'embedToken needs the host origin');

    const params = new URLSearchParams({ host: String(opts.host) });
    if (opts.redirectPages && typeof opts.redirectPages === 'object') {
      params.set('redirect_pages', JSON.stringify(opts.redirectPages));
    }
    const result = await call({
      method: 'POST',
      url: buildUrl(`/requests/${encodeURIComponent(id)}/actions/${encodeURIComponent(action)}/embedtoken`),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      context: 'create embed token',
    });
    return result.data;
  }

  return {
    createRequest,
    submitRequest,
    getRequest,
    listRequests,
    recall,
    remind,
    downloadPdf,
    downloadCertificate,
    embedToken,
  };
}

module.exports = {
  ZOHO_AUTH_SCHEME,
  ZOHO_ERROR_CODES,
  ZOHO_SUCCESS_CODE,
  DEFAULT_MAX_ATTEMPTS,
  containsSecret,
  redactTokenShapes,
  createRedactor,
  computeBackoffDelayMs,
  retryAfterMs,
  normalizeZohoResponse,
  isZohoSuccess,
  assertZohoId,
  createZohoSignClient,
};
