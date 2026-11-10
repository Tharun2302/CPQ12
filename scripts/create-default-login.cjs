const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');
const requireMongoUri = require('./lib/requireMongoUri.cjs');
const { DEFAULT_LOGIN_EMAIL, passwordProblem, upsertDefaultLogin } = require('./lib/defaultLogin.cjs');

// One-off: create or reset the backup email login. Usage: set DEFAULT_LOGIN_PASSWORD=... then node scripts/create-default-login.cjs

const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const password = process.env.DEFAULT_LOGIN_PASSWORD;
  const problem = passwordProblem(password);
  if (problem) {
    console.error(`❌ ${problem}`);
    process.exit(1);
  }

  const client = new MongoClient(requireMongoUri());
  try {
    await client.connect();
    const hashedPassword = await bcrypt.hash(password, 12);
    const outcome = await upsertDefaultLogin(client.db(DB_NAME), hashedPassword);
    console.log(`✅ ${DEFAULT_LOGIN_EMAIL} ${outcome} in database "${DB_NAME}"`);
  } catch (error) {
    console.error('❌ Failed:', error.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
})();
