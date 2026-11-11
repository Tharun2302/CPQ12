import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

type Helper = 'getAuthenticatedUser' | 'getApprovalAdminUser' | 'getExhibitAdminUser';

function routeSource(method: string, routePath: string): string {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const start = serverSrc.search(new RegExp(`\\napp\\.${method}\\(\\s*['"]${escaped}['"]\\s*,`));
  expect(start, `route not found: ${method.toUpperCase()} ${routePath}`).toBeGreaterThan(-1);
  const end = serverSrc.indexOf('\napp.', start + 2);
  return serverSrc.slice(start + 1, end === -1 ? undefined : end);
}

const LOCKED: Array<{ method: string; path: string; helper: Helper }> = [
  { method: 'post', path: '/api/quotes', helper: 'getAuthenticatedUser' },
  { method: 'put', path: '/api/quotes/:id', helper: 'getAuthenticatedUser' },
  { method: 'delete', path: '/api/quotes/:id', helper: 'getAuthenticatedUser' },
  { method: 'get', path: '/api/pricing-tiers', helper: 'getAuthenticatedUser' },
  { method: 'post', path: '/api/pricing-tiers', helper: 'getAuthenticatedUser' },
  { method: 'post', path: '/api/documents', helper: 'getAuthenticatedUser' },
  { method: 'delete', path: '/api/documents/:id', helper: 'getAuthenticatedUser' },
  { method: 'post', path: '/api/documents/upload', helper: 'getAuthenticatedUser' },
  { method: 'post', path: '/api/documents/test', helper: 'getAuthenticatedUser' },
  { method: 'post', path: '/api/email/send', helper: 'getAuthenticatedUser' },
  { method: 'post', path: '/api/email/check-suppression', helper: 'getAuthenticatedUser' },
  { method: 'post', path: '/api/send-authorization-request', helper: 'getAuthenticatedUser' },
  { method: 'get', path: '/api/templates', helper: 'getAuthenticatedUser' },
  { method: 'get', path: '/api/templates/:id/file', helper: 'getAuthenticatedUser' },
  { method: 'get', path: '/api/combinations', helper: 'getAuthenticatedUser' },
  { method: 'get', path: '/api/combinations/:id/file', helper: 'getAuthenticatedUser' },
  { method: 'get', path: '/api/exhibits', helper: 'getAuthenticatedUser' },
  { method: 'get', path: '/api/exhibits/:id/file', helper: 'getAuthenticatedUser' },

  { method: 'get', path: '/api/auth/daily-logins', helper: 'getApprovalAdminUser' },
  { method: 'get', path: '/api/chat/logs', helper: 'getApprovalAdminUser' },
  { method: 'get', path: '/api/chat/analytics', helper: 'getApprovalAdminUser' },
  { method: 'get', path: '/api/authorization-requests', helper: 'getApprovalAdminUser' },
  { method: 'put', path: '/api/team-approval-settings', helper: 'getApprovalAdminUser' },
  { method: 'get', path: '/api/test-mongodb', helper: 'getApprovalAdminUser' },

  { method: 'post', path: '/api/templates', helper: 'getExhibitAdminUser' },
  { method: 'put', path: '/api/templates/:id', helper: 'getExhibitAdminUser' },
  { method: 'delete', path: '/api/templates/:id', helper: 'getExhibitAdminUser' },
  { method: 'post', path: '/api/templates/reseed', helper: 'getExhibitAdminUser' },
  { method: 'post', path: '/api/combinations', helper: 'getExhibitAdminUser' },
  { method: 'put', path: '/api/combinations/:id', helper: 'getExhibitAdminUser' },
  { method: 'post', path: '/api/combinations/:id/file', helper: 'getExhibitAdminUser' },
  { method: 'post', path: '/api/combinations/seed', helper: 'getExhibitAdminUser' },
  { method: 'delete', path: '/api/combinations/:id', helper: 'getExhibitAdminUser' },
];

describe.each(LOCKED)('$method $path requires $helper', ({ method, path: routePath, helper }) => {
  const route = routeSource(method, routePath);
  const callMatch = new RegExp(`await ${helper}\\(req, res[^;]*\\);\\s*if \\(!\\w+\\) return;`).exec(route);

  it('calls the helper and returns when it yields null', () => {
    expect(callMatch, `${helper} call with early return`).not.toBeNull();
  });

  it('authorizes before any database access or outgoing email', () => {
    const authAt = route.indexOf(`await ${helper}(`);
    const sideEffect = /\bdb\.|libre\b|_cacheClear|sendEmail\(|sgMail\.|axios\.|process\.env\.SENDGRID_API_KEY/.exec(route.replace(/\/\/.*$/gm, ''));
    expect(authAt).toBeGreaterThan(-1);
    expect(sideEffect).not.toBeNull();
    expect(authAt).toBeLessThan(sideEffect!.index);
  });

  it('authorizes before the request body, params, query or file are read', () => {
    const authAt = route.indexOf(`await ${helper}(`);
    const inputUse = /\breq\.(body|params|query|file)\b/.exec(route);
    if (inputUse) expect(authAt).toBeLessThan(inputUse.index);
  });

});

describe('dead duplicate registrations of POST/DELETE /api/documents', () => {
  it('the live (first) registrations come before the duplicates and both require login', () => {
    const posts = [...serverSrc.matchAll(/\napp\.post\(\s*'\/api\/documents'\s*,/g)];
    const deletes = [...serverSrc.matchAll(/\napp\.delete\(\s*'\/api\/documents\/:id'\s*,/g)];
    expect(posts.length).toBeGreaterThanOrEqual(1);
    expect(deletes.length).toBeGreaterThanOrEqual(1);
    const firstPost = serverSrc.slice(posts[0].index! + 1, serverSrc.indexOf('\napp.', posts[0].index! + 2));
    const firstDelete = serverSrc.slice(deletes[0].index! + 1, serverSrc.indexOf('\napp.', deletes[0].index! + 2));
    expect(firstPost).toContain('await getAuthenticatedUser(req, res)');
    expect(firstDelete).toContain('await getAuthenticatedUser(req, res)');
  });
});

describe('routes that must stay open are unchanged', () => {
  const OPEN: Array<[string, string]> = [
    ['get', '/api/quotes'],
    ['post', '/api/convert/docx-to-pdf'],
    ['get', '/api/team-approval-settings'],
    ['get', '/api/team-approval-settings/team/:teamName'],
    ['post', '/api/chat/message'],
    ['post', '/api/client-log'],
    ['get', '/api/database/health'],
    ['get', '/api/convert/test'],
    ['get', '/api/libreoffice/health'],
    ['post', '/api/send-manager-email'],
    ['post', '/api/send-team-email'],
    ['post', '/api/send-ceo-email'],
    ['post', '/api/send-client-email'],
    ['post', '/api/send-deal-desk-email'],
    ['post', '/api/send-approval-emails'],
  ];

  it.each(OPEN)('%s %s calls no auth helper', (method, routePath) => {
    const route = routeSource(method, routePath);
    expect(route).not.toMatch(/getAuthenticatedUser|getApprovalAdminUser|getExhibitAdminUser/);
  });

  it('the server still calls docx-to-pdf internally without a login token', () => {
    expect(serverSrc).toMatch(/\/api\/convert\/docx-to-pdf/);
  });
});

describe('GET /api/auth/daily-logins behaviour', () => {
  const route = routeSource('get', '/api/auth/daily-logins');
  const helperStart = serverSrc.indexOf('const DEFAULT_APPROVAL_ADMINS');
  const helperEnd = serverSrc.indexOf("app.get('/api/settings/approval-admins'");
  const helperSrc = serverSrc.slice(helperStart, helperEnd);
  const originalAdmins = process.env.APPROVAL_ADMIN_EMAILS;

  afterEach(() => {
    if (originalAdmins === undefined) delete process.env.APPROVAL_ADMIN_EMAILS;
    else process.env.APPROVAL_ADMIN_EMAILS = originalAdmins;
  });

  function setup() {
    process.env.APPROVAL_ADMIN_EMAILS = 'admin@test.example';
    const touched: string[] = [];
    const finds: Array<{ query: unknown; limit?: number }> = [];
    const users: Record<string, { id: string; email: string }> = {
      'admin-id': { id: 'admin-id', email: 'admin@test.example' },
      'user-id': { id: 'user-id', email: 'user@test.example' },
    };
    const db = {
      collection(name: string) {
        touched.push(name);
        if (name === 'users') return { findOne: async ({ id }: { id: string }) => users[id] ?? null };
        if (name === 'settings') return { findOne: async () => null };
        if (name === 'daily_logins') {
          return {
            find(query: unknown) {
              const entry: { query: unknown; limit?: number } = { query };
              finds.push(entry);
              const cursor = {
                sort: () => cursor,
                limit: (n: number) => { entry.limit = n; return cursor; },
                toArray: async () => [],
              };
              return cursor;
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
        throw new Error('invalid signature');
      },
    };
    let handler: (req: unknown, res: unknown) => Promise<void> = async () => {};
    const app = { get: (_p: string, h: typeof handler) => { handler = h; } };
    new Function('app', 'db', 'jwt', 'JWT_SECRET', 'console', `${helperSrc}\n${route}`)(
      app, db, jwt, 'test-secret', { error: () => {}, log: () => {} },
    );
    const call = async (headers: Record<string, string>, query: Record<string, unknown> = {}) => {
      const res = {
        statusCode: 200,
        body: undefined as Record<string, unknown> | undefined,
        status(code: number) { res.statusCode = code; return res; },
        json(payload: Record<string, unknown>) { res.body = payload; return res; },
      };
      await handler({ headers, query }, res);
      return res;
    };
    return { call, touched, finds };
  }

  it('no token: 401 and the database is never touched', async () => {
    const { call, touched } = setup();
    const res = await call({});
    expect(res.statusCode).toBe(401);
    expect(touched).toEqual([]);
  });

  it('malformed or bad-signature token: 401 and no login data is read', async () => {
    const { call, touched } = setup();
    expect((await call({ authorization: 'Bearer notajwt' })).statusCode).toBe(401);
    expect((await call({ authorization: 'Bearer aaa.bad.ccc' })).statusCode).toBe(401);
    expect(touched).not.toContain('daily_logins');
  });

  it('signed-in non-admin: 403 and daily_logins is never read', async () => {
    const { call, touched } = setup();
    const res = await call({ authorization: 'Bearer aaa.user.ccc' });
    expect(res.statusCode).toBe(403);
    expect(touched).not.toContain('daily_logins');
  });

  it('admin: 200 with the unchanged response shape', async () => {
    const { call } = setup();
    const res = await call({ authorization: 'Bearer aaa.admin.ccc' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { records: [], summary: { total_days: 0, total_logins: 0, unique_users: 0 } },
    });
  });

  it('caps limit at 90 and defaults a bad limit to 30', async () => {
    const { call, finds } = setup();
    const headers = { authorization: 'Bearer aaa.admin.ccc' };
    const limits: Array<[unknown, number]> = [
      [undefined, 30], ['10', 10], ['500', 90], ['90', 90], ['abc', 30], ['-5', 30], ['0', 30], [['1', '2'], 1], [{ $gt: '' }, 30],
    ];
    for (const [input, expected] of limits) {
      finds.length = 0;
      const res = await call(headers, input === undefined ? {} : { limit: input });
      expect(res.statusCode).toBe(200);
      expect(finds[0].limit, `limit input ${JSON.stringify(input)}`).toBe(expected);
    }
  });

  it('coerces startDate and endDate to strings so operators cannot reach the filter', async () => {
    const { call, finds } = setup();
    await call(
      { authorization: 'Bearer aaa.admin.ccc' },
      { startDate: { $ne: '' }, endDate: '2026-01-31' },
    );
    const date = (finds[0].query as { date: { $gte: unknown; $lte: unknown } }).date;
    expect(typeof date.$gte).toBe('string');
    expect(date.$lte).toBe('2026-01-31');
  });
});

describe('GET /api/combinations behaviour', () => {
  const route = routeSource('get', '/api/combinations');
  const helperStart = serverSrc.indexOf('async function getAuthenticatedUser');
  const helperEnd = serverSrc.indexOf('async function getApprovalAdminUser');
  const helperSrc = serverSrc.slice(helperStart, helperEnd);

  function setup() {
    const touched: string[] = [];
    const rows = [
      { id: 'c1', label: 'A', fileName: 'a.docx', displayOrder: 1 },
      { id: 'c2', label: 'B', displayOrder: 2 },
    ];
    const db = {
      collection(name: string) {
        touched.push(name);
        if (name === 'users') return { findOne: async ({ id }: { id: string }) => (id === 'user-id' ? { id } : null) };
        if (name === 'combinations') {
          return {
            find() {
              const cursor = { sort: () => cursor, toArray: async () => rows };
              return cursor;
            },
          };
        }
        throw new Error(`unexpected collection ${name}`);
      },
    };
    const jwt = {
      verify: (token: string) => {
        if (token === 'aaa.user.ccc') return { userId: 'user-id' };
        throw new Error('invalid signature');
      },
    };
    let handler: (req: unknown, res: unknown) => Promise<void> = async () => {};
    const app = { get: (_p: string, h: typeof handler) => { handler = h; } };
    new Function('app', 'db', 'jwt', 'JWT_SECRET', 'console', `${helperSrc}\n${route}`)(
      app, db, jwt, 'test-secret', { error: () => {}, log: () => {} },
    );
    const call = async (headers: Record<string, string>) => {
      const res = {
        statusCode: 200,
        body: undefined as Record<string, unknown> | undefined,
        status(code: number) { res.statusCode = code; return res; },
        json(payload: Record<string, unknown>) { res.body = payload; return res; },
      };
      await handler({ headers, query: {} }, res);
      return res;
    };
    return { call, touched };
  }

  it('no token: 401, no data, and the database is never touched', async () => {
    const { call, touched } = setup();
    const res = await call({});
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Authentication required' });
    expect(touched).toEqual([]);
  });

  it('bad-signature token: 401 and combinations are never read', async () => {
    const { call, touched } = setup();
    const res = await call({ authorization: 'Bearer aaa.bad.ccc' });
    expect(res.statusCode).toBe(401);
    expect(touched).not.toContain('combinations');
  });

  it('valid token: 200 with the unchanged response shape', async () => {
    const { call } = setup();
    const res = await call({ authorization: 'Bearer aaa.user.ccc' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      count: 2,
      combinations: [
        { id: 'c1', label: 'A', fileName: 'a.docx', displayOrder: 1, hasFile: true },
        { id: 'c2', label: 'B', displayOrder: 2, hasFile: false },
      ],
    });
  });
});

describe('seed scripts need an admin token', () => {
  for (const script of ['reseed-templates.cjs', 'reseed-combinations.cjs']) {
    it(`${script} sends CPQ_ADMIN_TOKEN as a Bearer header and refuses to run without it`, () => {
      const src = fs.readFileSync(path.resolve(process.cwd(), script), 'utf8');
      expect(src).toContain('process.env.CPQ_ADMIN_TOKEN');
      expect(src).toContain('Authorization: `Bearer ${process.env.CPQ_ADMIN_TOKEN}`');
      expect(src.indexOf('!process.env.CPQ_ADMIN_TOKEN')).toBeLessThan(src.indexOf('axios.post'));
      expect(src).toContain('process.exit(1)');
    });
  }
});
