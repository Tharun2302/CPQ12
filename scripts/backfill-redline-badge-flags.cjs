/**
 * Backfill the "Redline Agreement" badge flags onto approval workflows that were redlined
 * BEFORE the flags were introduced.
 *
 * Evidence used: a forked redline always writes a new document carrying
 * `forkedFromDocumentId` (see /api/onlyoffice/persist-to-document). Any approval workflow
 * whose documentId is the fork source was therefore redlined at least once.
 *
 * Limitation: the OTHER persist path overwrites the document in place and leaves no marker,
 * so redlines made when no approval was active cannot be recovered. Those stay unflagged.
 *
 * Sets the same fields the live code sets, with redlineForked: true (these are all forks)
 * and redlineEditedAt taken from the newest fork's createdAt rather than "now", so the
 * timestamp reflects when the redline actually happened.
 *
 * Usage:
 *   node scripts/backfill-redline-badge-flags.cjs            # dry run (default)
 *   node scripts/backfill-redline-badge-flags.cjs --apply    # write changes
 *   node scripts/backfill-redline-badge-flags.cjs --revert   # unset the flags again
 */
const { MongoClient } = require('mongodb');
require('dotenv').config();

const APPLY = process.argv.includes('--apply');
const REVERT = process.argv.includes('--revert');

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.DB_NAME || 'cpq_database');
  const workflows = db.collection('approval_workflows');

  if (REVERT) {
    const res = await workflows.updateMany(
      { hasRedlineEdit: true },
      { $unset: { hasRedlineEdit: '', redlineEditedAt: '', redlineDocumentId: '', redlineForked: '' } }
    );
    console.log(`↩️  Reverted flags on ${res.modifiedCount} workflow(s).`);
    await client.close();
    return;
  }

  const forks = await db.collection('documents')
    .find(
      { forkedFromDocumentId: { $exists: true, $ne: null } },
      { projection: { id: 1, forkedFromDocumentId: 1, createdAt: 1 } }
    )
    .toArray();

  // Newest fork per source document — that is the most recent redline for that agreement.
  const latestBySource = new Map();
  for (const f of forks) {
    const prev = latestBySource.get(f.forkedFromDocumentId);
    if (!prev || new Date(f.createdAt) > new Date(prev.createdAt)) latestBySource.set(f.forkedFromDocumentId, f);
  }

  const targets = await workflows
    .find(
      { documentId: { $in: [...latestBySource.keys()] } },
      { projection: { id: 1, documentId: 1, status: 1, creatorEmail: 1, hasRedlineEdit: 1 } }
    )
    .toArray();

  const pending = targets.filter((w) => !w.hasRedlineEdit);

  console.log(`Redline fork documents        : ${forks.length}`);
  console.log(`Distinct source documents     : ${latestBySource.size}`);
  console.log(`Matching workflows            : ${targets.length}`);
  console.log(`Needing the flag              : ${pending.length}\n`);

  for (const w of pending) {
    const fork = latestBySource.get(w.documentId);
    console.log(`  ${w.id}  [${w.status}]  ${w.creatorEmail || '—'}`);
    console.log(`    doc ${w.documentId}`);
    console.log(`    → redline ${fork.id} @ ${new Date(fork.createdAt).toISOString()}`);
  }

  if (!APPLY) {
    console.log(`\n(dry run — nothing written. Re-run with --apply to write these ${pending.length} change(s).)`);
    await client.close();
    return;
  }

  let updated = 0;
  for (const w of pending) {
    const fork = latestBySource.get(w.documentId);
    const res = await workflows.updateOne(
      { id: w.id },
      {
        $set: {
          hasRedlineEdit: true,
          redlineEditedAt: new Date(fork.createdAt).toISOString(),
          redlineDocumentId: fork.id,
          redlineForked: true,
          updatedAt: new Date().toISOString(),
        },
      }
    );
    updated += res.modifiedCount;
  }

  console.log(`\n✅ Flagged ${updated} workflow(s) as redlined.`);
  await client.close();
})().catch((e) => { console.error('❌ Backfill failed:', e); process.exit(1); });
