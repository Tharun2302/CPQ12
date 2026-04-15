/**
 * Clears all e-sign test data from MongoDB and uploaded files on disk.
 *
 *   node scripts/clear-esign-data.cjs           # dry-run: shows counts only
 *   node scripts/clear-esign-data.cjs --execute  # actually deletes everything
 */
const path = require('path');
const fs   = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME     = process.env.DB_NAME || process.env.MONGODB_DB || 'cpq_database';

const COLLECTIONS = [
  'esign_documents',
  'esign_recipients',
  'signature_fields',
  'esign_signature_secrets',
];

const UPLOAD_DIRS = [
  path.join(__dirname, '..', 'uploads', 'documents'),
  path.join(__dirname, '..', 'uploads', 'signed'),
  path.join(__dirname, '..', 'uploads', 'signatures'),
];

function countFiles(dir) {
  try {
    return fs.readdirSync(dir).filter(f => !f.startsWith('.')).length;
  } catch { return 0; }
}

function deleteFiles(dir) {
  let deleted = 0;
  try {
    const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
    for (const f of files) {
      fs.rmSync(path.join(dir, f), { recursive: true, force: true });
      deleted++;
    }
  } catch (e) {
    console.warn(`  ⚠️  Could not clear ${dir}: ${e.message}`);
  }
  return deleted;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const client  = new MongoClient(MONGODB_URI);
  await client.connect();

  try {
    const db = client.db(DB_NAME);
    console.log(`\nDatabase: ${DB_NAME}\n`);

    // ── MongoDB collections ──────────────────────────────────────────────
    console.log('MongoDB collections:');
    const counts = {};
    for (const col of COLLECTIONS) {
      counts[col] = await db.collection(col).countDocuments();
      console.log(`  ${col}: ${counts[col]} document(s)`);
    }

    // ── Uploaded files ───────────────────────────────────────────────────
    console.log('\nUploaded files:');
    for (const dir of UPLOAD_DIRS) {
      console.log(`  ${path.relative(path.join(__dirname, '..'), dir)}: ${countFiles(dir)} file(s)`);
    }

    if (!execute) {
      console.log('\n⚠️  Dry run — nothing deleted.');
      console.log('   To delete everything, run:');
      console.log('   node scripts/clear-esign-data.cjs --execute\n');
      return;
    }

    // ── Execute deletions ────────────────────────────────────────────────
    console.log('\nDeleting...');
    for (const col of COLLECTIONS) {
      const result = await db.collection(col).deleteMany({});
      console.log(`  ✅ ${col}: deleted ${result.deletedCount}`);
    }

    for (const dir of UPLOAD_DIRS) {
      const n = deleteFiles(dir);
      console.log(`  ✅ ${path.relative(path.join(__dirname, '..'), dir)}: deleted ${n} file(s)`);
    }

    console.log('\n✅ All e-sign test data cleared.\n');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
