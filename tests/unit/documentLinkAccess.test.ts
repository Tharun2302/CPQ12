import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import access from '../../document-access.cjs';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import approvalCombination from '../../approval-combination.cjs';

// Linking a document to an approval or e-sign makes the caller its requester / e-sign creator,
// which grants read (GET /api/documents/:id) and Edit for RedLine. So only the owner or an admin may link.

const { mayLinkDocument } = access as { mayLinkDocument: (args: Record<string, unknown>) => boolean };
const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

function routeSource(method: string, routePath: string): string {
  const start = serverSrc.indexOf(`\napp.${method}('${routePath}'`);
  expect(start, `${method} ${routePath}`).toBeGreaterThan(-1);
  return serverSrc.slice(start + 1, serverSrc.indexOf('\napp.', start + 2));
}

const DOC = { id: 'Acme_Jane_12345', createdByEmail: 'a@test.example' };

describe('mayLinkDocument', () => {
  it('allows the creator, a document admin and an approval admin', () => {
    expect(mayLinkDocument({ doc: DOC, user: { email: ' A@Test.example' } })).toBe(true);
    expect(mayLinkDocument({ doc: DOC, user: { email: 'b@test.example' }, isDocumentAdmin: true })).toBe(true);
    expect(mayLinkDocument({ doc: DOC, user: { email: 'b@test.example' }, isApprovalAdmin: true })).toBe(true);
  });

  it('refuses anyone else, a legacy document with no creator, a redline admin, and a caller without email', () => {
    expect(mayLinkDocument({ doc: DOC, user: { email: 'b@test.example' } })).toBe(false);
    expect(mayLinkDocument({ doc: { id: 'old' }, user: { email: 'b@test.example' } })).toBe(false);
    expect(mayLinkDocument({ doc: DOC, user: { email: 'b@test.example' }, isRedlineAdmin: true })).toBe(false);
    expect(mayLinkDocument({ doc: DOC, user: {}, isApprovalAdmin: true })).toBe(false);
  });
});

describe('callerMayLinkDocument', () => {
  const helperSrc = serverSrc.slice(
    serverSrc.indexOf('// Linking makes the caller'),
    serverSrc.indexOf('// Save PDF document to MongoDB'),
  );

  function load(admins: { doc?: boolean; approval?: boolean } = {}) {
    const docs: Record<string, unknown> = { [DOC.id]: DOC, old: { id: 'old' } };
    const db = { collection: () => ({ findOne: async ({ id }: { id: string }) => docs[id] ?? null }) };
    return new Function(
      'db', 'mayLinkDocument', 'hasDocumentAdminAccess', 'hasApprovalAdminAccess',
      `${helperSrc}\nreturn callerMayLinkDocument;`,
    )(db, mayLinkDocument, async () => !!admins.doc, async () => !!admins.approval);
  }

  it('reports missing, allowed and denied', async () => {
    expect(await load()('nope', { email: 'b@test.example' })).toBe('missing');
    expect(await load()(DOC.id, { email: 'a@test.example' })).toBe('allowed');
    expect(await load()(DOC.id, { email: 'b@test.example' })).toBe('denied');
    expect(await load()('old', { email: 'b@test.example' })).toBe('denied');
    expect(await load({ doc: true })(DOC.id, { email: 'b@test.example' })).toBe('allowed');
    expect(await load({ approval: true })('old', { email: 'b@test.example' })).toBe('allowed');
  });
});

describe('POST /api/approval-workflows only links documents the caller may link', () => {
  const route = routeSource('post', '/api/approval-workflows');
  const linkHelperSrc = serverSrc.slice(
    serverSrc.indexOf('// Linking makes the caller'),
    serverSrc.indexOf('// Save PDF document to MongoDB'),
  );

  it('checks the documentId after login and before the workflow is inserted', () => {
    const checkAt = route.indexOf('await callerMayLinkDocument(documentIdInput.value, actor)');
    expect(checkAt).toBeGreaterThan(route.indexOf('await getAuthenticatedUser(req, res)'));
    expect(checkAt).toBeLessThan(route.indexOf("collection('approval_workflows').insertOne"));
    expect(route.indexOf('parseDocumentIdInput(workflowData.documentId)')).toBeLessThan(checkAt);
  });

  function setup() {
    const inserted: any[] = [];
    const docs: Record<string, unknown> = { Acme_Bob_12345: { id: 'Acme_Bob_12345', createdByEmail: 'bob@test.example' } };
    const db = {
      collection(name: string) {
        if (name === 'documents') {
          return { findOne: async (q: { id: unknown }) => (typeof q.id === 'string' ? docs[q.id] ?? null : null) };
        }
        if (name === 'approval_workflows') return { insertOne: async (w: any) => { inserted.push(w); return { insertedId: 'x' }; } };
        throw new Error(`unexpected collection ${name}`);
      },
    };
    let handler: (req: unknown, res: unknown) => Promise<void> = async () => {};
    const users: Record<string, { id: string; email: string }> = {
      bob: { id: 'bob', email: 'bob@test.example' },
      eve: { id: 'eve', email: 'eve@test.example' },
    };
    new Function(
      'app', 'db', 'getAuthenticatedUser', 'stripLockedWorkflowFields', 'pendingNewWorkflowSteps', 'technicalApproverGuard',
      'parseDocumentIdInput', 'mayLinkDocument', 'hasDocumentAdminAccess', 'hasApprovalAdminAccess', 'logger',
      'hasNestedDiscountKey', 'enforceDiscountCap', 'normalizeEmail', 'ObjectId', 'callerMaySeeRecipientTokens',
      'parseCombinationInput',
      `${linkHelperSrc}\n${route}`,
    )(
      { post: (_p: string, h: typeof handler) => { handler = h; } },
      db,
      async (req: any) => users[req.headers.user],
      (body: any) => ({ updates: { ...body } }),
      (steps: unknown) => steps,
      { isSigninEnforced: () => false },
      (access as any).parseDocumentIdInput, mayLinkDocument, async () => false, async () => false,
      { warn: () => {}, info: () => {}, error: () => {} },
      () => false, async () => ({ ok: true, value: 0 }), (e: string) => String(e || '').trim().toLowerCase(),
      class {}, () => false,
      (approvalCombination as any).parseCombinationInput,
    );
    const call = async (user: string, body: Record<string, unknown>) => {
      const res = {
        statusCode: 200,
        body: undefined as any,
        status(code: number) { res.statusCode = code; return res; },
        json(payload: any) { res.body = payload; return res; },
      };
      await handler({ headers: { user }, body }, res);
      return res;
    };
    return { call, inserted };
  }

  it.each([
    [['Acme_Bob_12345', 'x']], [['Acme_Bob_12345']], [{ $ne: null }], [42], ['   '],
  ])('documentId %j: 400 INVALID_DOCUMENT_ID and nothing inserted', async (documentId) => {
    const { call, inserted } = setup();
    const res = await call('eve', { documentId, clientName: 'C' });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_DOCUMENT_ID');
    expect(inserted).toEqual([]);
  });

  it("someone else's document and a not-yet-existing id both get the same 404, nothing inserted", async () => {
    const { call, inserted } = setup();
    const other = await call('eve', { documentId: 'Acme_Bob_12345' });
    const future = await call('eve', { documentId: 'Acme_Bob_99999' });
    expect(other.statusCode).toBe(404);
    expect(future.statusCode).toBe(404);
    expect(other.body).toEqual(future.body);
    expect(inserted).toEqual([]);
  });

  it('the creator links their own saved document; the stored id is the trimmed string', async () => {
    const { call, inserted } = setup();
    const res = await call('bob', { documentId: ' Acme_Bob_12345 ' });
    expect(res.statusCode).toBe(200);
    expect(inserted[0].documentId).toBe('Acme_Bob_12345');
    expect(inserted[0].creatorEmail).toBe('bob@test.example');
  });

  it('a workflow without a document is still allowed', async () => {
    const { call, inserted } = setup();
    expect((await call('eve', { clientName: 'C' })).statusCode).toBe(200);
    expect(inserted).toHaveLength(1);
  });

  it('stores the combination label trimmed, and drops a blank one', async () => {
    const { call, inserted } = setup();
    await call('bob', { documentId: 'Acme_Bob_12345', combination: '  Multi-Combination + Data Sprawl ' });
    await call('bob', { documentId: 'Acme_Bob_12345', combination: '   ' });
    expect(inserted[0].combination).toBe('Multi-Combination + Data Sprawl');
    expect(inserted[1]).not.toHaveProperty('combination');
  });

  it.each([[['Data Sprawl']], [{ $ne: null }], [42], ['x'.repeat(151)]])(
    'combination %j: 400 INVALID_COMBINATION and nothing inserted',
    async (combination) => {
      const { call, inserted } = setup();
      const res = await call('bob', { documentId: 'Acme_Bob_12345', combination });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('INVALID_COMBINATION');
      expect(inserted).toEqual([]);
    },
  );
});

describe('POST /api/esign/documents/from-approval', () => {
  const route = routeSource('post', '/api/esign/documents/from-approval');

  it('rejects a non-string documentId or workflowId before any lookup', () => {
    const parseAt = route.indexOf('parseDocumentIdInput(rawDocumentId)');
    expect(parseAt).toBeGreaterThan(-1);
    expect(parseAt).toBeLessThan(route.indexOf("collection('approval_workflows')"));
    expect(route).toMatch(/typeof workflowId !== 'string'\) \{\s*return res\.status\(400\)/);
  });

  it('without a verified approval, only the owner or an admin can e-sign the document (404 otherwise)', () => {
    const checkAt = route.indexOf("if (!workflow && (await callerMayLinkDocument(documentId, user)) === 'denied')");
    expect(checkAt).toBeGreaterThan(route.indexOf('mayManageApprovalWorkflow({ workflow, user, isAdmin })'));
    expect(checkAt).toBeLessThan(route.indexOf("collection('esign_documents').insertOne"));
    expect(checkAt).toBeLessThan(route.indexOf('fs.writeFileSync'));
  });
});
