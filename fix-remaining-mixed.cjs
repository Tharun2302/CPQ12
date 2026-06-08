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
  console.log('║   FIX: STANDARDIZE COMBINED MIGRATION EXHIBIT TAGS             ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const fixes = [
    // Fix "Dropbox to Google Drive (MyDrive & Shared Drive)" to use consistent combined tag
    {
      name: 'Dropbox to Google Drive (MyDrive & Shared Drive) Standard Plan - Standard Not Include',
      newCombos: ['dropbox-to-google-mydrive-and-sharedrive', 'all'],
      reason: 'Should use combined tag like Standard Include variant'
    },
    // Fix ShareFile (MyDrive & Shared Drive) to use consistent combined tag (if it exists)
    {
      name: 'ShareFile to Google Drive (MyDrive & Shared Drive) Basic Plan - Basic Include',
      newCombos: ['sharefile-to-google-mydrive-and-sharedrive', 'all'],
      reason: 'Combined migration should use combined tag, not mixed MyDrive/SharedDrive'
    },
    {
      name: 'ShareFile to Google Drive (MyDrive & Shared Drive) Basic Plan - Basic Not Include',
      newCombos: ['sharefile-to-google-mydrive-and-sharedrive', 'all'],
      reason: 'Combined migration should use combined tag, not mixed MyDrive/SharedDrive'
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
    
    await col.updateOne({ _id: doc._id }, { $set: { combinations: fix.newCombos } });
    fixedCount++;

    console.log(`✓ FIXED: "${fix.name}"`);
    console.log(`         ${fix.reason}`);
    console.log(`         ${oldCombos.join('|')} → ${fix.newCombos.join('|')}\n`);
  }

  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log(`SUMMARY: Fixed ${fixedCount} exhibits\n`);

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
