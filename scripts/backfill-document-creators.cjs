/**
 * One-off: stamp createdByEmail / createdByUserId / createdBySource on legacy `documents` rows,
 * so the per-user Documents list (GET /api/documents) still shows people their own older agreements.
 *
 * Attribution (see scripts/lib/documentCreatorBackfill.cjs):
 *   1. Login-verified approval workflows (creatorVerified === true): one distinct requester ->
 *      that person. Several different requesters -> reported as ambiguous and skipped.
 *   2. Otherwise older approval rows with no creatorVerified flag (source
 *      'backfill:approval-unverified'). They took the requester from the request body, so they
 *      are trusted by decision, not proof; --verified-only skips them and reports them instead.
 *   3. Otherwise a linked e-sign document's creator (uploaded_by / requested_by_email).
 *   4. Otherwise left unset: only document admins will see it.
 *
 * Safety:
 *   - Defaults to a DRY RUN that only prints counts.
 *   - Writes only with --apply AND --i-understand-this-is-the-live-database.
 *   - Never overwrites an existing createdByEmail (the update filter requires it to be empty).
 *   - Never deletes anything.
 *
 * Run (dry run, no writes):
 *   node scripts/backfill-document-creators.cjs
 *   node scripts/backfill-document-creators.cjs --list-ids    (also prints skipped document ids)
 *   node scripts/backfill-document-creators.cjs --verified-only   (skip older unverified approvals)
 *
 * Run (apply):
 *   node scripts/backfill-document-creators.cjs --apply --i-understand-this-is-the-live-database
 */

const { MongoClient } = require('mongodb');
const requireMongoUri = require('./lib/requireMongoUri.cjs');
const { planBackfill } = require('./lib/documentCreatorBackfill.cjs');

const DB_NAME = process.env.DB_NAME || 'cpq_database';

function maskUri(uri) {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

async function loadInputs(db) {
  const [documents, workflows, esignDocs] = await Promise.all([
    db.collection('documents').find({}, { projection: { _id: 0, id: 1, createdByEmail: 1 } }).toArray(),
    db.collection('approval_workflows').find(
      { documentId: { $exists: true, $ne: null } },
      { projection: { _id: 0, id: 1, documentId: 1, creatorEmail: 1, createdBy: 1, creatorVerified: 1 } }
    ).toArray(),
    db.collection('esign_documents').find(
      { source_document_id: { $exists: true, $ne: null } },
      { projection: { _id: 0, source_document_id: 1, uploaded_by: 1, requested_by_email: 1 } }
    ).toArray(),
  ]);
  return { documents, workflows, esignDocs };
}

function printSummary(summary, { ambiguousIds, unverifiedIds, unattributableIds }, listIds) {
  const row = (label, n) => console.log(`${label.padEnd(40)}${n}`);
  console.log('');
  row('Documents scanned:', summary.total);
  row('Already have a creator:', summary.existing);
  row('Attributable via verified approval:', summary.attributed['backfill:approval']);
  row('Attributable via unverified approval:', summary.attributed['backfill:approval-unverified']);
  row('Attributable via e-sign:', summary.attributed['backfill:esign']);
  row('Ambiguous (approval):', summary.ambiguous['backfill:approval'] + summary.ambiguous['backfill:approval-unverified']);
  row('Ambiguous (e-sign):', summary.ambiguous['backfill:esign']);
  row('Unverified approval only (skipped):', summary.unverifiedOnly);
  row('Unattributable:', summary.unattributable);
  if (listIds) {
    console.log(`
Ambiguous ids: ${ambiguousIds.join(', ') || '(none)'}`);
    console.log(`Unverified-only ids (review by hand): ${unverifiedIds.join(', ') || '(none)'}`);
    console.log(`Unattributable ids: ${unattributableIds.join(', ') || '(none)'}`);
  }
}

// Users are matched case-insensitively because older user rows may store "First.Last@..." spellings.
async function userIdsByEmail(db, emails) {
  const wanted = new Set(emails);
  const users = await db.collection('users')
    .find({ email: { $type: 'string' } }, { projection: { _id: 0, id: 1, email: 1 } })
    .toArray();
  const ids = new Map();
  for (const u of users) {
    const email = String(u.email).trim().toLowerCase();
    if (wanted.has(email) && !ids.has(email)) ids.set(email, u.id || null);
  }
  return ids;
}

async function applyPlan(db, plan) {
  const ids = await userIdsByEmail(db, [...new Set(plan.map((p) => p.email))]);
  const now = new Date();
  let written = 0;
  for (const item of plan) {
    const result = await db.collection('documents').updateOne(
      { id: item.id, createdByEmail: { $in: [null, ''] } },
      {
        $set: {
          createdByEmail: item.email,
          createdByUserId: ids.get(item.email) || null,
          createdBySource: item.source,
          createdByBackfilledAt: now,
        },
      }
    );
    written += result.modifiedCount;
  }
  return written;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const confirmed = process.argv.includes('--i-understand-this-is-the-live-database');
  const listIds = process.argv.includes('--list-ids');
  const includeUnverified = !process.argv.includes('--verified-only');
  const uri = requireMongoUri();

  console.log(`Connecting to ${maskUri(uri)} / db "${DB_NAME}"`);
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(DB_NAME);
    const result = planBackfill({ ...(await loadInputs(db)), includeUnverified });
    printSummary(result.summary, result, listIds);

    if (!apply) {
      console.log(`\nDRY RUN — would stamp a creator on ${result.plan.length} document(s). Nothing was written.`);
      console.log('Re-run with --apply --i-understand-this-is-the-live-database to write.');
      return;
    }
    if (!confirmed) {
      console.error('Refusing to write: --apply requires --i-understand-this-is-the-live-database as well.');
      process.exitCode = 1;
      return;
    }
    const written = await applyPlan(db, result.plan);
    console.log(`\nStamped a creator on ${written} document(s). Existing values were left untouched.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Error:', err && err.message ? err.message : err);
  process.exitCode = 1;
});
