const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.DB_NAME || 'cpq_database';

function inferPlan(ex) {
  const s = `${ex.planType || ''} ${ex.name || ''} ${ex.fileName || ''}`.toLowerCase();
  if (/\bbasic\b/.test(s)) return 'basic';
  if (/\b(standard|std)\b/.test(s)) return 'standard';
  if (/\badvanced\b/.test(s)) return 'advanced';
  return '';
}

function inferIncludeType(ex) {
  const s = `${ex.includeType || ''} ${ex.name || ''} ${ex.fileName || ''}`.toLowerCase();
  if (/not\s*-?\s*include(d)?|notincluded|excluded/.test(s)) return 'notincluded';
  if (/\bincluded\b|\binclude\b/.test(s)) return 'included';
  return '';
}

function primaryCombo(ex) {
  const arr = Array.isArray(ex.combinations) ? ex.combinations : [];
  return (arr.find((x) => x && x !== 'all') || 'all').toString();
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const exhibits = await db.collection('exhibits')
    .find({})
    .project({ name: 1, fileName: 1, category: 1, combinations: 1, planType: 1, includeType: 1 })
    .toArray();

  const rows = [];
  for (const ex of exhibits) {
    const planType = (ex.planType || '').toString().toLowerCase();
    const includeType = (ex.includeType || '').toString().toLowerCase();
    const inferredPlan = inferPlan(ex);
    const inferredIncludeType = inferIncludeType(ex);
    const issues = [];

    if (!planType && inferredPlan) issues.push('missing_planType');
    if (!includeType && inferredIncludeType) issues.push('missing_includeType');
    if (planType && inferredPlan && planType !== inferredPlan) issues.push('planType_mismatch');
    if (includeType && inferredIncludeType && includeType !== inferredIncludeType) issues.push('includeType_mismatch');

    if (issues.length) {
      rows.push({
        id: ex._id.toString(),
        combo: primaryCombo(ex),
        category: ex.category || '',
        name: ex.name || '',
        fileName: ex.fileName || '',
        planType,
        includeType,
        inferredPlan,
        inferredIncludeType,
        issues: issues.join('|'),
        combinations: JSON.stringify(ex.combinations || [])
      });
    }
  }

  const byCombo = {};
  for (const r of rows) {
    if (!byCombo[r.combo]) byCombo[r.combo] = { count: 0, issues: {} };
    byCombo[r.combo].count += 1;
    for (const issue of r.issues.split('|')) {
      byCombo[r.combo].issues[issue] = (byCombo[r.combo].issues[issue] || 0) + 1;
    }
  }

  const summary = Object.entries(byCombo)
    .map(([combo, v]) => ({ combo, count: v.count, issues: v.issues }))
    .sort((a, b) => b.count - a.count);

  const outDir = path.resolve(__dirname, 'reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, 'exhibit-metadata-inconsistencies.json');
  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalExhibits: exhibits.length,
    totalInconsistent: rows.length,
    summary,
    rows
  }, null, 2));

  const csvPath = path.join(outDir, 'exhibit-metadata-inconsistencies.csv');
  const headers = [
    'id', 'combo', 'category', 'name', 'fileName',
    'planType', 'includeType', 'inferredPlan', 'inferredIncludeType',
    'issues', 'combinations'
  ];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))
  ].join('\n');
  fs.writeFileSync(csvPath, csv);

  console.log(`totalExhibits=${exhibits.length}`);
  console.log(`totalInconsistent=${rows.length}`);
  console.log(`json=${jsonPath}`);
  console.log(`csv=${csvPath}`);
  console.log('top20=');
  console.log(JSON.stringify(summary.slice(0, 20), null, 2));

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

