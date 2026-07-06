/**
 * One-time script: drop MongoDB collections that are not used by the application.
 * Run: node drop-unused-collections.cjs
 *
 * Collections removed:
 *   - boldsign_documents
 *   - customer_onboarding
 *   - esign_envelopes
 *   - esign_requests
 *   - signed_agreements
 *   - signed_documents
 */
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

const UNUSED_COLLECTIONS = [
  'boldsign_documents',
  'customer_onboarding',
  'esign_envelopes',
  'esign_requests',
  'signed_agreements',
  'signed_documents',
];

async function main() {
  let client;
  try {
    console.log('Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    const existing = await db.listCollections().toArray();
    const existingNames = new Set(existing.map((c) => c.name));

    for (const name of UNUSED_COLLECTIONS) {
      if (existingNames.has(name)) {
        await db.collection(name).drop();
        console.log('Dropped:', name);
      } else {
        console.log('Skip (not present):', name);
      }
    }

    console.log('Done.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    if (client) await client.close();
  }
}

main();
