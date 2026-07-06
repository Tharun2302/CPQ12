const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';
const fs = require('fs');
const path = require('path');

const ESIGN_ID = '69e93bc28a28c08611031603';

async function run() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    // 1. Look up the esign document
    const esignDoc = await db.collection('esign_documents').findOne({ _id: new ObjectId(ESIGN_ID) });
    console.log('\n=== esign_documents ===');
    if (!esignDoc) { console.log('NOT FOUND'); return; }
    console.log('file_name:', esignDoc.file_name);
    console.log('file_path:', esignDoc.file_path);
    console.log('signed_file_path:', esignDoc.signed_file_path);
    console.log('review_merged_file_path:', esignDoc.review_merged_file_path);
    console.log('upload_source:', esignDoc.upload_source);
    console.log('source_document_id:', esignDoc.source_document_id);
    console.log('status:', esignDoc.status);

    // 2. Check if disk files exist
    const paths = [esignDoc.signed_file_path, esignDoc.review_merged_file_path, esignDoc.file_path].filter(Boolean);
    console.log('\n=== Disk file existence ===');
    paths.forEach(p => console.log(p, '->', fs.existsSync(p) ? 'EXISTS' : 'MISSING'));

    // 3. Look up linked approval workflow
    console.log('\n=== approval_workflows (esignDocumentId) ===');
    const workflow = await db.collection('approval_workflows').findOne({ esignDocumentId: ESIGN_ID });
    if (!workflow) {
      console.log('No workflow found with esignDocumentId =', ESIGN_ID);
    } else {
      console.log('workflowId:', workflow.id);
      console.log('documentId:', workflow.documentId);
      console.log('status:', workflow.status);

      // 4. Check source document
      if (workflow.documentId) {
        console.log('\n=== documents (source) ===');
        const srcDoc = await db.collection('documents').findOne({ id: workflow.documentId });
        if (!srcDoc) {
          console.log('Source document NOT FOUND for id:', workflow.documentId);
        } else {
          console.log('id:', srcDoc.id);
          console.log('fileName:', srcDoc.fileName);
          console.log('fileData type:', typeof srcDoc.fileData);
          console.log('fileData length:', srcDoc.fileData ? String(srcDoc.fileData).length : 0);
        }
      }
    }

    // 5. Also check by file_name pattern in documents collection
    if (esignDoc.file_name) {
      const baseName = path.basename(esignDoc.file_name, '.pdf');
      console.log('\n=== documents (by fileName pattern) ===');
      const byName = await db.collection('documents').find({ fileName: { $regex: baseName.substring(0, 30), $options: 'i' } }).limit(3).toArray();
      byName.forEach(d => console.log('id:', d.id, '| fileName:', d.fileName, '| hasFileData:', !!d.fileData));
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.close();
  }
}

run();
