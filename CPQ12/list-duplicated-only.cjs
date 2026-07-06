const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const exhibits = await db.collection('exhibits').find({}).toArray();

  // Focus on GROUP 1: all | standard | included
  const group1Exhibits = exhibits.filter(ex => {
    const combos = ex.combinations || ['all'];
    const plan = ex.planType || '(none)';
    const include = ex.includeType || '(none)';
    return combos.includes('all') && plan === 'standard' && include === 'included';
  });

  // Duplicated combinations
  const duplicatedCombos = [
    'dropbox-to-mydrive',
    'dropbox-to-google',
    'dropbox-to-google-sharedrive',
    'sharefile-to-google-sharedrive',
    'nfs-to-microsoft',
    'nfs-to-google'
  ];

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║            DUPLICATED COMBINATIONS - DETAILED LIST             ║');
  console.log('║  GROUP 1: all | standard | included                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  duplicatedCombos.forEach((combo, idx) => {
    const exsWithCombo = group1Exhibits.filter(ex => 
      (ex.combinations || []).includes(combo)
    );

    console.log(`\n[${combo.toUpperCase()}]`);
    console.log(`Appears ${exsWithCombo.length} times:\n`);

    exsWithCombo.forEach((ex, i) => {
      console.log(`  ${i + 1}. ${ex.name}`);
      console.log(`     ID: ${ex._id}`);
      console.log(`     File: ${ex.fileName}`);
      console.log(`     Combinations: ${JSON.stringify(ex.combinations)}`);
      console.log();
    });

    console.log('-'.repeat(65));
  });

  console.log('\n');
  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
