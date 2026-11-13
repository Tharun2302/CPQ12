'use strict';

// Kept out of server.cjs so the idle-session rules are testable without a database.
// The auth_sessions collection, clock and id generator are injected.

const crypto = require('crypto');

const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
// Absolute limit even for an active user, so a stolen token cannot be kept alive by pinging
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const COLLECTION_NAME = 'auth_sessions';

const isSafeId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.startsWith('$');

function createSessionStore({
  getCollection,
  now = Date.now,
  randomId = () => crypto.randomUUID(),
  idleTimeoutMs = IDLE_TIMEOUT_MS,
  maxAgeMs = SESSION_MAX_AGE_MS,
} = {}) {
  const idleCutoff = () => new Date(now() - idleTimeoutMs);
  const ageCutoff = () => new Date(now() - maxAgeMs);
  const remainingMs = (lastActivityAt) => Math.max(0, new Date(lastActivityAt).getTime() + idleTimeoutMs - now());
  const maxAgeRemainingMs = (createdAt) => Math.max(0, new Date(createdAt).getTime() + maxAgeMs - now());
  const timesLeft = (session) => ({
    idleRemainingMs: remainingMs(session.lastActivityAt),
    maxAgeRemainingMs: maxAgeRemainingMs(session.createdAt),
  });

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
      expiresAt: new Date(stamp.getTime() + maxAgeMs),
    });
    return { sid, idleRemainingMs: idleTimeoutMs, maxAgeRemainingMs: maxAgeMs };
  }

  // Returns { ok: true, idleRemainingMs, maxAgeRemainingMs } or { ok: false, reason }; never extends the session.
  async function checkSession(sid, userId) {
    if (!isSafeId(sid)) return { ok: false, reason: 'NO_SESSION' };
    const session = await getCollection().findOne({ sid });
    if (!session) return { ok: false, reason: 'NO_SESSION' };
    if (session.userId !== userId) return { ok: false, reason: 'WRONG_USER' };
    if (session.revokedAt) return { ok: false, reason: 'SIGNED_OUT' };
    const left = timesLeft(session);
    if (left.maxAgeRemainingMs <= 0) return { ok: false, reason: 'MAX_AGE' };
    if (left.idleRemainingMs <= 0) return { ok: false, reason: 'IDLE' };
    return { ok: true, ...left };
  }

  // Conditional update so an idle, expired or signed-out session can never be revived by a late ping.
  async function touchSession(sid, userId) {
    if (!isSafeId(sid)) return { ok: false, reason: 'NO_SESSION' };
    const stamp = new Date(now());
    const result = await getCollection().findOneAndUpdate(
      { sid, userId, revokedAt: null, lastActivityAt: { $gt: idleCutoff() }, createdAt: { $gt: ageCutoff() } },
      { $set: { lastActivityAt: stamp } },
      { returnDocument: 'after' }
    );
    // Driver v6 returns the document; older drivers wrap it in { value }
    const session = result && result.value !== undefined ? result.value : result;
    if (!session) return { ok: false, reason: 'EXPIRED_OR_SIGNED_OUT' };
    return { ok: true, ...timesLeft(session) };
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
