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

    // Find ALL ShareFile exhibits to see what exists
    const exhibitsCollection = db.collection('exhibits');
    
    const allShareFileExhibits = await exhibitsCollection.find({
      $or: [
        { name: { $regex: /ShareFile.*Google.*Shared.*Drive/i } },
        { fileName: { $regex: /sharefile.*sharedrive/i } }
      ]
    }).toArray();

    console.log(`\n📋 Found ${allShareFileExhibits.length} ShareFile exhibit(s) in database:`);
    allShareFileExhibits.forEach((exhibit, index) => {
      console.log(`   ${index + 1}. ${exhibit.name}`);
      console.log(`      File: ${exhibit.fileName}`);
      console.log(`      ID: ${exhibit._id}`);
      console.log(`      Category: ${exhibit.category || 'N/A'}`);
    });

    // Delete the old exhibit (without "Advanced Plan" in the name)
    const query = {
      name: 'ShareFile to Google Shared Drive - Not Included Features'
    };

    const result = await exhibitsCollection.deleteMany(query);

    console.log(`\n✅ Successfully deleted ${result.deletedCount} old exhibit(s) from the database.`);
    
    if (result.deletedCount > 0) {
      console.log('   The old "ShareFile to Google Shared Drive - Not Included Features" has been removed.');
    } else {
      console.log('   No old exhibit found to delete.');
    }

    // Verify what remains
    const remaining = await exhibitsCollection.find({
      $or: [
        { name: { $regex: /ShareFile.*Google.*Shared.*Drive/i } },
        { fileName: { $regex: /sharefile.*sharedrive/i } }
      ]
    }).toArray();

    console.log(`\n📋 Remaining ShareFile exhibits: ${remaining.length}`);
    remaining.forEach((exhibit, index) => {
      console.log(`   ${index + 1}. ${exhibit.name}`);
    });

  } catch (error) {
    console.error('❌ Error deleting exhibit:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 Database connection closed.');
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

