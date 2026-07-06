const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function checkMicrosoftToGoogle() {
  let client;

  try {
    console.log('🔍 Connecting to MongoDB...');

    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    console.log('✅ Connected to MongoDB successfully\n');

    const exhibitsCollection = db.collection('exhibits');

    // Find all exhibits with "Microsoft" in the name
    const microsoftExhibits = await exhibitsCollection.find({
      $or: [
        { name: { $regex: /Microsoft/i } },
        { name: { $regex: /microsoft-to-google/i } },
        { combinations: { $elemMatch: { $regex: /microsoft-to-google/i } } }
      ]
    }).toArray();

    console.log(`📋 Found ${microsoftExhibits.length} exhibit(s) related to Microsoft To Google:\n`);

    if (microsoftExhibits.length === 0) {
      console.log('   No matching exhibits found.');
    } else {
      microsoftExhibits.forEach((exhibit, index) => {
        console.log(`${index + 1}. ${exhibit.name}`);
        console.log(`   Category: ${exhibit.category || 'N/A'}`);
        console.log(`   Plan Type: ${exhibit.planType || 'NOT SET'}`);
        console.log(`   Combinations: ${JSON.stringify(exhibit.combinations || [])}`);
        console.log(`   Include Type: ${exhibit.includeType || 'N/A'}`);
        console.log(`   ID: ${exhibit._id}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Error checking exhibits:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Database connection closed.');
    }
  }
}

checkMicrosoftToGoogle()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
