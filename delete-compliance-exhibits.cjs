const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function deleteComplianceExhibits() {
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

    // Find the compliance exhibits to delete
    const exhibitsCollection = db.collection('exhibits');
    
    // Search for both compliance exhibits - using exact names found in database
    const query = {
      $or: [
        { name: 'Google MyDrive Compliance' },
        { name: 'NFS to Google MyDrive Compliance' },
        { fileName: 'exhibit-mydrive-to-mydrive-compliance.docx' },
        { fileName: 'exhibit-nfs-to-google-mydrive-compliance.docx' },
        { _id: { $in: ['693bacec3fcd1f596e7cfeb6', '693bc4b5282dead28fccfff5'].map(id => {
          try {
            return require('mongodb').ObjectId(id);
          } catch {
            return id;
          }
        }) } }
      ]
    };

    const exhibits = await exhibitsCollection.find(query).toArray();
    
    if (exhibits.length === 0) {
      console.log('ℹ️  No compliance exhibits found in the database.');
      return;
    }

    console.log(`\n📋 Found ${exhibits.length} compliance exhibit(s):`);
    exhibits.forEach((exhibit, index) => {
      console.log(`   ${index + 1}. ${exhibit.name}`);
      console.log(`      File: ${exhibit.fileName}`);
      console.log(`      ID: ${exhibit._id}`);
      console.log(`      Category: ${exhibit.category || 'N/A'}`);
    });

    // Delete all matching exhibits
    const result = await exhibitsCollection.deleteMany(query);

    console.log(`\n✅ Successfully deleted ${result.deletedCount} exhibit(s) from the database.`);
    console.log('   The following exhibits have been removed:');
    console.log('   - Google MyDrive Compliance');
    console.log('   - NFS to Google MyDrive Compliance\n');

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
deleteComplianceExhibits()
  .then(() => {
    console.log('✅ Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
