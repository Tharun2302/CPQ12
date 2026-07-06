/**
 * READ-ONLY diagnostic. Does NOT modify or delete anything.
 *
 * Scans the `documents` collection for entries whose stored fileData is missing
 * or not a valid PDF/DOCX (the "can't open this file" cause), then reports for
 * each whether it is linked to an approval workflow or an e-sign workflow.
 *
 *   - Approval link:  approval_workflows.documentId === doc.id
 *   - E-sign link:    esign_documents.source_document_id === doc.id
 *
 * Run:  node scripts/check-broken-docs-workflow.cjs
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'cpq_database';

// fileData may be a BSON Binary, a Node Buffer, or (older) a base64 string.
// Normalize to a Buffer, then check magic bytes: PDF = %PDF (25 50 44 46), DOCX/zip = PK (50 4B).
function toBuffer(fileData) {
  if (!fileData) return null;
  if (Buffer.isBuffer(fileData)) return fileData;
  // mongodb BSON Binary
  if (fileData.buffer && (Buffer.isBuffer(fileData.buffer) || fileData.buffer instanceof Uint8Array)) {
    return Buffer.from(fileData.buffer);
  }
  if (typeof fileData.value === 'function') {
    try { return Buffer.from(fileData.value(true)); } catch { /* ignore */ }
  }
  if (fileData.data) return Buffer.from(fileData.data);
  if (typeof fileData === 'string' && fileData.length > 0) {
    // could be base64
    try { return Buffer.from(fileData, 'base64'); } catch { return null; }
  }
  return null;
}

function classifyFileData(fileData) {
  const buf = toBuffer(fileData);
  if (!buf || buf.length === 0) return { ok: false, kind: 'MISSING', size: 0 };
  const h = buf.subarray(0, 4);
  if (h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46) return { ok: true, kind: 'PDF', size: buf.length };
  if (h[0] === 0x50 && h[1] === 0x4b) return { ok: true, kind: 'DOCX/ZIP', size: buf.length };
  return { ok: false, kind: 'CORRUPT/UNKNOWN', size: buf.length };
}

(async () => {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in .env');
    process.exit(1);
  }
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    console.log(`✅ Connected to ${DB_NAME}\n`);

    const docs = await db.collection('documents').find({}).toArray();
    console.log(`📚 Total documents: ${docs.length}\n`);

    const broken = [];
    for (const doc of docs) {
      const c = classifyFileData(doc.fileData);
      if (!c.ok) broken.push({ doc, c });
    }

    if (broken.length === 0) {
      console.log('🎉 No broken documents found — all have valid PDF/DOCX data.');
      return;
    }

    console.log(`⚠️  Found ${broken.length} broken document(s):\n`);
    console.log('='.repeat(90));

    for (const { doc, c } of broken) {
      const wf = await db.collection('approval_workflows').findOne({ documentId: doc.id });
      const esign = await db.collection('esign_documents').findOne({ source_document_id: doc.id });

      const inApproval = !!wf;
      const inEsign = !!esign;
      const safeToDelete = !inApproval && !inEsign;

      console.log(`\n📄 ${doc.company || '(no company)'}  —  ${doc.clientName || ''}`);
      console.log(`   id:            ${doc.id}`);
      console.log(`   fileName:      ${doc.fileName || '(none)'}`);
      console.log(`   fileData:      ${c.kind} (${c.size} chars)`);
      console.log(`   approval flow: ${inApproval ? `YES (status: ${wf.status || 'unknown'}, workflowId: ${wf.workflowId || wf._id})` : 'no'}`);
      console.log(`   e-sign flow:   ${inEsign ? `YES (status: ${esign.status || 'unknown'}, esignId: ${esign._id})` : 'no'}`);
      console.log(`   👉 VERDICT:    ${safeToDelete ? '✅ SAFE TO DELETE (not in any workflow)' : '⛔ IN A WORKFLOW — do NOT just delete; cancel workflow + regenerate'}`);
    }

    console.log('\n' + '='.repeat(90));
    const safe = [];
    const linked = [];
    for (const { doc } of broken) {
      const wf = await db.collection('approval_workflows').findOne({ documentId: doc.id });
      const esign = await db.collection('esign_documents').findOne({ source_document_id: doc.id });
      if (!wf && !esign) safe.push(doc.id); else linked.push(doc.id);
    }
    console.log(`\nSUMMARY: ${broken.length} broken — ${safe.length} safe to delete, ${linked.length} in a workflow (need recover/regenerate).`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
