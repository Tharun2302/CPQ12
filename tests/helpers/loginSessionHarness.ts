import fs from 'node:fs';
import path from 'node:path';

const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

// The real decodeLoginToken / readBearerToken / verifyLoginToken source, for route harnesses built with new Function
export const loginSessionSrc = serverSrc.slice(
  serverSrc.indexOf('function decodeLoginToken'),
  serverSrc.indexOf('const GOTENBERG_URL'),
);

export const TEST_SESSION_ID = 'test-sid';

type FakeJwt = { verify: (...args: any[]) => Record<string, unknown> };

// Every token the fake jwt accepts belongs to the test session unless the fake names its own sid
export function withSession<T extends FakeJwt>(jwt: T): T {
  return { ...jwt, verify: (...args: any[]) => ({ sid: TEST_SESSION_ID, ...jwt.verify(...args) }) };
}

export function fakeLoginSessions(state: 'active' | 'idle' = 'active') {
  const checked: Array<{ sid: unknown; userId: unknown }> = [];
  return {
    checked,
    async checkSession(sid: unknown, userId: unknown) {
      checked.push({ sid, userId });
      if (state === 'active' && sid === TEST_SESSION_ID) return { ok: true, idleRemainingMs: 60 * 60 * 1000 };
      return { ok: false, reason: 'IDLE' };
    },
  };
}
