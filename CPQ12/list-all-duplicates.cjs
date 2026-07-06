const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const exhibits = await db.collection('exhibits').find({}).toArray();

  const groupMap = new Map();
  exhibits.forEach(exhibit => {
    const combos = exhibit.combinations || ['all'];
    const plan = exhibit.planType || '(none)';
    const include = exhibit.includeType || '(none)';

    combos.forEach(combo => {
      const key = `${combo}|${plan}|${include}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key).push(exhibit);
    });
  });

  const duplicateGroups = [];
  for (const [key, items] of groupMap) {
    if (items.length > 1) {
      const [combo, plan, include] = key.split('|');
      duplicateGroups.push({
        key,
        combination: combo,
        plan,
        include,
        exhibits: items
      });
    }
  }

  duplicateGroups.sort((a, b) => b.exhibits.length - a.exhibits.length);

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║        ALL COMBINATIONS WITH DUPLICATES - DETAILED LIST        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  let groupNum = 1;
  duplicateGroups.forEach(group => {
    console.log(`\n[${'='.repeat(65)}]`);
    console.log(`GROUP ${groupNum}: ${group.combination.toUpperCase()}`);
    console.log(`Plan: ${group.plan} | Include: ${group.include}`);
    console.log(`Total Exhibits: ${group.exhibits.length} (Duplicates: ${group.exhibits.length - 1})`);
    console.log(`${'='.repeat(65)}\n`);

    group.exhibits.forEach((ex, idx) => {
      console.log(`  ${idx + 1}. ${ex.name}`);
      console.log(`     ID: ${ex._id}`);
      console.log(`     File: ${ex.fileName}`);
      console.log(`     Combinations: ${JSON.stringify(ex.combinations)}`);
      console.log();
    });

    groupNum++;
  });

  console.log('\n' + '═'.repeat(65));
  console.log(`TOTAL DUPLICATE GROUPS: ${duplicateGroups.length}`);
  console.log('═'.repeat(65) + '\n');

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
