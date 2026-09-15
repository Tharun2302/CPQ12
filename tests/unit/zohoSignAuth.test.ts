import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import zohoAuth from '../../zoho-sign-auth.cjs';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import zohoConfig from '../../zoho-sign-config.cjs';

// The rules this file pins are the ones that cost real money or real outages when they are
// wrong: one refresh for many concurrent callers, exactly one retry after a 401, and never a
// token or secret in anything the module hands back. Every transport here is a fake — no test
// in this file opens a socket.

type TokenRecord = { access_token: string; expires_at: Date; api_domain: string; updated_at: Date };
type HttpSpec = { method: string; url: string; headers: Record<string, string>; body: string };
type HttpResponse = { status: number; body: string };

const {
  ZOHO_ERROR_CODES, TOKEN_EXPIRY_SKEW_MS, isAccessTokenFresh, isZohoAuthFailure,
  shouldRetryAfterAuthFailure, buildRefreshRequest, parseTokenResponse, createZohoSignAuth,
} = zohoAuth as {
  ZOHO_ERROR_CODES: Record<string, string>;
  TOKEN_EXPIRY_SKEW_MS: number;
  isAccessTokenFresh: (record: unknown, nowMs: number, skewMs?: number) => boolean;
  isZohoAuthFailure: (error: unknown) => boolean;
  shouldRetryAfterAuthFailure: (error: unknown, attempt: number) => boolean;
  buildRefreshRequest: (config: unknown) => HttpSpec;
  parseTokenResponse: (status: number, body: unknown, nowMs: number) => TokenRecord;
  createZohoSignAuth: (deps: Record<string, unknown>) => {
    getAccessToken: (options?: { forceRefresh?: boolean }) => Promise<string>;
    invalidateAccessToken: () => void;
    peekTokenExpiry: () => Date | null;
    withAccessToken: <T>(call: (token: string) => Promise<T>) => Promise<T>;
  };
};

const { resolveZohoSignConfig } = zohoConfig as { resolveZohoSignConfig: (env: unknown) => Record<string, unknown> };

const CLIENT_SECRET = 'super-secret-client-value-0001';
const REFRESH_TOKEN = '1000.refresh-token-value-0002.aaaa';
const NOW = Date.UTC(2026, 8, 14, 10, 0, 0);

function testConfig(overrides: Record<string, string> = {}) {
  return resolveZohoSignConfig({
    ZOHO_SIGN_ENABLED: '1',
    ZOHO_SIGN_DC: 'eu',
    ZOHO_SIGN_CLIENT_ID: '1000.CLIENTID',
    ZOHO_SIGN_CLIENT_SECRET: CLIENT_SECRET,
    ZOHO_SIGN_REFRESH_TOKEN: REFRESH_TOKEN,
    ...overrides,
  });
}

function tokenResponse(accessToken: string, expiresIn = 3600): HttpResponse {
  return { status: 200, body: JSON.stringify({ access_token: accessToken, expires_in: expiresIn, api_domain: 'https://www.zohoapis.eu' }) };
}

describe('isAccessTokenFresh', () => {
  it('is false with no record and no token', () => {
    expect(isAccessTokenFresh(null, NOW)).toBe(false);
    expect(isAccessTokenFresh({ expires_at: new Date(NOW + 3600000) }, NOW)).toBe(false);
  });

  it('is true well inside the window and false once only the skew is left', () => {
    expect(isAccessTokenFresh({ access_token: 't', expires_at: new Date(NOW + 3600000) }, NOW)).toBe(true);
    expect(isAccessTokenFresh({ access_token: 't', expires_at: new Date(NOW + TOKEN_EXPIRY_SKEW_MS - 1) }, NOW)).toBe(false);
  });

  it('accepts an expiry stored as an ISO string, which is what comes back out of Mongo', () => {
    expect(isAccessTokenFresh({ access_token: 't', expires_at: new Date(NOW + 3600000).toISOString() }, NOW)).toBe(true);
  });

  it('treats an unparseable expiry as expired rather than as forever', () => {
    expect(isAccessTokenFresh({ access_token: 't', expires_at: 'not a date' }, NOW)).toBe(false);
  });
});

describe('the 401 retry decision', () => {
  it('recognises a 401 and the invalid-token markers Zoho actually sends', () => {
    expect(isZohoAuthFailure({ status: 401 })).toBe(true);
    expect(isZohoAuthFailure({ status: 200, zohoMessage: 'INVALID_OAUTHTOKEN' })).toBe(true);
    expect(isZohoAuthFailure({ code: ZOHO_ERROR_CODES.AUTH_FAILED })).toBe(true);
  });

  it('does not treat an ordinary failure as an auth failure, so a real error is not hidden by a refresh', () => {
    expect(isZohoAuthFailure({ status: 429 })).toBe(false);
    expect(isZohoAuthFailure({ status: 400, zohoMessage: 'Extra key found' })).toBe(false);
    expect(isZohoAuthFailure(null)).toBe(false);
  });

  it('allows exactly one retry', () => {
    expect(shouldRetryAfterAuthFailure({ status: 401 }, 0)).toBe(true);
    expect(shouldRetryAfterAuthFailure({ status: 401 }, 1)).toBe(false);
    expect(shouldRetryAfterAuthFailure({ status: 429 }, 0)).toBe(false);
  });
});

describe('buildRefreshRequest', () => {
  it('posts the refresh grant to the accounts domain of the configured data centre', () => {
    const spec = buildRefreshRequest(testConfig());
    expect(spec.method).toBe('POST');
    expect(spec.url).toBe('https://accounts.zoho.eu/oauth/v2/token');
    expect(spec.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const params = new URLSearchParams(spec.body);
    expect(params.get('grant_type')).toBe('refresh_token');
    expect(params.get('refresh_token')).toBe(REFRESH_TOKEN);
  });

  it('refuses with a named-keys message when a credential is missing', () => {
    expect(() => buildRefreshRequest(testConfig({ ZOHO_SIGN_REFRESH_TOKEN: '' })))
      .toThrowError(/ZOHO_SIGN_REFRESH_TOKEN/);
  });

  it('refuses when there is no accounts base at all', () => {
    expect(() => buildRefreshRequest({ clientId: 'a', clientSecret: 'b', refreshToken: 'c' })).toThrowError(/accounts base/);
  });
});

describe('parseTokenResponse', () => {
  it('turns a good response into the zoho_sign_tokens record shape', () => {
    const record = parseTokenResponse(200, tokenResponse('access-1').body, NOW);
    expect(record.access_token).toBe('access-1');
    expect(record.expires_at.getTime()).toBe(NOW + 3600000);
    expect(record.api_domain).toBe('https://www.zohoapis.eu');
  });

  it('never carries the refresh token into the record, because that stays in .env only', () => {
    const body = JSON.stringify({ access_token: 'access-1', refresh_token: REFRESH_TOKEN, expires_in: 3600 });
    const record = parseTokenResponse(200, body, NOW);
    expect(JSON.stringify(record)).not.toContain(REFRESH_TOKEN);
  });

  it('treats Zoho 200-with-an-error-slug as a failure', () => {
    // Zoho answers a bad refresh with HTTP 200, so the status alone decides nothing.
    expect(() => parseTokenResponse(200, JSON.stringify({ error: 'invalid_client' }), NOW))
      .toThrowError(/invalid_client/);
  });

  it('rejects an unreadable body and a body with no token', () => {
    expect(() => parseTokenResponse(200, 'not json at all', NOW)).toThrowError(/unreadable/);
    expect(() => parseTokenResponse(200, JSON.stringify({ expires_in: 3600 }), NOW)).toThrowError(/no access token/);
  });

  it('falls back to the documented one-hour lifetime when expires_in is absent or nonsense', () => {
    expect(parseTokenResponse(200, JSON.stringify({ access_token: 'a' }), NOW).expires_at.getTime()).toBe(NOW + 3600000);
    expect(parseTokenResponse(200, JSON.stringify({ access_token: 'a', expires_in: 'soon' }), NOW).expires_at.getTime()).toBe(NOW + 3600000);
  });
});

describe('createZohoSignAuth', () => {
  it('refuses to build without a transport, so nothing can quietly reach the network', () => {
    expect(() => createZohoSignAuth({ config: testConfig() })).toThrowError(/httpRequest/);
  });

  it('refreshes once and then serves the cached token', async () => {
    const httpRequest = vi.fn(async () => tokenResponse('access-1'));
    const auth = createZohoSignAuth({ config: testConfig(), httpRequest, now: () => NOW });

    expect(await auth.getAccessToken()).toBe('access-1');
    expect(await auth.getAccessToken()).toBe('access-1');
    expect(httpRequest).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent callers into a single refresh', async () => {
    // Ten callers finding an expired token must cost ONE refresh: Zoho counts refreshes against
    // the same 50-calls-per-minute ceiling as real work.
    let resolveHttp: (value: HttpResponse) => void = () => {};
    const inFlight = new Promise<HttpResponse>((resolve) => { resolveHttp = resolve; });
    const httpRequest = vi.fn(() => inFlight);
    const auth = createZohoSignAuth({ config: testConfig(), httpRequest, now: () => NOW });

    const pending = Promise.all(Array.from({ length: 10 }, () => auth.getAccessToken()));
    resolveHttp(tokenResponse('access-1'));
    const tokens = await pending;

    expect(tokens).toEqual(Array.from({ length: 10 }, () => 'access-1'));
    expect(httpRequest).toHaveBeenCalledTimes(1);
  });

  it('releases the lock after a failed refresh so the next caller can try again', async () => {
    const httpRequest = vi.fn()
      .mockResolvedValueOnce({ status: 200, body: JSON.stringify({ error: 'invalid_client' }) })
      .mockResolvedValueOnce(tokenResponse('access-2'));
    const auth = createZohoSignAuth({ config: testConfig(), httpRequest, now: () => NOW });

    await expect(auth.getAccessToken()).rejects.toThrowError(/invalid_client/);
    expect(await auth.getAccessToken()).toBe('access-2');
  });

  it('adopts a still-valid token from the store instead of refreshing after a restart', async () => {
    const httpRequest = vi.fn(async () => tokenResponse('access-new'));
    const store = {
      load: vi.fn(async () => ({ access_token: 'access-from-store', expires_at: new Date(NOW + 3000000) })),
      save: vi.fn(async () => {}),
    };
    const auth = createZohoSignAuth({ config: testConfig(), httpRequest, store, now: () => NOW });

    expect(await auth.getAccessToken()).toBe('access-from-store');
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it('refreshes and persists when the stored token is stale', async () => {
    const httpRequest = vi.fn(async () => tokenResponse('access-new'));
    const store = {
      load: vi.fn(async () => ({ access_token: 'old', expires_at: new Date(NOW - 1000) })),
      save: vi.fn(async () => {}),
    };
    const auth = createZohoSignAuth({ config: testConfig(), httpRequest, store, now: () => NOW });

    expect(await auth.getAccessToken()).toBe('access-new');
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(store.save.mock.calls[0][0]).toMatchObject({ access_token: 'access-new' });
  });

  it('keeps working when the store is broken, because a cache miss must not break signing', async () => {
    const httpRequest = vi.fn(async () => tokenResponse('access-1'));
    const store = {
      load: vi.fn(async () => { throw new Error('mongo down'); }),
      save: vi.fn(async () => { throw new Error('mongo down'); }),
    };
    const auth = createZohoSignAuth({ config: testConfig(), httpRequest, store, now: () => NOW });
    expect(await auth.getAccessToken()).toBe('access-1');
  });

  it('turns an unreachable accounts domain into a normalised network error', async () => {
    const httpRequest = vi.fn(async () => { throw new Error('ECONNREFUSED 10.0.0.1:443'); });
    const auth = createZohoSignAuth({ config: testConfig(), httpRequest, now: () => NOW });
    await expect(auth.getAccessToken()).rejects.toMatchObject({ code: ZOHO_ERROR_CODES.NETWORK_ERROR });
  });

  it('exposes the expiry but never the token itself', async () => {
    const httpRequest = vi.fn(async () => tokenResponse('access-1'));
    const auth = createZohoSignAuth({ config: testConfig(), httpRequest, now: () => NOW });
    expect(auth.peekTokenExpiry()).toBeNull();
    await auth.getAccessToken();
    expect(auth.peekTokenExpiry()?.getTime()).toBe(NOW + 3600000);
    expect(Object.keys(auth)).not.toContain('accessToken');
  });
});

describe('withAccessToken', () => {
  it('refreshes once and retries once on a 401, and the caller never sees it', async () => {
    const httpRequest = vi.fn()
      .mockResolvedValueOnce(tokenResponse('stale-token'))
      .mockResolvedValueOnce(tokenResponse('fresh-token'));
    const auth = createZohoSignAuth({ config: testConfig(), httpRequest, now: () => NOW });

    const seen: string[] = [];
    const result = await auth.withAccessToken(async (token: string) => {
      seen.push(token);
      if (token === 'stale-token') throw Object.assign(new Error('unauthorised'), { status: 401 });
      return 'done';
    });

    expect(result).toBe('done');
    expect(seen).toEqual(['stale-token', 'fresh-token']);
    expect(httpRequest).toHaveBeenCalledTimes(2);
  });

  it('gives up after the second 401 instead of looping against the rate limit', async () => {
    const httpRequest = vi.fn(async () => tokenResponse('token'));
    const auth = createZohoSignAuth({ config: testConfig(), httpRequest, now: () => NOW });
    const call = vi.fn(async () => { throw Object.assign(new Error('unauthorised'), { status: 401 }); });

    await expect(auth.withAccessToken(call)).rejects.toThrowError(/unauthorised/);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('passes a non-auth failure straight through without spending a refresh', async () => {
    const httpRequest = vi.fn(async () => tokenResponse('token'));
    const auth = createZohoSignAuth({ config: testConfig(), httpRequest, now: () => NOW });
    const call = vi.fn(async () => { throw Object.assign(new Error('rate limited'), { status: 429 }); });

    await expect(auth.withAccessToken(call)).rejects.toThrowError(/rate limited/);
    expect(call).toHaveBeenCalledTimes(1);
    expect(httpRequest).toHaveBeenCalledTimes(1);
  });
});
