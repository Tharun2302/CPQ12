const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log('\n================ SCANNING FOR ALL DUPLICATE EXHIBITS ================\n');

  const exhibits = await db.collection('exhibits')
    .find({})
    .project({
      _id: 1,
      name: 1,
      fileName: 1,
      combinations: 1,
      planType: 1,
      includeType: 1,
      createdAt: 1,
      displayOrder: 1
    })
    .toArray();

  console.log(`📊 Total exhibits in database: ${exhibits.length}\n`);

  // Group by combination + plan + include to find duplicates
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

  // Find groups with more than 1 exhibit (those are duplicates)
  const duplicateGroups = [];
  for (const [key, exhibits] of groupMap) {
    if (exhibits.length > 1) {
      duplicateGroups.push({ key, exhibits });
    }
  }

  if (duplicateGroups.length === 0) {
    console.log('✅ No duplicates found!\n');
  } else {
    console.log(`⚠️  Found ${duplicateGroups.length} duplicate group(s):\n`);
    
    let totalDuplicates = 0;
    
    duplicateGroups.forEach((group, groupIdx) => {
      const [combo, plan, include] = group.key.split('|');
      console.log(`\n${'='.repeat(80)}`);
      console.log(`GROUP ${groupIdx + 1}: ${combo} | Plan: ${plan} | Include: ${include}`);
      console.log(`Count: ${group.exhibits.length} exhibits (${group.exhibits.length - 1} duplicates)`);
      console.log('='.repeat(80));
      
      group.exhibits.forEach((ex, idx) => {
        console.log(`\n  [${idx + 1}] ${ex.name}`);
        console.log(`      ID: ${ex._id}`);
        console.log(`      FileName: ${ex.fileName}`);
        console.log(`      Created: ${ex.createdAt}`);
        console.log(`      Display Order: ${ex.displayOrder}`);
        console.log(`      Combinations: ${JSON.stringify(ex.combinations)}`);
      });
      
      totalDuplicates += (group.exhibits.length - 1);
    });

    console.log(`\n${'='.repeat(80)}`);
    console.log(`\n📈 SUMMARY:`);
    console.log(`   Total duplicate groups: ${duplicateGroups.length}`);
    console.log(`   Total duplicate records: ${totalDuplicates}`);
    console.log(`   Records to keep: ${duplicateGroups.length}`);
    console.log(`   Records to DELETE: ${totalDuplicates}\n`);
  }

  await client.close();
})().catch(e => { console.error('❌ ERROR:', e.message); process.exit(1); });
