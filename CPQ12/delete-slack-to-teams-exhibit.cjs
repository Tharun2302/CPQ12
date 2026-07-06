const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function deleteSlackToTeamsExhibits() {
  let client;
  
  try {
    console.log('🔍 Connecting to MongoDB...');
    console.log('📊 MongoDB config:', {
      uri: MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'), // Hide credentials
      database: DB_NAME
    });

    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    console.log('✅ Connected to MongoDB successfully');

    // Find all exhibits related to Slack to Teams
    const exhibitsCollection = db.collection('exhibits');
    
    // Search for exhibits with "Slack to Teams" in the name
    const query = {
      $or: [
        { name: { $regex: /Slack to Teams/i } },
        { fileName: { $regex: /slack-to-teams/i } },
        { combinations: 'slack-to-teams' }
      ]
    };

    const exhibits = await exhibitsCollection.find(query).toArray();
    
    if (exhibits.length === 0) {
      console.log('ℹ️  No Slack to Teams exhibits found in the database.');
      return;
    }

    console.log(`\n📋 Found ${exhibits.length} Slack to Teams exhibit(s):`);
    exhibits.forEach((exhibit, index) => {
      console.log(`   ${index + 1}. ${exhibit.name}`);
      console.log(`      File: ${exhibit.fileName}`);
      console.log(`      ID: ${exhibit._id}`);
      console.log(`      Category: ${exhibit.category || 'N/A'}`);
    });

    // Delete all matching exhibits
    const result = await exhibitsCollection.deleteMany(query);

    console.log(`\n✅ Successfully deleted ${result.deletedCount} exhibit(s) from the database.`);
    console.log('   You can now reupload the updated exhibit for Slack to Teams.\n');

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

// Run the script
deleteSlackToTeamsExhibits()
  .then(() => {
    console.log('✨ Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

