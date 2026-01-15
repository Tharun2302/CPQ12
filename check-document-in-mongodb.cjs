/**
 * Diagnostic script to check if a document exists in MongoDB
 * Usage: node check-document-in-mongodb.cjs [documentId]
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

const documentId = process.argv[2] || 'RenovusAssociatesLLC_JasonWoods_09272';

async function checkDocument() {
  let client;
  
  try {
    console.log('🔍 Connecting to MongoDB...');
    console.log('📊 MongoDB URI:', MONGODB_URI.replace(/\/\/.*@/, '//***:***@'));
    console.log('📊 Database name:', DB_NAME);
    console.log('📄 Looking for document ID:', documentId);
    console.log('');
    
    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB successfully!\n');
    
    const db = client.db(DB_NAME);
    const documentsCollection = db.collection('documents');
    
    // Check if documents collection exists
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    if (!collectionNames.includes('documents')) {
      console.log('❌ "documents" collection does NOT exist');
      console.log('💡 No documents have been saved yet.');
      return;
    }
    
    console.log('✅ "documents" collection exists\n');
    
    // Count total documents
    const totalCount = await documentsCollection.countDocuments();
    console.log(`📊 Total documents in collection: ${totalCount}\n`);
    
    if (totalCount === 0) {
      console.log('⚠️  No documents found in the collection');
      return;
    }
    
    // Try exact match first
    console.log(`🔍 Searching for document with ID: "${documentId}"`);
    const exactMatch = await documentsCollection.findOne({ id: documentId });
    
    if (exactMatch) {
      console.log('✅ Document found with exact ID match!');
      console.log('\n📄 Document Details:');
      console.log('   ID:', exactMatch.id);
      console.log('   File Name:', exactMatch.fileName);
      console.log('   Client Name:', exactMatch.clientName);
      console.log('   Company:', exactMatch.company);
      console.log('   File Size:', exactMatch.fileSize, 'bytes');
      console.log('   Has fileData:', !!exactMatch.fileData);
      console.log('   Created At:', exactMatch.createdAt);
      console.log('   Status:', exactMatch.status);
      return;
    }
    
    console.log('❌ No exact match found\n');
    
    // Try case-insensitive search
    console.log('🔍 Trying case-insensitive search...');
    const allDocs = await documentsCollection.find({}).toArray();
    const caseInsensitiveMatch = allDocs.find(doc => 
      doc.id && doc.id.toLowerCase() === documentId.toLowerCase()
    );
    
    if (caseInsensitiveMatch) {
      console.log('⚠️  Found document with different case:');
      console.log('   Stored ID:', caseInsensitiveMatch.id);
      console.log('   Searched ID:', documentId);
      console.log('   File Name:', caseInsensitiveMatch.fileName);
      return;
    }
    
    // Try partial match (in case of timestamp differences)
    console.log('🔍 Trying partial match (checking for similar IDs)...');
    const baseId = documentId.split('_').slice(0, 2).join('_'); // Company_Client
    console.log('   Base ID (Company_Client):', baseId);
    
    const partialMatches = allDocs.filter(doc => 
      doc.id && doc.id.startsWith(baseId)
    );
    
    if (partialMatches.length > 0) {
      console.log(`\n⚠️  Found ${partialMatches.length} document(s) with similar ID pattern:`);
      partialMatches.forEach((doc, idx) => {
        console.log(`\n   ${idx + 1}. ID: ${doc.id}`);
        console.log(`      File Name: ${doc.fileName}`);
        console.log(`      Client: ${doc.clientName}`);
        console.log(`      Company: ${doc.company}`);
        console.log(`      Created: ${doc.createdAt}`);
      });
      return;
    }
    
    // Show all document IDs for reference
    console.log('\n📋 All document IDs in database:');
    const allIds = allDocs.map(doc => ({
      id: doc.id,
      clientName: doc.clientName,
      company: doc.company,
      createdAt: doc.createdAt
    }));
    
    if (allIds.length > 0) {
      console.log(`\n   Found ${allIds.length} document(s):\n`);
      allIds.slice(0, 20).forEach((doc, idx) => {
        console.log(`   ${idx + 1}. ${doc.id}`);
        console.log(`      Client: ${doc.clientName}, Company: ${doc.company}`);
      });
      if (allIds.length > 20) {
        console.log(`   ... and ${allIds.length - 20} more`);
      }
    } else {
      console.log('   No documents found');
    }
    
    // Check workflows collection for this document ID
    console.log('\n🔍 Checking approval_workflows collection...');
    const workflowsCollection = db.collection('approval_workflows');
    const workflowsWithThisDoc = await workflowsCollection.find({ 
      documentId: documentId 
    }).toArray();
    
    if (workflowsWithThisDoc.length > 0) {
      console.log(`\n✅ Found ${workflowsWithThisDoc.length} workflow(s) with this document ID:`);
      workflowsWithThisDoc.forEach((wf, idx) => {
        console.log(`\n   ${idx + 1}. Workflow ID: ${wf.id}`);
        console.log(`      Document ID: ${wf.documentId}`);
        console.log(`      Client: ${wf.clientName}`);
        console.log(`      Status: ${wf.status}`);
        console.log(`      Created: ${wf.createdAt}`);
      });
      console.log('\n⚠️  The workflow exists but the document is missing!');
      console.log('💡 This suggests the document was not saved when the workflow was created.');
    } else {
      console.log('❌ No workflows found with this document ID');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    if (client) {
      await client.close();
      console.log('\n✅ MongoDB connection closed');
    }
  }
}

checkDocument().catch(console.error);
