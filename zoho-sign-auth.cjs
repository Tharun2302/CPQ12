'use strict';

// OAuth token handling for Zoho Sign. Kept out of server.cjs so the cache, the single-flight
// lock and the 401-retry decision can be unit tested with a fake transport and a fake store —
// no network, no database.
//
// Injected contracts, so nothing here reaches the outside world on its own:
//   httpRequest({ method, url, headers, body }) -> { status, body }   body: string
//   store.load() -> record | null,  store.save(record)                record: the
//     `zoho_sign_tokens` shape from the design (_id 'zoho-sign', access_token, expires_at,
//     api_domain, updated_at). The REFRESH TOKEN IS NEVER WRITTEN THERE — it stays in .env.
//
// Nothing in this file logs a token, a refresh token or a client secret, at any level.

const ZOHO_TOKEN_PATH = '/oauth/v2/token';

// Zoho access tokens last 3600s. Refresh two minutes early so a call that is already in flight
// when the clock rolls over does not fail on an expiry we could see coming.
const TOKEN_EXPIRY_SKEW_MS = 120000;
const DEFAULT_TOKEN_TTL_SECONDS = 3600;

const ZOHO_ERROR_CODES = Object.freeze({
  AUTH_FAILED: 'ZOHO_AUTH_FAILED',
  NOT_CONFIGURED: 'ZOHO_NOT_CONFIGURED',
  RATE_LIMITED: 'ZOHO_RATE_LIMITED',
  NOT_FOUND: 'ZOHO_NOT_FOUND',
  SERVER_ERROR: 'ZOHO_SERVER_ERROR',
  NETWORK_ERROR: 'ZOHO_NETWORK_ERROR',
  API_ERROR: 'ZOHO_API_ERROR',
  INVALID_INPUT: 'ZOHO_INVALID_INPUT',
});

// Zoho publishes no exhaustive error-code table, so the token-expiry signal is matched on the
// strings it is actually observed to send as well as on the HTTP status. Additive by design:
// an unmatched marker degrades to "not an auth failure", which surfaces the real error instead
// of hiding it behind a pointless refresh.
const ZOHO_INVALID_TOKEN_MARKERS = Object.freeze([
  'INVALID_OAUTHTOKEN',
  'INVALID_TOKEN',
  'EXPIRED_TOKEN',
  'AUTHTOKEN_EXPIRED',
  'INVALID_OAUTH',
]);

// Deep enough for the shapes that actually occur: axios wraps the original in `cause`, and a
// Happy Eyeballs failure — the one this suffix exists to diagnose — is an AggregateError whose
// per-address errors hold the only real code.
const TRANSPORT_CAUSE_DEPTH = 3;

/**
 * ` (ETIMEDOUT)` for a transport failure that names a code, `''` otherwise. Only the code is
 * taken, never the message: a raw transport message can carry the request URL, and a token
 * call's URL carries the client id. Codes are a fixed vocabulary — Node syscall names plus
 * axios's own ECONNABORTED — so the result is safe to show a user.
 */
function transportCauseSuffix(error, depth) {
  const remaining = typeof depth === 'number' ? depth : TRANSPORT_CAUSE_DEPTH;
  if (!error || typeof error !== 'object' || remaining <= 0) return '';
  if (typeof error.code === 'string' && error.code !== '') return ` (${error.code})`;
  if (Array.isArray(error.errors)) {
    for (const inner of error.errors) {
      const found = transportCauseSuffix(inner, remaining - 1);
      if (found !== '') return found;
    }
  }
  return transportCauseSuffix(error.cause, remaining - 1);
}

/** Normalised error every Zoho module throws. `message` is safe to show a user. */
function zohoSignError(code, message, extra) {
  const err = new Error(message);
  err.name = 'ZohoSignError';
  err.code = code;
  Object.assign(err, extra || {});
  return err;
}

function toEpochMs(value) {
  if (value == null) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** A cached token is usable only while it still has more than the skew left on it. */
function isAccessTokenFresh(record, nowMs, skewMs) {
  if (!record || !record.access_token) return false;
  const skew = typeof skewMs === 'number' ? skewMs : TOKEN_EXPIRY_SKEW_MS;
  return toEpochMs(record.expires_at) - skew > nowMs;
}

function containsInvalidTokenMarker(text) {
  const upper = String(text == null ? '' : text).toUpperCase();
  return ZOHO_INVALID_TOKEN_MARKERS.some((marker) => upper.includes(marker));
}

/** True when the failure is "your access token is no longer good", not a real API error. */
function isZohoAuthFailure(error) {
  if (!error) return false;
  if (error.status === 401) return true;
  if (error.code === ZOHO_ERROR_CODES.AUTH_FAILED) return true;
  return containsInvalidTokenMarker(error.zohoMessage || error.zohoCode || '');
}

/**
 * The whole 401 policy in one function: refresh once, retry once, then give up. Retrying a
 * second time cannot help — the refresh already produced a brand-new token — and it doubles
 * the load against a 50 calls/minute ceiling.
 */
function shouldRetryAfterAuthFailure(error, attempt) {
  return isZohoAuthFailure(error) && Number(attempt || 0) < 1;
}

/**
 * Refresh call, as data. Built here rather than inline so a test can assert the grant type and
 * the accounts domain without a transport — a refresh sent to the wrong data centre is one of
 * the easiest Zoho mistakes to make and one of the hardest to read from the error.
 */
function buildRefreshRequest(config) {
  if (!config || !config.accountsBase) {
    throw zohoSignError(ZOHO_ERROR_CODES.NOT_CONFIGURED, 'Zoho Sign has no accounts base URL configured');
  }
  const missing = ['clientId', 'clientSecret', 'refreshToken'].filter((k) => !config[k]);
  if (missing.length > 0) {
    throw zohoSignError(
      ZOHO_ERROR_CODES.NOT_CONFIGURED,
      'Zoho Sign is missing credentials in .env: '
        + missing.map((k) => ({ clientId: 'ZOHO_SIGN_CLIENT_ID', clientSecret: 'ZOHO_SIGN_CLIENT_SECRET', refreshToken: 'ZOHO_SIGN_REFRESH_TOKEN' }[k])).join(', '),
    );
  }
  const params = new URLSearchParams();
  params.set('grant_type', 'refresh_token');
  params.set('client_id', config.clientId);
  params.set('client_secret', config.clientSecret);
  params.set('refresh_token', config.refreshToken);

  return {
    method: 'POST',
    url: `${config.accountsBase}${ZOHO_TOKEN_PATH}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  };
}

/**
 * Zoho answers a bad refresh with HTTP 200 and `{"error":"invalid_client"}`, so the status code
 * alone decides nothing. The error slug is a fixed vocabulary word, never a credential, so it
 * is safe to surface.
 */
function parseTokenResponse(status, body, nowMs) {
  let payload = body;
  if (typeof body === 'string') {
    try {
      payload = JSON.parse(body);
    } catch (e) {
      payload = null;
    }
  }
  if (!payload || typeof payload !== 'object') {
    throw zohoSignError(ZOHO_ERROR_CODES.AUTH_FAILED, 'Zoho returned an unreadable token response', { status });
  }
  if (payload.error) {
    throw zohoSignError(ZOHO_ERROR_CODES.AUTH_FAILED, `Zoho rejected the token refresh (${String(payload.error)})`, { status });
  }
  if (!payload.access_token) {
    throw zohoSignError(ZOHO_ERROR_CODES.AUTH_FAILED, 'Zoho returned no access token', { status });
  }
  const ttlSeconds = Number(payload.expires_in);
  const ttl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : DEFAULT_TOKEN_TTL_SECONDS;
  return {
    access_token: String(payload.access_token),
    expires_at: new Date(nowMs + ttl * 1000),
    api_domain: payload.api_domain ? String(payload.api_domain) : '',
    updated_at: new Date(nowMs),
  };
}

/**
 * Token provider. One per process.
 *
 * @param {object} deps
 * @param {object} deps.config      resolved zoho-sign-config object
 * @param {Function} deps.httpRequest  transport, see the header contract
 * @param {object} [deps.store]     persistent cache; omit for memory-only
 * @param {Function} [deps.now]     clock, for tests
 */
function createZohoSignAuth(deps) {
  const { config, httpRequest, store } = deps || {};
  const now = (deps && deps.now) || (() => Date.now());
  if (typeof httpRequest !== 'function') {
    throw zohoSignError(ZOHO_ERROR_CODES.INVALID_INPUT, 'createZohoSignAuth requires an httpRequest function');
  }

  let cached = null;
  let storeChecked = false;
  // The single-flight lock. Ten callers hitting an expired token must cost ONE refresh, not ten:
  // Zoho counts every refresh against the same 50/minute ceiling as real work.
  let pendingRefresh = null;

  async function loadFromStore() {
    if (!store || typeof store.load !== 'function') return null;
    try {
      return await store.load();
    } catch (e) {
      // A cache miss is survivable — we just refresh. Never let the store break signing.
      return null;
    }
  }

  async function saveToStore(record) {
    if (!store || typeof store.save !== 'function') return;
    try {
      await store.save(record);
    } catch (e) {
      // Same reasoning: the in-memory copy is authoritative for this process.
    }
  }

  async function refreshNow() {
    // Another process may have refreshed while we were expiring. One read is far cheaper than
    // a redundant refresh, and it keeps a restart loop from burning the rate limit.
    const stored = await loadFromStore();
    if (isAccessTokenFresh(stored, now())) {
      cached = stored;
      return cached;
    }

    const request = buildRefreshRequest(config);
    let response;
    try {
      response = await httpRequest(request);
    } catch (e) {
      // The transport code is the whole diagnosis for this class of failure (ETIMEDOUT vs
      // ENOTFOUND vs ECONNREFUSED point at three different fixes) and it is a fixed
      // vocabulary word, never a credential — so it is carried into the message.
      throw zohoSignError(
        ZOHO_ERROR_CODES.NETWORK_ERROR,
        `Could not reach Zoho to refresh the access token${transportCauseSuffix(e)}`,
      );
    }
    const record = parseTokenResponse(response && response.status, response && response.body, now());
    cached = record;
    await saveToStore(record);
    return record;
  }

  /** Current token, refreshing if needed. Concurrent callers share one refresh. */
  async function getAccessToken(options) {
    const force = !!(options && options.forceRefresh);

    if (!force && isAccessTokenFresh(cached, now())) return cached.access_token;

    if (!force && !storeChecked) {
      storeChecked = true;
      const stored = await loadFromStore();
      if (isAccessTokenFresh(stored, now())) {
        cached = stored;
        return cached.access_token;
      }
    }

    if (!pendingRefresh) {
      storeChecked = true;
      pendingRefresh = refreshNow().finally(() => {
        pendingRefresh = null;
      });
    }
    const record = await pendingRefresh;
    return record.access_token;
  }

  /** Drop the cached token so the next call refreshes. Used by the 401 path. */
  function invalidateAccessToken() {
    cached = null;
  }

  /** Expiry only — for GET /api/zoho-sign/status. The token itself never leaves this module. */
  function peekTokenExpiry() {
    return cached && cached.expires_at ? new Date(toEpochMs(cached.expires_at)) : null;
  }

  /**
   * Run an authenticated call. `call(token)` does the work; on an auth failure this refreshes
   * once, retries once, and the caller never sees the 401 (acceptance criterion 8).
   */
  async function withAccessToken(call) {
    for (let attempt = 0; ; attempt += 1) {
      const token = await getAccessToken({ forceRefresh: attempt > 0 });
      try {
        return await call(token);
      } catch (err) {
        if (!shouldRetryAfterAuthFailure(err, attempt)) throw err;
        invalidateAccessToken();
      }
    }
  }

  return { getAccessToken, invalidateAccessToken, peekTokenExpiry, withAccessToken };
}

module.exports = {
  ZOHO_ERROR_CODES,
  transportCauseSuffix,
  ZOHO_INVALID_TOKEN_MARKERS,
  TOKEN_EXPIRY_SKEW_MS,
  ZOHO_TOKEN_PATH,
  zohoSignError,
  isAccessTokenFresh,
  isZohoAuthFailure,
  shouldRetryAfterAuthFailure,
  buildRefreshRequest,
  parseTokenResponse,
  createZohoSignAuth,
};
