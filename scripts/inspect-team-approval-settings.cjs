/**
 * Read-only: print the current team_approval_settings (Team Lead emails per team)
 * and how the recipient resolves a "Team Lead" role to an email.
 *
 * Usage: node scripts/inspect-team-approval-settings.cjs
 */
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'cpq_database';
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const doc = await client.db(DB_NAME).collection('team_approval_settings').findOne({ _id: 'main' });
  console.log('team_approval_settings (_id: main):\n');
  if (!doc) {
    console.log('(no document — server falls back to default in code)');
  } else {
    console.log(JSON.stringify(doc, null, 2));
  }
  console.log('\nEnv fallback TEAM_APPROVAL_EMAIL =', process.env.TEAM_APPROVAL_EMAIL || '(unset)');
  await client.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
