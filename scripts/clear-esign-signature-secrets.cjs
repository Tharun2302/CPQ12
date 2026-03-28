/**
 * One-off: remove all documents from esign_signature_secrets (legacy encrypted signature blobs).
 * Uses MONGODB_URI and DB_NAME from .env (same as server.cjs).
 *
 *   node scripts/clear-esign-signature-secrets.cjs           # dry-run: count only
 *   node scripts/clear-esign-signature-secrets.cjs --execute # delete all rows
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function main() {
  const execute = process.argv.includes('--execute');
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  try {
    const db = client.db(DB_NAME);
    const col = db.collection('esign_signature_secrets');
    const count = await col.countDocuments();
    console.log(`Database: ${DB_NAME}`);
    console.log(`Collection: esign_signature_secrets`);
    console.log(`Documents: ${count}`);
    if (!execute) {
      console.log('');
      console.log('Dry run. To delete all documents, run:');
      console.log('  node scripts/clear-esign-signature-secrets.cjs --execute');
      return;
    }
    const result = await col.deleteMany({});
    console.log(`Deleted ${result.deletedCount} document(s).`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
