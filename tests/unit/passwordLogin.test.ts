import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import passwordLogin from '../../password-login.cjs';

type Doc = Record<string, unknown>;
type Result = { ok: boolean; status?: number; body?: Doc; user?: Doc };

const { authenticatePasswordLogin } = passwordLogin as {
  authenticatePasswordLogin: (args: { body: unknown; users: unknown; bcrypt: unknown }) => Promise<Result>;
};

const HASH = bcrypt.hashSync('Correct-Horse-9!', 4);
const GENERIC = { success: false, message: 'Invalid email or password' };

function makeUsers() {
  const store: Doc[] = [
    { id: 'u1', email: 'cpq@zenop.ai', password: HASH, role: 'viewer' },
    { id: 'u2', email: 'ms@cloudfuze.com', provider: 'microsoft', role: 'viewer' },
    { id: 'u3', email: 'blank@zenop.ai', password: '', role: 'viewer' },
  ];
  const findOne = vi.fn(async (q: Doc) => store.find((u) => Object.entries(q).every(([k, v]) => u[k] === v)) ?? null);
  return { users: { findOne }, findOne };
}

const run = (body: unknown, fake = makeUsers()) => authenticatePasswordLogin({ body, users: fake.users, bcrypt }).then((res) => ({ res, fake }));

describe('POST /api/auth/login logic', () => {
  it('valid credentials succeed with the user record', async () => {
    const { res } = await run({ email: 'cpq@zenop.ai', password: 'Correct-Horse-9!' });
    expect(res.ok).toBe(true);
    expect(res.user).toMatchObject({ id: 'u1' });
  });

  it('unknown user, Microsoft-only user, empty hash and wrong password all return the identical 401 body', async () => {
    const outcomes = await Promise.all([
      run({ email: 'nobody@zenop.ai', password: 'Correct-Horse-9!' }),
      run({ email: 'ms@cloudfuze.com', password: 'Correct-Horse-9!' }),
      run({ email: 'blank@zenop.ai', password: 'anything' }),
      run({ email: 'cpq@zenop.ai', password: 'wrong-password' }),
    ]);
    outcomes.forEach(({ res }) => {
      expect(res.ok).toBe(false);
      expect(res.status).toBe(401);
      expect(res.body).toEqual(GENERIC);
      expect(res.user).toBeUndefined();
    });
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['blank', '   '],
    ['a number', 7],
  ])('a user with %s id and a correct password gets the identical 401 and no user', async (_label, id) => {
    const store: Doc[] = [{ id, email: 'noid@zenop.ai', password: HASH, role: 'exhibit_admin' }];
    const users = { findOne: vi.fn(async (q: Doc) => store.find((u) => u.email === q.email) ?? null) };
    const logger = { warn: vi.fn() };
    const res = await authenticatePasswordLogin({ body: { email: 'noid@zenop.ai', password: 'Correct-Horse-9!' }, users, bcrypt, logger } as never);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(GENERIC);
    expect(res.user).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('Password sign-in refused', { source: 'password-login', reason: 'USER_WITHOUT_ID' });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('noid@zenop.ai');
  });

  it('never calls bcrypt.compare with an undefined hash', async () => {
    const compare = vi.fn(async () => false);
    const fake = makeUsers();
    await authenticatePasswordLogin({ body: { email: 'ms@cloudfuze.com', password: 'x' }, users: fake.users, bcrypt: { compare } });
    expect(compare).toHaveBeenCalledTimes(1);
    expect(typeof (compare.mock.calls[0] as unknown[])[1]).toBe('string');
  });

  it.each([
    ['email as an operator object', { email: { $ne: null }, password: 'x' }],
    ['password as an operator object', { email: 'cpq@zenop.ai', password: { $ne: null } }],
    ['email as a number', { email: 5, password: 'x' }],
    ['password as an array', { email: 'cpq@zenop.ai', password: ['x'] }],
    ['oversized email', { email: `${'a'.repeat(321)}`, password: 'x' }],
    ['oversized password', { email: 'cpq@zenop.ai', password: 'p'.repeat(1025) }],
  ])('rejects %s with 400 before any database call', async (_label, body) => {
    const { res, fake } = await run(body);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(fake.findOne).not.toHaveBeenCalled();
  });

  it.each([null, undefined, 'text', {}, { email: 'cpq@zenop.ai' }, { password: 'x' }, { email: '', password: 'x' }])(
    'missing credentials (%j) keep the existing 400 message',
    async (body) => {
      const { res, fake } = await run(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, message: 'Email and password are required' });
      expect(fake.findOne).not.toHaveBeenCalled();
    },
  );

  it('looks the user up by the exact email string only', async () => {
    const { fake } = await run({ email: 'cpq@zenop.ai', password: 'wrong' });
    expect(fake.findOne).toHaveBeenCalledWith({ email: 'cpq@zenop.ai' });
  });
});

describe('dummy hash timing', () => {
  const { DUMMY_HASH, BCRYPT_COST } = passwordLogin as { DUMMY_HASH: string; BCRYPT_COST: number };
  const root = process.cwd();

  it('is a valid bcrypt hash at the cost used for real hashes', () => {
    expect(DUMMY_HASH).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
    expect(Number(DUMMY_HASH.split('$')[2])).toBe(BCRYPT_COST);
    expect(bcrypt.getRounds(DUMMY_HASH)).toBe(BCRYPT_COST);
  });

  it('matches the cost the default-login script hashes with', () => {
    const script = fs.readFileSync(path.resolve(root, 'scripts/create-default-login.cjs'), 'utf8');
    const used = script.match(/bcrypt\.hash\(\s*\w+\s*,\s*(\d+)\s*\)/);
    expect(used).not.toBeNull();
    expect(Number(used![1])).toBe(BCRYPT_COST);
  });

  it('does not match an arbitrary password', async () => {
    expect(await bcrypt.compare('Correct-Horse-9!', DUMMY_HASH)).toBe(false);
  });

  it('unknown-user and Microsoft-only logins compare against the dummy hash', async () => {
    const compare = vi.fn(async () => false);
    const fake = makeUsers();
    await authenticatePasswordLogin({ body: { email: 'nobody@zenop.ai', password: 'x' }, users: fake.users, bcrypt: { compare } });
    await authenticatePasswordLogin({ body: { email: 'ms@cloudfuze.com', password: 'x' }, users: fake.users, bcrypt: { compare } });
    expect(compare.mock.calls.map((c) => (c as unknown[])[1])).toEqual([DUMMY_HASH, DUMMY_HASH]);
  });
});

describe('POST /api/auth/login route wiring', () => {
  const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');
  const start = serverSrc.search(/app\.post\(\s*['"]\/api\/auth\/login['"]\s*,/);
  const route = serverSrc.slice(start, serverSrc.indexOf('\napp.', start + 1));

  it('delegates to the hardened helper and no longer reads body fields or compares passwords itself', () => {
    expect(start).toBeGreaterThan(-1);
    expect(route).toContain('passwordLogin.authenticatePasswordLogin');
    expect(route).not.toMatch(/bcrypt\.compare|req\.body\./);
    expect(route).not.toMatch(/message: 'Failed to login'[^}]*error:/);
  });
});
