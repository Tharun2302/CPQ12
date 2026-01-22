const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function checkTestingToProductionExhibits() {
  let client;
  
  try {
    console.log('🔍 Connecting to MongoDB...');
    
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    console.log('✅ Connected to MongoDB successfully\n');

    const exhibitsCollection = db.collection('exhibits');
    
    // Find all exhibits with "testing-to-production" in combinations
    const testingExhibits = await exhibitsCollection.find({
      combinations: { $regex: /testing-to-production/i }
    }).toArray();
    
    console.log(`📋 Found ${testingExhibits.length} exhibit(s) with "testing-to-production" combination:\n`);
    
    if (testingExhibits.length === 0) {
      console.log('   No exhibits found with "testing-to-production" combination.');
      console.log('   You may need to upload exhibits with this combination first.\n');
    } else {
      testingExhibits.forEach((exhibit, index) => {
        console.log(`   ${index + 1}. ${exhibit.name}`);
        console.log(`      File: ${exhibit.fileName}`);
        console.log(`      Category: ${exhibit.category || 'N/A'}`);
        console.log(`      Combinations: ${exhibit.combinations?.join(', ') || 'N/A'}`);
        console.log(`      Plan Type: ${exhibit.planType || 'N/A'}`);
        console.log(`      Display Order: ${exhibit.displayOrder || 'N/A'}`);
        console.log(`      ID: ${exhibit._id}`);
        console.log('');
      });
      
      // Group by base combination
      console.log('\n📁 Grouped by base combination:');
      const grouped = {};
      testingExhibits.forEach(exhibit => {
        const primaryCombination = exhibit.combinations?.[0] || '';
        const base = primaryCombination.replace(/-(include|notinclude|included|notincluded|basic|standard|advanced)$/i, '');
        if (!grouped[base]) {
          grouped[base] = [];
        }
        grouped[base].push(exhibit);
      });
      
      Object.keys(grouped).forEach(base => {
        console.log(`\n   📂 ${base}:`);
        grouped[base].forEach(ex => {
          console.log(`      - ${ex.name} (${ex.combinations?.[0] || 'N/A'})`);
        });
      });
    }

    // Also check for similar names
    console.log('\n\n🔍 Checking for exhibits with "testing" or "production" in name...');
    const similarExhibits = await exhibitsCollection.find({
      $or: [
        { name: { $regex: /testing/i } },
        { name: { $regex: /production/i } },
        { fileName: { $regex: /testing/i } },
        { fileName: { $regex: /production/i } }
      ]
    }).toArray();
    
    if (similarExhibits.length > 0) {
      console.log(`\n📋 Found ${similarExhibits.length} exhibit(s) with "testing" or "production" in name:\n`);
      similarExhibits.forEach((exhibit, index) => {
        console.log(`   ${index + 1}. ${exhibit.name}`);
        console.log(`      File: ${exhibit.fileName}`);
        console.log(`      Combinations: ${exhibit.combinations?.join(', ') || 'N/A'}`);
        console.log('');
      });
    }

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

checkTestingToProductionExhibits()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
