/**
 * Fix-up: remove the incorrect 'google-sharedrive-to-google-sharedrive' tag from
 * the "Google Drive to Google(MyDrive & Shared Drive) - Included Features" exhibit.
 *
 * Background: that exhibit's DOCX content describes Google MyDrive sources only
 * ("Mydrive to Mydrive" and "Google Mydrive to Google Shared Drive" tables), but
 * its combinations array also listed 'google-sharedrive-to-google-sharedrive'.
 * As a result, agreements generated for ShareDrive → ShareDrive migrations were
 * merging this exhibit and showing unrelated MyDrive tables in Exhibit 1 - INCLUDED.
 *
 * What this script does: locates the exhibit by name (or legacy file name) and
 * rewrites combinations to ['google-mydrive-to-google-mydrive',
 * 'google-mydrive-to-google-sharedrive', 'all'] — matching the actual content.
 *
 * Default: DRY RUN. Use `--apply` to write.
 *
 *   node scripts/fix-google-drive-mydrive-shareddrive-exhibit-combinations.cjs
 *   node scripts/fix-google-drive-mydrive-shareddrive-exhibit-combinations.cjs --apply
 */
const { MongoClient } = require('mongodb');
require('dotenv').config();

const APPLY = process.argv.includes('--apply');
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'cpq_database';

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set');
  process.exit(1);
}

const EXHIBIT_NAME = 'Google Drive to Google(MyDrive & Shared Drive) - Included Features';
const LEGACY_FILE_NAME = 'Google Drive to Google Drive (MyDrive & Shared Drive) - Included Features.docx';
const NEW_COMBINATIONS = [
  'google-mydrive-to-google-mydrive',
  'google-mydrive-to-google-sharedrive',
  'all'
];

(async () => {
  console.log(`MongoDB: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);
  console.log(`DB:      ${DB_NAME}`);
  console.log(`Mode:    ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const filter = {
    $or: [
      { name: EXHIBIT_NAME },
      { fileName: LEGACY_FILE_NAME },
      { legacyFileNames: LEGACY_FILE_NAME }
    ]
  };

  const matches = await db
    .collection('exhibits')
    .find(filter)
    .project({ _id: 1, name: 1, combinations: 1, fileName: 1 })
    .toArray();

  if (matches.length === 0) {
    console.log('ℹ️  No matching exhibit found — nothing to fix.');
    await client.close();
    return;
  }

  console.log(`Found ${matches.length} exhibit(s) to inspect:\n`);
  let toFix = 0;
  for (const ex of matches) {
    const current = Array.isArray(ex.combinations) ? ex.combinations : [];
    const sameAsTarget =
      current.length === NEW_COMBINATIONS.length &&
      current.every((c, i) => c === NEW_COMBINATIONS[i]);

    console.log(`  • ${ex.name}`);
    console.log(`      _id:           ${ex._id}`);
    console.log(`      fileName:      ${ex.fileName}`);
    console.log(`      combinations:  ${JSON.stringify(current)}`);
    console.log(`      target:        ${JSON.stringify(NEW_COMBINATIONS)}`);
    console.log(`      action:        ${sameAsTarget ? 'already correct' : 'will update'}\n`);
    if (!sameAsTarget) toFix++;
  }

  if (toFix === 0) {
    console.log('✅ All matching exhibits already have the correct combinations array.');
    await client.close();
    return;
  }

  if (!APPLY) {
    console.log(`\nDRY RUN: ${toFix} exhibit(s) would be updated. Re-run with --apply to write.`);
    await client.close();
    return;
  }

  const res = await db
    .collection('exhibits')
    .updateMany(filter, { $set: { combinations: NEW_COMBINATIONS } });

  console.log(`\n✅ Updated ${res.modifiedCount} exhibit(s).`);
  await client.close();
})().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
