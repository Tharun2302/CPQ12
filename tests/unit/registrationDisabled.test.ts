import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { passwordProblem, upsertDefaultLogin, DEFAULT_LOGIN_EMAIL } = require('../../scripts/lib/defaultLogin.cjs');

const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

function routeSource(opening: RegExp): string {
  const start = serverSrc.search(opening);
  expect(start, `route not found: ${opening}`).toBeGreaterThan(-1);
  const end = serverSrc.indexOf('\napp.', start + 1);
  return serverSrc.slice(start, end === -1 ? undefined : end);
}

describe('POST /api/auth/register is disabled', () => {
  const route = routeSource(/app\.post\(\s*['"]\/api\/auth\/register['"]\s*,/);

  it('answers 403 and never creates a user or issues a token', () => {
    expect(route).toMatch(/status\(403\)/);
    expect(route).toContain('Registration is disabled');
    expect(route).not.toMatch(/insertOne|jwt\.sign|bcrypt|req\.body/);
  });

  it('is not advertised as an available endpoint at startup', () => {
    expect(serverSrc).not.toMatch(/console\.log\([^)]*POST \/api\/auth\/register/);
  });
});

describe('default login password rules', () => {
  it('rejects a missing, short, or previously leaked password', () => {
    expect(passwordProblem(undefined)).toMatch(/not set/);
    expect(passwordProblem('')).toMatch(/not set/);
    expect(passwordProblem('short-1!')).toMatch(/at least 12/);
    expect(passwordProblem('CPQ@2025@TEAM')).toMatch(/exposed in public code/);
  });

  it('accepts a long new password', () => {
    expect(passwordProblem('a-brand-new-Passw0rd!')).toBeNull();
  });
});

describe('upsertDefaultLogin', () => {
  function fakeDb(existing: unknown) {
    const users = {
      findOne: vi.fn().mockResolvedValue(existing),
      insertOne: vi.fn().mockResolvedValue({}),
      updateOne: vi.fn().mockResolvedValue({}),
    };
    return { users, db: { collection: vi.fn(() => users) } };
  }

  it('creates the account as a viewer with only the hash stored', async () => {
    const { users, db } = fakeDb(null);
    const outcome = await upsertDefaultLogin(db, 'HASH');
    expect(outcome).toBe('created');
    expect(users.insertOne).toHaveBeenCalledTimes(1);
    const doc = users.insertOne.mock.calls[0][0];
    expect(doc).toMatchObject({ email: DEFAULT_LOGIN_EMAIL, password: 'HASH', role: 'viewer', provider: 'email' });
    expect(users.updateOne).not.toHaveBeenCalled();
  });

  it('on an existing account replaces only the password', async () => {
    const { users, db } = fakeDb({ email: DEFAULT_LOGIN_EMAIL, role: 'exhibit_admin' });
    const outcome = await upsertDefaultLogin(db, 'HASH2');
    expect(outcome).toBe('updated');
    expect(users.insertOne).not.toHaveBeenCalled();
    const [filter, update] = users.updateOne.mock.calls[0];
    expect(filter).toEqual({ email: DEFAULT_LOGIN_EMAIL });
    expect(Object.keys(update.$set).sort()).toEqual(['password', 'updated_at']);
  });
});
