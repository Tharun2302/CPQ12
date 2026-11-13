'use strict';

// Kept out of server.cjs so the idle-session rules are testable without a database.
// The auth_sessions collection, clock and id generator are injected.

const crypto = require('crypto');

const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
// The JWT's own 7-day cap; records past it are useless and the TTL index removes them.
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const COLLECTION_NAME = 'auth_sessions';

const isSafeId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.startsWith('$');

function createSessionStore({ getCollection, now = Date.now, randomId = () => crypto.randomUUID(), idleTimeoutMs = IDLE_TIMEOUT_MS } = {}) {
  const idleCutoff = () => new Date(now() - idleTimeoutMs);
  const remainingMs = (lastActivityAt) => Math.max(0, new Date(lastActivityAt).getTime() + idleTimeoutMs - now());

  async function ensureIndexes() {
    const sessions = getCollection();
    await sessions.createIndex({ sid: 1 }, { unique: true });
    await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  }

  async function createSession({ userId, email }) {
    const stamp = new Date(now());
    const sid = randomId();
    await getCollection().insertOne({
      sid,
      userId,
      email,
      createdAt: stamp,
      lastActivityAt: stamp,
      revokedAt: null,
      expiresAt: new Date(stamp.getTime() + SESSION_MAX_AGE_MS),
    });
    return { sid, idleRemainingMs: idleTimeoutMs };
  }

  // Returns { ok: true, idleRemainingMs } or { ok: false, reason }; never extends the session.
  async function checkSession(sid, userId) {
    if (!isSafeId(sid)) return { ok: false, reason: 'NO_SESSION' };
    const session = await getCollection().findOne({ sid });
    if (!session) return { ok: false, reason: 'NO_SESSION' };
    if (session.userId !== userId) return { ok: false, reason: 'WRONG_USER' };
    if (session.revokedAt) return { ok: false, reason: 'SIGNED_OUT' };
    const left = remainingMs(session.lastActivityAt);
    if (left <= 0) return { ok: false, reason: 'IDLE' };
    return { ok: true, idleRemainingMs: left };
  }

  // Conditional update so an idle or signed-out session can never be revived by a late ping.
  async function touchSession(sid, userId) {
    if (!isSafeId(sid)) return { ok: false, reason: 'NO_SESSION' };
    const stamp = new Date(now());
    const result = await getCollection().updateOne(
      { sid, userId, revokedAt: null, lastActivityAt: { $gt: idleCutoff() } },
      { $set: { lastActivityAt: stamp } }
    );
    if (!result || result.matchedCount !== 1) return { ok: false, reason: 'IDLE_OR_SIGNED_OUT' };
    return { ok: true, idleRemainingMs: idleTimeoutMs };
  }

  async function revokeSession(sid) {
    if (!isSafeId(sid)) return false;
    const result = await getCollection().updateOne({ sid, revokedAt: null }, { $set: { revokedAt: new Date(now()) } });
    return !!result && result.modifiedCount === 1;
  }

  return { ensureIndexes, createSession, checkSession, touchSession, revokeSession };
}

module.exports = {
  COLLECTION_NAME,
  IDLE_TIMEOUT_MS,
  SESSION_MAX_AGE_MS,
  createSessionStore,
};
