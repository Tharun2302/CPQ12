/**
 * Delete exhibit records from MongoDB by exact fileName(s)
 *
 * Usage:
 *   node delete-exhibits-by-filenames.cjs "File 1.docx" "File 2.docx"
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function main() {
  const fileNames = process.argv.slice(2).filter(Boolean);
  if (fileNames.length === 0) {
    console.error('❌ Please provide at least one fileName to delete.');
    console.error('   Example: node delete-exhibits-by-filenames.cjs "Some Exhibit.docx"');
    process.exit(1);
  }

  let client;
  try {
    console.log('🔍 Connecting to MongoDB...');
    console.log('📊 MongoDB config:', {
      uri: MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'),
      database: DB_NAME,
    });

    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    const exhibitsCollection = db.collection('exhibits');

    const query = { fileName: { $in: fileNames } };
    const exhibits = await exhibitsCollection.find(query).toArray();

    if (exhibits.length === 0) {
      console.log('ℹ️  No matching exhibits found for the provided fileName(s).');
      return;
    }

    console.log(`\n📋 Found ${exhibits.length} exhibit(s) to delete:`);
    exhibits.forEach((exhibit, index) => {
      console.log(`   ${index + 1}. ${exhibit.name}`);
      console.log(`      File: ${exhibit.fileName}`);
      console.log(`      ID: ${exhibit._id}`);
      console.log(`      Category: ${exhibit.category || 'N/A'}`);
    });

    const result = await exhibitsCollection.deleteMany(query);
    console.log(`\n✅ Successfully deleted ${result.deletedCount} exhibit(s) from the database.\n`);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Database connection closed.');
    }
  }
}

main()
  .then(() => {
    console.log('✨ Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });



