const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║    CHECKING FOR OTHER INCOMPLETE FIXES (Similar Pattern)      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const exhibits = await db.collection('exhibits').find({}).toArray();

  // Find exhibits with generic "nfs-to-google" or "dropbox-to-google" that should be more specific
  const problems = {};

  exhibits.forEach(ex => {
    const combos = ex.combinations || [];
    
    // Check for generic tags that should be more specific
    if (combos.includes('nfs-to-google') && !ex.name.toLowerCase().includes('shared')) {
      const key = 'nfs-to-google (should be nfs-to-google-mydrive)';
      problems[key] = (problems[key] || 0) + 1;
    }
    
    if (combos.includes('dropbox-to-google') && !ex.name.toLowerCase().includes('shared')) {
      const key = 'dropbox-to-google (should be more specific)';
      problems[key] = (problems[key] || 0) + 1;
    }
  });

  if (Object.keys(problems).length === 0) {
    console.log('✅ No other incomplete fixes found!\n');
  } else {
    console.log('⚠️  Found other potential issues:\n');
    for (const [key, count] of Object.entries(problems)) {
      console.log(`  ${count} exhibit(s): ${key}`);
    }
    console.log();
  }

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
