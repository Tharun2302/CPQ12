'use strict';

// Redline-admin and document-admin email lists. Kept out of server.cjs so validation, the
// env/DB merge and the atomic writes can be unit tested with a fake db.

const MAX_EMAIL_LENGTH = 254;
const DEFAULT_MAX_LIST_SIZE = 200;
// Commas, semicolons and angle brackets are rejected so one entry cannot smuggle in a second one.
const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/**
 * Validates and canonicalises an admin email.
 * @returns {{ ok: true, value: string } | { ok: false, code: 'INVALID_EMAIL', error: string }}
 */
function normalizeAdminEmail(raw) {
  const invalid = { ok: false, code: 'INVALID_EMAIL', error: 'A valid email address is required' };
  if (typeof raw !== 'string') return invalid;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(trimmed)) return invalid;
  return { ok: true, value: trimmed.toLowerCase() };
}

/** Comma-separated env value -> unique, normalized emails. Invalid entries are dropped. */
function parseEnvEmails(str) {
  if (typeof str !== 'string') return [];
  const out = [];
  for (const part of str.split(',')) {
    const check = normalizeAdminEmail(part);
    if (check.ok && !out.includes(check.value)) out.push(check.value);
  }
  return out;
}

function storedEmails(doc) {
  if (!doc || !Array.isArray(doc.emails)) return [];
  const out = [];
  for (const e of doc.emails) {
    const check = normalizeAdminEmail(e);
    if (check.ok && !out.includes(check.value)) out.push(check.value);
  }
  return out;
}

/**
 * One admin list stored as settings{ _id: settingsId, emails, updatedAt, updatedBy } plus an
 * env bootstrap list whose members always have access and cannot be removed from the UI.
 * Results of add/remove: { ok, httpStatus, data?, message?, code?, error?, changed?, email? }.
 */
function createAdminEmailList({
  settingsId, envVar, maxSize = DEFAULT_MAX_LIST_SIZE, env = process.env,
}) {
  if (!settingsId || !envVar) throw new Error('settingsId and envVar are required');

  const envEmails = () => parseEnvEmails(env[envVar]);
  const loadDoc = (db) => db.collection('settings').findOne({ _id: settingsId });

  async function dbEmails(db) {
    return storedEmails(await loadDoc(db));
  }

  /** `emails` is everyone with access (env first); `envEmails` cannot be removed. */
  async function snapshot(db) {
    const doc = await loadDoc(db);
    const fromEnv = envEmails();
    const fromDb = storedEmails(doc).filter((e) => !fromEnv.includes(e));
    return {
      emails: [...fromEnv, ...fromDb],
      envEmails: fromEnv,
      updatedAt: (doc && doc.updatedAt) || null,
      updatedBy: (doc && doc.updatedBy) || null,
    };
  }

  // Fails closed: a settings read error means "not an admin", never "everyone is".
  async function hasAccess(db, user) {
    const check = normalizeAdminEmail(user && user.email);
    if (!check.ok) return false;
    if (envEmails().includes(check.value)) return true;
    if (!db) return false;
    try {
      return (await dbEmails(db)).includes(check.value);
    } catch (e) {
      return false;
    }
  }

  const listFull = () => ({
    ok: false,
    httpStatus: 400,
    code: 'LIST_FULL',
    error: `The list can hold at most ${maxSize} emails`,
  });
  const done = async (db, email, changed, message) => ({
    ok: true, httpStatus: 200, changed, email, data: await snapshot(db), message,
  });
  const stamp = (actorEmail) => ({ updatedAt: new Date(), updatedBy: actorEmail || null });

  // The cap is in the filter so concurrent adds cannot push the list past maxSize; on a full list
  // the filter misses and the upsert's insert collides on _id (E11000).
  async function addWithCap(db, email, actorEmail) {
    try {
      await db.collection('settings').updateOne(
        { _id: settingsId, [`emails.${maxSize - 1}`]: { $exists: false } },
        { $addToSet: { emails: email }, $set: stamp(actorEmail) },
        { upsert: true }
      );
      return true;
    } catch (e) {
      if (e && e.code === 11000) return false;
      throw e;
    }
  }

  async function add(db, rawEmail, actorEmail) {
    const check = normalizeAdminEmail(rawEmail);
    if (!check.ok) return { ok: false, httpStatus: 400, code: check.code, error: check.error };
    const current = await dbEmails(db);
    if (current.includes(check.value) || envEmails().includes(check.value)) {
      return done(db, check.value, false, 'Email already in list');
    }
    if (current.length >= maxSize) return listFull();
    // E11000 can also mean two first-ever adds raced to create the doc; retry once.
    if (!(await addWithCap(db, check.value, actorEmail))) {
      const full = (await dbEmails(db)).length >= maxSize;
      if (full || !(await addWithCap(db, check.value, actorEmail))) return listFull();
    }
    return done(db, check.value, true, 'Email added');
  }

  async function remove(db, rawEmail, actorEmail) {
    const check = normalizeAdminEmail(rawEmail);
    if (!check.ok) return { ok: false, httpStatus: 400, code: check.code, error: check.error };
    if (envEmails().includes(check.value)) {
      return {
        ok: false,
        httpStatus: 409,
        code: 'ENV_MANAGED',
        error: 'This email is set in the server configuration and cannot be removed here',
      };
    }
    // Pull every stored spelling of this address, so a hand-edited "A@X.com" goes too.
    const doc = await loadDoc(db);
    const variants = (doc && Array.isArray(doc.emails) ? doc.emails : [])
      .filter((e) => typeof e === 'string' && e.trim().toLowerCase() === check.value);
    if (variants.length === 0) return done(db, check.value, false, 'Email was not in list');
    const result = await db.collection('settings').updateOne(
      { _id: settingsId, emails: { $in: variants } },
      { $pull: { emails: { $in: variants } }, $set: stamp(actorEmail) }
    );
    const changed = !!(result && result.modifiedCount > 0);
    return done(db, check.value, changed, changed ? 'Email removed' : 'Email was not in list');
  }

  return { settingsId, envVar, maxSize, envEmails, dbEmails, snapshot, hasAccess, add, remove };
}

module.exports = {
  MAX_EMAIL_LENGTH,
  DEFAULT_MAX_LIST_SIZE,
  normalizeAdminEmail,
  parseEnvEmails,
  createAdminEmailList,
};
