import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  stripTokenFields,
  callerMaySeeRecipientTokens,
  recipientsForCaller,
} = require('../../esign-recipient-access.cjs');

type Row = Record<string, any>;

const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

function routeSource(method: string, routePath: string): string {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const start = serverSrc.search(new RegExp(`\\napp\\.${method}\\(\\s*['"]${escaped}['"]\\s*,`));
  expect(start, `route not found: ${method.toUpperCase()} ${routePath}`).toBeGreaterThan(-1);
  const end = serverSrc.indexOf('\napp.', start + 2);
  return serverSrc.slice(start + 1, end === -1 ? undefined : end);
}

const ROUTE_PATH = '/api/esign/documents/:id/recipients';
const DOC_ID = 'a'.repeat(24);
const MISSING_DOC_ID = 'b'.repeat(24);

const DOC = { _id: DOC_ID, uploaded_by: 'Alice@Test.example', status: 'sent' };
const DOC_APPROVAL = { _id: DOC_ID, uploaded_by: 'Alice Smith', requested_by_email: ' alice@test.example ' };

const FULL_ROW: Row = {
  id: 'r1',
  name: 'Carol',
  email: 'carol@test.example',
  role: 'signer',
  action: 'signer',
  status: 'pending',
  order: 0,
  comment: null,
  email_message: 'Please sign',
  signing_token: 'SECRET-SIGNING-TOKEN',
  token_expires_at: '2099-01-01T00:00:00.000Z',
  expiry_reminder_sent_at: null,
  sent_at: '2026-01-01',
  viewed_at: null,
  signed_at: null,
  forwarded_to_email: null,
  forwarded_to_name: null,
  forwarded_at: null,
  forward_count: 0,
  forwarded_from_email: null,
  forwarded_from_name: null,
};
const TOKEN_KEYS = ['signing_token', 'token_expires_at'];

describe('stripTokenFields', () => {
  it('removes signing_token, token_expires_at and any other field with "token" in its name', () => {
    const out = stripTokenFields({
      ...FULL_ROW,
      token_created_at: 'x',
      inboxToken: 'y',
      forward_TOKEN_id: 'z',
    });
    expect(Object.keys(out).filter((k) => /token/i.test(k))).toEqual([]);
  });

  it('keeps every other field with its value', () => {
    const out = stripTokenFields(FULL_ROW);
    const expected = { ...FULL_ROW };
    TOKEN_KEYS.forEach((k) => delete expected[k]);
    expect(out).toEqual(expected);
  });

  it('does not mutate the input row', () => {
    const row = { ...FULL_ROW };
    stripTokenFields(row);
    expect(row).toEqual(FULL_ROW);
  });

  it('tolerates null and undefined', () => {
    expect(stripTokenFields(null)).toEqual({});
    expect(stripTokenFields(undefined)).toEqual({});
  });
});

describe('callerMaySeeRecipientTokens', () => {
  const creator = { email: 'alice@test.example' };
  const may = (user: Row | null, isApprovalAdmin = false, doc: Row = DOC) =>
    callerMaySeeRecipientTokens({ doc, user, isApprovalAdmin });

  it('creator: yes, ignoring case and whitespace', () => {
    expect(may(creator)).toBe(true);
    expect(may({ email: '  ALICE@test.example ' })).toBe(true);
  });

  it('creator of an approval-generated document is found through requested_by_email', () => {
    expect(may(creator, false, DOC_APPROVAL)).toBe(true);
  });

  it('approval admin who is not the creator: yes', () => {
    expect(may({ email: 'boss@test.example' }, true)).toBe(true);
  });

  it('logged-in non-creator: no', () => {
    expect(may({ email: 'bob@test.example' })).toBe(false);
  });

  it('no login: no, even for an admin flag', () => {
    expect(may(null)).toBe(false);
    expect(may(null, true)).toBe(false);
  });

  it('a user row without an email is never the creator', () => {
    expect(may({})).toBe(false);
    expect(may({ email: '' })).toBe(false);
    expect(may({ email: 'bob@test.example' }, false, { _id: 'x', uploaded_by: '' })).toBe(false);
  });

  it('only a real boolean true counts as admin', () => {
    expect(may({ email: 'bob@test.example' }, 'yes' as unknown as boolean)).toBe(false);
  });
});

describe('recipientsForCaller', () => {
  const rows = [FULL_ROW, { ...FULL_ROW, id: 'r2', email: 'dan@test.example', signing_token: 'SECRET-2' }];

  it('creator and admin keep every field', () => {
    expect(recipientsForCaller({ recipients: rows, doc: DOC, user: { email: 'alice@test.example' }, isApprovalAdmin: false })).toEqual(rows);
    expect(recipientsForCaller({ recipients: rows, doc: DOC, user: { email: 'boss@test.example' }, isApprovalAdmin: true })).toEqual(rows);
  });

  it('everyone else gets the same list, order and other fields with no token fields', () => {
    const out = recipientsForCaller({ recipients: rows, doc: DOC, user: null, isApprovalAdmin: false });
    expect(out).toHaveLength(2);
    expect(out.map((r: Row) => r.id)).toEqual(['r1', 'r2']);
    expect(out.map((r: Row) => r.email)).toEqual(['carol@test.example', 'dan@test.example']);
    const expectedKeys = Object.keys(FULL_ROW).filter((k) => !TOKEN_KEYS.includes(k));
    out.forEach((r: Row) => expect(Object.keys(r)).toEqual(expectedKeys));
  });

  it('treats a missing list as empty', () => {
    expect(recipientsForCaller({ recipients: undefined, doc: DOC, user: null, isApprovalAdmin: false })).toEqual([]);
  });
});

describe(`GET ${ROUTE_PATH}`, () => {
  const route = routeSource('get', ROUTE_PATH);
  const fnAt = serverSrc.search(/async function getOptionalAuthenticatedUser\(/);
  const getUserSrc = serverSrc.slice(fnAt).match(/^[\s\S]*?\r?\n\}(?=\r?\n)/)![0];

  const USERS: Record<string, Row> = {
    'alice-id': { id: 'alice-id', email: 'alice@test.example' },
    'bob-id': { id: 'bob-id', email: 'bob@test.example' },
    'boss-id': { id: 'boss-id', email: 'boss@test.example' },
  };
  const JWT_USERS: Record<string, string> = {
    'aaa.alice.ccc': 'alice-id',
    'aaa.bob.ccc': 'bob-id',
    'aaa.boss.ccc': 'boss-id',
    'aaa.ghost.ccc': 'ghost-id',
  };

  function ObjectIdFake(this: Row, value: string) {
    if (!/^[0-9a-f]{24}$/.test(String(value))) throw new Error('bad id');
    this.value = String(value);
    this.toString = () => this.value;
  }

  function call(headers: Record<string, string>, extra: Row = {}) {
    const db = {
      collection(name: string) {
        if (name === 'users') return { findOne: async ({ id }: { id: string }) => USERS[id] ?? null };
        if (name === 'esign_documents') {
          return { findOne: async ({ _id }: Row) => (String(_id) === DOC_ID ? DOC : null) };
        }
        if (name === 'esign_recipients') {
          return {
            find() {
              const cursor = {
                sort: () => cursor,
                toArray: async () => [
                  { _id: 'r1', name: 'Carol', email: 'carol@test.example', role: 'signer', status: 'pending', order: 0, signing_token: 'SECRET-SIGNING-TOKEN', token_expires_at: '2099-01-01', token_created_at: 'x' },
                  { _id: 'r2', email: 'dan@test.example', status: 'viewed', order: 1, signing_token: 'SECRET-TOKEN-2', token_expires_at: '2099-02-02' },
                ],
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
        if (token === 'aaa.stale.ccc') throw new Error('jwt expired');
        const userId = JWT_USERS[token];
        if (!userId) throw new Error('invalid signature');
        return { userId };
      },
    };
    let handler: (req: unknown, res: unknown) => Promise<void> = async () => {};
    const app = { get: (_p: string, h: typeof handler) => { handler = h; } };
    new Function(
      'app', 'db', 'jwt', 'JWT_SECRET', 'console', 'ObjectId', 'hasApprovalAdminAccess', 'recipientsForCaller',
      `${getUserSrc}\n${route}`,
    )(
      app, db, jwt, 'test-secret', { error: () => {}, log: () => {} }, ObjectIdFake,
      async (u: { email: string }) => u.email === 'boss@test.example',
      recipientsForCaller,
    );
    const res = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: undefined as Row | undefined,
      set(name: string, value: string) { res.headers[name] = value; return res; },
      status(code: number) { res.statusCode = code; return res; },
      json(payload: Row) { res.body = payload; return res; },
    };
    return handler({ headers, query: {}, body: {}, params: { id: DOC_ID }, ...extra }, res).then(() => res);
  }

  const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
  const withTokens = (res: { body?: Row }) => res.body!.recipients.map((r: Row) => r.signing_token);

  it('creator login: tokens are returned', async () => {
    const res = await call(bearer('aaa.alice.ccc'));
    expect(res.statusCode).toBe(200);
    expect(withTokens(res)).toEqual(['SECRET-SIGNING-TOKEN', 'SECRET-TOKEN-2']);
    expect(res.body!.recipients[0].token_expires_at).toBe('2099-01-01');
  });

  it('approval admin login: tokens are returned', async () => {
    const res = await call(bearer('aaa.boss.ccc'));
    expect(withTokens(res)).toEqual(['SECRET-SIGNING-TOKEN', 'SECRET-TOKEN-2']);
  });

  const STRANGERS: Array<[string, Record<string, string>]> = [
    ['no login', {}],
    ['a stale login', bearer('aaa.stale.ccc')],
    ['a login for a user that no longer exists', bearer('aaa.ghost.ccc')],
    ['a malformed token', { authorization: 'Bearer not-a-jwt' }],
    ['a logged-in non-creator', bearer('aaa.bob.ccc')],
  ];

  describe.each(STRANGERS)('%s', (_label, headers) => {
    it('gets the same list with no token fields anywhere in the response', async () => {
      const res = await call(headers);
      expect(res.statusCode).toBe(200);
      expect(res.body!.success).toBe(true);
      expect(res.body!.recipients.map((r: Row) => r.id)).toEqual(['r1', 'r2']);
      expect(res.body!.recipients.map((r: Row) => r.email)).toEqual(['carol@test.example', 'dan@test.example']);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('signing_token');
      expect(text).not.toContain('token_expires_at');
      expect(text).not.toMatch(/token/i);
      expect(text).not.toContain('SECRET');
    });

    it('has the same field names as the creator view minus the token fields', async () => {
      const creatorView = await call(bearer('aaa.alice.ccc'));
      const res = await call(headers);
      const names = (r: Row) => Object.keys(r).filter((k) => !/token/i.test(k));
      expect(res.body!.recipients.map((r: Row) => Object.keys(r))).toEqual(creatorView.body!.recipients.map(names));
    });
  });

  it('a request claiming to be the creator (header, query, body) changes nothing', async () => {
    const spoof = {
      headers: { 'x-user-email': 'alice@test.example', 'x-actor-email': 'alice@test.example', 'x-forwarded-user': 'alice@test.example' },
      query: { email: 'alice@test.example', actor_email: 'alice@test.example', uploaded_by: 'alice@test.example' },
      body: { actor_email: 'alice@test.example', email: 'alice@test.example', uploaded_by: 'alice@test.example' },
    };
    const res = await call(spoof.headers, { query: spoof.query, body: spoof.body });
    expect(JSON.stringify(res.body)).not.toMatch(/token|SECRET/i);
    const asBob = await call({ ...bearer('aaa.bob.ccc'), ...spoof.headers }, { query: spoof.query, body: spoof.body });
    expect(JSON.stringify(asBob.body)).not.toMatch(/token|SECRET/i);
  });

  it('sets Cache-Control: no-store on success and on errors', async () => {
    expect((await call({})).headers['Cache-Control']).toBe('no-store');
    const bad = await call({}, { params: { id: 'not-an-id' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.headers['Cache-Control']).toBe('no-store');
    const missing = await call({}, { params: { id: MISSING_DOC_ID } });
    expect(missing.statusCode).toBe(404);
    expect(missing.headers['Cache-Control']).toBe('no-store');
  });

  it('stays open: it never rejects a caller, so public signer and approver pages keep working', () => {
    expect(route).not.toMatch(/getAuthenticatedUser\(req, res\)|getApprovalAdminUser|getExhibitAdminUser/);
    expect(route).toContain('getOptionalAuthenticatedUser(req)');
    expect(route).not.toMatch(/status\(401\)|status\(403\)/);
  });

  it('takes the caller only from the verified login, never from the request', () => {
    expect(route).not.toMatch(/req\.(query|body)\b/);
    expect(route).not.toMatch(/req\.headers\b/);
  });
});

describe('GET /api/esign/pending-for-email is removed', () => {
  it('no route with that path exists in server.cjs', () => {
    expect(serverSrc).not.toContain('pending-for-email');
    expect(serverSrc).not.toMatch(/app\.get\(\s*['"`]\/api\/esign\/pending-for-email/);
  });

  it('nothing under src calls it', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) files.push(full);
      }
    };
    walk(path.resolve(process.cwd(), 'src'));
    const offenders = files.filter((f) => fs.readFileSync(f, 'utf8').includes('pending-for-email'));
    expect(offenders).toEqual([]);
  });
});

describe('other open GET routes do not return signing tokens', () => {
  it.each([
    '/api/esign/documents/:id',
    '/api/esign/documents/:id/activity',
  ])('GET %s has no signing_token or token_expires_at in its source', (routePath) => {
    expect(routeSource('get', routePath)).not.toMatch(/signing_token|token_expires_at/);
  });
});

describe('public signer and approver pages never read token fields from the recipients response', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

  it.each([
    'src/components/TeamApprovalDashboard.tsx',
    'src/components/TechnicalTeamApprovalDashboard.tsx',
    'src/components/LegalTeamApprovalDashboard.tsx',
    'src/pages/EsignSignedPage.tsx',
  ])('%s does not use signing_token or token_expires_at', (rel) => {
    if (!fs.existsSync(path.resolve(process.cwd(), rel))) return;
    expect(read(rel)).not.toMatch(/signing_token|token_expires_at/);
  });

  it('EsignSignPage and EsignInboxByToken never call the recipients route', () => {
    expect(read('src/pages/EsignSignPage.tsx')).not.toMatch(/\/recipients/);
    expect(read('src/pages/EsignInboxByToken.tsx')).not.toMatch(/\/recipients/);
  });
});
