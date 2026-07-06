const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   PLAN TYPE COVERAGE CHECK (Basic & Standard ONLY)            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  function planOf(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('advanced') || n.includes('premium') || n.includes('enterprise')) return 'advanced+';
    if (n.includes('standard') || /-std|_std|std$/.test(n)) return 'standard';
    if (n.includes('basic')) return 'basic';
    return '(none)';
  }

  const exhibits = await db.collection('exhibits').find({}).toArray();

  const planStats = { basic: 0, standard: 0, advanced: 0, none: 0 };
  const planTypeFieldStats = { basic: 0, standard: 0, advanced: 0, none: 0, empty: 0 };

  exhibits.forEach(ex => {
    // Count from exhibit name
    const plan = planOf(ex.name);
    if (plan === 'basic') planStats.basic++;
    else if (plan === 'standard') planStats.standard++;
    else if (plan === 'advanced+') planStats.advanced++;
    else planStats.none++;

    // Count from planType field
    if (ex.planType) {
      const pt = ex.planType.toLowerCase();
      if (pt === 'basic') planTypeFieldStats.basic++;
      else if (pt === 'standard') planTypeFieldStats.standard++;
      else if (pt === 'advanced') planTypeFieldStats.advanced++;
      else planTypeFieldStats.none++;
    } else {
      planTypeFieldStats.empty++;
    }
  });

  console.log('📊 FROM EXHIBIT NAME ANALYSIS:');
  console.log(`   Basic:     ${planStats.basic} ✓`);
  console.log(`   Standard:  ${planStats.standard} ✓`);
  console.log(`   Advanced:  ${planStats.advanced} ✗ (Should be 0)`);
  console.log(`   None:      ${planStats.none}`);
  console.log(`   Total:     ${exhibits.length}\n`);

  console.log('📊 FROM planType FIELD:');
  console.log(`   Basic:     ${planTypeFieldStats.basic} ✓`);
  console.log(`   Standard:  ${planTypeFieldStats.standard} ✓`);
  console.log(`   Advanced:  ${planTypeFieldStats.advanced} ✗ (Should be 0)`);
  console.log(`   Other:     ${planTypeFieldStats.none}`);
  console.log(`   Empty:     ${planTypeFieldStats.empty}`);
  console.log(`   Total:     ${exhibits.length}\n`);

  // Check pricing tiers in database
  const tiers = await db.collection('pricingTiers').find({}).toArray();
  console.log(`📋 PRICING TIERS IN DATABASE: ${tiers.length}`);
  tiers.forEach(t => {
    console.log(`   - ${t.name}`);
  });

  // Check combinations with Advanced exhibits
  if (planStats.advanced > 0) {
    console.log('\n⚠️  EXHIBITS WITH ADVANCED PLAN (MUST BE REMOVED):');
    const advancedExhibits = exhibits.filter(ex => planOf(ex.name) === 'advanced+');
    advancedExhibits.forEach(ex => {
      console.log(`   - ${ex.name} (ID: ${ex._id})`);
      console.log(`     Combos: ${(ex.combinations || []).join(' | ')}`);
    });
  } else {
    console.log('\n✅ NO ADVANCED EXHIBITS FOUND - CODE IS CLEAN!\n');
  }

  if (planTypeFieldStats.advanced > 0) {
    console.log('\n⚠️  planType FIELD SET TO "advanced" (${planTypeFieldStats.advanced}):');
    const advancedType = exhibits.filter(ex => ex.planType?.toLowerCase() === 'advanced');
    advancedType.forEach(ex => {
      console.log(`   - ${ex.name} (ID: ${ex._id}, planType: ${ex.planType})`);
    });
  }

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
