const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║         "MULTI-COMBINATION" EXHIBITS ANALYSIS                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Find exhibits tagged with "multi-combination"
  const multiExhibits = await db.collection('exhibits').find({
    combinations: 'multi-combination'
  }).toArray();

  console.log(`📋 Exhibits tagged with "multi-combination": ${multiExhibits.length}\n`);
  
  if (multiExhibits.length === 0) {
    console.log('❌ NO exhibits currently use this tag.\n');
  } else {
    multiExhibits.forEach((ex, i) => {
      console.log(`${i+1}. NAME: ${ex.name}`);
      console.log(`   ID: ${ex._id}`);
      console.log(`   COMBOS: ${(ex.combinations || []).join(' | ')}\n`);
    });
  }

  // Check the dropdown definition
  const comboDef = await db.collection('combinations').findOne({
    value: 'multi-combination'
  });

  console.log('📌 DROPDOWN DEFINITION:');
  if (comboDef) {
    console.log(`   Value: ${comboDef.value}`);
    console.log(`   Migration Type: ${comboDef.migrationType}`);
    console.log(`   Display: ${comboDef.displayName || '(not set)'}`);
  } else {
    console.log('   ❌ Not found in dropdown');
  }

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
