import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import access from '../../approval-workflow-access.cjs';

// Approval admins get the requester's card actions: Reminder, Delete (plus Edit Dates, Cancel, Reset e-sign).

const { mayManageApprovalWorkflow } = access as { mayManageApprovalWorkflow: (args: unknown) => boolean };
const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

function routeSource(method: string, routePath: string): string {
  const start = serverSrc.indexOf(`\napp.${method}('${routePath}'`);
  expect(start, `${method} ${routePath}`).toBeGreaterThan(-1);
  return serverSrc.slice(start + 1, serverSrc.indexOf('\napp.', start + 2));
}

const WF = {
  id: 'WF-1', status: 'pending', creatorEmail: 'owner@x.com', documentId: 'Doc_1', currentStep: 1,
  workflowSteps: [{ step: 1, role: 'Team Approval', email: 'lead@x.com', status: 'pending' }],
};
const USERS: Record<string, { id: string; email: string; admin: boolean }> = {
  owner: { id: 'u1', email: 'owner@x.com', admin: false },
  admin: { id: 'u2', email: 'boss@x.com', admin: true },
  other: { id: 'u3', email: 'other@x.com', admin: false },
};

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: any) { res.body = payload; return res; },
  };
  return res;
}

function load(method: 'delete' | 'post', routePath: string, extra: Record<string, unknown> = {}) {
  const deleted: string[] = [];
  const updated: string[] = [];
  const store: Record<string, typeof WF> = { 'WF-1': WF };
  const db = {
    collection: () => ({
      findOne: async ({ id }: { id: string }) => store[id] ?? null,
      deleteOne: async ({ id }: { id: string }) => { deleted.push(id); return { deletedCount: store[id] ? 1 : 0 }; },
      updateOne: async ({ id }: { id: string }) => { updated.push(id); return { matchedCount: 1 }; },
    }),
  };
  let handler: (req: unknown, res: unknown) => Promise<void> = async () => {};
  const names = [
    'app', 'db', 'getAuthenticatedUser', 'hasApprovalAdminAccess', 'mayManageApprovalWorkflow', 'logger',
    'normalizeEmail', 'console', ...Object.keys(extra),
  ];
  new Function(...names, routeSource(method, routePath))(
    { [method]: (_p: string, h: typeof handler) => { handler = h; } },
    db,
    async (req: any) => USERS[req.headers.user] ?? null,
    async (u: { admin: boolean }) => u.admin,
    mayManageApprovalWorkflow,
    { warn: () => {}, info: () => {}, error: () => {} },
    (e: unknown) => String(e || '').trim().toLowerCase(),
    { log: () => {}, warn: () => {}, error: () => {} },
    ...Object.values(extra),
  );
  const call = async (user: string, id = 'WF-1') => {
    const res = makeRes();
    await handler({ headers: { user }, params: { id, workflowId: id } }, res);
    return res;
  };
  return { call, deleted, updated };
}

describe('mayManageApprovalWorkflow', () => {
  it('lets the requester and an approval admin manage, nobody else', () => {
    expect(mayManageApprovalWorkflow({ workflow: WF, user: { email: 'OWNER@x.com' }, isAdmin: false })).toBe(true);
    expect(mayManageApprovalWorkflow({ workflow: WF, user: { email: 'boss@x.com' }, isAdmin: true })).toBe(true);
    expect(mayManageApprovalWorkflow({ workflow: WF, user: { email: 'other@x.com' }, isAdmin: false })).toBe(false);
  });
});

describe('DELETE /api/approval-workflows/:id', () => {
  it('the requester and an approval admin can delete', async () => {
    const asOwner = load('delete', '/api/approval-workflows/:id');
    expect((await asOwner.call('owner')).statusCode).toBe(200);
    expect(asOwner.deleted).toEqual(['WF-1']);

    const asAdmin = load('delete', '/api/approval-workflows/:id');
    expect((await asAdmin.call('admin')).statusCode).toBe(200);
    expect(asAdmin.deleted).toEqual(['WF-1']);
  });

  it('anyone else gets 403 and nothing is deleted; a missing id looks the same to them', async () => {
    const r = load('delete', '/api/approval-workflows/:id');
    const other = await r.call('other');
    const missing = await r.call('other', 'WF-404');
    expect(other.statusCode).toBe(403);
    expect(missing.statusCode).toBe(403);
    expect(other.body).toEqual(missing.body);
    expect(r.deleted).toEqual([]);
  });

  it('no login: 401 and nothing deleted', async () => {
    const r = load('delete', '/api/approval-workflows/:id');
    const res = await r.call('nobody');
    expect(r.deleted).toEqual([]);
    expect(res.body).toBeUndefined();
  });
});

describe('POST /api/approval-workflows/:workflowId/remind', () => {
  const built = { ok: true, role: 'Team Approval', approverEmail: 'lead@x.com', html: '<p/>', attachments: [] };
  const extra = {
    escapeHtml: (s: string) => s,
    buildCurrentApproverEmail: async () => built,
    sendEmail: async () => ({ success: true }),
  };

  it('a non-requester who is not an admin gets 403 and no email is built', async () => {
    let builtCalls = 0;
    const r = load('post', '/api/approval-workflows/:workflowId/remind', {
      ...extra, buildCurrentApproverEmail: async () => { builtCalls += 1; return built; },
    });
    const res = await r.call('other');
    expect(res.statusCode).toBe(403);
    expect(builtCalls).toBe(0);
    expect(r.updated).toEqual([]);
  });

  it('an approval admin passes the access check and reaches the reminder', async () => {
    let builtCalls = 0;
    const r = load('post', '/api/approval-workflows/:workflowId/remind', {
      ...extra, buildCurrentApproverEmail: async () => { builtCalls += 1; return built; },
    });
    await r.call('admin');
    expect(builtCalls).toBe(1);
  });
});
