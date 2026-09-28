/**
 * One-off: ARCHIVE (never delete) the two legacy `templates` collection records
 * that were silently overriding Combination Manager uploads for:
 *   - Multi Combination  (combination: 'multi-combination')
 *   - Manage Plan (generic, combination: 'manage-standalone', planType: 'manage')
 *
 * Why: GET /api/templates now excludes { archived: true } records (see server.cjs),
 * so once these two are flagged, template selection in src/App.tsx falls through to
 * the Combination Manager file for the exact agreement (multi-combination,
 * data-sprawl, manage-+-sprawl, overageagreemnet) instead of always matching these
 * two generic records first.
 *
 * This script:
 *   - NEVER deletes anything. It sets { archived: true, archivedAt, archivedReason }.
 *   - Is idempotent — running twice on an already-archived record is a no-op.
 *   - Defaults to a DRY RUN that only prints what it would change.
 *   - Only writes with --apply AND --i-understand-this-is-the-live-database.
 *
 * Run (dry run, safe, no writes):
 *   node scripts/archive-legacy-agreement-templates.cjs
 *
 * Run (apply):
 *   node scripts/archive-legacy-agreement-templates.cjs --apply --i-understand-this-is-the-live-database
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

// Identified 2026-09-21 from the live database. Matched by id (not by name/combination,
// so this never accidentally catches a future unrelated record).
const LEGACY_TEMPLATE_IDS = [
  'template-1771420090782-o1b312', // "Multi Combination" — combination: multi-combination
  'template-1779130007103-3ftgeh', // "Manage Plan – SaaS Agreement (3-Month Free Trial)" — planType: manage
];

function maskUri(uri) {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

async function main() {
  const apply = process.argv.includes('--apply');
  const confirmed = process.argv.includes('--i-understand-this-is-the-live-database');

  console.log(`Connecting to ${maskUri(MONGODB_URI)} / db "${DB_NAME}"`);
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const templates = db.collection('templates');

  const docs = await templates.find({ id: { $in: LEGACY_TEMPLATE_IDS } }).toArray();

  if (docs.length === 0) {
    console.log('No matching records found. Nothing to do (already archived-and-renamed, or ids changed).');
    await client.close();
    return;
  }

  console.log(`\nFound ${docs.length} of ${LEGACY_TEMPLATE_IDS.length} target record(s):\n`);
  for (const d of docs) {
    console.log(`  id=${d.id}`);
    console.log(`    name: ${d.name}`);
    console.log(`    combination: ${d.combination}  planType: ${d.planType}`);
    console.log(`    fileName: ${d.fileName}`);
    console.log(`    archived: ${d.archived === true ? 'YES (already)' : 'no'}`);
    console.log('');
  }

  const toArchive = docs.filter((d) => d.archived !== true);

  if (toArchive.length === 0) {
    console.log('All matching records are already archived. Nothing to do.');
    await client.close();
    return;
  }

  if (!apply) {
    console.log(`DRY RUN — would set { archived: true } on ${toArchive.length} record(s) listed above.`);
    console.log('No data is deleted by this script at any point — only an "archived" flag is set.');
    console.log('Re-run with --apply --i-understand-this-is-the-live-database to write this change.');
    await client.close();
    return;
  }

  if (!confirmed) {
    console.error('Refusing to write: --apply requires --i-understand-this-is-the-live-database as well.');
    await client.close();
    process.exitCode = 1;
    return;
  }

  const now = new Date().toISOString();
  const result = await templates.updateMany(
    { id: { $in: toArchive.map((d) => d.id) } },
    {
      $set: {
        archived: true,
        archivedAt: now,
        archivedReason:
          'Superseded by Combination Manager per-agreement templates; excluded from GET /api/templates listing but bytes and record kept intact.',
      },
    }
  );

  console.log(`\nArchived ${result.modifiedCount} record(s). Nothing was deleted.`);
  await client.close();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exitCode = 1;
});
