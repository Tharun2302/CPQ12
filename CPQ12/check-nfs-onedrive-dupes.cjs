const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         CHECKING FOR DUPLICATE NFS TO ONEDRIVE RECORDS        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const exhibits = await db.collection('exhibits')
    .find({ combinations: { $in: ['nfs-to-onedrive'] } })
    .project({ _id: 1, name: 1, fileName: 1, combinations: 1, createdAt: 1 })
    .toArray();

  console.log(`Found ${exhibits.length} exhibits with "nfs-to-onedrive" combination:\n`);

  exhibits.forEach((ex, idx) => {
    console.log(`${idx + 1}. ${ex.name}`);
    console.log(`   ID: ${ex._id}`);
    console.log(`   File: ${ex.fileName}`);
    console.log(`   Combinations: ${JSON.stringify(ex.combinations)}`);
    console.log(`   Created: ${ex.createdAt}`);
    console.log();
  });

  if (exhibits.length > 1) {
    console.log('⚠️  DUPLICATE FOUND! Both have the same combination tag.');
    console.log('    One should be deleted.\n');
  }

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
