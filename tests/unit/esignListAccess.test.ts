import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  canViewEsignDocument,
  loadEsignAccessLinks,
  filterEsignDocsForCaller,
} = require('../../esign-list-access.cjs');

type Row = Record<string, unknown>;

const oid = (s: string) => ({ toString: () => s });

const DOC_OWN = { _id: oid('d1'), file_name: 'own.pdf', uploaded_by: 'Alice@Test.example', status: 'sent' };
const DOC_APPROVAL = { _id: oid('d2'), file_name: 'appr.pdf', uploaded_by: 'Alice Smith', requested_by_email: ' alice@test.example ', status: 'sent' };
const DOC_OTHER = { _id: oid('d3'), file_name: 'other.pdf', uploaded_by: 'bob@test.example', status: 'sent' };
const DOC_LEGACY = { _id: oid('d4'), file_name: 'legacy.pdf', uploaded_by: 'Some Name', status: 'completed' };
const DOC_WF = { _id: oid('d5'), file_name: 'wf.pdf', uploaded_by: 'Some Name', status: 'sent' };
const DOC_RECIP = { _id: oid('d6'), file_name: 'recip.pdf', uploaded_by: 'bob@test.example', status: 'sent' };
const ALL_DOCS = [DOC_OWN, DOC_APPROVAL, DOC_OTHER, DOC_LEGACY, DOC_WF, DOC_RECIP];

const WORKFLOWS = {
  d5: [{ esignDocumentId: 'd5', creatorEmail: 'ALICE@test.example ' }],
};
const RECIPIENTS = {
  d6: [{ email: ' Alice@Test.example', signing_token: 'secret' }],
  d3: [{ email: 'carol@test.example' }],
};

describe('canViewEsignDocument', () => {
  const view = (doc: Row, userEmail: string | undefined, extra: Row = {}) =>
    canViewEsignDocument({ doc, recipients: [], workflows: [], userEmail, isAdmin: false, ...extra });

  it('admin sees everything, including a legacy document with no creator', () => {
    expect(canViewEsignDocument({ doc: DOC_LEGACY, recipients: [], workflows: [], userEmail: 'boss@test.example', isAdmin: true })).toBe(true);
    expect(canViewEsignDocument({ doc: DOC_OTHER, userEmail: undefined, isAdmin: true })).toBe(true);
  });

  it('the creator sees their own document (uploaded_by is an address)', () => {
    expect(view(DOC_OWN, 'alice@test.example')).toBe(true);
  });

  it('the creator of an approval-generated document is found through requested_by_email', () => {
    expect(view(DOC_APPROVAL, 'alice@test.example')).toBe(true);
  });

  it('does not show another user their colleague\'s document', () => {
    expect(view(DOC_OTHER, 'alice@test.example')).toBe(false);
    expect(view(DOC_OWN, 'bob@test.example')).toBe(false);
  });

  it('the creator of a linked approval workflow sees the document (creatorEmail or createdBy)', () => {
    const byCreatorEmail = [{ creatorEmail: 'alice@test.example' }];
    const byCreatedBy = [{ createdBy: 'Alice@test.example' }];
    expect(view(DOC_WF, 'alice@test.example', { workflows: byCreatorEmail })).toBe(true);
    expect(view(DOC_WF, 'alice@test.example', { workflows: byCreatedBy })).toBe(true);
    expect(view(DOC_WF, 'bob@test.example', { workflows: byCreatorEmail })).toBe(false);
  });

  it('a workflow row created without a verified login never grants visibility', () => {
    const forged = [{ creatorEmail: 'alice@test.example', creatorVerified: false }];
    expect(view(DOC_WF, 'alice@test.example', { workflows: forged })).toBe(false);
  });

  it('a recipient sees the document they were sent', () => {
    expect(view(DOC_RECIP, 'alice@test.example', { recipients: [{ email: 'carol@test.example' }, { email: ' ALICE@test.example ' }] })).toBe(true);
    expect(view(DOC_RECIP, 'dave@test.example', { recipients: [{ email: 'carol@test.example' }] })).toBe(false);
  });

  it('a legacy document with no creator and no matching recipient is admin-only', () => {
    expect(view(DOC_LEGACY, 'alice@test.example')).toBe(false);
    expect(view(DOC_LEGACY, 'alice@test.example', { recipients: [{ email: 'carol@test.example' }], workflows: [{ creatorEmail: '' }] })).toBe(false);
  });

  it('is case and whitespace insensitive', () => {
    expect(view(DOC_OWN, '  ALICE@TEST.EXAMPLE  ')).toBe(true);
  });

  it('a blank or missing user email sees nothing, even for documents with blank creators', () => {
    const blank = { _id: oid('x'), uploaded_by: '', requested_by_email: '' };
    expect(view(blank, '')).toBe(false);
    expect(view(blank, undefined)).toBe(false);
    expect(view(DOC_OWN, undefined)).toBe(false);
    expect(view(blank, 'alice@test.example', { recipients: [{ email: '' }, { email: null }, null] })).toBe(false);
  });

  it('tolerates missing recipients and workflows', () => {
    expect(canViewEsignDocument({ doc: DOC_OWN, userEmail: 'alice@test.example', isAdmin: false })).toBe(true);
    expect(canViewEsignDocument({ doc: null, userEmail: 'alice@test.example', isAdmin: false })).toBe(false);
  });
});

describe('filterEsignDocsForCaller', () => {
  const run = (userEmail: string, isAdmin = false) =>
    filterEsignDocsForCaller({ docs: ALL_DOCS, workflowsByDoc: WORKFLOWS, recipientsByDoc: RECIPIENTS, userEmail, isAdmin })
      .map((d: Row) => d.file_name);

  it('admin gets every document', () => {
    expect(run('boss@test.example', true)).toEqual(ALL_DOCS.map((d) => d.file_name));
  });

  it('a non-admin gets own, approval-created, workflow-linked and received documents only', () => {
    expect(run('alice@test.example')).toEqual(['own.pdf', 'appr.pdf', 'wf.pdf', 'recip.pdf']);
  });

  it('a user with no link to anything gets an empty list', () => {
    expect(run('nobody@test.example')).toEqual([]);
  });

  it('the legacy no-creator document is only in the admin result', () => {
    expect(run('alice@test.example')).not.toContain('legacy.pdf');
    expect(run('boss@test.example', true)).toContain('legacy.pdf');
  });

  it('does not add signing_token or token fields to the documents it returns', () => {
    const out = filterEsignDocsForCaller({ docs: ALL_DOCS, workflowsByDoc: WORKFLOWS, recipientsByDoc: RECIPIENTS, userEmail: 'alice@test.example', isAdmin: false });
    expect(JSON.stringify(out)).not.toMatch(/signing_token|token_expires_at|secret/);
  });
});

describe('loadEsignAccessLinks', () => {
  function makeDb() {
    const calls: Array<{ name: string; query: unknown }> = [];
    const db = {
      collection(name: string) {
        return {
          find(query: unknown) {
            calls.push({ name, query });
            const rows: Row[] =
              name === 'approval_workflows'
                ? [{ esignDocumentId: 'd5', creatorEmail: 'alice@test.example' }, { esignDocumentId: null }]
                : [{ document_id: oid('d6'), email: 'a@test.example' }, { document_id: 'd3', email: 'b@test.example' }];
            return { toArray: async () => rows };
          },
        };
      },
    };
    return { db, calls };
  }

  it('uses exactly two batched queries however many documents there are', async () => {
    const { db, calls } = makeDb();
    const links = await loadEsignAccessLinks(db, ALL_DOCS);
    expect(calls.map((c) => c.name)).toEqual(['approval_workflows', 'esign_recipients']);
    expect(Object.keys(links.workflowsByDoc)).toEqual(['d5']);
    expect(Object.keys(links.recipientsByDoc).sort()).toEqual(['d3', 'd6']);
  });

  it('runs no query at all for an empty page', async () => {
    const { db, calls } = makeDb();
    const links = await loadEsignAccessLinks(db, []);
    expect(calls).toEqual([]);
    expect(links).toEqual({ workflowsByDoc: {}, recipientsByDoc: {} });
  });
});

describe('e-sign list routes (real route source against fakes)', () => {
  const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

  function routeSource(routePath: string): string {
    const escaped = routePath.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const start = serverSrc.search(new RegExp(`\\napp\\.get\\(\\s*['"]${escaped}['"]\\s*,`));
    expect(start, `route not found: ${routePath}`).toBeGreaterThan(-1);
    return serverSrc.slice(start + 1, serverSrc.indexOf('\napp.', start + 2));
  }

  const helperSrc = serverSrc.slice(
    serverSrc.indexOf('async function getAuthenticatedUser'),
    serverSrc.indexOf('async function getApprovalAdminUser'),
  );

  const USERS: Record<string, Row> = {
    'alice-id': { id: 'alice-id', email: 'alice@test.example' },
    'boss-id': { id: 'boss-id', email: 'boss@test.example' },
  };

  function setup(routePath: string) {
    const touched: string[] = [];
    const rowsFor = (name: string): Row[] => {
      if (name === 'esign_documents') {
        return ALL_DOCS.map((d) => ({ ...d, file_data: undefined, created_at: '2026-01-01', sent_at: '2026-01-02' }));
      }
      if (name === 'approval_workflows') return WORKFLOWS.d5;
      if (name === 'esign_recipients') {
        return [
          { _id: oid('r1'), document_id: oid('d6'), email: 'alice@test.example', name: 'Alice', signing_token: 'tok-secret', token_expires_at: '2026-12-01' },
          { _id: oid('r2'), document_id: 'd3', email: 'carol@test.example', signing_token: 'tok-secret-2' },
        ];
      }
      throw new Error(`unexpected collection ${name}`);
    };
    const db = {
      collection(name: string) {
        touched.push(name);
        if (name === 'users') return { findOne: async ({ id }: { id: string }) => USERS[id] ?? null };
        return {
          find() {
            const cursor = { sort: () => cursor, toArray: async () => rowsFor(name) };
            return cursor;
          },
        };
      },
    };
    const jwt = {
      verify: (token: string) => {
        if (token === 'aaa.alice.ccc') return { userId: 'alice-id' };
        if (token === 'aaa.boss.ccc') return { userId: 'boss-id' };
        throw new Error('invalid signature');
      },
    };
    let handler: (req: unknown, res: unknown) => Promise<void> = async () => {};
    const app = { get: (_p: string, h: typeof handler) => { handler = h; } };
    new Function(
      'app', 'db', 'jwt', 'JWT_SECRET', 'console', 'hasApprovalAdminAccess', 'loadEsignAccessLinks', 'filterEsignDocsForCaller',
      `${helperSrc}\n${routeSource(routePath)}`,
    )(
      app, db, jwt, 'test-secret', { error: () => {}, log: () => {} },
      async (u: { email: string }) => u.email === 'boss@test.example',
      loadEsignAccessLinks, filterEsignDocsForCaller,
    );
    const call = async (headers: Record<string, string>) => {
      const res = {
        statusCode: 200,
        headers: {} as Record<string, string>,
        body: undefined as Record<string, any> | undefined,
        set(name: string, value: string) { res.headers[name] = value; return res; },
        status(code: number) { res.statusCode = code; return res; },
        json(payload: Record<string, any>) { res.body = payload; return res; },
      };
      await handler({ headers, query: {} }, res);
      return res;
    };
    return { call, touched };
  }

  describe.each([
    { routePath: '/api/esign/documents', listKey: 'documents' },
    { routePath: '/api/esign/agreement-status', listKey: 'agreements' },
  ])('GET $routePath', ({ routePath, listKey }) => {
    const route = routeSource(routePath);

    it('calls getAuthenticatedUser and returns on null before any database read', () => {
      expect(route).toMatch(/await getAuthenticatedUser\(req, res\);\s*if \(!authUser\) return;/);
      const authAt = route.indexOf('await getAuthenticatedUser(');
      const firstDb = route.search(/\bdb\./);
      expect(authAt).toBeGreaterThan(-1);
      expect(authAt).toBeLessThan(firstDb);
    });

    it('sets Cache-Control: no-store', () => {
      expect(route).toContain("res.set('Cache-Control', 'no-store')");
    });

    it('no token: 401 and the fake database is never touched', async () => {
      const { call, touched } = setup(routePath);
      const res = await call({});
      expect(res.statusCode).toBe(401);
      expect(touched).toEqual([]);
      expect(res.headers['Cache-Control']).toBe('no-store');
    });

    it('bad-signature token: 401 and no agreements are read', async () => {
      const { call, touched } = setup(routePath);
      const res = await call({ authorization: 'Bearer aaa.bad.ccc' });
      expect(res.statusCode).toBe(401);
      expect(touched).not.toContain('esign_documents');
    });

    it('non-admin gets only their own, approval-created, workflow-linked and received agreements', async () => {
      const { call } = setup(routePath);
      const res = await call({ authorization: 'Bearer aaa.alice.ccc' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['Cache-Control']).toBe('no-store');
      const names = res.body![listKey].map((d: Row) => d.file_name);
      expect(names).toEqual(['own.pdf', 'appr.pdf', 'wf.pdf', 'recip.pdf']);
      expect(names).not.toContain('other.pdf');
      expect(names).not.toContain('legacy.pdf');
    });

    it('admin gets every agreement', async () => {
      const { call } = setup(routePath);
      const res = await call({ authorization: 'Bearer aaa.boss.ccc' });
      expect(res.statusCode).toBe(200);
      expect(res.body![listKey]).toHaveLength(ALL_DOCS.length);
    });

    it('never returns a signing token', async () => {
      const { call } = setup(routePath);
      for (const token of ['aaa.alice.ccc', 'aaa.boss.ccc']) {
        const res = await call({ authorization: `Bearer ${token}` });
        expect(JSON.stringify(res.body)).not.toMatch(/signing_token|tok-secret/);
      }
    });
  });

  it('agreement-status keeps its response shape and filters recipients with the document', async () => {
    const { call } = setup('/api/esign/agreement-status');
    const res = await call({ authorization: 'Bearer aaa.alice.ccc' });
    const recip = res.body!.agreements.find((a: Row) => a.id === 'd6');
    expect(Object.keys(recip).sort()).toEqual([
      'created_at', 'creator_email', 'creator_name', 'file_name', 'id', 'provider', 'recipients', 'requested_by',
      'sent_at', 'signed_at', 'status', 'upload_source', 'uploaded_by', 'voided_at', 'zoho_request_status',
    ]);
    expect(recip.recipients).toHaveLength(1);
    expect(recip.recipients[0].email).toBe('alice@test.example');
  });

  it('documents route keeps its response shape', async () => {
    const { call } = setup('/api/esign/documents');
    const res = await call({ authorization: 'Bearer aaa.alice.ccc' });
    expect(Object.keys(res.body!.documents[0]).sort()).toEqual(['created_at', 'file_name', 'id', 'status', 'uploaded_by']);
  });

  it('admin skips the extra access-link queries on the documents route', async () => {
    const { call, touched } = setup('/api/esign/documents');
    await call({ authorization: 'Bearer aaa.boss.ccc' });
    expect(touched).not.toContain('approval_workflows');
    expect(touched).not.toContain('esign_recipients');
  });
});
