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
  console.log('║        FIXING NFS TO GOOGLE MYDRIVE REMAINING EXHIBITS        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const fixes = [
    {
      id: '69609b347990d8f5a5ebe9b9',
      name: 'NFS to Google MyDrive Basic Plan - Basic Include',
      oldCombo: ['nfs-to-google', 'all'],
      newCombo: ['nfs-to-google-mydrive', 'all']
    },
    {
      id: '69609b347990d8f5a5ebe9ba',
      name: 'NFS to Google MyDrive Basic Plan - Basic Not Include',
      oldCombo: ['nfs-to-google', 'all'],
      newCombo: ['nfs-to-google-mydrive', 'all']
    },
    {
      id: '69609ce647c07139a4ebe4f8',
      name: 'NFS to Google MyDrive Standard Plan - Standard Not Include',
      oldCombo: ['nfs-to-google', 'all'],
      newCombo: ['nfs-to-google-mydrive', 'all']
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
        console.log(`   Changed: nfs-to-google → nfs-to-google-mydrive\n`);
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
