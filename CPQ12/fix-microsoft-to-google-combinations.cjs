const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function fixCombinations() {
  let client;

  try {
    console.log('🔍 Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB successfully\n');

    const exhibitsCollection = db.collection('exhibits');

    // Find all Microsoft To Google exhibits
    const microsoftExhibits = await exhibitsCollection.find({
      $or: [
        { combinations: { $elemMatch: { $regex: /^microsoft-to-google/ } } }
      ]
    }).toArray();

    console.log(`📋 Found ${microsoftExhibits.length} Microsoft To Google exhibits\n`);

    let updated = 0;

    for (const exhibit of microsoftExhibits) {
      const combinations = exhibit.combinations || [];
      const hasBaseCombination = combinations.some(c => c === 'microsoft-to-google');

      if (!hasBaseCombination) {
        console.log(`Updating: ${exhibit.name}`);
        console.log(`  Current combinations: ${JSON.stringify(combinations)}`);

        // Add 'microsoft-to-google' to combinations if not present
        const newCombinations = ['microsoft-to-google', ...combinations];

        await exhibitsCollection.updateOne(
          { _id: exhibit._id },
          { $set: { combinations: newCombinations } }
        );

        console.log(`  New combinations: ${JSON.stringify(newCombinations)}\n`);
        updated++;
      } else {
        console.log(`✓ ${exhibit.name} already has base combination\n`);
      }
    }

    console.log(`✅ Updated ${updated} exhibits with base combination 'microsoft-to-google'`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Database connection closed.');
    }
  }
}

fixCombinations()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
