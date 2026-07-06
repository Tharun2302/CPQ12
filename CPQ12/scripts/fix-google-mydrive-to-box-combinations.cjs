/**
 * Add the specific combination key "google-mydrive-to-box" to the 4 Google
 * MyDrive to Box exhibits. They currently have combinations: ["all"] only.
 *
 * QuoteGenerator.getBaseCombination filters out "all" and returns '' when no
 * other entries are left, which makes the expansion loop SKIP these exhibits
 * with reason "no base combination". The config-fallback then re-adds only
 * the user's primary (Include) exhibit, dropping the Not-Include.
 *
 * Seeded exhibits use the pattern combinations: ["<combo-key>", "all"]
 * (e.g. ["dropbox-to-google", "all"] in seed-exhibits.cjs:454). Aligning these
 * 4 to the same shape lets expansion find both Include and Not-Include.
 *
 * Default: DRY RUN. Pass --apply to write. Idempotent.
 */
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const APPLY = process.argv.includes('--apply');
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'cpq_database';
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

const COMBO_KEY = 'google-mydrive-to-box';
const TARGET_IDS = [
  '6960b4a433c5a7f666d6c89c',
  '6960b4a433c5a7f666d6c89d',
  '6960be510a2b315165727c5b',
  '6960be510a2b315165727c5c',
];

(async () => {
  console.log(`MongoDB: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);
  console.log(`DB:      ${DB_NAME}`);
  console.log(`Mode:    ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const col = client.db(DB_NAME).collection('exhibits');

  let updated = 0, alreadyOk = 0, skipped = 0;

  for (const idStr of TARGET_IDS) {
    const doc = await col.findOne(
      { _id: new ObjectId(idStr) },
      { projection: { name: 1, combinations: 1 } }
    );
    if (!doc) {
      console.log(`  SKIP  ${idStr}  (not found)`);
      skipped++;
      continue;
    }
    const current = Array.isArray(doc.combinations) ? doc.combinations : [];
    const hasCombo = current.some((c) => String(c).toLowerCase() === COMBO_KEY);
    if (hasCombo) {
      console.log(`  OK    ${idStr}  combinations already include "${COMBO_KEY}"  (${JSON.stringify(current)})`);
      alreadyOk++;
      continue;
    }
    const next = [COMBO_KEY, ...current.filter((c) => String(c).toLowerCase() !== COMBO_KEY)];
    console.log(`  ${APPLY ? 'WRITE' : 'WOULD'}  ${idStr}  ${JSON.stringify(current)} -> ${JSON.stringify(next)}  ${doc.name}`);
    if (APPLY) {
      await col.updateOne(
        { _id: new ObjectId(idStr) },
        { $set: { combinations: next, updatedAt: new Date() } }
      );
      updated++;
    }
  }

  await client.close();

  console.log(`\nSummary: ${APPLY ? 'updated' : 'would update'} ${APPLY ? updated : TARGET_IDS.length - alreadyOk - skipped}, already-OK ${alreadyOk}, skipped ${skipped}`);
  if (!APPLY) console.log('\nDry run only. Re-run with --apply to write.');
})().catch(err => { console.error('FATAL:', err); process.exit(1); });
