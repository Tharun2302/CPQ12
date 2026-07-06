/**
 * Resets the e-sign document linked to a specific approval workflow so that
 * "Proceed to e-Sign" opens fresh (add recipients) instead of showing old status.
 *
 * Usage (dry-run first, then execute):
 *   node scripts/reset-esign-for-workflow.cjs --esignId <esign_doc_id>
 *   node scripts/reset-esign-for-workflow.cjs --esignId <esign_doc_id> --execute
 *
 * Example:
 *   node scripts/reset-esign-for-workflow.cjs --esignId 69df5ec0fab9bc7a667ebdc5 --execute
 */
const path = require('path');
const fs   = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME     = process.env.DB_NAME || 'cpq_database';

// Parse --esignId <id> from args
const esignIdArg = (() => {
  const idx = process.argv.indexOf('--esignId');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();
const execute = process.argv.includes('--execute');

if (!esignIdArg) {
  console.error('Error: --esignId <id> is required.');
  console.error('Example: node scripts/reset-esign-for-workflow.cjs --esignId 69df5ec0fab9bc7a667ebdc5 --execute');
  process.exit(1);
}

// Match by string ID or ObjectId
function docIdFilter(id) {
  const filters = [{ document_id: id }];
  try { filters.push({ document_id: new ObjectId(id) }); } catch {}
  return { $or: filters };
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  try {
    const db = client.db(DB_NAME);

    // 1. Find the esign document
    const esignDoc = await db.collection('esign_documents').findOne({
      $or: [
        { _id: (() => { try { return new ObjectId(esignIdArg); } catch { return null; } })() },
        { id: esignIdArg }
      ].filter(Boolean)
    });

    // 2. Find the approval workflow that references this esign doc
    const workflow = await db.collection('approval_workflows').findOne({
      esignDocumentId: esignIdArg
    });

    // 3. Count recipients and signature fields
    const recipientCount  = await db.collection('esign_recipients').countDocuments(docIdFilter(esignIdArg));
    const sigFieldCount   = await db.collection('signature_fields').countDocuments(docIdFilter(esignIdArg));
    const secretCount     = await db.collection('esign_signature_secrets').countDocuments(docIdFilter(esignIdArg));

    // 4. Find uploaded file on disk
    const uploadsDir  = path.join(__dirname, '..', 'uploads', 'documents');
    const signedDir   = path.join(__dirname, '..', 'uploads', 'signed');
    const relatedFiles = [];
    for (const dir of [uploadsDir, signedDir]) {
      try {
        fs.readdirSync(dir)
          .filter(f => f.includes(esignIdArg))
          .forEach(f => relatedFiles.push(path.join(dir, f)));
      } catch {}
    }
    // Also check filename stored in DB
    if (esignDoc?.file_path) relatedFiles.push(esignDoc.file_path);
    if (esignDoc?.signed_file_path) relatedFiles.push(esignDoc.signed_file_path);
    const uniqueFiles = [...new Set(relatedFiles)].filter(f => { try { return fs.existsSync(f); } catch { return false; } });

    console.log('\n=== Dry run — what will be reset ===\n');
    console.log('E-sign document ID :', esignIdArg);
    console.log('Document found     :', esignDoc ? `Yes (status: ${esignDoc.status}, file: ${esignDoc.original_name || esignDoc.filename || 'unknown'})` : 'No');
    console.log('Linked workflow    :', workflow ? `${workflow.documentId} (${workflow.clientName})` : 'None found');
    console.log('Recipients to delete      :', recipientCount);
    console.log('Signature fields to delete:', sigFieldCount);
    console.log('Signature secrets to delete:', secretCount);
    console.log('Files to delete    :', uniqueFiles.length, uniqueFiles.map(f => path.basename(f)));

    if (!execute) {
      console.log('\n⚠️  Dry run — nothing changed.');
      console.log('   Add --execute to actually reset:\n');
      console.log(`   node scripts/reset-esign-for-workflow.cjs --esignId ${esignIdArg} --execute\n`);
      return;
    }

    // ── Execute ──────────────────────────────────────────────────────────

    // Delete esign document
    const delDoc = await db.collection('esign_documents').deleteOne({
      $or: [
        { _id: (() => { try { return new ObjectId(esignIdArg); } catch { return null; } })() },
        { id: esignIdArg }
      ].filter(Boolean)
    });
    console.log(`\n✅ esign_documents deleted: ${delDoc.deletedCount}`);

    // Delete recipients, signature fields, secrets
    const delR = await db.collection('esign_recipients').deleteMany(docIdFilter(esignIdArg));
    console.log(`✅ esign_recipients deleted: ${delR.deletedCount}`);

    const delS = await db.collection('signature_fields').deleteMany(docIdFilter(esignIdArg));
    console.log(`✅ signature_fields deleted: ${delS.deletedCount}`);

    const delSec = await db.collection('esign_signature_secrets').deleteMany(docIdFilter(esignIdArg));
    console.log(`✅ esign_signature_secrets deleted: ${delSec.deletedCount}`);

    // Clear esignDocumentId from the workflow
    if (workflow) {
      await db.collection('approval_workflows').updateOne(
        { _id: workflow._id },
        { $unset: { esignDocumentId: '' }, $set: { updatedAt: new Date().toISOString() } }
      );
      console.log(`✅ Cleared esignDocumentId from workflow: ${workflow.documentId}`);
    } else {
      console.log('⚠️  No linked workflow found — nothing to unset.');
    }

    // Delete files on disk
    for (const f of uniqueFiles) {
      try { fs.unlinkSync(f); console.log(`✅ Deleted file: ${path.basename(f)}`); }
      catch (e) { console.warn(`⚠️  Could not delete file ${f}: ${e.message}`); }
    }

    console.log('\n✅ Done. Click "Proceed to e-Sign" on the deal to start fresh.\n');
  } finally {
    await client.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
