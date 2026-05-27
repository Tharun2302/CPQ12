/**
 * Push the on-disk "Box to Dropbox Advanced Plan - Advanced Include.docx"
 * into MongoDB by writing it to the matching exhibit document's `fileData`
 * (base64) field.
 *
 * Why this exists: the `/api/exhibits/:id/file` endpoint serves the binary
 * from MongoDB (`exhibit.fileData`), not from the backend-exhibits folder.
 * Updating the DOCX on disk alone has no effect until the DB row is refreshed.
 *
 * Scope: only updates records whose fileName (or legacyFileNames) point at
 * "Box to Dropbox Advanced Plan - Advanced Include.docx" — which after the
 * Standard→Basic / Advanced→Standard rename is the file backing the
 * "Box to Dropbox Standard Plan - Standard Include" display name
 * (see seed-exhibits.cjs lines 577–579). The Basic plan exhibit (backed by
 * "Box to Dropbox Standard Plan - Standard Include.docx") is left untouched.
 *
 * Default: DRY RUN. Use `--apply` to write.
 *
 *   node scripts/sync-box-to-dropbox-standard-include-to-mongo.cjs
 *   node scripts/sync-box-to-dropbox-standard-include-to-mongo.cjs --apply
 */
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const APPLY = process.argv.includes('--apply');
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'cpq_database';

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set');
  process.exit(1);
}

const FILE_NAME = 'Box to Dropbox Advanced Plan - Advanced Include.docx';
const FILE_PATH = path.join(process.cwd(), 'backend-exhibits', FILE_NAME);

(async () => {
  console.log(`MongoDB: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);
  console.log(`DB:      ${DB_NAME}`);
  console.log(`File:    ${FILE_PATH}`);
  console.log(`Mode:    ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  if (!fs.existsSync(FILE_PATH)) {
    console.error('❌ Disk file not found — cannot sync.');
    process.exit(1);
  }

  const buf = fs.readFileSync(FILE_PATH);
  const base64 = buf.toString('base64');
  console.log(`Disk file size: ${buf.length} bytes (${base64.length} base64 chars)\n`);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const filter = {
    $or: [
      { fileName: FILE_NAME },
      { legacyFileNames: FILE_NAME }
    ]
  };

  const matches = await db
    .collection('exhibits')
    .find(filter)
    .project({ _id: 1, name: 1, fileName: 1, fileType: 1, fileData: 1 })
    .toArray();

  if (matches.length === 0) {
    console.log('ℹ️  No matching exhibit record found in MongoDB.');
    await client.close();
    return;
  }

  console.log(`Found ${matches.length} matching exhibit record(s):\n`);
  for (const ex of matches) {
    const dbSize = typeof ex.fileData === 'string' ? Math.floor(ex.fileData.length * 3 / 4) : 0; // approx bytes
    const matchesAlready = ex.fileData === base64;
    console.log(`  • ${ex.name}`);
    console.log(`      _id:       ${ex._id}`);
    console.log(`      fileName:  ${ex.fileName}`);
    console.log(`      DB size:   ~${dbSize} bytes`);
    console.log(`      disk size: ${buf.length} bytes`);
    console.log(`      action:    ${matchesAlready ? 'already in sync' : 'will overwrite fileData'}\n`);
  }

  if (!APPLY) {
    const toUpdate = matches.filter((ex) => ex.fileData !== base64).length;
    console.log(`DRY RUN: ${toUpdate} record(s) would be updated. Re-run with --apply to write.`);
    await client.close();
    return;
  }

  const res = await db.collection('exhibits').updateMany(filter, {
    $set: {
      fileData: base64,
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      updatedAt: new Date()
    }
  });
  console.log(`\n✅ Updated ${res.modifiedCount} record(s). Matched ${res.matchedCount}.`);

  await client.close();
})().catch((err) => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
