/**
 * Remap planType on the 4 Google MyDrive to Box exhibits to align with the
 * frontend Basic/Standard/Advanced tier names.
 *
 *   Standard Plan files (planType "standard")  ->  "basic"
 *   Advanced Plan files (planType "advanced")  ->  "standard"
 *
 * Without this remap, agreement generation for Basic and Standard tiers skips
 * these exhibits in QuoteGenerator's expansion loop (plan mismatch), and the
 * config-fallback only re-adds the Include variant, so Not-Include disappears.
 *
 * Default: DRY RUN. Pass --apply to write.
 * Targets only the 4 specific _ids; refuses to update if current planType
 * doesn't match the expected "from" value.
 */
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const APPLY = process.argv.includes('--apply');
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'cpq_database';
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

const TARGETS = [
  { _id: '6960b4a433c5a7f666d6c89c', expectedName: 'Google MyDrive to Box Standard Plan - Standard Include',     from: 'standard', to: 'basic' },
  { _id: '6960b4a433c5a7f666d6c89d', expectedName: 'Google MyDrive to Box Standard Plan - Standard Not Include', from: 'standard', to: 'basic' },
  { _id: '6960be510a2b315165727c5b', expectedName: 'Google MyDrive to Box Advanced Plan - Advanced Include',     from: 'advanced', to: 'standard' },
  { _id: '6960be510a2b315165727c5c', expectedName: 'Google MyDrive to Box Advanced Plan - Advanced Not Include', from: 'advanced', to: 'standard' },
];

(async () => {
  console.log(`MongoDB: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);
  console.log(`DB:      ${DB_NAME}`);
  console.log(`Mode:    ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const col = client.db(DB_NAME).collection('exhibits');

  let updated = 0, skipped = 0;

  for (const t of TARGETS) {
    const doc = await col.findOne(
      { _id: new ObjectId(t._id) },
      { projection: { name: 1, planType: 1, includeType: 1 } }
    );
    if (!doc) {
      console.log(`  SKIP  ${t._id}  (not found)`);
      skipped++;
      continue;
    }
    if (doc.name !== t.expectedName) {
      console.log(`  SKIP  ${t._id}  (name mismatch: "${doc.name}" expected "${t.expectedName}")`);
      skipped++;
      continue;
    }
    const current = (doc.planType || '').toLowerCase();
    if (current === t.to) {
      console.log(`  OK    ${t._id}  planType already "${t.to}"`);
      continue;
    }
    if (current !== t.from) {
      console.log(`  SKIP  ${t._id}  (planType "${current}" != expected "${t.from}")  ${doc.name}`);
      skipped++;
      continue;
    }
    console.log(`  ${APPLY ? 'WRITE' : 'WOULD'}  ${t._id}  planType ${t.from} -> ${t.to}  ${doc.name}`);
    if (APPLY) {
      await col.updateOne(
        { _id: new ObjectId(t._id) },
        { $set: { planType: t.to, updatedAt: new Date() } }
      );
      updated++;
    }
  }

  await client.close();

  console.log(`\nSummary: ${APPLY ? 'updated' : 'would update'} ${APPLY ? updated : TARGETS.length - skipped}, skipped ${skipped}`);
  if (!APPLY) console.log('\nDry run only. Re-run with --apply to write.');
})().catch(err => { console.error('FATAL:', err); process.exit(1); });
