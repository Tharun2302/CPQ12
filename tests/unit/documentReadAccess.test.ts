import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import documentAccess from '../../document-access.cjs';

type Doc = Record<string, unknown>;
type Verdict = { ok: boolean; httpStatus?: number; error?: string };

const {
  escapeRegExp, parseDocumentId, sameCustomerIdPattern, storedNamePattern,
  workflowDocumentIds, checkDocumentReadCaller, isDocumentCreator,
} = documentAccess as {
  escapeRegExp: (value: string) => string;
  parseDocumentId: (id: unknown) => { company: string; client: string } | null;
  sameCustomerIdPattern: (parts: { company: string; client: string }) => RegExp;
  storedNamePattern: (part: string) => RegExp;
  workflowDocumentIds: (workflow: unknown) => string[];
  checkDocumentReadCaller: (args: unknown) => Verdict;
  isDocumentCreator: (document: unknown, email: unknown) => boolean;
};

const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8').replace(/\r\n/g, '\n');

function routeOpening(method: string, routePath: string): RegExp {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`\\napp\\.${method}\\(\\s*['"]${escaped}['"]\\s*,`, 'g');
}

function routeSource(method: string, routePath: string): string {
  const starts = [...serverSrc.matchAll(routeOpening(method, routePath))];
  expect(starts.length, `route not found: ${method.toUpperCase()} ${routePath}`).toBeGreaterThan(0);
  const start = starts[0].index!;
  const end = serverSrc.indexOf('\napp.', start + 2);
  return serverSrc.slice(start + 1, end === -1 ? undefined : end).replace(/\/\/.*$/gm, '');
}

function functionSource(name: string): string {
  const start = serverSrc.search(new RegExp(`\\n(async )?function ${name}\\(`));
  expect(start, `function not found: ${name}`).toBeGreaterThan(-1);
  return serverSrc.slice(start, serverSrc.indexOf('\n}\n', start) + 3);
}

describe('parseDocumentId', () => {
  it('reads the company and client of a Company_Client_12345 id', () => {
    expect(parseDocumentId('AcmeInc_JohnSmith_37728')).toEqual({ company: 'AcmeInc', client: 'JohnSmith' });
  });

  it('refuses ids whose parts could act as a pattern', () => {
    for (const id of ['.*_.*_x', '.+_.+_1', 'Acme_(a+)+_1', 'A|B_C_1', '[a-z]_x_1', 'Acme_.*', '^_$_1']) {
      expect(parseDocumentId(id), id).toBeNull();
    }
  });

  it('refuses ids without two name parts, over-long parts and non-strings', () => {
    expect(parseDocumentId('justoneword')).toBeNull();
    expect(parseDocumentId('_John_1')).toBeNull();
    expect(parseDocumentId('Acme__1')).toBeNull();
    expect(parseDocumentId(`${'a'.repeat(41)}_John_1`)).toBeNull();
    expect(parseDocumentId({ $ne: null })).toBeNull();
    expect(parseDocumentId(undefined)).toBeNull();
  });
});

describe('patterns built from an id', () => {
  it('escapeRegExp neutralises every special character', () => {
    const special = '.*+?^${}()|[]\\';
    expect(new RegExp(`^${escapeRegExp(special)}$`).test(special)).toBe(true);
    expect(new RegExp(`^${escapeRegExp('a.c')}$`).test('abc')).toBe(false);
  });

  it('sameCustomerIdPattern matches only ids of that company and client', () => {
    const pattern = sameCustomerIdPattern({ company: 'AcmeInc', client: 'JohnSmith' });
    expect(pattern.test('AcmeInc_JohnSmith_99999')).toBe(true);
    expect(pattern.test('acmeinc_johnsmith_1')).toBe(true);
    expect(pattern.test('AcmeInc_JohnSmithson_1')).toBe(false);
    expect(pattern.test('OtherCo_JohnSmith_1')).toBe(false);
    expect(pattern.test('XAcmeInc_JohnSmith_1')).toBe(false);
  });

  it('storedNamePattern matches the name the id part was made from, not a substring of another', () => {
    const pattern = storedNamePattern('JohnSmith');
    expect(pattern.test('John Smith')).toBe(true);
    expect(pattern.test('john-smith.')).toBe(true);
    expect(pattern.test('John Smithson')).toBe(false);
    expect(pattern.test('Mr John Smith')).toBe(false);
    expect(storedNamePattern('Jo').test('John Smith')).toBe(false);
  });

  it('storedNamePattern allows a longer name only when the part is at the 20-character cut', () => {
    expect(storedNamePattern('InternationalBusines').test('International Business Machines')).toBe(true);
    expect(storedNamePattern('InternationalBusine').test('International Business Machines')).toBe(false);
  });
});

describe('workflowDocumentIds', () => {
  it('lists the document and the redline copy', () => {
    expect(workflowDocumentIds({ documentId: 'D1', redlineDocumentId: 'D2' })).toEqual(['D1', 'D2']);
    expect(workflowDocumentIds({ documentId: 'D1' })).toEqual(['D1']);
    expect(workflowDocumentIds({})).toEqual([]);
    expect(workflowDocumentIds(null)).toEqual([]);
  });
});

describe('checkDocumentReadCaller', () => {
  const document = { id: 'D1' };
  const staff = { ok: true, kind: 'staff', user: { email: 'rep@x.com' } };
  const link = (role: string) => ({ ok: true, kind: 'link', role });

  it('answers 401 when there is no login and no valid link', () => {
    for (const caller of [null, undefined, { ok: false, httpStatus: 401 }]) {
      expect(checkDocumentReadCaller({ caller, document, linkDocumentIds: ['D1'] })).toMatchObject({ ok: false, httpStatus: 401 });
    }
  });

  it('lets staff read any document', () => {
    expect(checkDocumentReadCaller({ caller: staff, document, linkDocumentIds: [] })).toEqual({ ok: true });
  });

  it('lets each of the four link roles read the document or redline copy of its own workflow', () => {
    for (const role of ['teamlead', 'technical', 'legal', 'client']) {
      expect(checkDocumentReadCaller({ caller: link(role), document, linkDocumentIds: ['D1'] }), role).toEqual({ ok: true });
      expect(checkDocumentReadCaller({ caller: link(role), document: { id: 'D2' }, linkDocumentIds: ['D1', 'D2'] }), role).toEqual({ ok: true });
    }
  });

  it('answers 403 when a link asks for any other document', () => {
    expect(checkDocumentReadCaller({ caller: link('legal'), document: { id: 'OTHER' }, linkDocumentIds: ['D1'] }))
      .toMatchObject({ ok: false, httpStatus: 403 });
    expect(checkDocumentReadCaller({ caller: link('legal'), document, linkDocumentIds: [] })).toMatchObject({ ok: false, httpStatus: 403 });
    expect(checkDocumentReadCaller({ caller: link('legal'), document })).toMatchObject({ ok: false, httpStatus: 403 });
  });

  it('never matches a document without an id, or an unknown link role', () => {
    expect(checkDocumentReadCaller({ caller: link('legal'), document: {}, linkDocumentIds: ['', 'undefined'] }).ok).toBe(false);
    expect(checkDocumentReadCaller({ caller: link('legal'), document: null, linkDocumentIds: ['D1'] }).ok).toBe(false);
    expect(checkDocumentReadCaller({ caller: link('admin'), document, linkDocumentIds: ['D1'] }).ok).toBe(false);
    expect(checkDocumentReadCaller({ caller: { ok: true, kind: 'other' }, document, linkDocumentIds: ['D1'] }).ok).toBe(false);
  });
});

describe('isDocumentCreator', () => {
  it('matches the saved creator whatever the letter case, and nothing else', () => {
    expect(isDocumentCreator({ createdBy: 'rep@x.com' }, ' Rep@X.com ')).toBe(true);
    expect(isDocumentCreator({ createdBy: 'rep@x.com' }, 'other@x.com')).toBe(false);
    expect(isDocumentCreator({}, 'rep@x.com')).toBe(false);
    expect(isDocumentCreator({}, '')).toBe(false);
    expect(isDocumentCreator({ createdBy: '' }, undefined)).toBe(false);
  });
});

describe('resolveStoredDocumentById (server.cjs)', () => {
  const DOCS: Doc[] = [
    { id: 'AcmeInc_JohnSmith_11111', company: 'Acme Inc', clientName: 'John Smith', createdAt: '2026-01-01' },
    { id: 'AcmeInc_JohnSmith_22222', company: 'Acme Inc', clientName: 'John Smith', createdAt: '2026-02-01' },
    { id: 'OtherCo_JaneDoe_33333', company: 'Other Co', clientName: 'Jane Doe', createdAt: '2026-03-01' },
    { id: 'legacy-7', company: 'Globex LLC', clientName: 'Ann Lee', createdAt: '2026-01-15' },
  ];

  function matches(doc: Doc, filter: Doc): boolean {
    if (Array.isArray(filter.$and)) return (filter.$and as Doc[]).every((f) => matches(doc, f));
    return Object.entries(filter).every(([key, cond]) => {
      const value = String(doc[key] ?? '');
      if (cond && typeof cond === 'object') {
        const regex = (cond as { $regex?: unknown }).$regex;
        expect(regex, 'patterns must be RegExp objects built by document-access.cjs').toBeInstanceOf(RegExp);
        return (regex as RegExp).test(value);
      }
      return value === cond;
    });
  }

  const db = {
    collection: () => ({
      findOne: async (filter: Doc) => DOCS.find((d) => matches(d, filter)) ?? null,
      find: (filter: Doc) => {
        let rows = DOCS.filter((d) => matches(d, filter));
        const cursor = {
          sort: () => { rows = [...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); return cursor; },
          limit: (n: number) => { rows = rows.slice(0, n); return cursor; },
          toArray: async () => rows,
        };
        return cursor;
      },
    }),
  };

  const load = () => new Function('documentAccess', `${functionSource('resolveStoredDocumentById')}\nreturn resolveStoredDocumentById;`)(
    documentAccess,
  ) as (db: unknown, id: unknown) => Promise<Doc | null>;

  it('returns the exact document when the id exists', async () => {
    const resolve = load();
    expect((await resolve(db, 'AcmeInc_JohnSmith_11111'))?.id).toBe('AcmeInc_JohnSmith_11111');
    expect((await resolve(db, 'legacy-7'))?.id).toBe('legacy-7');
  });

  it('keeps the fallback: a stale number resolves to the newest document of the same company and client', async () => {
    expect((await load()(db, 'AcmeInc_JohnSmith_99999'))?.id).toBe('AcmeInc_JohnSmith_22222');
  });

  it('keeps the fallback by saved company and client name when no id shares the prefix', async () => {
    expect((await load()(db, 'GlobexLLC_AnnLee_55555'))?.id).toBe('legacy-7');
  });

  it('returns nothing for wildcard ids', async () => {
    const resolve = load();
    for (const id of ['.*_.*_x', '.+_.+_.+', 'A.*_J.*_1', '[A-Z].*_.*_1', '', 'nope']) {
      expect(await resolve(db, id), id).toBeNull();
    }
  });

  it('never returns the document of another customer for an id that does not exist', async () => {
    const resolve = load();
    for (const id of ['Acme_John_1', 'AcmeInc_Jane_1', 'Unknown_JohnSmith_1', 'Other_Doe_1', 'o_e_1']) {
      expect(await resolve(db, id), id).toBeNull();
    }
  });
});

describe('server.cjs wiring', () => {
  const READ_ROUTES: Array<{ method: string; path: string; doc: string }> = [
    { method: 'get', path: '/api/documents/:id', doc: 'document' },
    { method: 'get', path: '/api/documents/:id/file', doc: 'document' },
    { method: 'get', path: '/api/documents/:id/preview', doc: 'document' },
    { method: 'get', path: '/api/documents/:id/edit-context', doc: 'doc' },
    { method: 'get', path: '/api/boldsign/download-document/:documentId', doc: 'document' },
  ];

  it.each(READ_ROUTES)('$method $path asks for a login or link before touching the database', ({ method, path: routePath }) => {
    const route = routeSource(method, routePath);
    const call = /const caller = await requireDocumentReadCaller\(req, res\);\s*if \(!caller\) return;/.exec(route);
    expect(call, 'requireDocumentReadCaller with early return').not.toBeNull();
    const firstUse = route.search(/\bdb\.|resolveStoredDocumentById\(|req\.(params|query)\b/);
    expect(firstUse).toBeGreaterThan(call!.index);
  });

  it.each(READ_ROUTES)('$method $path checks the stored document before sending it', ({ method, path: routePath, doc }) => {
    const route = routeSource(method, routePath);
    const check = route.indexOf(`if (!(await documentReadAllowed(req, res, caller, ${doc}))) return;`);
    expect(check).toBeGreaterThan(-1);
    const lookup = route.search(/resolveStoredDocumentById\(|\.findOne\(\{ id: String\(/);
    expect(lookup).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(lookup);
    expect(route.slice(check)).toMatch(/res\.send\(|success: true/);
    expect(route.slice(0, check)).not.toMatch(/res\.send\(|success: true/);
  });

  it('each read route is registered once, so no unchecked copy can answer', () => {
    for (const { method, path: routePath } of READ_ROUTES) {
      expect(serverSrc.match(routeOpening(method, routePath)), routePath).toHaveLength(1);
    }
  });

  it('?inline=1 skips only the pending-download block, never the access check', () => {
    const route = routeSource('get', '/api/documents/:id/file');
    expect(route.indexOf('req.query.inline')).toBeGreaterThan(route.indexOf('requireDocumentReadCaller(req, res)'));
    const block = route.slice(route.indexOf('if (!inline) {'), route.indexOf('resolveStoredDocumentById('));
    expect(block).toContain('Download restricted');
    expect(block).not.toContain('documentReadAllowed');
    expect(route.match(/documentReadAllowed\(/g)).toHaveLength(1);
  });

  it('the template fallback of the BoldSign download stays staff-only', () => {
    const route = routeSource('get', '/api/boldsign/download-document/:documentId');
    expect(route).toContain("caller.kind === 'staff' ? await templatesCollection.findOne(");
  });

  it('requireDocumentReadCaller takes the workflow from the query string, only as a string', () => {
    const fn = functionSource('requireDocumentReadCaller');
    expect(fn).toContain("typeof req.query.workflowId === 'string' ? req.query.workflowId : ''");
    expect(fn).toContain('return requireApprovalCaller(req, res, workflowId);');
    expect(fn).not.toContain('req.body');
  });

  it('documentReadAllowed compares the stored document with the stored documents of the link workflow', () => {
    const fn = functionSource('documentReadAllowed');
    expect(fn).toContain("caller.kind === 'link' ? await linkWorkflowDocumentIds(req.query.workflowId) : []");
    expect(fn).toContain('documentAccess.checkDocumentReadCaller({ caller, document, linkDocumentIds })');
    expect(fn).toContain('res.status(verdict.httpStatus)');
    const ids = functionSource('linkWorkflowDocumentIds');
    expect(ids).toContain("db.collection('approval_workflows').findOne(");
    expect(ids).toContain('documentAccess.workflowDocumentIds(workflow)');
    expect(ids).toContain('resolveStoredDocumentById(db, id)');
  });

  it('no pattern is built from a raw document id anywhere in the server', () => {
    expect(serverSrc).not.toMatch(/new RegExp\(`\^\$\{parts\[/);
    expect(serverSrc).not.toMatch(/\$regex: (companyPart|clientPart|clientNamePattern|possibleCompany|possibleClient)\b/);
    const fn = functionSource('resolveStoredDocumentById');
    expect(fn).not.toMatch(/new RegExp|\$options/);
    expect(fn).toContain('documentAccess.parseDocumentId(id)');
  });

  it('DELETE /api/documents/:id is for the creator or an approval admin, checked before the delete', () => {
    const route = routeSource('delete', '/api/documents/:id');
    const login = route.search(/const authUser = await getAuthenticatedUser\(req, res\);\s*if \(!authUser\) return;/);
    expect(login).toBeGreaterThan(-1);
    const refusal = /if \(!\(await actorMayDeleteDocument\(existing, authUser\)\)\) \{\s*return res\.status\(403\)/.exec(route);
    expect(refusal, 'creator-or-admin refusal with 403').not.toBeNull();
    expect(refusal!.index).toBeGreaterThan(login);
    expect(route.indexOf('.deleteOne(')).toBeGreaterThan(refusal!.index);
    const fn = functionSource('actorMayDeleteDocument');
    expect(fn).toContain('documentAccess.isDocumentCreator(document, actor.email)');
    expect(fn).toContain('actorCanEditSourceDocumentDates(document, normalizeEmail(actor.email))');
    expect(fn).not.toContain('req.');
  });

  it('new documents record their creator from the login, not the request body', () => {
    expect(serverSrc.match(/createdBy: normalizeEmail\(authUser\.email\),/g)).toHaveLength(2);
    expect(routeSource('post', '/api/documents')).toContain('createdBy: normalizeEmail(authUser.email),');
    expect(routeSource('post', '/api/documents/upload')).toContain('createdBy: normalizeEmail(authUser.email),');
  });
});
