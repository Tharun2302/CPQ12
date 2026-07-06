const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const combos = await db.collection('combinations').find({}).toArray();
  const exhibits = await db.collection('exhibits').find({}).toArray();

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         COMBINATION PLANS ANALYSIS                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`📊 DATABASE COMBINATIONS: ${combos.length} total\n`);

  // Group by migration type
  const byType = {};
  combos.forEach(c => {
    const type = c.migrationType || 'unknown';
    if (!byType[type]) byType[type] = [];
    byType[type].push(c);
  });

  for (const [type, items] of Object.entries(byType).sort()) {
    console.log(`\n🏷️  ${type.toUpperCase()}`);
    console.log(`   Count: ${items.length}`);
    items.slice(0, 5).forEach(c => {
      console.log(`   - ${c.value}`);
    });
    if (items.length > 5) console.log(`   ... and ${items.length - 5} more`);
  }

  console.log('\n\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         EXHIBITS PER COMBINATION                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Count exhibits per combination value
  const byCombo = {};
  exhibits.forEach(ex => {
    const exCombos = ex.combinations || ['all'];
    exCombos.forEach(c => {
      if (!byCombo[c]) byCombo[c] = 0;
      byCombo[c]++;
    });
  });

  const sorted = Object.entries(byCombo).sort((a, b) => b[1] - a[1]);
  console.log(`Total exhibit instances: ${exhibits.length}`);
  console.log(`Unique combination tags used: ${sorted.length}\n`);
  
  console.log('Top 15 most-used combinations:');
  sorted.slice(0, 15).forEach(([combo, count]) => {
    const inDropdown = combos.some(c => c.value === combo) ? '✓' : '✗';
    console.log(`  ${inDropdown} ${combo.padEnd(40)} ${count}× exhibits`);
  });

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
