const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const exhibits = await db.collection('exhibits').find({
    name: /egnyte.*microsoft/i
  }).toArray();

  console.log(`\nFound ${exhibits.length} Egnyte to Microsoft exhibits:\n`);
  exhibits.forEach((ex, i) => {
    console.log(`${i+1}. NAME: ${ex.name}`);
    console.log(`   ID: ${ex._id}`);
    console.log(`   COMBOS: ${(ex.combinations || []).join(' | ')}\n`);
  });

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
