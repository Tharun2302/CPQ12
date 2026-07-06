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
        groupMap.get(key) ? groupMap.get(key).push(exhibit) : groupMap.set(key, [exhibit]);
      } else {
        groupMap.get(key).push(exhibit);
      }
    });
  });

  const duplicateGroups = [];
  for (const [key, items] of groupMap) {
    if (items.length > 1) {
      const [combo, plan, include] = key.split('|');
      duplicateGroups.push({
        combination: combo,
        plan,
        include,
        total: items.length,
        duplicates: items.length - 1
      });
    }
  }

  // Sort by duplicates descending
  duplicateGroups.sort((a, b) => b.duplicates - a.duplicates);

  console.log('\n================== COMBINATIONS WITH DUPLICATES ==================\n');
  console.log('Combination | Plan | Include | Total Count | Duplicates to Delete\n');
  console.log('-'.repeat(80));

  let totalDups = 0;
  duplicateGroups.forEach(group => {
    const combo = group.combination.padEnd(35);
    const plan = group.plan.padEnd(10);
    const include = group.include.padEnd(15);
    console.log(`${combo} | ${plan} | ${include} | ${group.total} | ${group.duplicates}`);
    totalDups += group.duplicates;
  });

  console.log('-'.repeat(80));
  console.log(`\n📊 TOTAL:`);
  console.log(`   Duplicate groups: ${duplicateGroups.length}`);
  console.log(`   Total records to delete: ${totalDups}\n`);

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
