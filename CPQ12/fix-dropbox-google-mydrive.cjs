const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const { ObjectId } = require('mongodb');

  console.log('\n✅ FIXING FINAL ISSUE: Dropbox to Google MyDrive - Not Include\n');

  const result = await db.collection('exhibits').updateOne(
    { _id: new ObjectId('696a45415d18434d1b410b52') },
    { $set: { combinations: ['dropbox-to-google-mydrive', 'all'], updatedAt: new Date() } }
  );

  if (result.modifiedCount > 0) {
    console.log('✅ Fixed!');
    console.log('   Old: ["dropbox-to-mydrive","dropbox-to-google","all"]');
    console.log('   New: ["dropbox-to-google-mydrive","all"]\n');
  }

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
