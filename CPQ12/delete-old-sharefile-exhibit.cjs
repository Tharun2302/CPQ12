const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function deleteOldShareFileExhibit() {
  let client;
  
  try {
    console.log('🔍 Connecting to MongoDB...');
    
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    console.log('✅ Connected to MongoDB successfully');

    // Find the old exhibit (without "Advanced Plan" in the name)
    const exhibitsCollection = db.collection('exhibits');
    
    // Search for the old exhibit - exact name match without "Advanced Plan"
    const query = {
      name: 'ShareFile to Google Shared Drive - Not Included Features'
    };

    const exhibits = await exhibitsCollection.find(query).toArray();
    
    if (exhibits.length === 0) {
      console.log('ℹ️  No old ShareFile exhibit found in the database.');
      return;
    }

    console.log(`\n📋 Found ${exhibits.length} old ShareFile exhibit(s):`);
    exhibits.forEach((exhibit, index) => {
      console.log(`   ${index + 1}. ${exhibit.name}`);
      console.log(`      File: ${exhibit.fileName}`);
      console.log(`      ID: ${exhibit._id}`);
      console.log(`      Category: ${exhibit.category || 'N/A'}`);
    });

    // Delete the old exhibit
    const result = await exhibitsCollection.deleteMany(query);

    console.log(`\n✅ Successfully deleted ${result.deletedCount} old exhibit(s) from the database.`);
    console.log('   The old "ShareFile to Google Shared Drive - Not Included Features" has been removed.\n');

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
    console.log('✨ Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

