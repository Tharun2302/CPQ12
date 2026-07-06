/**
 * Finds esign_documents with missing disk files and backfills file_data
 * from the documents collection by matching client name / date patterns.
 */
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';
const fs = require('fs');
const path = require('path');

async function run() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    // Get all esign docs that have no file_data and no signed_file_data
    const brokenDocs = await db.collection('esign_documents').find({
      file_data: { $exists: false },
      signed_file_data: { $exists: false },
    }).toArray();

    console.log(`Found ${brokenDocs.length} esign documents with no stored file data.\n`);

    for (const esignDoc of brokenDocs) {
      const id = esignDoc._id.toString();
      const fileName = esignDoc.file_name || '';

      // Check if disk files exist (skip if already accessible)
      const diskPaths = [esignDoc.signed_file_path, esignDoc.file_path].filter(Boolean);
      const diskOk = diskPaths.some(p => fs.existsSync(p));
      if (diskOk) {
        console.log(`[${id}] Disk OK — skipping`);
        continue;
      }

      console.log(`[${id}] Missing: ${fileName}`);

      // Try to find a matching document in the documents collection
      // Match by extracting client name from the agreement filename
      // Pattern: "agreement-{ClientName}-{...}-{date}.pdf"
      let sourceDoc = null;

      // Extract searchable parts from fileName
      const withoutExt = fileName.replace(/\.pdf$/i, '');
      const parts = withoutExt.replace(/^agreement-/i, '').split('-').filter(Boolean);
      // Use first 2-3 parts as search terms (usually client name)
      const searchTerms = parts.slice(0, 3).filter(p => p.length > 2 && !/^\d{4}$/.test(p));

      for (const term of searchTerms) {
        const candidates = await db.collection('documents').find({
          $or: [
            { fileName: { $regex: term, $options: 'i' } },
            { clientName: { $regex: term, $options: 'i' } },
            { id: { $regex: term, $options: 'i' } },
          ],
          fileData: { $exists: true }
        }).limit(5).toArray();

        if (candidates.length > 0) {
          // Pick the most recently created one
          sourceDoc = candidates.sort((a, b) => {
            const ta = new Date(a.createdAt || a.created_at || 0).getTime();
            const tb = new Date(b.createdAt || b.created_at || 0).getTime();
            return tb - ta;
          })[0];
          console.log(`  Matched via term "${term}": ${sourceDoc.id} — ${sourceDoc.fileName}`);
          break;
        }
      }

      if (!sourceDoc) {
        // Try approval_workflows link
        const workflow = await db.collection('approval_workflows').findOne({ esignDocumentId: id });
        if (workflow && workflow.documentId) {
          sourceDoc = await db.collection('documents').findOne({ id: workflow.documentId, fileData: { $exists: true } });
          if (sourceDoc) console.log(`  Matched via workflow: ${sourceDoc.id}`);
        }
      }

      if (sourceDoc && sourceDoc.fileData) {
        const fileDataStr = typeof sourceDoc.fileData === 'string'
          ? sourceDoc.fileData
          : Buffer.isBuffer(sourceDoc.fileData)
            ? sourceDoc.fileData.toString('base64')
            : Buffer.from(sourceDoc.fileData.buffer).toString('base64');

        await db.collection('esign_documents').updateOne(
          { _id: esignDoc._id },
          { $set: { file_data: fileDataStr, source_document_id: sourceDoc.id } }
        );
        console.log(`  ✅ Backfilled file_data (${Math.round(fileDataStr.length / 1024)} KB base64)`);
      } else {
        console.log(`  ⚠️  No source document found — cannot recover this file`);
      }
    }

    console.log('\nDone.');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.close();
  }
}

run();
