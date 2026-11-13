import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import sessionActivity from '../../session-activity.cjs';

type Doc = Record<string, any>;

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (condition && typeof condition === 'object' && '$gt' in condition) {
      return doc[key] instanceof Date && doc[key].getTime() > condition.$gt.getTime();
    }
    return doc[key] === condition;
  });
}

function createFakeCollection() {
  const docs: Doc[] = [];
  const indexes: Array<[Doc, Doc | undefined]> = [];
  return {
    docs,
    indexes,
    async createIndex(spec: Doc, options?: Doc) { indexes.push([spec, options]); },
    async insertOne(doc: Doc) { docs.push({ ...doc }); },
    async findOne(filter: Doc) { return docs.find((d) => matches(d, filter)) ?? null; },
    async findOneAndUpdate(filter: Doc, update: { $set: Doc }) {
      const doc = docs.find((d) => matches(d, filter));
      if (!doc) return null;
      Object.assign(doc, update.$set);
      return { ...doc };
    },
    async updateOne(filter: Doc, update: { $set: Doc }) {
      const doc = docs.find((d) => matches(d, filter));
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(doc, update.$set);
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
}

const MINUTE = 60 * 1000;
const START = Date.UTC(2026, 10, 13, 9, 0, 0);

describe('session-activity', () => {
  let clock: number;
  let collection: ReturnType<typeof createFakeCollection>;
  let store: any;

  beforeEach(() => {
    clock = START;
    collection = createFakeCollection();
    let n = 0;
    store = sessionActivity.createSessionStore({
      getCollection: () => collection,
      now: () => clock,
      randomId: () => `sid-${++n}`,
    });
  });

  it('uses a 60-minute idle timeout', () => {
    expect(sessionActivity.IDLE_TIMEOUT_MS).toBe(60 * MINUTE);
  });

  it('caps every sign-in at 12 hours', () => {
    expect(sessionActivity.SESSION_MAX_AGE_MS).toBe(12 * 60 * MINUTE);
  });

  it('creates a session with a full idle window and a TTL expiry', async () => {
    const created = await store.createSession({ userId: 'u1', email: 'a@cloudfuze.com' });
    expect(created).toEqual({ sid: 'sid-1', idleRemainingMs: 60 * MINUTE, maxAgeRemainingMs: 12 * 60 * MINUTE });
    const doc = collection.docs[0];
    expect(doc.revokedAt).toBeNull();
    expect(doc.expiresAt.getTime() - START).toBe(sessionActivity.SESSION_MAX_AGE_MS);
  });

  it('creates a unique sid index and a TTL index', async () => {
    await store.ensureIndexes();
    expect(collection.indexes).toContainEqual([{ sid: 1 }, { unique: true }]);
    expect(collection.indexes).toContainEqual([{ expiresAt: 1 }, { expireAfterSeconds: 0 }]);
  });

  it('accepts an active session and reports the time left without extending it', async () => {
    const { sid } = await store.createSession({ userId: 'u1' });
    clock += 20 * MINUTE;
    expect(await store.checkSession(sid, 'u1')).toEqual({ ok: true, idleRemainingMs: 40 * MINUTE, maxAgeRemainingMs: 700 * MINUTE });
    clock += 20 * MINUTE;
    expect(await store.checkSession(sid, 'u1')).toEqual({ ok: true, idleRemainingMs: 20 * MINUTE, maxAgeRemainingMs: 680 * MINUTE });
  });

  it('an active user is still signed out at the 12-hour cap, and pings cannot extend past it', async () => {
    const { sid } = await store.createSession({ userId: 'u1' });
    for (let i = 0; i < 14; i += 1) {
      clock += 50 * MINUTE;
      await store.touchSession(sid, 'u1');
    }
    expect((await store.checkSession(sid, 'u1')).ok).toBe(true);
    clock += 19 * MINUTE;
    expect(await store.touchSession(sid, 'u1')).toEqual({ ok: true, idleRemainingMs: 60 * MINUTE, maxAgeRemainingMs: MINUTE });
    clock += MINUTE;
    expect(await store.checkSession(sid, 'u1')).toEqual({ ok: false, reason: 'MAX_AGE' });
    expect((await store.touchSession(sid, 'u1')).ok).toBe(false);
  });

  it('refuses a session idle for exactly 60 minutes', async () => {
    const { sid } = await store.createSession({ userId: 'u1' });
    clock += 60 * MINUTE;
    expect(await store.checkSession(sid, 'u1')).toEqual({ ok: false, reason: 'IDLE' });
  });

  it('activity resets the idle clock', async () => {
    const { sid } = await store.createSession({ userId: 'u1' });
    clock += 59 * MINUTE;
    expect(await store.touchSession(sid, 'u1')).toEqual({ ok: true, idleRemainingMs: 60 * MINUTE, maxAgeRemainingMs: 661 * MINUTE });
    clock += 59 * MINUTE;
    expect((await store.checkSession(sid, 'u1')).ok).toBe(true);
  });

  it('a late ping cannot revive an idle session', async () => {
    const { sid } = await store.createSession({ userId: 'u1' });
    clock += 61 * MINUTE;
    expect((await store.touchSession(sid, 'u1')).ok).toBe(false);
    expect((await store.checkSession(sid, 'u1')).ok).toBe(false);
  });

  it('refuses a signed-out session and cannot touch it', async () => {
    const { sid } = await store.createSession({ userId: 'u1' });
    expect(await store.revokeSession(sid)).toBe(true);
    expect(await store.checkSession(sid, 'u1')).toEqual({ ok: false, reason: 'SIGNED_OUT' });
    expect((await store.touchSession(sid, 'u1')).ok).toBe(false);
    expect(await store.revokeSession(sid)).toBe(false);
  });

  it('refuses a session presented with another user id', async () => {
    const { sid } = await store.createSession({ userId: 'u1' });
    expect(await store.checkSession(sid, 'u2')).toEqual({ ok: false, reason: 'WRONG_USER' });
    expect((await store.touchSession(sid, 'u2')).ok).toBe(false);
  });

  it('refuses missing, unknown and operator-shaped session ids', async () => {
    expect((await store.checkSession(undefined, 'u1')).reason).toBe('NO_SESSION');
    expect((await store.checkSession('nope', 'u1')).reason).toBe('NO_SESSION');
    expect((await store.checkSession('$where', 'u1')).reason).toBe('NO_SESSION');
    expect((await store.checkSession({ $ne: null } as any, 'u1')).reason).toBe('NO_SESSION');
    expect((await store.touchSession({ $ne: null } as any, 'u1')).ok).toBe(false);
    expect(await store.revokeSession({ $ne: null } as any)).toBe(false);
  });
});

describe('server.cjs login session wiring', () => {
  const server = fs.readFileSync(fileURLToPath(new URL('../../server.cjs', import.meta.url)), 'utf8');

  it('verifies login tokens in exactly one place', () => {
    expect(server.match(/jwt\.verify\([^)]*(?<![A-Z_])JWT_SECRET\b/g)).toHaveLength(1);
  });

  it('puts the session id in every issued login token', () => {
    expect(server).toMatch(/jwt\.sign\(\{ \.\.\.result\.jwtPayload, sid: session\.sid \}, JWT_SECRET, \{ expiresIn: '12h' \}\)/);
    expect(server.match(/jwt\.sign\(.*?(?<![A-Z_])JWT_SECRET\b/g)).toHaveLength(1);
  });

  it('refuses tokens without a session id', () => {
    expect(server).toMatch(/if \(!decoded \|\| !decoded\.sid \|\| !decoded\.userId\) return null;/);
  });

  it('rate limits activity per session and gives logout its own limiter', () => {
    expect(server).toContain("app.post('/api/auth/activity', sessionActivityLimiter,");
    expect(server).toContain("app.post('/api/auth/logout', logoutLimiter,");
    expect(server).toMatch(/`sid:\$\{decoded\.sid\}`/);
  });

  it('reports a database failure during the sign-in check as 503, not as an expired login', () => {
    const helper = server.slice(server.indexOf('async function getAuthenticatedUser'), server.indexOf('async function getApprovalAdminUser'));
    expect(helper).toContain("res.status(503).json({ success: false, error: 'Could not verify sign-in, please retry' })");
  });

  it('does not reset the idle clock from /api/auth/me', () => {
    const me = server.slice(server.indexOf("app.get('/api/auth/me'"), server.indexOf('const sessionActivityLimiter'));
    expect(me).not.toContain('touchSession');
  });
});
