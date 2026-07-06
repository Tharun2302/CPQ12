const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function updateSlackExhibitNames() {
  let client;
  
  try {
    console.log('🔍 Connecting to MongoDB...');
    
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    console.log('✅ Connected to MongoDB successfully\n');

    const exhibitsCollection = db.collection('exhibits');
    
    // Update "Included Features" to "Basic Include"
    const result1 = await exhibitsCollection.updateOne(
      { 
        name: 'Slack to Teams Basic Plan - Included Features',
        fileName: 'slack-to-teams-basic-plan-included.docx'
      },
      {
        $set: {
          name: 'Slack to Teams Basic Plan - Basic Include',
          updatedAt: new Date()
        }
      }
    );

    // Update "Not Included Features" to "Basic Not Include"
    const result2 = await exhibitsCollection.updateOne(
      { 
        name: 'Slack to Teams Basic Plan - Not Included Features',
        fileName: 'slack-to-teams-basic-plan-notincluded.docx'
      },
      {
        $set: {
          name: 'Slack to Teams Basic Plan - Basic Not Include',
          updatedAt: new Date()
        }
      }
    );

    console.log('📋 Update Results:');
    console.log(`   ✅ Updated "Included Features" → "Basic Include": ${result1.modifiedCount} document(s)`);
    console.log(`   ✅ Updated "Not Included Features" → "Basic Not Include": ${result2.modifiedCount} document(s)\n`);

    // Verify the updates
    const updatedExhibits = await exhibitsCollection.find({
      fileName: { $in: ['slack-to-teams-basic-plan-included.docx', 'slack-to-teams-basic-plan-notincluded.docx'] }
    }).toArray();

    console.log('📋 Updated exhibits:');
    updatedExhibits.forEach((exhibit, index) => {
      console.log(`   ${index + 1}. ${exhibit.name}`);
    });

  } catch (error) {
    console.error('❌ Error updating exhibit names:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 Database connection closed.');
    }
  }
}

updateSlackExhibitNames()
  .then(() => {
    console.log('\n✅ Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
