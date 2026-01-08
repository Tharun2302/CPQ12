const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function run() {
  const fileNamesToDelete = [
    'Egnyte to OneDrive for Business Advanced Plan - Advanced Include.docx',
    'Egnyte to OneDrive for Business Advanced Plan - Advanced Not Include.docx',
  ];

  let client;
  try {
    console.log('🔍 Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    console.log('🗑️ Deleting exhibits by fileName:', fileNamesToDelete);

    const result = await db.collection('exhibits').deleteMany({
      fileName: { $in: fileNamesToDelete },
    });

    console.log('✅ Deleted exhibits count:', result.deletedCount);
  } catch (err) {
    console.error('❌ Failed to delete exhibits:', err);
    process.exitCode = 1;
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Database connection closed.');
    }
  }
}

run();



