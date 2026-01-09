const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function deleteSlackToGoogleChatExhibits() {
  let client;

  try {
    console.log('🔍 Connecting to MongoDB...');
    console.log('📊 MongoDB config:', {
      uri: MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'), // Hide credentials
      database: DB_NAME,
    });

    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    console.log('✅ Connected to MongoDB successfully');

    const exhibitsCollection = db.collection('exhibits');

    const query = {
      $or: [
        { name: { $regex: /Slack to Google Chat/i } },
        { fileName: { $regex: /Slack to Google Chat/i } },
        { combinations: 'slack-to-google-chat' },
      ],
    };

    const exhibits = await exhibitsCollection.find(query).toArray();

    if (exhibits.length === 0) {
      console.log('ℹ️  No Slack to Google Chat exhibits found in the database.');
      return;
    }

    console.log(`\n📋 Found ${exhibits.length} Slack to Google Chat exhibit(s):`);
    exhibits.forEach((exhibit, index) => {
      console.log(`   ${index + 1}. ${exhibit.name}`);
      console.log(`      File: ${exhibit.fileName}`);
      console.log(`      ID: ${exhibit._id}`);
      console.log(`      Category: ${exhibit.category || 'N/A'}`);
    });

    const result = await exhibitsCollection.deleteMany(query);
    console.log(`\n✅ Successfully deleted ${result.deletedCount} exhibit(s) from the database.\n`);
  } catch (error) {
    console.error('❌ Error deleting exhibits:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Database connection closed.');
    }
  }
}

deleteSlackToGoogleChatExhibits()
  .then(() => {
    console.log('✨ Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });



