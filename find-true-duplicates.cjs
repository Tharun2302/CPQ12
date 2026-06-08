const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║              FINDING TRUE DUPLICATE EXHIBITS                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const exhibits = await db.collection('exhibits').find({}).toArray();

  // Focus on combinations with known duplicates
  const problemCombos = [
    'dropbox-to-mydrive',
    'google-mydrive-to-google-mydrive',
    'google-mydrive-to-google-sharedrive',
    'sharefile-to-google-mydrive',
    'sharefile-to-google-sharedrive',
    'teams-to-slack'
  ];

  function planOf(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('advanced')) return 'advanced';
    if (n.includes('standard') || /-std|_std|std$/.test(n)) return 'standard';
    if (n.includes('basic')) return 'basic';
    return '(none)';
  }
  function includeOf(name) {
    const n = (name || '').toLowerCase();
    if (/not\s*include|notinclude|not included/.test(n)) return 'notinclude';
    if (/include|included/.test(n)) return 'include';
    return '(none)';
  }

  for (const combo of problemCombos) {
    const exsForCombo = exhibits.filter(ex => {
      const combos = ex.combinations || [];
      return combos.some(c => c.toLowerCase() === combo.toLowerCase());
    });

    // Group by plan + include
    const byPlanInclude = {};
    exsForCombo.forEach(ex => {
      const plan = ex.planType || planOf(ex.name);
      const inc = ex.includeType || includeOf(ex.name);
      const key = `${plan}/${inc}`;
      if (!byPlanInclude[key]) byPlanInclude[key] = [];
      byPlanInclude[key].push(ex);
    });

    // Find duplicates
    const dups = Object.entries(byPlanInclude).filter(([, exs]) => exs.length > 1);
    if (!dups.length) continue;

    console.log(`\n⚠️  "${combo}"`);
    dups.forEach(([key, exs]) => {
      console.log(`   ${key} appears ${exs.length}×:`);
      exs.forEach((ex, i) => {
        console.log(`     ${i+1}. "${ex.name}" (ID: ${ex._id})`);
      });
    });
  }

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
