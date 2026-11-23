import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import utils from '../../esign-creator-utils.cjs';

// Approval admins get the creator's e-sign actions: Delete, Cancel Signing (void), Send Reminder, Extend expiry.

type Access = { ok: boolean; byAdmin: boolean };
const { esignManageAccess } = utils as {
  esignManageAccess: (args: { doc: unknown; user: unknown; isAdmin?: unknown }) => Promise<Access>;
};
const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

function routeSource(method: string, routePath: string): string {
  const start = serverSrc.indexOf(`\napp.${method}('${routePath}'`);
  expect(start, `${method} ${routePath}`).toBeGreaterThan(-1);
  return serverSrc.slice(start + 1, serverSrc.indexOf('\napp.', start + 2));
}

const DOC_ID = '6a8dc7e188f43f837939c157';
const DOC = { _id: DOC_ID, status: 'sent', uploaded_by: 'owner@x.com', file_name: 'Deal.pdf' };
const USERS: Record<string, { id: string; email: string; admin: boolean }> = {
  owner: { id: 'u1', email: 'owner@x.com', admin: false },
  admin: { id: 'u2', email: 'boss@x.com', admin: true },
  other: { id: 'u3', email: 'other@x.com', admin: false },
};
const isAdmin = async (u: { admin?: boolean }) => u.admin === true;

describe('esignManageAccess', () => {
  it('lets the creator manage without an admin lookup', async () => {
    let lookups = 0;
    const r = await esignManageAccess({ doc: DOC, user: { email: ' OWNER@x.com ' }, isAdmin: async () => { lookups += 1; return false; } });
    expect(r).toEqual({ ok: true, byAdmin: false });
    expect(lookups).toBe(0);
  });

  it('lets an approval admin manage someone else\'s document and marks it', async () => {
    expect(await esignManageAccess({ doc: DOC, user: USERS.admin, isAdmin })).toEqual({ ok: true, byAdmin: true });
  });

  it('refuses everyone else, a missing email, a missing document and a non-function isAdmin', async () => {
    expect((await esignManageAccess({ doc: DOC, user: USERS.other, isAdmin })).ok).toBe(false);
    expect((await esignManageAccess({ doc: DOC, user: { email: '' }, isAdmin: async () => true })).ok).toBe(false);
    expect((await esignManageAccess({ doc: null, user: USERS.admin, isAdmin })).ok).toBe(false);
    expect((await esignManageAccess({ doc: DOC, user: USERS.admin, isAdmin: true })).ok).toBe(false);
  });

  it('uses the requester address for approval-created documents', async () => {
    const approvalDoc = { ...DOC, uploaded_by: 'Owner Name', requested_by_email: 'owner@x.com' };
    expect((await esignManageAccess({ doc: approvalDoc, user: USERS.owner, isAdmin })).ok).toBe(true);
  });
});

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: any) { res.body = payload; return res; },
    set() { return res; },
  };
  return res;
}

class FakeObjectId {
  value: string;
  constructor(v: string) { if (!/^[0-9a-f]{24}$/.test(v)) throw new Error('bad id'); this.value = v; }
  toString() { return this.value; }
}

// Runs one route against an in-memory document; records every write so a refusal can prove nothing changed.
function load(method: 'delete' | 'post', routePath: string) {
  const writes: string[] = [];
  const collection = (name: string) => ({
    findOne: async () => (name === 'esign_documents' ? { ...DOC } : null),
    find: () => ({ sort: () => ({ toArray: async () => [] }), toArray: async () => [] }),
    countDocuments: async () => 0,
    deleteMany: async () => { writes.push(`${name}.deleteMany`); return {}; },
    deleteOne: async () => { writes.push(`${name}.deleteOne`); return {}; },
    updateOne: async () => { writes.push(`${name}.updateOne`); return {}; },
    updateMany: async () => { writes.push(`${name}.updateMany`); return {}; },
  });
  const deps: Record<string, unknown> = {
    app: { [method]: (_p: string, h: unknown) => { handler = h as typeof handler; } },
    db: { collection },
    ObjectId: FakeObjectId,
    getAuthenticatedUser: async (req: any, res: any) => {
      const u = USERS[req.headers.user];
      if (!u) res.status(401).json({ success: false });
      return u ?? null;
    },
    esignManageAccessFor: (doc: unknown, user: unknown) => esignManageAccess({ doc, user, isAdmin }),
    logger: { warn: () => {}, info: () => {}, error: () => {} },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    logAudit: async () => { writes.push('audit'); },
    signatureFieldsDocumentFilter: () => ({}),
    esignRecipientsDocumentFilter: () => ({}),
    fs: { existsSync: () => false, unlinkSync: () => {} },
    isZohoManagedDocument: () => false,
    process: { env: { SENDGRID_API_KEY: 'test-key' } },
  };
  let handler: (req: unknown, res: unknown) => Promise<void> = async () => {};
  new Function(...Object.keys(deps), routeSource(method, routePath))(...Object.values(deps));
  const call = async (user: string, body: Record<string, unknown> = {}) => {
    const res = makeRes();
    await handler({ headers: { user }, params: { id: DOC_ID }, body, ip: '127.0.0.1' }, res);
    return res;
  };
  return { call, writes };
}

const ROUTES: Array<[string, 'delete' | 'post', string, Record<string, unknown>]> = [
  ['Delete', 'delete', '/api/esign/documents/:id', {}],
  ['Cancel Signing', 'post', '/api/esign/documents/:id/void', { void_reason: 'Wrong terms' }],
  ['Send Reminder', 'post', '/api/esign/documents/:id/remind', {}],
  ['Extend expiry', 'post', '/api/esign/documents/:id/extend-expiry', { days: 7 }],
];

describe.each(ROUTES)('%s route', (_label, method, routePath, body) => {
  it('refuses a signed-in user who is neither creator nor admin, and changes nothing', async () => {
    const r = load(method, routePath);
    const res = await r.call('other', body);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/creator or an approval admin/);
    expect(r.writes).toEqual([]);
  });

  it('refuses a signed-out caller with 401 and changes nothing', async () => {
    const r = load(method, routePath);
    const res = await r.call('nobody', body);
    expect(res.statusCode).toBe(401);
    expect(r.writes).toEqual([]);
  });

  it('lets an approval admin past the access check', async () => {
    const r = load(method, routePath);
    const res = await r.call('admin', body);
    expect(res.statusCode).not.toBe(403);
    expect(res.statusCode).not.toBe(401);
  });

  it('uses the shared creator-or-admin rule, not a creator-only check', () => {
    const src = routeSource(method, routePath);
    expect(src).toContain('esignManageAccessFor(doc,');
    expect(src).not.toContain('esignActorIsDocumentCreator(');
  });
});

describe('Delete route', () => {
  it('an approval admin really deletes someone else\'s document', async () => {
    const r = load('delete', '/api/esign/documents/:id');
    const res = await r.call('admin');
    expect(res.statusCode).toBe(200);
    expect(r.writes).toContain('esign_documents.deleteOne');
  });

  it('records who deleted it after the document\'s own audit rows are wiped', async () => {
    const r = load('delete', '/api/esign/documents/:id');
    await r.call('admin');
    expect(r.writes.lastIndexOf('audit')).toBeGreaterThan(r.writes.indexOf('audit_logs.deleteMany'));
    const src = routeSource('delete', '/api/esign/documents/:id');
    expect(src).toMatch(/logAudit\(docId\.toString\(\), 'deleted', actor\.email[^)]*by_admin: access\.byAdmin/);
  });

  it('checks the login before reading the document id', () => {
    const src = routeSource('delete', '/api/esign/documents/:id');
    expect(src.indexOf('getAuthenticatedUser')).toBeLessThan(src.indexOf('req.params'));
  });
});
