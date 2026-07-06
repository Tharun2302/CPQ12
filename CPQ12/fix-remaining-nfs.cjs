const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const { ObjectId } = require('mongodb');

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          FIXING REMAINING NFS ONEDRIVE EXHIBITS               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const fixes = [
    {
      id: '695f7a1be1fead4fd516f226',
      name: 'NFS to OneDrive Basic Plan - Basic Include',
      oldCombo: ['nfs-to-microsoft', 'all'],
      newCombo: ['nfs-to-onedrive', 'all']
    },
    {
      id: '695f7a1be1fead4fd516f227',
      name: 'NFS to OneDrive Basic Plan - Basic Not Include',
      oldCombo: ['nfs-to-microsoft', 'all'],
      newCombo: ['nfs-to-onedrive', 'all']
    },
    {
      id: '6960fa898c5f6d11a5a61b7c',
      name: 'NFS to OneDrive Standard Plan - Standard Not Include',
      oldCombo: ['nfs-to-microsoft', 'all'],
      newCombo: ['nfs-to-onedrive', 'all']
    }
  ];

  console.log(`Fixing ${fixes.length} remaining exhibits...\n`);

  let updated = 0;

  for (const fix of fixes) {
    try {
      const result = await db.collection('exhibits').updateOne(
        { _id: new ObjectId(fix.id) },
        { $set: { combinations: fix.newCombo, updatedAt: new Date() } }
      );

      if (result.modifiedCount > 0) {
        console.log(`✅ ${fix.name}`);
        console.log(`   Old: ${JSON.stringify(fix.oldCombo)}`);
        console.log(`   New: ${JSON.stringify(fix.newCombo)}\n`);
        updated++;
      }
    } catch (error) {
      console.log(`❌ ${fix.name} - Error: ${error.message}\n`);
    }
  }

  console.log('═'.repeat(65));
  console.log(`\n✨ FIXED: ${updated}/${fixes.length} exhibits\n`);

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
