import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import access from '../../approval-workflow-access.cjs';

type Doc = Record<string, unknown>;

const { listApprovalWorkflowsForCaller, verifyApprovalPortalToken, isWorkflowVisibleToUser } = access as {
  listApprovalWorkflowsForCaller: (args: unknown) => Promise<{ status: number; body: Record<string, unknown> }>;
  verifyApprovalPortalToken: (db: unknown, query: unknown) => Promise<{ ok: boolean; message?: string; workflowId?: string; role?: string }>;
  isWorkflowVisibleToUser: (workflow: unknown, email: unknown) => boolean;
};

const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 86_400_000);

function steps(emails: Array<[string, string]>, status = 'pending') {
  return emails.map(([role, email], i) => ({ step: i + 1, role, email, status, comments: '' }));
}

const WF_A = {
  id: 'WF-1', createdAt: '2026-01-01T00:00:00.000Z', status: 'pending', creatorEmail: 'owner@x.com',
  workflowSteps: steps([['Team Approval', 'Lead@X.com'], ['Technical Team', 'tech@x.com'], ['Legal Team', 'legal@x.com']]),
};
const WF_B = {
  id: 'WF-2', createdAt: '2026-02-01T00:00:00.000Z', status: 'pending', creatorEmail: 'other@x.com',
  workflowSteps: steps([['Team Approval', 'lead2@x.com'], ['Technical Team', 'tech2@x.com'], ['Legal Team', 'legal@x.com']]),
};
const WF_NO_CREATOR = {
  id: 'WF-3', createdAt: '2026-03-01T00:00:00.000Z', status: 'pending',
  workflowSteps: steps([['Technical Team', 'tech3@x.com'], ['Legal Team', 'legal3@x.com']]),
};
const WF_DONE = {
  id: 'WF-4', createdAt: '2026-04-01T00:00:00.000Z', status: 'in_progress', creatorEmail: 'owner@x.com',
  workflowSteps: steps([['Team Approval', 'lead@x.com'], ['Technical Team', 'tech@x.com'], ['Legal Team', 'legal@x.com']], 'approved'),
};
const WF_DONE_OTHER = { ...WF_DONE, id: 'WF-5', creatorEmail: 'other@x.com', createdAt: '2026-05-01T00:00:00.000Z' };

function makeDb(workflows: Doc[], tokens: Doc[] = []) {
  const store = workflows.map((w) => structuredClone(w));
  const updateMany = vi.fn(async (filter: { id: { $in: string[] } }, update: { $set: Doc }) => {
    store.forEach((w) => { if (filter.id.$in.includes(w.id as string)) Object.assign(w, update.$set); });
  });
  const find = vi.fn(() => ({
    sort: () => ({
      toArray: async () => [...store].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    }),
  }));
  const db = {
    collection: (name: string) => {
      if (name === 'approval_workflows') {
        return { find, updateMany, findOne: async (q: Doc) => store.find((w) => w.id === q.id) ?? null };
      }
      if (name === 'approval_access_tokens') {
        return {
          findOne: async (q: Doc) =>
            tokens.find((t) => t.workflowId === q.workflowId && t.role === q.role && t.token === q.token) ?? null,
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
  return { db, store, updateMany, find };
}

const ALL = [WF_A, WF_B, WF_NO_CREATOR, WF_DONE, WF_DONE_OTHER];
const TOKENS = [
  { workflowId: 'WF-1', role: 'teamlead', token: 'tok-a', expiresAt: FUTURE },
  { workflowId: 'WF-1', role: 'legal', token: 'tok-old', expiresAt: PAST },
];

const ids = (body: Record<string, unknown>) => (body.workflows as Doc[]).map((w) => w.id);

describe('GET /api/approval-workflows access decision', () => {
  it('(a) no credentials: 401 with no data', async () => {
    const { db, find, updateMany } = makeDb(ALL, TOKENS);
    const res = await listApprovalWorkflowsForCaller({ db, user: null, isAdmin: false, query: {} });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Authentication required' });
    expect(find).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('(b) invalid JWT (no user) and no token: 401 with no data', async () => {
    const { db } = makeDb(ALL, TOKENS);
    const res = await listApprovalWorkflowsForCaller({ db, user: null, isAdmin: false, query: { role: 'legal' } });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('WF-');
  });

  it('(c) admin gets every workflow, newest first', async () => {
    const { db } = makeDb(ALL);
    const res = await listApprovalWorkflowsForCaller({ db, user: { email: 'boss@x.com' }, isAdmin: true, query: {} });
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(['WF-5', 'WF-4', 'WF-3', 'WF-2', 'WF-1']);
    expect(res.body.count).toBe(5);
  });

  it('(d) non-admin creator sees only their own, matched case-insensitively', async () => {
    const { db } = makeDb(ALL);
    const res = await listApprovalWorkflowsForCaller({ db, user: { email: ' OWNER@x.com ' }, isAdmin: false, query: {} });
    expect(ids(res.body)).toEqual(['WF-4', 'WF-1']);
  });

  it('(e) non-admin step approver sees theirs and nothing else', async () => {
    const { db } = makeDb(ALL);
    const lead = await listApprovalWorkflowsForCaller({ db, user: { email: 'lead@x.com' }, isAdmin: false, query: {} });
    expect(ids(lead.body)).toEqual(['WF-5', 'WF-4', 'WF-1']);
    const tech3 = await listApprovalWorkflowsForCaller({ db, user: { email: 'TECH3@x.com' }, isAdmin: false, query: {} });
    expect(ids(tech3.body)).toEqual(['WF-3']);
    const legal = await listApprovalWorkflowsForCaller({ db, user: { email: 'legal@x.com' }, isAdmin: false, query: {} });
    expect(ids(legal.body)).toEqual(['WF-5', 'WF-4', 'WF-2', 'WF-1']);
  });

  it('non-admin with no matching workflow, or no email, gets an empty list', async () => {
    const { db } = makeDb(ALL);
    const none = await listApprovalWorkflowsForCaller({ db, user: { email: 'nobody@x.com' }, isAdmin: false, query: {} });
    expect(none.body).toEqual({ success: true, workflows: [], count: 0 });
    const noEmail = await listApprovalWorkflowsForCaller({ db, user: {}, isAdmin: false, query: {} });
    expect(noEmail.body.count).toBe(0);
  });

  it('workflows without creatorEmail are admin-only unless the user is an approver', async () => {
    const { db } = makeDb([WF_NO_CREATOR]);
    const stranger = await listApprovalWorkflowsForCaller({ db, user: { email: 'owner@x.com' }, isAdmin: false, query: {} });
    expect(stranger.body.count).toBe(0);
    const admin = await listApprovalWorkflowsForCaller({ db, user: { email: 'boss@x.com' }, isAdmin: true, query: {} });
    expect(ids(admin.body)).toEqual(['WF-3']);
    expect(isWorkflowVisibleToUser(WF_NO_CREATOR, '')).toBe(false);
  });

  it('legacy rows with only createdBy are visible to that user and no one else', async () => {
    const legacy = { ...WF_NO_CREATOR, id: 'WF-6', createdBy: 'Legacy@X.com' };
    const { db } = makeDb([legacy]);
    const mine = await listApprovalWorkflowsForCaller({ db, user: { email: 'legacy@x.com' }, isAdmin: false, query: {} });
    expect(ids(mine.body)).toEqual(['WF-6']);
    const other = await listApprovalWorkflowsForCaller({ db, user: { email: 'owner@x.com' }, isAdmin: false, query: {} });
    expect(other.body.count).toBe(0);
    expect(isWorkflowVisibleToUser(legacy, 'legacy@x.com')).toBe(true);
    expect(isWorkflowVisibleToUser(legacy, 'someone@x.com')).toBe(false);
  });

  it('creatorEmail takes precedence over createdBy', () => {
    const wf = { id: 'WF-7', creatorEmail: 'real@x.com', createdBy: 'stale@x.com', workflowSteps: [] };
    expect(isWorkflowVisibleToUser(wf, 'real@x.com')).toBe(true);
    expect(isWorkflowVisibleToUser(wf, 'stale@x.com')).toBe(false);
  });

  it('(f) a valid token returns only that workflow in the same shape', async () => {
    const { db } = makeDb(ALL, TOKENS);
    const res = await listApprovalWorkflowsForCaller({
      db, user: null, isAdmin: false, query: { workflowId: 'WF-1', role: 'TeamLead', token: 'tok-a' },
    });
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(['WF-1']);
    expect(res.body.count).toBe(1);
  });

  it('(g) a token for workflow A cannot fetch workflow B', async () => {
    const { db } = makeDb(ALL, TOKENS);
    const res = await listApprovalWorkflowsForCaller({
      db, user: null, isAdmin: false, query: { workflowId: 'WF-2', role: 'teamlead', token: 'tok-a' },
    });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('WF-');
  });

  it('(g) wrong role, expired and unknown tokens are rejected', async () => {
    const { db } = makeDb(ALL, TOKENS);
    const attempts = [
      { workflowId: 'WF-1', role: 'legal', token: 'tok-a' },
      { workflowId: 'WF-1', role: 'legal', token: 'tok-old' },
      { workflowId: 'WF-1', role: 'teamlead', token: 'nope' },
      { workflowId: 'WF-1', role: 'admin', token: 'tok-a' },
      { workflowId: 'WF-1', role: 'teamlead' },
    ];
    for (const query of attempts) {
      const res = await listApprovalWorkflowsForCaller({ db, user: null, isAdmin: false, query });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ success: false, error: 'Authentication required' });
    }
  });

  it('valid login for an unrelated user plus a valid token returns the token workflow', async () => {
    const { db } = makeDb(ALL, TOKENS);
    const res = await listApprovalWorkflowsForCaller({
      db, user: { email: 'nobody@x.com' }, isAdmin: false,
      query: { workflowId: 'WF-1', role: 'teamlead', token: 'tok-a' },
    });
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(['WF-1']);
    expect(res.body.count).toBe(1);
  });

  it('token workflow is unioned with the user visible set without duplicates', async () => {
    const { db } = makeDb(ALL, TOKENS);
    const other = await listApprovalWorkflowsForCaller({
      db, user: { email: 'other@x.com' }, isAdmin: false,
      query: { workflowId: 'WF-1', role: 'teamlead', token: 'tok-a' },
    });
    expect(ids(other.body)).toEqual(['WF-5', 'WF-2', 'WF-1']);
    const owner = await listApprovalWorkflowsForCaller({
      db, user: { email: 'owner@x.com' }, isAdmin: false,
      query: { workflowId: 'WF-1', role: 'teamlead', token: 'tok-a' },
    });
    expect(ids(owner.body)).toEqual(['WF-4', 'WF-1']);
  });

  it('stale or invalid login (no user) plus a valid token returns the token workflow, not 401', async () => {
    const { db } = makeDb(ALL, TOKENS);
    const res = await listApprovalWorkflowsForCaller({
      db, user: null, isAdmin: false, query: { workflowId: 'WF-1', role: 'teamlead', token: 'tok-a' },
    });
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(['WF-1']);
  });

  it('valid login with an invalid token still returns the login list, not 401', async () => {
    const { db } = makeDb(ALL, TOKENS);
    const res = await listApprovalWorkflowsForCaller({
      db, user: { email: 'owner@x.com' }, isAdmin: false,
      query: { workflowId: 'WF-2', role: 'teamlead', token: 'tok-a' },
    });
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(['WF-4', 'WF-1']);
  });

  it('a token does not narrow an admin list', async () => {
    const { db } = makeDb(ALL, TOKENS);
    const res = await listApprovalWorkflowsForCaller({
      db, user: { email: 'boss@x.com' }, isAdmin: true,
      query: { workflowId: 'WF-1', role: 'teamlead', token: 'tok-a' },
    });
    expect(res.body.count).toBe(5);
  });

  it('(h) the success shape is { success, workflows, count }', async () => {
    const { db } = makeDb(ALL);
    const res = await listApprovalWorkflowsForCaller({ db, user: { email: 'boss@x.com' }, isAdmin: true, query: {} });
    expect(Object.keys(res.body).sort()).toEqual(['count', 'success', 'workflows']);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.workflows)).toBe(true);
  });
});

describe('completed-approval re-evaluation', () => {
  it('only settles workflows inside the caller visible set', async () => {
    const { db, store, updateMany } = makeDb(ALL);
    const res = await listApprovalWorkflowsForCaller({ db, user: { email: 'owner@x.com' }, isAdmin: false, query: {} });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0][0]).toEqual({ id: { $in: ['WF-4'] } });
    expect(store.find((w) => w.id === 'WF-5')?.status).toBe('in_progress');
    const returned = (res.body.workflows as Doc[]).find((w) => w.id === 'WF-4');
    expect(returned?.status).toBe('approved');
  });

  it('returns the updated status without re-querying the collection', async () => {
    const { db, find } = makeDb(ALL);
    const res = await listApprovalWorkflowsForCaller({ db, user: { email: 'boss@x.com' }, isAdmin: true, query: {} });
    expect(find).toHaveBeenCalledTimes(1);
    const statuses = Object.fromEntries((res.body.workflows as Doc[]).map((w) => [w.id, w.status]));
    expect(statuses['WF-4']).toBe('approved');
    expect(statuses['WF-5']).toBe('approved');
    expect(statuses['WF-1']).toBe('pending');
  });

  it('returned updatedAt on settled workflows equals the value written by updateMany', async () => {
    const { db, updateMany } = makeDb(ALL);
    const res = await listApprovalWorkflowsForCaller({ db, user: { email: 'boss@x.com' }, isAdmin: true, query: {} });
    const written = updateMany.mock.calls[0][1].$set.updatedAt;
    expect(typeof written).toBe('string');
    const settled = (res.body.workflows as Doc[]).filter((w) => w.status === 'approved');
    expect(settled.map((w) => w.id).sort()).toEqual(['WF-4', 'WF-5']);
    settled.forEach((w) => expect(w.updatedAt).toBe(written));
  });

  it('skips workflows without an id so updateMany never matches a null id', async () => {
    const idless = { ...WF_DONE, id: undefined };
    const { db, updateMany } = makeDb([idless]);
    const res = await listApprovalWorkflowsForCaller({ db, user: { email: 'boss@x.com' }, isAdmin: true, query: {} });
    expect(updateMany).not.toHaveBeenCalled();
    expect((res.body.workflows as Doc[])[0].status).toBe('in_progress');
  });

  it('settles only the id-bearing workflows when an id-less one is also complete', async () => {
    const idless = { ...WF_DONE, id: undefined, createdAt: '2026-06-01T00:00:00.000Z' };
    const { db, updateMany } = makeDb([WF_DONE, idless]);
    await listApprovalWorkflowsForCaller({ db, user: { email: 'boss@x.com' }, isAdmin: true, query: {} });
    expect(updateMany.mock.calls[0][0]).toEqual({ id: { $in: ['WF-4'] } });
  });

  it('does not write when nothing is complete', async () => {
    const { db, updateMany } = makeDb([WF_A, WF_B]);
    await listApprovalWorkflowsForCaller({ db, user: { email: 'boss@x.com' }, isAdmin: true, query: {} });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('token callers can only settle the one workflow they hold', async () => {
    const tokens = [{ workflowId: 'WF-4', role: 'legal', token: 't4', expiresAt: FUTURE }];
    const { db, updateMany } = makeDb(ALL, tokens);
    await listApprovalWorkflowsForCaller({ db, user: null, isAdmin: false, query: { workflowId: 'WF-4', role: 'legal', token: 't4' } });
    expect(updateMany.mock.calls[0][0]).toEqual({ id: { $in: ['WF-4'] } });
  });
});

describe('verifyApprovalPortalToken', () => {
  const { db } = makeDb([], [...TOKENS]);

  it('keeps the exact denial messages verify-access has always returned', async () => {
    expect(await verifyApprovalPortalToken(db, {})).toEqual({ ok: false, message: 'Missing workflowId, role, or token' });
    expect(await verifyApprovalPortalToken(db, { workflowId: 'WF-1', role: 'boss', token: 'x' })).toEqual({ ok: false, message: 'Invalid role' });
    expect(await verifyApprovalPortalToken(db, { workflowId: 'WF-1', role: 'legal', token: 'x' })).toEqual({ ok: false, message: 'Invalid or unknown token' });
    expect(await verifyApprovalPortalToken(db, { workflowId: 'WF-1', role: 'legal', token: 'tok-old' })).toEqual({ ok: false, message: 'Token has expired' });
  });

  it('returns the stored workflowId and lower-cased role on success', async () => {
    expect(await verifyApprovalPortalToken(db, { workflowId: 'WF-1', role: 'TeamLead', token: 'tok-a' }))
      .toEqual({ ok: true, workflowId: 'WF-1', role: 'teamlead' });
  });
});

describe('server.cjs wiring', () => {
  const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');
  const routeAt = serverSrc.search(/app\.get\(\s*['"]\/api\/approval-workflows['"]\s*,/);
  const route = serverSrc.slice(routeAt, serverSrc.indexOf('\napp.', routeAt + 1));
  const verifyAt = serverSrc.search(/app\.get\(\s*['"]\/api\/approval-workflows\/verify-access['"]\s*,/);
  const verifyRoute = serverSrc.slice(verifyAt, serverSrc.indexOf('\napp.', verifyAt + 1));

  it('the list route resolves the caller from the JWT and never reads the collection itself', () => {
    expect(routeAt).toBeGreaterThan(-1);
    expect(route).toContain('getOptionalAuthenticatedUser(req)');
    expect(route).toContain('hasApprovalAdminAccess(user)');
    expect(route).toContain('listApprovalWorkflowsForCaller(');
    expect(route).not.toContain("collection('approval_workflows')");
  });

  function makeRes() {
    const res = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: undefined as unknown,
      set(name: string, value: string) { res.headers[name] = value; return res; },
      status(code: number) { res.statusCode = code; return res; },
      json(payload: unknown) { res.body = payload; return res; },
    };
    return res;
  }

  // Runs the real route source against fakes so no server or database is started.
  function runRoute(dbValue: unknown, user: unknown, query: Record<string, string> = {}) {
    let handler: (req: unknown, res: unknown) => Promise<void> = async () => {};
    const app = { get: (_p: string, h: typeof handler) => { handler = h; } };
    const factory = new Function(
      'app', 'dbValue', 'getOptionalAuthenticatedUser', 'hasApprovalAdminAccess',
      'listApprovalWorkflowsForCaller', 'console',
      `const db = dbValue; ${route}`,
    );
    factory(
      app, dbValue, async () => user, async () => false,
      listApprovalWorkflowsForCaller, { error: () => {} },
    );
    const res = makeRes();
    return handler({ query, headers: {} }, res).then(() => res);
  }

  it('sets Cache-Control: no-store on 200, 401 and 500 list responses', async () => {
    expect(route).toContain("res.set('Cache-Control', 'no-store')");
    const { db } = makeDb(ALL, TOKENS);
    const ok = await runRoute(db, { email: 'boss@x.com' });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['Cache-Control']).toBe('no-store');
    const unauth = await runRoute(db, null);
    expect(unauth.statusCode).toBe(401);
    expect(unauth.headers['Cache-Control']).toBe('no-store');
    const noDb = await runRoute(null, null);
    expect(noDb.statusCode).toBe(500);
    expect(noDb.headers['Cache-Control']).toBe('no-store');
  });

  it('db unavailable keeps the original 500 shape', async () => {
    const res = await runRoute(null, null);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: 'Database not available',
      message: 'Cannot fetch workflows without database connection',
    });
  });

  it('an invalid JWT resolves to no user and falls through to the token check', async () => {
    const fnAt = serverSrc.search(/async function getOptionalAuthenticatedUser\(/);
    const fnSrc = serverSrc.slice(fnAt).match(/^[\s\S]*?\r?\n\}(?=\r?\n)/)![0];
    const getUser = new Function(
      'jwt', 'JWT_SECRET', 'db', `${fnSrc}; return getOptionalAuthenticatedUser;`,
    )(
      { verify: () => { throw new Error('invalid signature'); } },
      'secret',
      { collection: () => { throw new Error('must not query users'); } },
    ) as (req: unknown) => Promise<unknown>;

    const user = await getUser({ headers: { authorization: 'Bearer aaa.bbb.ccc' } });
    expect(user).toBeNull();

    const { db } = makeDb(ALL, TOKENS);
    const noToken = await listApprovalWorkflowsForCaller({ db, user, isAdmin: false, query: {} });
    expect(noToken.status).toBe(401);
    const withToken = await listApprovalWorkflowsForCaller({
      db, user, isAdmin: false, query: { workflowId: 'WF-1', role: 'teamlead', token: 'tok-a' },
    });
    expect(withToken.status).toBe(200);
    expect(ids(withToken.body)).toEqual(['WF-1']);
  });

  it('verify-access and the list route share one token check', () => {
    expect(verifyAt).toBeGreaterThan(-1);
    expect(verifyRoute).toContain('verifyApprovalPortalToken(db, req.query)');
    expect(verifyRoute).not.toContain("collection('approval_access_tokens')");
  });
});
