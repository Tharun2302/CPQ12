// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { documentServiceMongoDB } from '../../src/services/documentServiceMongoDB';
import { fakeLoginSessions, loginSessionSrc, withSession } from '../helpers/loginSessionHarness';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import access from '../../document-access.cjs';

const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');
const authContextSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/contexts/AuthContext.tsx'), 'utf8');

function routeSource(opening: RegExp): string {
  const start = serverSrc.search(opening);
  expect(start, `route not found: ${opening}`).toBeGreaterThan(-1);
  const end = serverSrc.indexOf('\napp.', start + 1);
  return serverSrc.slice(start, end === -1 ? undefined : end);
}

const authHelperSrc = serverSrc.slice(
  serverSrc.indexOf('async function getAuthenticatedUser'),
  serverSrc.indexOf('async function getApprovalAdminUser'),
);

describe('GET /api/documents requires a signed-in user', () => {
  it('verifies the caller before reading the collection', () => {
    const listRoute = routeSource(/app\.get\(\s*['"]\/api\/documents['"]\s*,/);
    const authAt = listRoute.indexOf('getAuthenticatedUser(req, res)');
    const queryAt = listRoute.indexOf("collection('documents')");
    expect(authAt).toBeGreaterThan(-1);
    expect(queryAt).toBeGreaterThan(authAt);
    expect(listRoute).toMatch(/if \(!authUser\) return;/);
  });
});

describe('documentServiceMongoDB.getAllDocuments', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, documents: [], totalCount: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the saved login token as a Bearer header', async () => {
    localStorage.setItem('cpq_token', 'aaa.bbb.ccc');
    await documentServiceMongoDB.getAllDocuments();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({ Authorization: 'Bearer aaa.bbb.ccc' });
  });

  it('sends no Authorization header when signed out', async () => {
    await documentServiceMongoDB.getAllDocuments();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({});
  });

  it('surfaces a 401 from the server as an error instead of an empty list', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'Authentication required' });
    await expect(documentServiceMongoDB.getAllDocuments()).rejects.toThrow(/401/);
  });
});

describe('AuthContext only stores server-issued tokens', () => {
  it('has no hardcoded password or fake token generation', () => {
    expect(authContextSrc).not.toMatch(/CPQ@2025@TEAM/);
    expect(authContextSrc).not.toMatch(/mock_token_/);
    expect(authContextSrc).not.toMatch(/hubspot_auth_token/);
  });

  it('never stores the Microsoft access token as the app login token', () => {
    expect(authContextSrc).not.toMatch(/setItem\(\s*['"]cpq_token['"]\s*,\s*microsoftUser\.accessToken/);
  });

  it('only stores cpq_token from a backend response', () => {
    const writes = authContextSrc.match(/setItem\(\s*['"]cpq_token['"]\s*,\s*[^)]+\)/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(w).toMatch(/data\.token/);
  });
});

describe('GET /api/documents is scoped to the caller', () => {
  const listRoute = routeSource(/app\.get\(\s*['"]\/api\/documents['"]\s*,/);

  it('applies the owner filter to both the count and the page, matching before projecting', () => {
    expect(listRoute).toContain('const isDocumentAdmin = await hasDocumentAdminAccess(authUser);');
    expect(listRoute).toContain('documentListOwnerMatch({ user: authUser, isDocumentAdmin })');
    expect(listRoute).toContain('countDocuments(listMatch)');
    expect(listRoute).not.toContain('countDocuments(approvalMatch)');
    expect(listRoute.indexOf('{ $match: listMatch }')).toBeLessThan(listRoute.indexOf('{ $project: DOCUMENTS_LIST_PROJECTION }'));
    expect(listRoute).toContain("scope: isDocumentAdmin ? 'all' : 'own'");
  });

  function setup(isDocumentAdmin: boolean) {
    const counts: unknown[] = [];
    const pipelines: any[] = [];
    const db = {
      collection(name: string) {
        if (name === 'users') return { findOne: async () => ({ id: 'u1', email: 'Rep@Test.example' }) };
        if (name === 'approval_workflows') return { distinct: async () => ['wf-doc'] };
        if (name === 'documents') {
          return {
            countDocuments: async (filter: unknown) => { counts.push(filter); return 0; },
            aggregate: (pipeline: unknown[]) => { pipelines.push(pipeline); return { toArray: async () => [] }; },
          };
        }
        throw new Error(`unexpected collection ${name}`);
      },
    };
    let handler: (req: unknown, res: unknown) => Promise<void> = async () => {};
    const app = { get: (_p: string, h: typeof handler) => { handler = h; } };
    new Function(
      'app', 'db', 'jwt', 'JWT_SECRET', 'console', 'loginSessions', 'logger', 'DOCUMENTS_LIST_PROJECTION',
      'documentListOwnerMatch', 'combineMatches', 'hasDocumentAdminAccess',
      `${loginSessionSrc}\n${authHelperSrc}\n${listRoute}`,
    )(
      app, db, withSession({ verify: () => ({ userId: 'u1' }) }), 'secret', { log: () => {}, error: () => {} },
      fakeLoginSessions(), { error: () => {} }, { fileData: 0 },
      (access as any).documentListOwnerMatch, (access as any).combineMatches, async () => isDocumentAdmin,
    );
    const call = async (query: Record<string, unknown> = {}) => {
      const res = {
        statusCode: 200,
        body: undefined as any,
        status(code: number) { res.statusCode = code; return res; },
        json(payload: any) { res.body = payload; return res; },
      };
      await handler({ headers: { authorization: 'Bearer a.b.c' }, query }, res);
      return res;
    };
    return { call, counts, pipelines };
  }

  it('a regular user only counts and lists documents they created', async () => {
    const { call, counts, pipelines } = setup(false);
    const res = await call({ approvalFilter: 'in_workflow' });
    const expected = { $and: [{ id: { $in: ['wf-doc'] } }, { createdByEmail: 'rep@test.example' }] };
    expect(counts).toEqual([expected]);
    expect(pipelines[0][0]).toEqual({ $match: expected });
    expect(res.body).toMatchObject({ success: true, scope: 'own', totalCount: 0 });
  });

  it('a document admin sees every document', async () => {
    const { call, counts, pipelines } = setup(true);
    const res = await call();
    expect(counts).toEqual([{}]);
    expect(pipelines[0][0]).toEqual({ $project: { fileData: 0 } });
    expect(res.body.scope).toBe('all');
  });
});

describe('GET and DELETE /api/documents/:id behaviour', () => {
  const getRoute = routeSource(/app\.get\(\s*['"]\/api\/documents\/:id['"]\s*,/);
  const deleteRoute = routeSource(/app\.delete\(\s*['"]\/api\/documents\/:id['"]\s*,/);
  const readHelperSrc = serverSrc.slice(
    serverSrc.indexOf('// Cheapest checks first'),
    serverSrc.indexOf('// Linking makes the caller'),
  );
  const USERS: Record<string, { id: string; email: string }> = {
    creator: { id: 'creator', email: 'creator@test.example' },
    stranger: { id: 'stranger', email: 'stranger@test.example' },
    approver: { id: 'approver', email: 'legal@test.example' },
    signer: { id: 'signer', email: 'esign.owner@test.example' },
    docadmin: { id: 'docadmin', email: 'docs@test.example' },
    apadmin: { id: 'apadmin', email: 'approvals@test.example' },
  };

  function setup() {
    const deleted: unknown[] = [];
    const logs: unknown[] = [];
    const audits: unknown[] = [];
    const doc = { id: 'Acme_Jane_12345', createdByEmail: 'creator@test.example', fileData: Buffer.from('pdf') };
    const db = {
      collection(name: string) {
        if (name === 'users') return { findOne: async ({ id }: { id: string }) => USERS[id] ?? null };
        if (name === 'documents') {
          return {
            findOne: async ({ id }: { id: string }) => (id === doc.id ? { ...doc } : null),
            deleteOne: async (filter: unknown) => { deleted.push(filter); return { deletedCount: 1 }; },
          };
        }
        if (name === 'approval_workflows') {
          return { find: () => ({ toArray: async () => [{ creatorEmail: 'req@test.example', workflowSteps: [{ email: 'legal@test.example' }] }] }), countDocuments: async () => 1 };
        }
        if (name === 'esign_documents') {
          return { find: () => ({ toArray: async () => [{ uploaded_by: 'esign.owner@test.example' }] }), countDocuments: async () => 2 };
        }
        throw new Error(`unexpected collection ${name}`);
      },
    };
    const handlers: Record<string, (req: unknown, res: unknown) => Promise<void>> = {};
    const app = {
      get: (_p: string, h: any) => { handlers.get = h; },
      delete: (_p: string, h: any) => { handlers.delete = h; },
    };
    const flag = (who: string) => async (u: { id: string }) => u.id === who;
    new Function(
      'app', 'db', 'jwt', 'JWT_SECRET', 'console', 'loginSessions', 'logger',
      'mayReadDocument', 'mayDeleteDocument', 'hasDocumentAdminAccess', 'hasApprovalAdminAccess', 'hasRedlineAdminAccess',
      'parseDocumentIdInput', 'logAudit',
      `${loginSessionSrc}\n${authHelperSrc}\n${readHelperSrc}\n${getRoute}\n${deleteRoute}`,
    )(
      app, db, withSession({ verify: (t: string) => ({ userId: t.split('.')[1] }) }), 'secret',
      { log: () => {}, error: () => {}, warn: () => {} }, fakeLoginSessions(),
      { info: (...a: unknown[]) => logs.push(a), error: () => {} },
      (access as any).mayReadDocument, (access as any).mayDeleteDocument,
      flag('docadmin'), flag('apadmin'), async () => false,
      (access as any).parseDocumentIdInput, async (...a: unknown[]) => { audits.push(a); },
    );
    const call = async (method: 'get' | 'delete', who: string, id = doc.id) => {
      const res = {
        statusCode: 200,
        body: undefined as any,
        set() { return res; },
        status(code: number) { res.statusCode = code; return res; },
        json(payload: any) { res.body = payload; return res; },
      };
      await handlers[method]({ headers: { authorization: `Bearer a.${who}.c` }, params: { id } }, res);
      return res;
    };
    return { call, deleted, logs, audits };
  }

  it.each(['creator', 'approver', 'signer', 'docadmin', 'apadmin'])('GET: %s can open the document', async (who) => {
    const { call } = setup();
    const res = await call('get', who);
    expect(res.statusCode).toBe(200);
    expect(res.body.document.id).toBe('Acme_Jane_12345');
  });

  it('GET: a stranger gets the same 404 as a missing id', async () => {
    const { call } = setup();
    const stranger = await call('get', 'stranger');
    const missing = await call('get', 'creator', 'Nope_Nope_00000');
    expect(stranger.statusCode).toBe(404);
    expect(stranger.body).toEqual(missing.body);
  });

  it('DELETE: only a document admin; everyone else, the creator included, gets 404 and nothing is deleted', async () => {
    for (const who of ['stranger', 'approver', 'apadmin', 'creator']) {
      const { call, deleted } = setup();
      expect((await call('delete', who)).statusCode).toBe(404);
      expect(deleted).toEqual([]);
    }
    for (const who of ['docadmin']) {
      const { call, deleted, logs, audits } = setup();
      expect((await call('delete', who)).statusCode).toBe(200);
      expect(deleted).toEqual([{ id: 'Acme_Jane_12345' }]);
      expect(audits).toEqual([[undefined, 'document_deleted', USERS[who].email, null, {
        source: 'documents', document_id: 'Acme_Jane_12345', linked_approvals: 1, linked_esign: 2,
      }]]);
      expect(logs[0]).toEqual(['Document deleted', { source: 'documents', actor: USERS[who].email, documentId: 'Acme_Jane_12345' }]);
    }
  });
});

describe('document creation stamps the creator from the verified login', () => {
  const postRoute = routeSource(/app\.post\(\s*['"]\/api\/documents['"]\s*,/);
  const uploadRoute = routeSource(/app\.post\(\s*['"]\/api\/documents\/upload['"]\s*,/);
  const testRoute = routeSource(/app\.post\(\s*['"]\/api\/documents\/test['"]\s*,/);

  it('POST /api/documents and /upload stamp createdBy* from authUser after the named fields', () => {
    for (const route of [postRoute, uploadRoute]) {
      expect(route).toContain('...creatorStampFromLogin(authUser),');
      expect(route).not.toMatch(/\.\.\.req\.body|\.\.\.payload/);
      expect(route).not.toMatch(/createdByEmail|createdByUserId|createdBySource/);
    }
    expect(testRoute).toContain('creatorStampFromLogin(authUser)');
  });

  it('a createdByEmail in the body is never read', () => {
    const destructure = /const \{([^}]*)\} = req\.body/.exec(postRoute)![1];
    expect(destructure).not.toMatch(/createdBy/);
  });

  it('the list query is backed by an index', () => {
    expect(serverSrc).toContain('createIndex({ createdByEmail: 1, createdAt: -1, generatedDate: -1 })');
  });
});
