const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = require('./scripts/lib/requireMongoUri.cjs')();
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     REMOVING ALL ADVANCED PLAN EXHIBITS                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Find all Advanced exhibits
  const advancedExhibits = await db.collection('exhibits').find({
    $or: [
      { name: /advanced/i },
      { planType: 'advanced' }
    ]
  }).toArray();

  console.log(`Found ${advancedExhibits.length} Advanced exhibits to remove:\n`);
  
  const idsToDelete = [];
  advancedExhibits.forEach(ex => {
    console.log(`- ${ex.name}`);
    console.log(`  ID: ${ex._id}`);
    console.log(`  planType: ${ex.planType || 'none'}\n`);
    idsToDelete.push(ex._id);
  });

  if (idsToDelete.length === 0) {
    console.log('✅ No Advanced exhibits found!\n');
  } else {
    // Delete them
    const result = await db.collection('exhibits').deleteMany({
      _id: { $in: idsToDelete }
    });

    console.log(`\n✅ DELETED: ${result.deletedCount} Advanced exhibits\n`);
  }

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
