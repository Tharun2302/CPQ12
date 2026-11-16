import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fakeLoginSessions, loginSessionSrc, withSession } from '../helpers/loginSessionHarness';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import lists from '../../admin-email-lists.cjs';

const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

function routeSource(method: string, routePath: string): string {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const start = serverSrc.search(new RegExp(`\\napp\\.${method}\\(\\s*['"]${escaped}['"]\\s*,`));
  expect(start, `route not found: ${method.toUpperCase()} ${routePath}`).toBeGreaterThan(-1);
  const end = serverSrc.indexOf('\napp.', start + 2);
  return serverSrc.slice(start + 1, end === -1 ? undefined : end);
}

const ROUTES: Array<[string, string]> = [];
for (const kind of ['exhibit-admins', 'document-admins']) {
  ROUTES.push(['get', `/api/settings/${kind}`], ['post', `/api/settings/${kind}`], ['delete', `/api/settings/${kind}/:email`]);
}

describe.each(ROUTES)('%s %s', (method, routePath) => {
  const route = routeSource(method, routePath);

  it('is approval-admin only, checked before any database access or input read', () => {
    const authAt = route.indexOf('await getApprovalAdminUser(req, res');
    expect(authAt).toBeGreaterThan(-1);
    expect(route).toMatch(/await getApprovalAdminUser\(req, res[^;]*\);\s*if \(!authUser\) return;/);
    const firstDbUse = /\bdb\.|\.add\(db|\.remove\(db|\.snapshot\(db|sendAdminListSnapshot\(/.exec(route);
    expect(firstDbUse).not.toBeNull();
    expect(authAt).toBeLessThan(firstDbUse!.index);
    const inputUse = /\breq\.(body|params|query)\b/.exec(route);
    if (inputUse) expect(authAt).toBeLessThan(inputUse.index);
  });

  it('never echoes internal error details', () => {
    expect(route).not.toMatch(/e\.message/);
  });

  it('is rate limited, writes with the limiter of its own list', () => {
    const limiter = method === 'get'
      ? 'adminListReadLimiter'
      : routePath.includes('exhibit') ? 'exhibitAdminsLimiter' : 'documentAdminsLimiter';
    expect(route).toMatch(new RegExp(`^app\\.${method}\\([^,]+,\\s*${limiter},`));
  });
});

describe('admin-list route behaviour', () => {
  const approvalHelpers = serverSrc.slice(
    serverSrc.indexOf('const DEFAULT_APPROVAL_ADMINS'),
    serverSrc.indexOf("app.get('/api/settings/approval-admins'"),
  );
  const exhibitListStart = serverSrc.indexOf('// Kept on the existing settings doc');
  const exhibitListDecl = serverSrc.slice(exhibitListStart, serverSrc.indexOf('// Effective exhibit admin', exhibitListStart));
  const listBlockStart = serverSrc.indexOf('// No hardcoded defaults: approval admins grant');
  const listRoutesEnd = serverSrc.indexOf('// Upload new exhibit (POST)');
  const listBlock = serverSrc.slice(listBlockStart, listRoutesEnd);
  const originalApproval = process.env.APPROVAL_ADMIN_EMAILS;
  const originalExhibit = process.env.EXHIBIT_ADMIN_EMAILS;

  afterEach(() => {
    if (originalApproval === undefined) delete process.env.APPROVAL_ADMIN_EMAILS;
    else process.env.APPROVAL_ADMIN_EMAILS = originalApproval;
    if (originalExhibit === undefined) delete process.env.EXHIBIT_ADMIN_EMAILS;
    else process.env.EXHIBIT_ADMIN_EMAILS = originalExhibit;
  });

  function setup() {
    process.env.APPROVAL_ADMIN_EMAILS = 'admin@test.example';
    process.env.EXHIBIT_ADMIN_EMAILS = 'env@test.example';
    const settings: Record<string, any> = {};
    const writes: any[] = [];
    const logs: any[] = [];
    const users: Record<string, { id: string; email: string }> = {
      'admin-id': { id: 'admin-id', email: 'admin@test.example' },
      'user-id': { id: 'user-id', email: 'user@test.example' },
      'exhibit-id': { id: 'exhibit-id', email: 'env@test.example' },
    };
    const db = {
      collection(name: string) {
        if (name === 'users') return { findOne: async ({ id }: { id: string }) => users[id] ?? null };
        if (name === 'settings') {
          return {
            findOne: async ({ _id }: { _id: string }) => (settings[_id] ? { ...settings[_id], emails: [...settings[_id].emails] } : null),
            updateOne: async (filter: any, update: any) => {
              writes.push({ filter, update });
              const doc = settings[filter._id] ?? (settings[filter._id] = { emails: [] });
              if (update.$addToSet) doc.emails.push(update.$addToSet.emails);
              if (update.$pull) doc.emails = doc.emails.filter((e: string) => !update.$pull.emails.$in.includes(e));
              Object.assign(doc, update.$set);
              return { matchedCount: 1, modifiedCount: 1 };
            },
          };
        }
        throw new Error(`unexpected collection ${name}`);
      },
    };
    const jwt = {
      verify: (token: string) => {
        if (token === 'aaa.admin.ccc') return { userId: 'admin-id' };
        if (token === 'aaa.user.ccc') return { userId: 'user-id' };
        if (token === 'aaa.exhibit.ccc') return { userId: 'exhibit-id' };
        throw new Error('invalid signature');
      },
    };
    const handlers: Record<string, (req: unknown, res: unknown) => Promise<void>> = {};
    const register = (method: string) => (p: string, ...fns: any[]) => { handlers[`${method} ${p}`] = fns[fns.length - 1]; };
    const app = { get: register('get'), post: register('post'), delete: register('delete') };
    const logger = { info: (...a: any[]) => logs.push(a), error: () => {} };
    const rateLimit = () => (_req: unknown, _res: unknown, next: () => void) => next();
    new Function(
      'app', 'db', 'jwt', 'JWT_SECRET', 'console', 'loginSessions', 'logger', 'rateLimit', 'createAdminEmailList',
      `${loginSessionSrc}\n${approvalHelpers}\n${exhibitListDecl}\n${listBlock}`,
    )(app, db, withSession(jwt), 'test-secret', { error: () => {}, log: () => {} }, fakeLoginSessions(), logger, rateLimit, (lists as any).createAdminEmailList);

    const call = async (key: string, token: string | null, extra: Record<string, unknown> = {}) => {
      const res = {
        statusCode: 200,
        headersSent: false,
        body: undefined as any,
        set() { return res; },
        status(code: number) { res.statusCode = code; return res; },
        json(payload: any) { res.body = payload; res.headersSent = true; return res; },
      };
      const headers = token ? { authorization: `Bearer ${token}` } : {};
      await handlers[key]({ headers, body: {}, params: {}, query: {}, ...extra }, res);
      return res;
    };
    return { call, writes, logs, settings };
  }

  it('no token: 401 and nothing is written', async () => {
    const { call, writes } = setup();
    expect((await call('get /api/settings/exhibit-admins', null)).statusCode).toBe(401);
    expect((await call('post /api/settings/exhibit-admins', null, { body: { email: 'x@y.com' } })).statusCode).toBe(401);
    expect(writes).toEqual([]);
  });

  it('signed-in non-admin: 403 with the list-specific message and no write', async () => {
    const { call, writes } = setup();
    const res = await call('post /api/settings/document-admins', 'aaa.user.ccc', { body: { email: 'x@y.com' } });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: 'Only approval admins can manage document admins' });
    const del = await call('delete /api/settings/exhibit-admins/:email', 'aaa.user.ccc', { params: { email: 'env@test.example' } });
    expect(del.statusCode).toBe(403);
    expect(writes).toEqual([]);
  });

  it('approval admin: add, list and remove with the documented shape and an audit log', async () => {
    const { call, logs } = setup();
    const added = await call('post /api/settings/exhibit-admins', 'aaa.admin.ccc', { body: { email: ' New@Test.example ' } });
    expect(added.statusCode).toBe(200);
    expect(added.body).toMatchObject({
      success: true,
      message: 'Email added',
      data: { emails: ['env@test.example', 'new@test.example'], envEmails: ['env@test.example'], updatedBy: 'admin@test.example' },
    });
    expect(logs[0]).toEqual(['Admin list changed', { source: 'admin-lists', list: 'exhibit_admins', action: 'add', actor: 'admin@test.example', target: 'new@test.example' }]);

    const listed = await call('get /api/settings/exhibit-admins', 'aaa.admin.ccc');
    expect(listed.body.data.emails).toEqual(['env@test.example', 'new@test.example']);

    const removed = await call('delete /api/settings/exhibit-admins/:email', 'aaa.admin.ccc', { params: { email: 'new@test.example' } });
    expect(removed.statusCode).toBe(200);
    expect(removed.body.data.emails).toEqual(['env@test.example']);
    expect(logs[1][1]).toMatchObject({ action: 'remove', target: 'new@test.example' });
  });

  it('an exhibit admin who is not an approval admin cannot manage the exhibit-admin list (403)', async () => {
    const { call, writes } = setup();
    const res = await call('post /api/settings/exhibit-admins', 'aaa.exhibit.ccc', { body: { email: 'x@y.com' } });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: 'Only approval admins can manage exhibit admins' });
    expect((await call('get /api/settings/exhibit-admins', 'aaa.exhibit.ccc')).statusCode).toBe(403);
    expect(writes).toEqual([]);
  });

  it('existing mixed-case members are listed once, lower-cased, and env members are flagged', async () => {
    const { call, settings } = setup();
    settings.exhibit_admins = { emails: ['Abhinav.Surattu@CloudFuze.com', 'abhinav.surattu@cloudfuze.com'] };
    const res = await call('get /api/settings/exhibit-admins', 'aaa.admin.ccc');
    expect(res.body.data.emails).toEqual(['env@test.example', 'abhinav.surattu@cloudfuze.com']);
    expect(res.body.data.envEmails).toEqual(['env@test.example']);
    const removed = await call('delete /api/settings/exhibit-admins/:email', 'aaa.admin.ccc', { params: { email: 'ABHINAV.surattu@cloudfuze.com' } });
    expect(removed.body.data.emails).toEqual(['env@test.example']);
    expect(settings.exhibit_admins.emails).toEqual([]);
  });

  it('bad email: 400 INVALID_EMAIL; env member: 409 ENV_MANAGED', async () => {
    const { call, writes } = setup();
    const bad = await call('post /api/settings/document-admins', 'aaa.admin.ccc', { body: { email: { $ne: '' } } });
    expect(bad.statusCode).toBe(400);
    expect(bad.body).toMatchObject({ success: false, code: 'INVALID_EMAIL' });
    const env = await call('delete /api/settings/exhibit-admins/:email', 'aaa.admin.ccc', { params: { email: 'env@test.example' } });
    expect(env.statusCode).toBe(409);
    expect(env.body).toMatchObject({ success: false, code: 'ENV_MANAGED' });
    expect(writes).toEqual([]);
  });

  it('the two lists are stored separately', async () => {
    const { call, settings } = setup();
    await call('post /api/settings/document-admins', 'aaa.admin.ccc', { body: { email: 'doc@test.example' } });
    expect(settings.document_admins.emails).toEqual(['doc@test.example']);
    expect(settings.exhibit_admins).toBeUndefined();
  });
});

describe('admin-list write limiters', () => {
  const src = serverSrc.slice(
    serverSrc.indexOf('function createAdminListWriteLimiter'),
    serverSrc.indexOf('const EXHIBIT_ADMINS_FORBIDDEN'),
  );

  it('keep 20/min, key by list plus session or IP, and do not count failed requests', () => {
    expect(src).toContain('max: 20,');
    expect(src).toContain('skipFailedRequests: true,');
    expect(src).toContain('return `${listName}:${who}`;');
    expect(src).toContain("createAdminListWriteLimiter('exhibit_admins')");
    expect(src).toContain("createAdminListWriteLimiter('document_admins')");
  });
});

describe('auth responses carry the new admin flags', () => {
  it.each([['get', '/api/auth/me'], ['post', '/api/auth/microsoft']])('%s %s', (method, routePath) => {
    const route = routeSource(method, routePath);
    expect(route).not.toMatch(/isRedlineAdmin|hasRedlineAdminAccess/);
    expect(route).toContain('const isAdmin = await hasExhibitAdminAccess(user);');
    expect(route).toContain('const isDocumentAdmin = await hasDocumentAdminAccess(user);');
    expect(route).toMatch(/userResponse = \{[^}]*isApprovalAdmin, isDocumentAdmin \}/);
  });

  it('the redline-admin list is gone', () => {
    expect(serverSrc).not.toMatch(/redline-admins|REDLINE_ADMIN|hasRedlineAdminAccess|isRedlineAdmin/);
  });

  it('exhibit-admin membership keeps the DB role and reads the existing exhibit_admins doc', () => {
    const fn = serverSrc.slice(serverSrc.indexOf('async function hasExhibitAdminAccess'), serverSrc.indexOf('async function getExhibitAdminUser'));
    expect(fn).toContain("if (user.role === 'exhibit_admin') return true;");
    expect(fn).toContain('EXHIBIT_ADMINS.hasAccess(db, user)');
    expect(serverSrc).toContain("createAdminEmailList({ settingsId: 'exhibit_admins', envVar: 'EXHIBIT_ADMIN_EMAILS' })");
  });
});
