const DEFAULT_LOGIN_EMAIL = 'cpq@zenop.ai';
const MIN_PASSWORD_LENGTH = 12;
// Shipped in public website code for a long time, so it must never be accepted again
const LEAKED_PASSWORDS = ['CPQ@2025@TEAM'];

function passwordProblem(password) {
  if (typeof password !== 'string' || !password) return 'DEFAULT_LOGIN_PASSWORD is not set.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (LEAKED_PASSWORDS.includes(password)) return 'That password was exposed in public code. Choose a new one.';
  return null;
}

async function upsertDefaultLogin(db, hashedPassword, now = new Date()) {
  const users = db.collection('users');
  const existing = await users.findOne({ email: DEFAULT_LOGIN_EMAIL });
  if (existing) {
    await users.updateOne({ email: DEFAULT_LOGIN_EMAIL }, { $set: { password: hashedPassword, updated_at: now } });
    return 'updated';
  }
  await users.insertOne({
    id: `user_${now.getTime()}`,
    name: 'CPQ Team',
    email: DEFAULT_LOGIN_EMAIL,
    password: hashedPassword,
    provider: 'email',
    role: 'viewer',
    created_at: now,
    updated_at: now,
  });
  return 'created';
}

module.exports = { DEFAULT_LOGIN_EMAIL, MIN_PASSWORD_LENGTH, passwordProblem, upsertDefaultLogin };
