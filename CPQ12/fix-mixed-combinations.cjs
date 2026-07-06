const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const col = db.collection('exhibits');

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       FIX: REMOVE GENERIC TAGS FROM EXHIBITS                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const fixes = [
    // Problem 1: Dropbox to Google Shared Drive Basic variants - remove generic "dropbox-to-google"
    {
      name: 'Dropbox to Google Shared Drive Basic Plan - Basic Include',
      remove: 'dropbox-to-google',
      reason: 'This is SharedDrive specific, not generic dropbox-to-google'
    },
    {
      name: 'Dropbox to Google Shared Drive Basic Plan - Basic Not Include',
      remove: 'dropbox-to-google',
      reason: 'This is SharedDrive specific, not generic dropbox-to-google'
    },
    {
      name: 'Dropbox to Google Shared Drive Standard Plan - Standard Not Include',
      remove: 'dropbox-to-google',
      reason: 'This is SharedDrive specific, not generic dropbox-to-google'
    },
    // Problem 2: Dropbox to Google Drive (MyDrive & Shared Drive) - remove generic "dropbox-to-google"
    {
      name: 'Dropbox to Google Drive (MyDrive & Shared Drive) Standard Plan - Standard Not Include',
      remove: 'dropbox-to-google',
      reason: 'Has specific tags for both MyDrive and SharedDrive, generic tag not needed'
    },
  ];

  let fixedCount = 0;

  for (const fix of fixes) {
    const doc = await col.findOne({ name: fix.name });
    if (!doc) {
      console.log(`⚠️  NOT FOUND: "${fix.name}"`);
      continue;
    }

    const oldCombos = [...(doc.combinations || [])];
    const newCombos = oldCombos.filter(c => c !== fix.remove);

    if (JSON.stringify(oldCombos) === JSON.stringify(newCombos)) {
      console.log(`✓ SKIP: "${fix.name}" (${fix.remove} not in tags)`);
      continue;
    }

    await col.updateOne({ _id: doc._id }, { $set: { combinations: newCombos } });
    fixedCount++;

    console.log(`✓ FIXED: "${fix.name}"`);
    console.log(`         ${fix.reason}`);
    console.log(`         ${oldCombos.join('|')} → ${newCombos.join('|')}\n`);
  }

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`SUMMARY: Fixed ${fixedCount} exhibits\n`);

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
