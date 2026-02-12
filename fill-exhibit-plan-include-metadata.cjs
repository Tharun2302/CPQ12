const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

function inferPlan(exhibit) {
  const s = `${exhibit.planType || ''} ${exhibit.name || ''} ${exhibit.fileName || ''}`.toLowerCase();
  if (/\bbasic\b/.test(s)) return 'basic';
  if (/\b(standard|std)\b/.test(s)) return 'standard';
  if (/\badvanced\b/.test(s)) return 'advanced';
  if (/\bpremium\b/.test(s)) return 'premium';
  if (/\benterprise\b/.test(s)) return 'enterprise';
  return '';
}

function inferIncludeType(exhibit) {
  const s = `${exhibit.includeType || ''} ${exhibit.name || ''} ${exhibit.fileName || ''}`.toLowerCase();
  if (/not\s*-?\s*include(d)?|notincluded|excluded/.test(s)) return 'notincluded';
  if (/\bincluded\b|\binclude\b/.test(s)) return 'included';
  return '';
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const exhibits = db.collection('exhibits');

  const docs = await exhibits.find({}).project({
    name: 1, fileName: 1, planType: 1, includeType: 1
  }).toArray();

  let updated = 0;
  let updatedPlan = 0;
  let updatedInclude = 0;

  for (const doc of docs) {
    const currentPlan = (doc.planType || '').toString().toLowerCase().trim();
    const currentInclude = (doc.includeType || '').toString().toLowerCase().trim();
    const inferredPlan = inferPlan(doc);
    const inferredInclude = inferIncludeType(doc);

    const set = {};
    if (!currentPlan && inferredPlan) {
      set.planType = inferredPlan;
      updatedPlan++;
    }
    if (!currentInclude && inferredInclude) {
      set.includeType = inferredInclude;
      updatedInclude++;
    }

    if (Object.keys(set).length > 0) {
      set.updatedAt = new Date();
      await exhibits.updateOne({ _id: doc._id }, { $set: set });
      updated++;
    }
  }

  const remainingMissingPlan = await exhibits.countDocuments({
    $or: [{ planType: { $exists: false } }, { planType: '' }, { planType: null }]
  });
  const remainingMissingInclude = await exhibits.countDocuments({
    $or: [{ includeType: { $exists: false } }, { includeType: '' }, { includeType: null }]
  });

  console.log(`✅ Updated records: ${updated}`);
  console.log(`   - planType filled: ${updatedPlan}`);
  console.log(`   - includeType filled: ${updatedInclude}`);
  console.log(`📌 Remaining missing planType: ${remainingMissingPlan}`);
  console.log(`📌 Remaining missing includeType: ${remainingMissingInclude}`);

  await client.close();
}

main().catch((err) => {
  console.error('❌ Failed to fill exhibit metadata:', err);
  process.exit(1);
});

