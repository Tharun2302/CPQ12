/**
 * MongoDB Documents Checker
 * Run this script to verify if PDFs are being saved to MongoDB
 * 
 * Usage: node check-mongodb-documents.cjs
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function checkDocuments() {
  let client;
  
  try {
    console.log('🔍 Connecting to MongoDB...');
    console.log('📊 MongoDB URI:', MONGODB_URI.replace(/\/\/.*@/, '//***:***@'));
    console.log('📊 Database name:', DB_NAME);
    console.log('');
    
    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB successfully!\n');
    
    const db = client.db(DB_NAME);
    
    // Check if documents collection exists
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    console.log('📋 Available collections:', collectionNames.join(', '));
    console.log('');
    
    if (!collectionNames.includes('documents')) {
      console.log('⚠️  "documents" collection does NOT exist yet');
      console.log('💡 This means no PDFs have been saved yet.');
      console.log('');
      console.log('📝 To save a PDF:');
      console.log('   1. Start your server: node server.cjs');
      console.log('   2. Open your app in browser');
      console.log('   3. Generate an agreement in Quote session');
      console.log('   4. Click the PDF button');
      console.log('   5. Run this script again to verify');
      return;
    }
    
    console.log('✅ "documents" collection exists!\n');
    
    // Get documents collection
    const documentsCollection = db.collection('documents');
    
    // Count total documents
    const totalCount = await documentsCollection.countDocuments();
    console.log('📊 Total documents in collection:', totalCount);
    console.log('');
    
    if (totalCount === 0) {
      console.log('⚠️  No documents found in the collection');
      console.log('💡 The collection exists but is empty.');
      console.log('');
      console.log('📝 To save a PDF:');
      console.log('   1. Make sure your server is running: node server.cjs');
      console.log('   2. Open your app in browser');
      console.log('   3. Generate an agreement in Quote session');
      console.log('   4. Click the PDF button');
      console.log('   5. Check browser console for "PDF saved to MongoDB" message');
      console.log('   6. Run this script again to verify');
      return;
    }
    
    console.log('✅ Found documents! Here are the details:\n');
    console.log('═'.repeat(80));
    
    // Get all documents
    const documents = await documentsCollection
      .find({})
      .sort({ generatedDate: -1 })
      .toArray();
    
    // Display each document
    documents.forEach((doc, index) => {
      console.log(`\n📄 Document ${index + 1}:`);
      console.log('   ID:', doc.id);
      console.log('   File Name:', doc.fileName);
      console.log('   Company:', doc.company);
      console.log('   Client Name:', doc.clientName);
      console.log('   Client Email:', doc.clientEmail);
      console.log('   Template:', doc.templateName);
      console.log('   Generated Date:', new Date(doc.generatedDate).toLocaleString());
      console.log('   File Size:', (doc.fileSize / 1024).toFixed(2), 'KB');
      
      if (doc.metadata) {
        console.log('   Metadata:');
        console.log('      Total Cost: $' + (doc.metadata.totalCost || 0).toFixed(2));
        console.log('      Duration:', doc.metadata.duration, 'months');
        console.log('      Migration Type:', doc.metadata.migrationType);
        console.log('      Number of Users:', doc.metadata.numberOfUsers);
      }
      
      console.log('   PDF Data:', doc.fileData ? `${(doc.fileData.length / 1024).toFixed(2)} KB (base64)` : 'N/A');
      console.log('─'.repeat(80));
    });
    
    console.log('\n✅ MongoDB documents check complete!');
    console.log(`\n📊 Summary: ${totalCount} PDF document(s) found in MongoDB\n`);
    
    // Show latest document details
    if (documents.length > 0) {
      const latest = documents[0];
      console.log('🆕 Latest Document:');
      console.log('   Company:', latest.company);
      console.log('   Generated:', new Date(latest.generatedDate).toLocaleString());
      console.log('   File:', latest.fileName);
    }
    
  } catch (error) {
    console.error('\n❌ Error connecting to MongoDB:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Make sure MongoDB is running');
    console.log('   2. Check your .env file has correct MONGODB_URI');
    console.log('   3. Verify MongoDB connection string is correct');
    console.log('   4. If using MongoDB Atlas, check network access settings');
    console.log('\n📝 Current configuration:');
    console.log('   MONGODB_URI:', MONGODB_URI);
    console.log('   DB_NAME:', DB_NAME);
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 MongoDB connection closed');
    }
  }
}

// Run the check
console.log('');
console.log('═'.repeat(80));
console.log('  📊 MONGODB DOCUMENTS CHECKER');
console.log('═'.repeat(80));
console.log('');

checkDocuments().catch(console.error);
