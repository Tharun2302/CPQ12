const { MongoClient } = require('mongodb');
const { seedDefaultTemplates } = require('./seed-templates.cjs');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function runSeed() {
  let client;

  try {
    console.log('🔍 Connecting to MongoDB...');

    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    console.log('✅ Connected to MongoDB successfully\n');

    await seedDefaultTemplates(db);

    console.log('\n✨ Template seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding templates:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Database connection closed.');
    }
  }
}

runSeed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });


