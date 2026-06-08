const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  FINDING EXHIBITS WITH SAME NAME BUT DIFFERENT COMBINATION TAGS ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const exhibits = await db.collection('exhibits').find({}).toArray();

  // Group by exhibit name prefix (e.g., "Box to Google MyDrive")
  const byNamePrefix = {};
  
  exhibits.forEach(ex => {
    // Extract the migration type (e.g., "Box to Google MyDrive" from "Box to Google MyDrive Basic Plan - Basic Include")
    const match = ex.name.match(/^(.+?)\s+(Basic|Standard|Advanced)\s+Plan/i);
    const prefix = match ? match[1].trim() : ex.name;
    
    if (!byNamePrefix[prefix]) {
      byNamePrefix[prefix] = [];
    }
    byNamePrefix[prefix].push({
      id: ex._id,
      fullName: ex.name,
      combos: JSON.stringify(ex.combinations || [])
    });
  });

  // Find prefixes where different exhibits have different combinations
  const inconsistencies = [];
  
  for (const [prefix, items] of Object.entries(byNamePrefix)) {
    const uniqueCombos = new Set(items.map(i => i.combos));
    
    // If exhibits with same prefix have different combination tags, it's an inconsistency
    if (uniqueCombos.size > 1 && items.length > 1) {
      inconsistencies.push({
        prefix,
        itemCount: items.length,
        uniqueComboCount: uniqueCombos.size,
        items
      });
    }
  }

  if (inconsistencies.length === 0) {
    console.log('✅ NO INCONSISTENCIES FOUND!\n');
    console.log('All exhibits with the same name prefix use consistent combination tags.\n');
  } else {
    console.log(`⚠️  Found ${inconsistencies.length} exhibit group(s) with inconsistent tags:\n`);
    
    inconsistencies.forEach((incon, idx) => {
      console.log(`${idx + 1}. "${incon.prefix}"`);
      console.log(`   Total exhibits: ${incon.itemCount}`);
      console.log(`   Different combination tags: ${incon.uniqueComboCount}\n`);
      
      incon.items.forEach(item => {
        console.log(`   - ${item.fullName}`);
        console.log(`     Tags: ${item.combos}`);
      });
      console.log();
    });
  }

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
