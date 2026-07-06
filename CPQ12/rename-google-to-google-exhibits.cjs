const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

const renames = [
  {
    oldName: 'Google My Drive & SharedDrive to Google My Drive & SharedDrive std Inscope',
    newName: 'Google My Drive & SharedDrive to Google My Drive & SharedDrive - Standard Plan - Standard Include',
  },
  {
    oldName: 'Google My Drive & SharedDrive to Google My Drive & SharedDrive std Outscope',
    newName: 'Google My Drive & SharedDrive to Google My Drive & SharedDrive - Standard Plan - Standard Not Include',
  },
  {
    oldName: 'Google My Drive & SharedDrive to Google My Drive & SharedDrive adv Inscope',
    newName: 'Google My Drive & SharedDrive to Google My Drive & SharedDrive - Advanced Plan - Advanced Include',
  },
  {
    oldName: 'Google My Drive & SharedDrive to Google My Drive & SharedDrive adv outscope',
    newName: 'Google My Drive & SharedDrive to Google My Drive & SharedDrive - Advanced Plan - Advanced Not Include',
  },
];

async function run() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    const col = client.db(DB_NAME).collection('exhibits');

    for (const { oldName, newName } of renames) {
      const result = await col.updateOne({ name: oldName }, { $set: { name: newName } });
      if (result.matchedCount === 0) {
        console.warn(`⚠️  Not found in DB: ${oldName}`);
      } else {
        console.log(`✅ Renamed: "${oldName}"\n       → "${newName}"`);
      }
    }

    console.log('\n✨ Done renaming Google-to-Google exhibits.');
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
