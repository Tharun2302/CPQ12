const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function findAndFixMismatches() {
  let client;

  try {
    console.log('🔍 Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB successfully\n');

    const exhibitsCollection = db.collection('exhibits');
    const allExhibits = await exhibitsCollection.find({}).toArray();

    console.log(`📊 Analyzing ${allExhibits.length} exhibits...\n`);

    // Group exhibits by their base combination
    const baseComboMap = new Map();

    for (const exhibit of allExhibits) {
      const combinations = exhibit.combinations || [];

      // Extract base combination from the detailed ones
      // e.g., "microsoft-to-google-included-basic" -> "microsoft-to-google"
      for (const combo of combinations) {
        if (combo === 'all') continue;

        // Try to extract the base combo by removing plan/include type suffixes
        let baseCombo = combo
          .replace(/-included-[^-]*$/, '')  // remove "-included-plan"
          .replace(/-notincluded-[^-]*$/, ''); // remove "-notincluded-plan"

        if (!baseComboMap.has(baseCombo)) {
          baseComboMap.set(baseCombo, []);
        }
        baseComboMap.get(baseCombo).push({
          name: exhibit.name,
          id: exhibit._id,
          currentCombos: combinations,
          hasBase: combinations.includes(baseCombo)
        });
      }
    }

    // Find base combinations that are missing in exhibits
    const problemCombos = [];
    for (const [baseCombo, exhibits] of baseComboMap) {
      const missingCount = exhibits.filter(e => !e.hasBase).length;
      if (missingCount > 0) {
        problemCombos.push({
          baseCombo,
          total: exhibits.length,
          missing: missingCount,
          exhibits: exhibits.filter(e => !e.hasBase)
        });
      }
    }

    if (problemCombos.length === 0) {
      console.log('✅ No mismatches found! All exhibits have their base combination.\n');
      return;
    }

    console.log(`⚠️  Found ${problemCombos.length} base combinations with mismatches:\n`);
    problemCombos.forEach(problem => {
      console.log(`   ${problem.baseCombo}: ${problem.missing}/${problem.total} missing base combo`);
    });

    console.log('\n🔧 Fixing mismatches...\n');

    let totalFixed = 0;
    for (const problem of problemCombos) {
      for (const exhibit of problem.exhibits) {
        const newCombos = [problem.baseCombo, ...exhibit.currentCombos];
        await exhibitsCollection.updateOne(
          { _id: exhibit.id },
          { $set: { combinations: newCombos } }
        );
        console.log(`   ✓ ${exhibit.name}`);
        totalFixed++;
      }
    }

    console.log(`\n✅ Fixed ${totalFixed} exhibits\n`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Database connection closed.');
    }
  }
}

findAndFixMismatches()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
