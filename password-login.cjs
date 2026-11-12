'use strict';

// Kept out of server.cjs so the password sign-in rules are testable without a database.

const MAX_EMAIL_LENGTH = 320;
// bcrypt only reads 72 bytes; the cap just stops oversized bodies from costing CPU.
const MAX_PASSWORD_LENGTH = 1024;

const GENERIC_FAILURE = { success: false, message: 'Invalid email or password' };

// Same cost as scripts/create-default-login.cjs, so the dummy compare takes as long as a real one.
const BCRYPT_COST = 12;

// Hash of a random throwaway string, compared against when there is no real hash so every failure costs the same.
const DUMMY_HASH = '$2b$12$b/9VgbU5tYncKk7/.boM6.xrbC2332zdtlKD.CzrLHnSyYdsqyoW6';

const failure = () => ({ ok: false, status: 401, body: { ...GENERIC_FAILURE } });

/**
 * Returns { ok: true, user } or { ok: false, status, body }.
 * Unknown user, Microsoft-only user, id-less user and wrong password all return the identical 401 body.
 */
async function authenticatePasswordLogin({ body, users, bcrypt, logger }) {
  const { email, password } = body && typeof body === 'object' ? body : {};
  if (email === undefined || password === undefined || email === '' || password === '' || email === null || password === null) {
    return { ok: false, status: 400, body: { success: false, message: 'Email and password are required' } };
  }
  const wellFormed = typeof email === 'string' && typeof password === 'string'
    && email.length <= MAX_EMAIL_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
  if (!wellFormed) return { ok: false, status: 400, body: { success: false, message: 'Invalid sign-in request' } };

  const user = await users.findOne({ email });
  const hash = user && typeof user.password === 'string' && user.password !== '' ? user.password : null;
  const matches = await bcrypt.compare(password, hash || DUMMY_HASH);
  if (!user || !hash || !matches) return failure();
  // A token with no userId could never be resolved back to this account.
  if (typeof user.id !== 'string' || user.id.trim() === '') {
    if (logger) logger.warn('Password sign-in refused', { source: 'password-login', reason: 'USER_WITHOUT_ID' });
    return failure();
  }
  return { ok: true, user };
}

module.exports = { BCRYPT_COST, DUMMY_HASH, MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH, authenticatePasswordLogin };
