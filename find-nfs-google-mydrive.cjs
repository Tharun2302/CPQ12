const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log('\n📎 Searching for NFS to Google MyDrive exhibits...\n');

  const exhibits = await db.collection('exhibits')
    .find({ name: { $regex: /nfs.*google.*mydrive|google.*mydrive.*nfs/i } })
    .project({ _id: 1, name: 1, combinations: 1, createdAt: 1 })
    .toArray();

  console.log(`Found ${exhibits.length} exhibit(s):\n`);

  exhibits.forEach((ex, idx) => {
    console.log(`${idx + 1}. ${ex.name}`);
    console.log(`   ID: ${ex._id}`);
    console.log(`   Combinations: ${JSON.stringify(ex.combinations)}`);
    console.log(`   Created: ${ex.createdAt}`);
    console.log();
  });

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
