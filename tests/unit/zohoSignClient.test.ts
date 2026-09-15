import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import zohoClient from '../../zoho-sign-client.cjs';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import zohoAuth from '../../zoho-sign-auth.cjs';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import zohoConfig from '../../zoho-sign-config.cjs';

// Every transport in this file is a fake. Nothing here opens a socket, which is the point: the
// Zoho account does not exist yet, so the client has to be provable against a stand-in.
//
// The three behaviours worth failing a build over: a 429 must never mark a document failed, a
// 200 carrying a non-zero Zoho code must not read as success, and no log line may carry a
// secret.

type HttpCall = { method: string; url: string; headers: Record<string, string>; body: unknown; responseType: string };
type HttpResponse = { status: number; body: unknown; headers?: Record<string, string> };

const {
  ZOHO_AUTH_SCHEME, ZOHO_ERROR_CODES, containsSecret, redactTokenShapes, createRedactor,
  computeBackoffDelayMs, retryAfterMs, normalizeZohoResponse, isZohoSuccess, assertZohoId,
  createZohoSignClient,
} = zohoClient as {
  ZOHO_AUTH_SCHEME: string;
  ZOHO_ERROR_CODES: Record<string, string>;
  containsSecret: (text: unknown, secrets: unknown[]) => boolean;
  redactTokenShapes: (text: unknown) => string;
  createRedactor: (secrets: unknown[]) => (text: unknown) => string | null;
  computeBackoffDelayMs: (attempt: number, options?: Record<string, unknown>) => number;
  retryAfterMs: (headers: unknown) => number;
  normalizeZohoResponse: (status: number, body: unknown, context?: string) => Error & { code: string; retryable: boolean; zohoCode: unknown };
  isZohoSuccess: (status: number, payload: unknown) => boolean;
  assertZohoId: (value: unknown, label?: string) => string;
  createZohoSignClient: (deps: Record<string, unknown>) => Record<string, (...args: never[]) => Promise<unknown>>;
};

const { createZohoSignAuth } = zohoAuth as { createZohoSignAuth: (deps: Record<string, unknown>) => Record<string, unknown> };
const { resolveZohoSignConfig } = zohoConfig as { resolveZohoSignConfig: (env: unknown) => Record<string, unknown> };

const CLIENT_SECRET = 'super-secret-client-value-0001';
const REFRESH_TOKEN = '1000.refresh-token-value-0002.aaaa';
const WEBHOOK_SECRET = 'webhook-hmac-secret-0003';
const API_BASE = 'https://sign.zoho.com/api/v1';

function testConfig(overrides: Record<string, string> = {}) {
  return resolveZohoSignConfig({
    ZOHO_SIGN_ENABLED: '1',
    ZOHO_SIGN_CLIENT_ID: '1000.CLIENTID',
    ZOHO_SIGN_CLIENT_SECRET: CLIENT_SECRET,
    ZOHO_SIGN_REFRESH_TOKEN: REFRESH_TOKEN,
    ZOHO_SIGN_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ...overrides,
  });
}

/** Auth stand-in: hands over a fixed token and never refreshes. */
const staticAuth = { withAccessToken: (call: (token: string) => Promise<unknown>) => call('access-token-abc') };

function ok(payload: Record<string, unknown>): HttpResponse {
  return { status: 200, body: JSON.stringify({ code: 0, status: 'success', ...payload }) };
}

function buildClient(responses: HttpResponse[] | ((call: HttpCall) => HttpResponse), extra: Record<string, unknown> = {}) {
  const calls: HttpCall[] = [];
  const queue = Array.isArray(responses) ? responses.slice() : null;
  const httpRequest = vi.fn(async (call: HttpCall) => {
    calls.push(call);
    if (queue) {
      const next = queue.shift();
      if (!next) throw new Error('fake transport ran out of responses');
      return next;
    }
    return (responses as (call: HttpCall) => HttpResponse)(call);
  });
  const client = createZohoSignClient({
    config: testConfig(),
    auth: staticAuth,
    httpRequest,
    sleep: async () => {},
    random: () => 0.5,
    ...extra,
  });
  return { client, calls, httpRequest };
}

describe('redaction guard', () => {
  it('finds a configured secret anywhere in a line', () => {
    expect(containsSecret(`refresh failed for ${REFRESH_TOKEN}`, [CLIENT_SECRET, REFRESH_TOKEN])).toBe(true);
    expect(containsSecret('refresh failed', [CLIENT_SECRET, REFRESH_TOKEN])).toBe(false);
  });

  it('ignores short or absent secrets so a blank .env value never matches everything', () => {
    expect(containsSecret('anything at all', ['', 'abc', null, undefined])).toBe(false);
  });

  it('masks token-shaped values that are not in config, because access tokens are runtime-only', () => {
    expect(redactTokenShapes('Authorization: Zoho-oauthtoken 1000.abcdef.ghijkl')).toBe('Authorization: Zoho-oauthtoken [REDACTED]');
    expect(redactTokenShapes('{"access_token":"1000.xyz","expires_in":3600}')).toBe('{"access_token":"[REDACTED]","expires_in":3600}');
    expect(redactTokenShapes('grant_type=refresh_token&refresh_token=1000.abc&client_id=x')).toContain('refresh_token=[REDACTED]');
  });

  it('DROPS a line carrying a configured secret rather than half-masking it', () => {
    const redact = createRedactor([CLIENT_SECRET, REFRESH_TOKEN, WEBHOOK_SECRET]);
    expect(redact(`boom: ${CLIENT_SECRET}`)).toBeNull();
    expect(redact(`boom: ${WEBHOOK_SECRET}`)).toBeNull();
    expect(redact('boom: something ordinary')).toBe('boom: something ordinary');
  });

  it('never lets a secret or an access token reach the logger during a retry', async () => {
    const logged: string[] = [];
    const { client } = buildClient(
      [{ status: 429, body: JSON.stringify({ code: 2955, message: `limit hit for ${CLIENT_SECRET}` }) }, ok({ requests: { request_id: 'r1' } })],
      { logger: (line: string) => logged.push(line) },
    );

    await client.getRequest('r1' as never);

    expect(logged.length).toBeGreaterThan(0);
    const all = logged.join('\n');
    expect(all).not.toContain(CLIENT_SECRET);
    expect(all).not.toContain(REFRESH_TOKEN);
    expect(all).not.toContain(WEBHOOK_SECRET);
    expect(all).not.toContain('access-token-abc');
  });
});

describe('computeBackoffDelayMs', () => {
  it('grows exponentially and stays under the cap', () => {
    const random = () => 0.5;
    expect(computeBackoffDelayMs(0, { random })).toBe(500);
    expect(computeBackoffDelayMs(1, { random })).toBe(1000);
    expect(computeBackoffDelayMs(2, { random })).toBe(2000);
    expect(computeBackoffDelayMs(20, { random })).toBeLessThanOrEqual(8000);
  });

  it('spreads retries out, so a whole poll batch does not retry on the same millisecond', () => {
    const low = computeBackoffDelayMs(1, { random: () => 0 });
    const high = computeBackoffDelayMs(1, { random: () => 0.999 });
    expect(low).toBeLessThan(high);
    expect(low).toBe(500);
  });

  it('never returns a negative delay for a nonsense attempt number', () => {
    expect(computeBackoffDelayMs(-5, { random: () => 0 })).toBeGreaterThanOrEqual(0);
    expect(computeBackoffDelayMs(NaN, { random: () => 0 })).toBeGreaterThanOrEqual(0);
  });
});

describe('retryAfterMs', () => {
  it('believes Zoho when it says how long to wait, up to half a minute', () => {
    expect(retryAfterMs({ 'retry-after': '12' })).toBe(12000);
    expect(retryAfterMs({ 'Retry-After': '600' })).toBe(30000);
  });

  it('ignores an absent or unparseable header', () => {
    expect(retryAfterMs(null)).toBe(0);
    expect(retryAfterMs({})).toBe(0);
    expect(retryAfterMs({ 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' })).toBe(0);
  });
});

describe('normalizeZohoResponse', () => {
  it('maps the statuses the design names, and marks only the transient ones retryable', () => {
    expect(normalizeZohoResponse(401, '{}').code).toBe(ZOHO_ERROR_CODES.AUTH_FAILED);
    expect(normalizeZohoResponse(429, '{}').retryable).toBe(true);
    expect(normalizeZohoResponse(503, '{}').retryable).toBe(true);
    expect(normalizeZohoResponse(404, '{}').code).toBe(ZOHO_ERROR_CODES.NOT_FOUND);
    expect(normalizeZohoResponse(400, '{}').retryable).toBe(false);
  });

  it('treats a 403 as a plan or scope problem, not an expired token', () => {
    // Refreshing cannot fix a 403, and routing it through the auth retry spends a refresh to
    // fail identically.
    expect(normalizeZohoResponse(403, '{}').code).toBe(ZOHO_ERROR_CODES.API_ERROR);
  });

  it('reads Zoho error codes carried on a 200', () => {
    expect(normalizeZohoResponse(200, JSON.stringify({ code: 9004, message: 'not found' })).code).toBe(ZOHO_ERROR_CODES.NOT_FOUND);
    expect(normalizeZohoResponse(200, JSON.stringify({ code: 2955, message: 'limit' })).code).toBe(ZOHO_ERROR_CODES.RATE_LIMITED);
  });

  it('never puts Zoho raw body text into the user-facing message', () => {
    const error = normalizeZohoResponse(400, JSON.stringify({ code: 9015, message: 'Extra key found for account 8891234 owner jane@example.com' }));
    expect(error.message).not.toContain('jane@example.com');
    expect(error.message).not.toContain('8891234');
    expect(error.zohoCode).toBe(9015);
  });

  it('survives a body that is not JSON at all, such as an HTML error page', () => {
    const error = normalizeZohoResponse(502, '<html>gateway</html>');
    expect(error.code).toBe(ZOHO_ERROR_CODES.SERVER_ERROR);
    expect(error.retryable).toBe(true);
  });
});

describe('isZohoSuccess', () => {
  it('requires both a 2xx and Zoho code 0', () => {
    expect(isZohoSuccess(200, { code: 0 })).toBe(true);
    expect(isZohoSuccess(200, { code: 9004 })).toBe(false);
    expect(isZohoSuccess(500, { code: 0 })).toBe(false);
  });

  it('accepts a 2xx with no code at all, which is what a PDF download returns', () => {
    expect(isZohoSuccess(200, null)).toBe(true);
  });
});

describe('assertZohoId', () => {
  it('accepts a normal id and rejects anything path-shaped', () => {
    expect(assertZohoId('123456000000012345')).toBe('123456000000012345');
    for (const bad of ['', '   ', '../../admin', 'a/b', 'id with space', 'a'.repeat(200)]) {
      expect(() => assertZohoId(bad, 'Zoho request id')).toThrowError(/Invalid Zoho request id/);
    }
  });
});

describe('createZohoSignClient construction', () => {
  it('refuses to build without a transport, a base URL or an auth instance', () => {
    expect(() => createZohoSignClient({ config: testConfig(), auth: staticAuth })).toThrowError(/httpRequest/);
    expect(() => createZohoSignClient({ config: { apiBase: '' }, auth: staticAuth, httpRequest: async () => ({}) })).toThrowError(/base URL/);
    expect(() => createZohoSignClient({ config: testConfig(), httpRequest: async () => ({}) })).toThrowError(/zoho-sign-auth/);
  });

  it('exposes exactly the nine calls the design names', () => {
    const { client } = buildClient([]);
    expect(Object.keys(client).sort()).toEqual([
      'createRequest', 'downloadCertificate', 'downloadPdf', 'embedToken', 'getRequest',
      'listRequests', 'recall', 'remind', 'submitRequest',
    ]);
  });
});

describe('the nine calls', () => {
  it('sends the Zoho-oauthtoken scheme, not Bearer', async () => {
    const { client, calls } = buildClient([ok({ requests: { request_id: 'r1' } })]);
    await client.getRequest('r1' as never);
    expect(calls[0].headers.Authorization).toBe(`${ZOHO_AUTH_SCHEME} access-token-abc`);
    expect(calls[0].headers.Authorization).not.toMatch(/^Bearer/);
  });

  it('createRequest posts multipart to /requests and unwraps the requests object', async () => {
    const { client, calls } = buildClient([ok({ requests: { request_id: 'r1', document_ids: [{ document_id: 'd1' }] } })]);
    const result = await client.createRequest({
      files: [{ buffer: Buffer.from('%PDF-1.4 fake'), fileName: 'agreement.pdf' }],
      data: { requests: { request_name: 'CPQ Agreement', actions: [] } },
    } as never);

    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(`${API_BASE}/requests`);
    expect(calls[0].body).toBeInstanceOf(FormData);
    expect((calls[0].body as FormData).get('data')).toContain('CPQ Agreement');
    expect(result).toMatchObject({ request_id: 'r1' });
  });

  it('createRequest refuses an empty file list or a missing payload before any call is made', async () => {
    const { client, httpRequest } = buildClient([]);
    await expect(client.createRequest({ files: [], data: {} } as never)).rejects.toThrowError(/at least one file/);
    await expect(client.createRequest({ files: [{ buffer: Buffer.from('x'), fileName: 'a.pdf' }] } as never)).rejects.toThrowError(/data payload/);
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it('submitRequest posts the field payload as a form-encoded data parameter', async () => {
    const { client, calls } = buildClient([ok({ requests: { request_status: 'inprogress' } })]);
    await client.submitRequest('r1' as never, { requests: { actions: [{ action_id: 'a1', fields: [] }] } } as never);

    expect(calls[0].url).toBe(`${API_BASE}/requests/r1/submit`);
    expect(calls[0].headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(JSON.parse(new URLSearchParams(calls[0].body as string).get('data') as string)).toMatchObject({
      requests: { actions: [{ action_id: 'a1' }] },
    });
  });

  it('listRequests passes the page context as a data query parameter', async () => {
    const { client, calls } = buildClient([ok({ requests: [] })]);
    await client.listRequests({ rowCount: 5, startIndex: 11 } as never);
    const data = JSON.parse(new URL(calls[0].url).searchParams.get('data') as string);
    expect(data.page_context).toMatchObject({ row_count: 5, start_index: 11, sort_column: 'created_time', sort_order: 'DESC' });
  });

  it('recall and remind post to their own paths', async () => {
    const { client, calls } = buildClient([ok({}), ok({})]);
    await client.recall('r1' as never);
    await client.remind('r1' as never);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${API_BASE}/requests/r1/recall`,
      `POST ${API_BASE}/requests/r1/remind`,
    ]);
  });

  it('downloadPdf asks for the merged document plus certificate and returns the bytes', async () => {
    const pdf = Buffer.from('%PDF-1.7 signed');
    const { client, calls } = buildClient([{ status: 200, body: pdf, headers: { 'content-type': 'application/pdf' } }]);
    const result = await client.downloadPdf('r1' as never) as { buffer: Buffer; contentType: string };

    expect(calls[0].responseType).toBe('buffer');
    expect(calls[0].url).toBe(`${API_BASE}/requests/r1/pdf?with_coc=true&merge=true`);
    expect(result.buffer.toString()).toBe('%PDF-1.7 signed');
    expect(result.contentType).toBe('application/pdf');
  });

  it('downloadPdf can be asked for the document without the certificate', async () => {
    const { client, calls } = buildClient([{ status: 200, body: Buffer.from('x'), headers: {} }]);
    await client.downloadPdf('r1' as never, { withCoc: false, merge: false } as never);
    expect(calls[0].url).toBe(`${API_BASE}/requests/r1/pdf?with_coc=false&merge=false`);
  });

  it('downloadCertificate hits the completion-certificate path as binary', async () => {
    const { client, calls } = buildClient([{ status: 200, body: Buffer.from('%PDF coc'), headers: {} }]);
    const result = await client.downloadCertificate('r1' as never) as { buffer: Buffer };
    expect(calls[0].url).toBe(`${API_BASE}/requests/r1/completioncertificate`);
    expect(result.buffer.toString()).toBe('%PDF coc');
  });

  it('embedToken needs a host and addresses the action, never the recipient row', async () => {
    const { client, calls, httpRequest } = buildClient([ok({ sign_url: 'https://sign.zoho.com/embed/xyz' })]);
    await expect(client.embedToken('r1' as never, 'a1' as never, {} as never)).rejects.toThrowError(/host origin/);
    expect(httpRequest).not.toHaveBeenCalled();

    await client.embedToken('r1' as never, 'a1' as never, { host: 'https://cpq.example.com', redirectPages: { sign_success: '/done' } } as never);
    expect(calls[0].url).toBe(`${API_BASE}/requests/r1/actions/a1/embedtoken`);
    const body = new URLSearchParams(calls[0].body as string);
    expect(body.get('host')).toBe('https://cpq.example.com');
    expect(JSON.parse(body.get('redirect_pages') as string)).toEqual({ sign_success: '/done' });
  });

  it('rejects a bad request id before it can reach the URL', async () => {
    const { client, httpRequest } = buildClient([]);
    await expect(client.getRequest('../../requests' as never)).rejects.toThrowError(/Invalid Zoho request id/);
    expect(httpRequest).not.toHaveBeenCalled();
  });
});

describe('retry behaviour', () => {
  it('backs off a 429 and succeeds on the retry, leaving the document untouched', async () => {
    const { client, httpRequest } = buildClient([
      { status: 429, body: JSON.stringify({ code: 2955, message: 'limit' }) },
      ok({ requests: { request_status: 'completed' } }),
    ]);
    const result = await client.getRequest('r1' as never);
    expect(httpRequest).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ request_status: 'completed' });
  });

  it('gives up after three attempts and reports a rate limit, never a failure of the document', async () => {
    const rateLimited = { status: 429, body: JSON.stringify({ code: 2955 }) };
    const { client, httpRequest } = buildClient([rateLimited, rateLimited, rateLimited]);
    await expect(client.getRequest('r1' as never)).rejects.toMatchObject({ code: ZOHO_ERROR_CODES.RATE_LIMITED });
    expect(httpRequest).toHaveBeenCalledTimes(3);
  });

  it('honours Retry-After in place of the computed backoff', async () => {
    const slept: number[] = [];
    const { client } = buildClient(
      [{ status: 429, body: '{}', headers: { 'retry-after': '3' } }, ok({ requests: {} })],
      { sleep: async (ms: number) => { slept.push(ms); } },
    );
    await client.getRequest('r1' as never);
    expect(slept).toEqual([3000]);
  });

  it('retries a 5xx and a transport failure', async () => {
    const { client, httpRequest } = buildClient([{ status: 500, body: '{}' }, ok({ requests: {} })]);
    await client.getRequest('r1' as never);
    expect(httpRequest).toHaveBeenCalledTimes(2);

    let attempts = 0;
    const flaky = createZohoSignClient({
      config: testConfig(),
      auth: staticAuth,
      sleep: async () => {},
      random: () => 0.5,
      httpRequest: async () => {
        attempts += 1;
        if (attempts < 2) throw new Error('ECONNRESET');
        return ok({ requests: { request_status: 'inprogress' } });
      },
    });
    await expect(flaky.getRequest('r1' as never)).resolves.toMatchObject({ request_status: 'inprogress' });
    expect(attempts).toBe(2);
  });

  it('does not retry an ordinary 4xx, because a second identical request cannot succeed', async () => {
    const { client, httpRequest } = buildClient([{ status: 400, body: JSON.stringify({ code: 9015, message: 'Extra key found' }) }]);
    await expect(client.getRequest('r1' as never)).rejects.toMatchObject({ code: ZOHO_ERROR_CODES.API_ERROR });
    expect(httpRequest).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 200 that carries a non-zero Zoho code, which would otherwise read as success', async () => {
    const { client } = buildClient([{ status: 200, body: JSON.stringify({ code: 9004, message: 'not found' }) }]);
    await expect(client.getRequest('r1' as never)).rejects.toMatchObject({ code: ZOHO_ERROR_CODES.NOT_FOUND });
  });
});

describe('client with the real auth module', () => {
  it('refreshes once and retries once when Zoho returns 401, and the caller never sees it', async () => {
    const tokenBody = (token: string) => ({ status: 200, body: JSON.stringify({ access_token: token, expires_in: 3600 }) });
    const seenTokens: string[] = [];

    const httpRequest = vi.fn(async (call: HttpCall) => {
      if (call.url.includes('/oauth/v2/token')) {
        return tokenBody(seenTokens.length === 0 ? 'stale' : 'fresh');
      }
      seenTokens.push(call.headers.Authorization);
      if (call.headers.Authorization.endsWith('stale')) return { status: 401, body: JSON.stringify({ message: 'INVALID_OAUTHTOKEN' }) };
      return ok({ requests: { request_status: 'completed' } });
    });

    const config = testConfig();
    const auth = createZohoSignAuth({ config, httpRequest, now: () => Date.now() });
    const client = createZohoSignClient({ config, auth, httpRequest, sleep: async () => {}, random: () => 0.5 });

    await expect(client.getRequest('r1' as never)).resolves.toMatchObject({ request_status: 'completed' });
    expect(seenTokens).toEqual([`${ZOHO_AUTH_SCHEME} stale`, `${ZOHO_AUTH_SCHEME} fresh`]);
  });
});
