const { MongoClient } = require('mongodb');
const { seedDefaultExhibits } = require('./seed-exhibits.cjs');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function runSeed() {
  let client;
  
  try {
    console.log('🔍 Connecting to MongoDB...');
    
    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    console.log('✅ Connected to MongoDB successfully\n');

    // Run the seed function
    await seedDefaultExhibits(db);

    console.log('\n✨ Seeding completed successfully!');

  } catch (error) {
    console.error('❌ Error seeding exhibits:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Database connection closed.');
    }
  }
}

// Run the script
runSeed()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

