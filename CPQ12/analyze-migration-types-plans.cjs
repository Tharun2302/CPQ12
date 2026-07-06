const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

function planOf(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('advanced')) return 'advanced';
  if (n.includes('standard') || /-std|_std|std$/.test(n)) return 'standard';
  if (n.includes('basic')) return 'basic';
  return '(none)';
}

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const combos = await db.collection('combinations').find({}).toArray();
  const exhibits = await db.collection('exhibits').find({}).toArray();

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  PLAN TYPE BREAKDOWN BY MIGRATION TYPE                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Group combinations by migration type
  const byType = {};
  combos.forEach(c => {
    const type = c.migrationType || 'unknown';
    if (!byType[type]) byType[type] = [];
    byType[type].push(c.value);
  });

  // For each migration type, analyze its exhibits
  const results = [];

  for (const [migType, comboCodes] of Object.entries(byType).sort()) {
    // Find all exhibits tagged with any combination of this migration type
    const typeExhibits = exhibits.filter(ex => {
      const exCombos = ex.combinations || [];
      return exCombos.some(c => comboCodes.includes(c));
    });

    // Count plans
    const planCounts = {
      basic: 0,
      standard: 0,
      advanced: 0,
      none: 0
    };

    typeExhibits.forEach(ex => {
      const plan = planOf(ex.name);
      if (plan === 'basic') planCounts.basic++;
      else if (plan === 'standard') planCounts.standard++;
      else if (plan === 'advanced') planCounts.advanced++;
      else planCounts.none++;
    });

    results.push({
      type: migType,
      total: typeExhibits.length,
      combos: comboCodes.length,
      basic: planCounts.basic,
      standard: planCounts.standard,
      advanced: planCounts.advanced,
      none: planCounts.none
    });
  }

  // Display results
  console.log('Migration Type                   | Combos | Total | Basic | Std | Adv | None');
  console.log('─'.repeat(85));
  
  let totalBasic = 0, totalStd = 0, totalAdv = 0, totalNone = 0, totalAll = 0;

  results.forEach(r => {
    const typeLabel = r.type.padEnd(30);
    console.log(
      `${typeLabel} | ${String(r.combos).padStart(5)} | ${String(r.total).padStart(5)} | ${String(r.basic).padStart(5)} | ${String(r.standard).padStart(3)} | ${String(r.advanced).padStart(3)} | ${String(r.none).padStart(4)}`
    );
    totalBasic += r.basic;
    totalStd += r.standard;
    totalAdv += r.advanced;
    totalNone += r.none;
    totalAll += r.total;
  });

  console.log('─'.repeat(85));
  console.log(
    `${'TOTAL'.padEnd(30)} | ${String(combos.length).padStart(5)} | ${String(totalAll).padStart(5)} | ${String(totalBasic).padStart(5)} | ${String(totalStd).padStart(3)} | ${String(totalAdv).padStart(3)} | ${String(totalNone).padStart(4)}`
  );

  console.log('\n\n📊 COVERAGE ANALYSIS\n');
  
  // Which types have all 3 plans?
  const fullCoverage = results.filter(r => r.basic > 0 && r.standard > 0 && r.advanced > 0);
  const partialCoverage = results.filter(r => (r.basic > 0 || r.standard > 0 || r.advanced > 0) && !(r.basic > 0 && r.standard > 0 && r.advanced > 0));
  const noPlanCoverage = results.filter(r => r.basic === 0 && r.standard === 0 && r.advanced === 0);

  console.log(`✅ FULL COVERAGE (Basic + Standard + Advanced): ${fullCoverage.length}`);
  fullCoverage.forEach(r => console.log(`   - ${r.type}`));

  console.log(`\n⚠️  PARTIAL COVERAGE (Only some plans): ${partialCoverage.length}`);
  partialCoverage.forEach(r => {
    const plans = [];
    if (r.basic > 0) plans.push(`Basic(${r.basic})`);
    if (r.standard > 0) plans.push(`Standard(${r.standard})`);
    if (r.advanced > 0) plans.push(`Advanced(${r.advanced})`);
    console.log(`   - ${r.type.padEnd(28)} ${plans.join(', ')}`);
  });

  console.log(`\n❌ NO PLAN TYPES: ${noPlanCoverage.length}`);
  noPlanCoverage.forEach(r => console.log(`   - ${r.type} (${r.total} exhibits with no plan)`));

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
