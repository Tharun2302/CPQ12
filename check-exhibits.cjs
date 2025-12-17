const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function checkExhibits() {
  let client;
  
  try {
    console.log('🔍 Connecting to MongoDB...');
    
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    console.log('✅ Connected to MongoDB successfully\n');

    const exhibitsCollection = db.collection('exhibits');
    
    // Find all exhibits with "Compliance" in the name
    const complianceExhibits = await exhibitsCollection.find({
      $or: [
        { name: { $regex: /Compliance/i } },
        { fileName: { $regex: /compliance/i } },
        { name: { $regex: /MyDrive/i } },
        { name: { $regex: /NFS/i } }
      ]
    }).toArray();
    
    console.log(`📋 Found ${complianceExhibits.length} exhibit(s) with "Compliance", "MyDrive", or "NFS" in name:\n`);
    
    if (complianceExhibits.length === 0) {
      console.log('   No matching exhibits found.');
    } else {
      complianceExhibits.forEach((exhibit, index) => {
        console.log(`   ${index + 1}. ${exhibit.name}`);
        console.log(`      File: ${exhibit.fileName}`);
        console.log(`      Category: ${exhibit.category || 'N/A'}`);
        console.log(`      ID: ${exhibit._id}`);
        console.log('');
      });
    }

    // Also show all exhibits to see what's there
    const allExhibits = await exhibitsCollection.find({}).toArray();
    console.log(`\n📊 Total exhibits in database: ${allExhibits.length}`);
    console.log('\nAll exhibit names:');
    allExhibits.forEach((ex, i) => {
      console.log(`   ${i + 1}. ${ex.name} (${ex.category || 'N/A'})`);
    });

  } catch (error) {
    console.error('❌ Error checking exhibits:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 Database connection closed.');
    }
  }
}

checkExhibits()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
