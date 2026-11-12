import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import microsoftLogin from '../../microsoft-login.cjs';

type Doc = Record<string, unknown>;
type Result = { ok: boolean; status?: number; body?: Doc; user?: Doc; jwtPayload?: Doc };

const { createMicrosoftLogin, createGraphFetcher, allowedDomains, MESSAGES } = microsoftLogin as {
  createMicrosoftLogin: (deps: Doc) => (body: unknown) => Promise<Result>;
  createGraphFetcher: (axiosInstance: { get: (...args: unknown[]) => Promise<unknown> }) => (token: string) => Promise<unknown>;
  allowedDomains: (env: Doc) => string[];
  MESSAGES: Record<string, string>;
};

const TENANT = '11111111-2222-3333-4444-555555555555';
const CLIENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const GRAPH_ID = 'graph-object-id-1';
const NOW = 1_800_000_000_000;
const PROD_ENV = { NODE_ENV: 'production', AZURE_TENANT_ID: TENANT, AZURE_CLIENT_ID: CLIENT };

function makeToken(claims: Doc = {}) {
  const enc = (o: Doc) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'RS256' })}.${enc({ tid: TENANT, appid: CLIENT, ...claims })}.sig`;
}

const GRAPH_OK = {
  id: GRAPH_ID,
  userPrincipalName: 'Jane.Doe@CloudFuze.com',
  mail: 'jane.doe@cloudfuze.com',
  displayName: 'Jane Graph',
};

function graphOk(data: Doc = GRAPH_OK) {
  return vi.fn(async () => ({ status: 200, data }));
}

function httpError(status: number) {
  return Object.assign(new Error(`status ${status}`), { response: { status } });
}

function makeUsers(seed: Doc[] = []) {
  const store = seed.map((u) => structuredClone(u));
  const matches = (u: Doc, q: Doc) => Object.entries(q).every(([k, v]) => {
    if (v && typeof v === 'object' && '$regex' in (v as Doc)) {
      const { $regex, $options } = v as { $regex: string; $options: string };
      return new RegExp($regex, $options).test(String(u[k]));
    }
    return u[k] === v;
  });
  const findOne = vi.fn(async (q: Doc) => store.find((u) => matches(u, q)) ?? null);
  const updateOne = vi.fn(async (q: Doc, update: { $set: Doc }) => {
    const hit = store.find((u) => matches(u, q));
    if (hit) Object.assign(hit, update.$set);
  });
  const insertOne = vi.fn(async (doc: Doc) => { store.push(structuredClone(doc)); });
  const getUsers = vi.fn(() => ({ findOne, updateOne, insertOne }));
  return { store, findOne, updateOne, insertOne, getUsers };
}

function setup(opts: { users?: Doc[]; env?: Doc; graphGet?: ReturnType<typeof vi.fn> } = {}) {
  const users = makeUsers(opts.users);
  const graphGet = opts.graphGet ?? graphOk();
  const logger = { warn: vi.fn(), error: vi.fn() };
  const login = createMicrosoftLogin({
    graphGet, getUsers: users.getUsers, env: opts.env ?? PROD_ENV, now: () => NOW, logger, randomId: () => 'rand-1',
  });
  return { login, users, graphGet, logger };
}

const goodBody = (over: Doc = {}) => ({
  id: 'body-id', name: 'Body Name', email: 'jane.doe@cloudfuze.com', accessToken: makeToken(), ...over,
});

function expectRefused(res: Result, status: number, users: ReturnType<typeof makeUsers>) {
  expect(res.ok).toBe(false);
  expect(res.status).toBe(status);
  expect(res.jwtPayload).toBeUndefined();
  expect(res.user).toBeUndefined();
  expect(users.getUsers).not.toHaveBeenCalled();
  expect(users.findOne).not.toHaveBeenCalled();
  expect(users.updateOne).not.toHaveBeenCalled();
  expect(users.insertOne).not.toHaveBeenCalled();
}

describe('step 1: request shape (400, no Graph call, no database)', () => {
  const cases: Array<[string, Doc]> = [
    ['email as an operator object', { email: { $ne: null } }],
    ['email as a number', { email: 42 }],
    ['email as an array', { email: ['jane.doe@cloudfuze.com'] }],
    ['email missing', { email: undefined }],
    ['email empty', { email: '' }],
    ['email starting with $', { email: '$ne@cloudfuze.com' }],
    ['email over 320 characters', { email: `${'a'.repeat(320)}@cloudfuze.com` }],
    ['id as an operator object', { id: { $gt: '' } }],
    ['id as a number', { id: 7 }],
    ['id starting with $', { id: '$where' }],
    ['id over 200 characters', { id: 'x'.repeat(201) }],
    ['name as an object', { name: { $ne: 'x' } }],
    ['name as a number', { name: 5 }],
    ['name starting with $', { name: '$set' }],
    ['name over 200 characters', { name: 'n'.repeat(201) }],
    ['accessToken as an object', { accessToken: { $ne: null } }],
    ['accessToken as a number', { accessToken: 12345 }],
    ['accessToken starting with $', { accessToken: '$ne' }],
    ['accessToken over the size cap', { accessToken: 'a'.repeat(8193) }],
  ];

  it.each(cases)('rejects %s', async (_label, over) => {
    const { login, users, graphGet } = setup();
    const res = await login(goodBody(over));
    expectRefused(res, 400, users);
    expect(res.body).toEqual({ success: false, message: 'Invalid sign-in request' });
    expect(graphGet).not.toHaveBeenCalled();
  });

  it.each([null, undefined, 'text', 12, [1, 2]])('rejects a non-object body (%j)', async (body) => {
    const { login, users } = setup();
    expectRefused(await login(body), 400, users);
  });
});

describe('step 2: token must be a real Microsoft token', () => {
  it.each([
    ['missing', { accessToken: undefined }],
    ['null', { accessToken: null }],
    ['empty', { accessToken: '' }],
    ['the browser fallback placeholder', { accessToken: 'fallback_token_123' }],
    ['the dev mock placeholder', { accessToken: 'mock_access_token_1' }],
    ['a token whose payload is not JSON', { accessToken: 'a.b.c' }],
  ])('%s -> 401 without a Graph call or database access', async (_label, over) => {
    const { login, users, graphGet } = setup();
    const res = await login(goodBody(over));
    expectRefused(res, 401, users);
    expect(res.body).toEqual({ success: false, message: MESSAGES.unauthorized });
    expect(graphGet).not.toHaveBeenCalled();
  });
});

describe('step 2: Graph outcomes', () => {
  it('Graph rejecting the token (401) -> 401, not retried', async () => {
    const graphGet = vi.fn(async () => { throw httpError(401); });
    const { login, users } = setup({ graphGet });
    const res = await login(goodBody());
    expectRefused(res, 401, users);
    expect(graphGet).toHaveBeenCalledTimes(1);
  });

  it('Graph 403 -> 401, not retried', async () => {
    const graphGet = vi.fn(async () => { throw httpError(403); });
    const { login, users } = setup({ graphGet });
    expectRefused(await login(goodBody()), 401, users);
    expect(graphGet).toHaveBeenCalledTimes(1);
  });

  it('a non-200 success status -> 401', async () => {
    const graphGet = vi.fn(async () => ({ status: 204, data: GRAPH_OK }));
    const { login, users } = setup({ graphGet });
    expectRefused(await login(goodBody()), 401, users);
  });

  it('a timeout is retried once, then 503', async () => {
    const graphGet = vi.fn(async () => { throw Object.assign(new Error('timeout of 8000ms exceeded'), { code: 'ECONNABORTED' }); });
    const { login, users } = setup({ graphGet });
    const res = await login(goodBody());
    expectRefused(res, 503, users);
    expect(res.body).toEqual({ success: false, message: MESSAGES.unavailable });
    expect(graphGet).toHaveBeenCalledTimes(2);
  });

  it('a network error is retried once, then 503', async () => {
    const graphGet = vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND graph.microsoft.com'); });
    const { login, users } = setup({ graphGet });
    expectRefused(await login(goodBody()), 503, users);
    expect(graphGet).toHaveBeenCalledTimes(2);
  });

  it('a Graph 5xx is retried once, then 503', async () => {
    const graphGet = vi.fn(async () => { throw httpError(502); });
    const { login, users } = setup({ graphGet });
    expectRefused(await login(goodBody()), 503, users);
    expect(graphGet).toHaveBeenCalledTimes(2);
  });

  it('Graph throttling (429) -> 503 without a retry', async () => {
    const graphGet = vi.fn(async () => { throw httpError(429); });
    const { login, users } = setup({ graphGet });
    expectRefused(await login(goodBody()), 503, users);
    expect(graphGet).toHaveBeenCalledTimes(1);
  });

  it('a transient failure followed by success signs in (single retry works)', async () => {
    const graphGet = vi.fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce({ status: 200, data: GRAPH_OK });
    const { login } = setup({ graphGet });
    const res = await login(goodBody());
    expect(res.ok).toBe(true);
    expect(graphGet).toHaveBeenCalledTimes(2);
  });
});

describe('step 2: identity and token provenance (no database access on any refusal)', () => {
  it('UPN different from the posted email -> 401', async () => {
    const { login, users } = setup({ graphGet: graphOk({ ...GRAPH_OK, mail: 'other@cloudfuze.com', userPrincipalName: 'other@cloudfuze.com' }) });
    const res = await login(goodBody({ email: 'anush.dasari@cloudfuze.com' }));
    expectRefused(res, 401, users);
    expect(res.body).toEqual({ success: false, message: MESSAGES.unauthorized });
  });

  it('a Graph /me without an object id -> 401', async () => {
    const { login, users } = setup({ graphGet: graphOk({ ...GRAPH_OK, id: undefined }) });
    expectRefused(await login(goodBody()), 401, users);
  });

  it('token from another tenant -> 403', async () => {
    const { login, users } = setup();
    const res = await login(goodBody({ accessToken: makeToken({ tid: '99999999-0000-0000-0000-000000000000' }) }));
    expectRefused(res, 403, users);
    expect(res.body).toEqual({ success: false, message: MESSAGES.forbidden });
  });

  it('token without a tid claim -> 403', async () => {
    const { login, users } = setup();
    expectRefused(await login(goodBody({ accessToken: makeToken({ tid: undefined }) })), 403, users);
  });

  it('token minted for another app (appid) -> 403', async () => {
    const { login, users } = setup();
    expectRefused(await login(goodBody({ accessToken: makeToken({ appid: 'someone-elses-app' }) })), 403, users);
  });

  it('token minted for another app (azp, no appid) -> 403', async () => {
    const { login, users } = setup();
    expectRefused(await login(goodBody({ accessToken: makeToken({ appid: undefined, azp: 'someone-elses-app' }) })), 403, users);
  });

  it('azp equal to the client id is accepted when appid is absent', async () => {
    const { login } = setup();
    expect((await login(goodBody({ accessToken: makeToken({ appid: undefined, azp: CLIENT }) }))).ok).toBe(true);
  });

  it('an uppercase, padded AZURE_CLIENT_ID still matches a lowercase token app id', async () => {
    const env = { ...PROD_ENV, AZURE_CLIENT_ID: ` ${CLIENT.toUpperCase()} ` };
    const { login } = setup({ env });
    expect((await login(goodBody())).ok).toBe(true);
  });

  it('an uppercase token app id matches the configured client id', async () => {
    const { login } = setup();
    expect((await login(goodBody({ accessToken: makeToken({ appid: CLIENT.toUpperCase() }) }))).ok).toBe(true);
  });

  it('a different client id still fails when the casing is normalised', async () => {
    const env = { ...PROD_ENV, AZURE_CLIENT_ID: CLIENT.toUpperCase() };
    const { login, users } = setup({ env });
    expectRefused(await login(goodBody({ accessToken: makeToken({ appid: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee' }) })), 403, users);
  });

  it('a non-string token app id is refused', async () => {
    const { login, users } = setup();
    expectRefused(await login(goodBody({ accessToken: makeToken({ appid: 12345 }) })), 403, users);
  });

  it('personal Microsoft account (acct = 1) -> 403', async () => {
    const { login, users } = setup();
    expectRefused(await login(goodBody({ accessToken: makeToken({ acct: 1 }) })), 403, users);
  });

  it('address outside the allowed domain -> 403', async () => {
    const graph = { ...GRAPH_OK, userPrincipalName: 'jane@evil.com', mail: 'jane@evil.com' };
    const { login, users } = setup({ graphGet: graphOk(graph) });
    expectRefused(await login(goodBody({ email: 'jane@evil.com' })), 403, users);
  });

  it('a look-alike domain is not accepted', async () => {
    const graph = { ...GRAPH_OK, userPrincipalName: 'jane@cloudfuze.com.evil.io', mail: 'jane@cloudfuze.com.evil.io' };
    const { login, users } = setup({ graphGet: graphOk(graph) });
    expectRefused(await login(goodBody({ email: 'jane@cloudfuze.com.evil.io' })), 403, users);
  });

  it('a double @ address is not accepted', async () => {
    const graph = { ...GRAPH_OK, userPrincipalName: 'a@evil.com@cloudfuze.com', mail: null };
    const { login, users } = setup({ graphGet: graphOk(graph) });
    expectRefused(await login(goodBody({ email: 'a@evil.com@cloudfuze.com' })), 403, users);
  });

  it('mail is accepted when the UPN differs, because the tenant is pinned', async () => {
    const graph = { ...GRAPH_OK, userPrincipalName: 'jane@cloudfuze.onmicrosoft.com', mail: 'Jane.Doe@cloudfuze.com' };
    const { login, users } = setup({ graphGet: graphOk(graph) });
    const res = await login(goodBody());
    expect(res.ok).toBe(true);
    expect(users.insertOne.mock.calls[0][0]).toMatchObject({ email: 'Jane.Doe@cloudfuze.com' });
  });

  it('the UPN is preferred over mail when both match the posted address', async () => {
    const graph = { ...GRAPH_OK, userPrincipalName: 'JANE.DOE@cloudfuze.com', mail: 'jane.doe@CLOUDFUZE.COM' };
    const { login, users } = setup({ graphGet: graphOk(graph) });
    const res = await login(goodBody());
    expect(res.ok).toBe(true);
    expect(users.insertOne.mock.calls[0][0]).toMatchObject({ email: 'JANE.DOE@cloudfuze.com' });
    expect(res.jwtPayload).toMatchObject({ email: 'JANE.DOE@cloudfuze.com' });
  });

  it('ALLOWED_LOGIN_DOMAINS overrides the default domain', async () => {
    const graph = { ...GRAPH_OK, userPrincipalName: 'jane@partner.com', mail: 'jane@partner.com' };
    const env = { ...PROD_ENV, ALLOWED_LOGIN_DOMAINS: 'cloudfuze.com, @partner.com' };
    const { login } = setup({ graphGet: graphOk(graph), env });
    expect((await login(goodBody({ email: 'jane@partner.com' }))).ok).toBe(true);
  });

  it('defaults to cloudfuze.com only', () => {
    expect(allowedDomains({})).toEqual(['cloudfuze.com']);
    expect(allowedDomains({ ALLOWED_LOGIN_DOMAINS: ' , ' })).toEqual(['cloudfuze.com']);
  });
});

describe('fail closed when Microsoft sign-in is not configured', () => {
  it.each([
    ['tenant missing', { NODE_ENV: 'production', AZURE_CLIENT_ID: CLIENT }],
    ['client id missing', { NODE_ENV: 'production', AZURE_TENANT_ID: TENANT }],
    ['both missing', { NODE_ENV: 'production' }],
    ['tenant blank', { NODE_ENV: 'production', AZURE_TENANT_ID: '  ', AZURE_CLIENT_ID: CLIENT }],
  ])('production with %s -> 503, logged once, no Graph call', async (_label, env) => {
    const { login, users, graphGet, logger } = setup({ env });
    const first = await login(goodBody());
    expectRefused(first, 503, users);
    expect(first.body).toEqual({ success: false, message: MESSAGES.notConfigured });
    await login(goodBody());
    expect(graphGet).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('production ignores ALLOW_UNVERIFIED_MS_LOGIN', async () => {
    const { login, users } = setup({ env: { NODE_ENV: 'production', ALLOW_UNVERIFIED_MS_LOGIN: 'true' } });
    expectRefused(await login(goodBody()), 503, users);
  });

  it.each([
    ['NODE_ENV unset', {}],
    ['NODE_ENV "Production"', { NODE_ENV: 'Production' }],
    ['NODE_ENV " production "', { NODE_ENV: ' production ' }],
    ['NODE_ENV "staging"', { NODE_ENV: 'staging' }],
    ['NODE_ENV empty', { NODE_ENV: '' }],
  ])('ALLOW_UNVERIFIED_MS_LOGIN=true is refused with %s', async (_label, base) => {
    const { login, users, graphGet } = setup({ env: { ...base, ALLOW_UNVERIFIED_MS_LOGIN: 'true' } });
    const res = await login(goodBody({ accessToken: 'fallback_token_1' }));
    expectRefused(res, 503, users);
    expect(res.body).toEqual({ success: false, message: MESSAGES.notConfigured });
    expect(graphGet).not.toHaveBeenCalled();
  });

  it.each(['development', 'test', ' Development ', 'TEST'])('ALLOW_UNVERIFIED_MS_LOGIN=true is honoured only for NODE_ENV %j', async (nodeEnv) => {
    const { login } = setup({ env: { NODE_ENV: nodeEnv, ALLOW_UNVERIFIED_MS_LOGIN: 'true' } });
    expect((await login(goodBody({ accessToken: 'fallback_token_1' }))).ok).toBe(true);
  });

  it('configured tenant and client still verify with NODE_ENV unset', async () => {
    const { login, graphGet } = setup({ env: { AZURE_TENANT_ID: TENANT, AZURE_CLIENT_ID: CLIENT, ALLOW_UNVERIFIED_MS_LOGIN: 'true' } });
    expect((await login(goodBody())).ok).toBe(true);
    expect(graphGet).toHaveBeenCalledTimes(1);
  });

  it('non-production without the explicit flag still refuses', async () => {
    const { login, users } = setup({ env: { NODE_ENV: 'development' } });
    expectRefused(await login(goodBody()), 503, users);
  });

  it('only the exact value "true" enables the dev skip', async () => {
    const { login, users } = setup({ env: { NODE_ENV: 'development', ALLOW_UNVERIFIED_MS_LOGIN: '1' } });
    expectRefused(await login(goodBody()), 503, users);
  });

  it('the AZURE_CLIENT_ID may come from VITE_MSAL_CLIENT_ID', async () => {
    const env = { NODE_ENV: 'production', AZURE_TENANT_ID: TENANT, VITE_MSAL_CLIENT_ID: CLIENT };
    const { login } = setup({ env });
    expect((await login(goodBody())).ok).toBe(true);
  });

  it('non-production with the explicit flag skips Graph, warns loudly, keeps the domain rule and never uses the body id', async () => {
    const env = { NODE_ENV: 'development', ALLOW_UNVERIFIED_MS_LOGIN: 'true' };
    const { login, users, graphGet, logger } = setup({ env });
    const res = await login(goodBody({ accessToken: 'fallback_token_1' }));
    expect(res.ok).toBe(true);
    expect(graphGet).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
    expect(users.insertOne.mock.calls[0][0]).toMatchObject({ id: 'microsoft_rand-1', role: 'viewer', provider: 'microsoft' });
    expect(res.jwtPayload).toEqual({ userId: 'microsoft_rand-1', email: 'jane.doe@cloudfuze.com' });

    const outside = await setup({ env }).login(goodBody({ email: 'x@evil.com' }));
    expect(outside.status).toBe(403);
  });
});

describe('step 3: database, only after verification', () => {
  const existingMs = { _id: 'oid-1', id: 'user-ms-1', name: 'Old Name', email: 'Jane.Doe@CloudFuze.com', provider: 'microsoft', role: 'exhibit_admin' };
  const passwordAccount = { _id: 'oid-2', id: 'user-pw-1', name: 'Password Person', email: 'Jane.Doe@CloudFuze.com', provider: 'password', password: 'hash', role: 'viewer' };

  it('existing Microsoft user: found by the Graph address, id and role unchanged, name from Graph', async () => {
    const { login, users } = setup({ users: [existingMs] });
    const res = await login(goodBody());
    expect(res.ok).toBe(true);
    expect(users.findOne.mock.calls[0][0]).toEqual({ email: 'Jane.Doe@CloudFuze.com' });
    expect(res.user).toMatchObject({ id: 'user-ms-1', role: 'exhibit_admin', name: 'Jane Graph', provider: 'microsoft' });
    expect(users.insertOne).not.toHaveBeenCalled();
    expect(users.updateOne).toHaveBeenCalledTimes(1);
    expect(users.updateOne.mock.calls[0][0]).toEqual({ _id: 'oid-1' });
    expect(Object.keys((users.updateOne.mock.calls[0][1] as { $set: Doc }).$set).sort()).toEqual(['name', 'updated_at']);
    expect(res.jwtPayload).toEqual({
      userId: 'user-ms-1', email: 'Jane.Doe@CloudFuze.com', msVerified: true, tid: TENANT, msName: 'Jane Graph', msVerifiedAt: NOW,
    });
  });

  it('matches an existing record that differs only in letter case', async () => {
    const { login, users } = setup({ users: [{ ...existingMs, email: 'JANE.DOE@CLOUDFUZE.COM' }] });
    const res = await login(goodBody());
    expect(res.ok).toBe(true);
    expect(res.user).toMatchObject({ id: 'user-ms-1' });
    expect(users.insertOne).not.toHaveBeenCalled();
  });

  it('a regex metacharacter in the address cannot match another user', async () => {
    const graph = { ...GRAPH_OK, userPrincipalName: 'a.c@cloudfuze.com', mail: null };
    const victim = { _id: 'v', id: 'victim', email: 'abc@cloudfuze.com', provider: 'microsoft' };
    const { login, users } = setup({ users: [victim], graphGet: graphOk(graph) });
    const res = await login(goodBody({ email: 'a.c@cloudfuze.com' }));
    expect(res.user).toMatchObject({ id: GRAPH_ID, email: 'a.c@cloudfuze.com' });
    expect(users.insertOne).toHaveBeenCalledTimes(1);
  });

  it('password account: logs in as that user but its name and provider are never touched', async () => {
    const { login, users, } = setup({ users: [passwordAccount] });
    const res = await login(goodBody());
    expect(res.ok).toBe(true);
    expect(users.updateOne).not.toHaveBeenCalled();
    expect(users.insertOne).not.toHaveBeenCalled();
    expect(users.store[0]).toMatchObject({ name: 'Password Person', provider: 'password' });
    expect(res.user).toMatchObject({ id: 'user-pw-1', provider: 'password', name: 'Password Person' });
  });

  it('new user: id is the Graph object id, body id ignored, viewer role, Microsoft provider', async () => {
    const { login, users } = setup();
    const res = await login(goodBody({ id: 'attacker-chosen-id' }));
    expect(res.ok).toBe(true);
    expect(users.insertOne).toHaveBeenCalledTimes(1);
    expect(users.insertOne.mock.calls[0][0]).toMatchObject({
      id: GRAPH_ID, name: 'Jane Graph', email: 'Jane.Doe@CloudFuze.com', provider: 'microsoft', role: 'viewer',
    });
    expect(res.jwtPayload).toMatchObject({ userId: GRAPH_ID, email: 'Jane.Doe@CloudFuze.com', msVerified: true });
  });

  it('body-id spoofing: posting a victim id creates no record with that id', async () => {
    const victim = { _id: 'v', id: 'victim-id-123', name: 'Victim', email: 'victim@cloudfuze.com', provider: 'microsoft', role: 'exhibit_admin' };
    const { login, users } = setup({ users: [victim] });
    const res = await login(goodBody({ id: 'victim-id-123' }));
    expect(res.ok).toBe(true);
    expect(res.jwtPayload?.userId).toBe(GRAPH_ID);
    expect(users.store.filter((u) => u.id === 'victim-id-123')).toHaveLength(1);
    expect(users.store.find((u) => u.email === 'Jane.Doe@CloudFuze.com')).toMatchObject({ id: GRAPH_ID });
  });

  it('posting an admin email with a token for someone else is refused before the database', async () => {
    const admin = { _id: 'a', id: 'admin-1', email: 'anush.dasari@cloudfuze.com', provider: 'microsoft' };
    const { login, users } = setup({ users: [admin] });
    const res = await login(goodBody({ email: 'anush.dasari@cloudfuze.com' }));
    expectRefused(res, 401, users);
  });

  it.each([
    ['microsoft', { provider: 'microsoft' }],
    ['password', { provider: 'password', password: 'hash' }],
  ])('existing %s user without an id is refused with a generic 401 and nothing is written', async (_label, extra) => {
    const idless = { _id: 'oid-9', email: 'Jane.Doe@CloudFuze.com', role: 'exhibit_admin', ...extra };
    const { login, users, logger } = setup({ users: [idless] });
    const res = await login(goodBody());
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: MESSAGES.unauthorized });
    expect(res.jwtPayload).toBeUndefined();
    expect(res.user).toBeUndefined();
    expect(users.updateOne).not.toHaveBeenCalled();
    expect(users.insertOne).not.toHaveBeenCalled();
    expect(users.store).toHaveLength(1);
    expect(users.store[0]).not.toHaveProperty('id');
    expect(logger.warn).toHaveBeenCalledWith('Microsoft sign-in refused', { source: 'microsoft-login', reason: 'EXISTING_USER_WITHOUT_ID' });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('cloudfuze.com');
  });

  it.each([['empty', ''], ['blank', '   '], ['number', 7], ['null', null]])('existing user with a %s id is refused', async (_label, id) => {
    const { login, users } = setup({ users: [{ _id: 'oid-8', id, email: 'jane.doe@cloudfuze.com', provider: 'microsoft' }] });
    const res = await login(goodBody());
    expect(res.status).toBe(401);
    expect(res.jwtPayload).toBeUndefined();
    expect(users.updateOne).not.toHaveBeenCalled();
  });

  it('first-login race: a duplicate-key error on insert re-reads the winner and signs in as it', async () => {
    const winner = { _id: 'oid-w', id: 'winner-id', name: 'Jane Graph', email: 'Jane.Doe@CloudFuze.com', provider: 'microsoft', role: 'viewer' };
    const insertOne = vi.fn(async () => { throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 }); });
    const findOne = vi.fn(async (q: Doc) => (insertOne.mock.calls.length > 0 && q.email === winner.email ? winner : null));
    const updateOne = vi.fn(async () => undefined);
    const login = createMicrosoftLogin({
      graphGet: graphOk(), getUsers: () => ({ findOne, updateOne, insertOne }), env: PROD_ENV, now: () => NOW, logger: { warn: vi.fn(), error: vi.fn() },
    });
    const res = await login(goodBody());
    expect(res.ok).toBe(true);
    expect(insertOne).toHaveBeenCalledTimes(1);
    expect(res.user).toMatchObject({ id: 'winner-id', role: 'viewer' });
    expect(res.jwtPayload).toMatchObject({ userId: 'winner-id', msVerified: true });
  });

  it('a duplicate-key error whose winner cannot be re-read is rethrown', async () => {
    const insertOne = vi.fn(async () => { throw Object.assign(new Error('E11000'), { code: 11000 }); });
    const login = createMicrosoftLogin({
      graphGet: graphOk(), getUsers: () => ({ findOne: async () => null, updateOne: vi.fn(), insertOne }), env: PROD_ENV, now: () => NOW,
    });
    await expect(login(goodBody())).rejects.toMatchObject({ code: 11000 });
  });

  it('any other insert error is rethrown without re-reading the user', async () => {
    const findOne = vi.fn(async () => null);
    const insertOne = vi.fn(async () => { throw Object.assign(new Error('network'), { code: 6 }); });
    const login = createMicrosoftLogin({
      graphGet: graphOk(), getUsers: () => ({ findOne, updateOne: vi.fn(), insertOne }), env: PROD_ENV, now: () => NOW,
    });
    await expect(login(goodBody())).rejects.toThrow('network');
    expect(findOne).toHaveBeenCalledTimes(2);
  });

  it('falls back to the posted name when Graph has no display name', async () => {
    const { login, users } = setup({ graphGet: graphOk({ ...GRAPH_OK, displayName: '' }) });
    await login(goodBody({ name: '  Body Name  ' }));
    expect(users.insertOne.mock.calls[0][0]).toMatchObject({ name: 'Body Name' });
  });
});

describe('the default Graph fetcher', () => {
  it('calls /me with the bearer token and an 8 second timeout', async () => {
    const get = vi.fn(async () => ({ status: 200, data: {} }));
    await createGraphFetcher({ get })('tok-abc');
    expect(get).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: 'Bearer tok-abc' },
      timeout: 8000,
    });
  });
});

describe('source order and route wiring', () => {
  const root = process.cwd();
  const moduleSrc = fs.readFileSync(path.resolve(root, 'microsoft-login.cjs'), 'utf8');
  const serverSrc = fs.readFileSync(path.resolve(root, 'server.cjs'), 'utf8');

  it('the handler verifies identity before it can reach the users collection', () => {
    const handlerAt = moduleSrc.indexOf('return async function authenticateMicrosoftLogin');
    expect(handlerAt).toBeGreaterThan(-1);
    const handler = moduleSrc.slice(handlerAt);
    const shapeAt = handler.indexOf('validateBodyShape(body)');
    const verifyAt = handler.indexOf('verifyIdentity(body, config)');
    const upsertAt = handler.indexOf('upsertUser(identity, body)');
    expect(shapeAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeGreaterThan(shapeAt);
    expect(upsertAt).toBeGreaterThan(verifyAt);
    expect(handler).not.toMatch(/getUsers|collection\(/);
  });

  it('verifyIdentity never touches the database', () => {
    const start = moduleSrc.indexOf('async function verifyIdentity');
    const end = moduleSrc.indexOf('function unverifiedIdentity');
    expect(moduleSrc.slice(start, end)).not.toMatch(/getUsers|users\.|collection\(/);
  });

  it('the users collection is only obtained inside upsertUser', () => {
    const uses = moduleSrc.split('getUsers()').length - 1;
    expect(uses).toBe(1);
    const upsertAt = moduleSrc.indexOf('async function upsertUser');
    expect(moduleSrc.indexOf('getUsers()')).toBeGreaterThan(upsertAt);
  });

  it('the route delegates to the module and never reads the body or the users collection itself', () => {
    const start = serverSrc.search(/app\.post\(\s*['"]\/api\/auth\/microsoft['"]\s*,/);
    expect(start).toBeGreaterThan(-1);
    const end = serverSrc.indexOf('\napp.', start + 1);
    const route = serverSrc.slice(start, end);
    expect(route).toContain('authenticateMicrosoftLogin(req.body)');
    expect(route).toMatch(/if \(!result\.ok\) return res\.status\(result\.status\)\.json\(result\.body\);/);
    expect(route.indexOf('if (!result.ok)')).toBeLessThan(route.indexOf('jwt.sign'));
    expect(route).toContain('jwt.sign(result.jwtPayload');
    expect(route).not.toMatch(/collection\('users'\)|insertOne|updateOne|req\.body\.(id|name|email)/);
    expect(route).not.toMatch(/message: 'Failed to process Microsoft authentication'[^}]*error:/);
  });

  it('the old fail-open verifier is gone', () => {
    expect(serverSrc).not.toContain('verifyMicrosoftIdentity');
  });
});
