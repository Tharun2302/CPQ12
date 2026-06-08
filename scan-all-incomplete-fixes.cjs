const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║        COMPREHENSIVE SCAN - ALL COMBINATIONS WITH ISSUES       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const exhibits = await db.collection('exhibits').find({}).toArray();

  // Group exhibits by their primary combinations
  const comboMap = {};
  exhibits.forEach(ex => {
    const combos = ex.combinations || ['all'];
    combos.forEach(combo => {
      if (!comboMap[combo]) {
        comboMap[combo] = [];
      }
      comboMap[combo].push({
        id: ex._id,
        name: ex.name,
        combos: ex.combinations,
        plan: ex.planType || '(none)',
        include: ex.includeType || '(none)'
      });
    });
  });

  // Find problematic combinations
  const problems = [];
  
  for (const [combo, exs] of Object.entries(comboMap)) {
    // Skip generic "all"
    if (combo === 'all') continue;

    // Look for combinations that should be more specific
    // Pattern: A generic combination (like "nfs-to-google") should be split if there are more specific versions
    
    // Check if this generic combo has a more specific variant
    const hasMoreSpecificVariant = Object.keys(comboMap).some(key => 
      key.startsWith(combo + '-') || 
      (combo === 'nfs-to-google' && (key === 'nfs-to-google-mydrive' || key === 'nfs-to-google-sharedrive')) ||
      (combo === 'dropbox-to-google' && (key === 'dropbox-to-google-mydrive' || key === 'dropbox-to-google-sharedrive'))
    );

    if (hasMoreSpecificVariant) {
      // Check if all exhibits with this combo should actually have the more specific one
      const problemExs = exs.filter(ex => {
        const name = ex.name.toLowerCase();
        if (combo === 'nfs-to-google' && !name.includes('shared')) return true;
        if (combo === 'dropbox-to-google' && !name.includes('shared')) return true;
        if (combo === 'box-to-google-mydrive' && !name.includes('shared')) return true;
        if (combo === 'sharefile-to-google-mydrive' && !name.includes('shared')) return true;
        return false;
      });

      if (problemExs.length > 0) {
        problems.push({
          genericCombo: combo,
          count: problemExs.length,
          exhibits: problemExs
        });
      }
    }
  }

  console.log(`🔍 Found ${problems.length} combination(s) with incomplete fixes:\n`);

  problems.forEach((problem, idx) => {
    console.log(`${idx + 1}. COMBINATION: "${problem.genericCombo}"`);
    console.log(`   Exhibits with issue: ${problem.count}\n`);
    
    problem.exhibits.forEach((ex, i) => {
      console.log(`   ${i + 1}. ${ex.name}`);
      console.log(`      ID: ${ex.id}`);
      console.log(`      Current tags: ${JSON.stringify(ex.combos)}`);
    });
    console.log();
  });

  console.log('═'.repeat(65));
  console.log(`\nTotal issues found: ${problems.length}\n`);

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
