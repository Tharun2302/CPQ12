const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function deleteOldShareFileExhibit() {
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

    // Find the old ShareFile exhibit (without "Advanced Plan" in the name)
    const exhibitsCollection = db.collection('exhibits');
    
    // Search for the exact exhibit name (without "Advanced Plan")
    const query = {
      name: 'ShareFile to Google Shared Drive - Not Included Features'
    };

    const exhibits = await exhibitsCollection.find(query).toArray();
    
    if (exhibits.length === 0) {
      console.log('ℹ️  No "ShareFile to Google Shared Drive - Not Included Features" exhibit found in the database.');
      return;
    }

    console.log(`\n📋 Found ${exhibits.length} exhibit(s):`);
    exhibits.forEach((exhibit, index) => {
      console.log(`   ${index + 1}. ${exhibit.name}`);
      console.log(`      File: ${exhibit.fileName}`);
      console.log(`      ID: ${exhibit._id}`);
      console.log(`      Category: ${exhibit.category || 'N/A'}`);
    });

    // Delete the exhibit
    const result = await exhibitsCollection.deleteMany(query);

    console.log(`\n✅ Successfully deleted ${result.deletedCount} exhibit(s) from the database.`);
    console.log('   The following exhibit has been removed:');
    console.log('   - ShareFile to Google Shared Drive - Not Included Features\n');

  } catch (error) {
    console.error('❌ Error deleting exhibit:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Database connection closed.');
    }
  }
}

// Run the script
deleteOldShareFileExhibit()
  .then(() => {
    console.log('✅ Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
