/*
 * Audit: for every combination, is it calling the right exhibits?
 *
 * Mirrors the grouping logic in src/components/ExhibitSelector.tsx so we can
 * detect the real user-facing bug: a rendered folder (what the user clicks)
 * that contains exhibits belonging to MORE THAN ONE real combination.
 *
 * Read-only. No writes to the DB.
 */
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

// ---- Faithful port of extractBaseCombination (ExhibitSelector.tsx:371) ----
function extractBaseCombination(combination) {
  if (!combination || combination === 'all') return '';
  let base = combination.toLowerCase();

  if (base === 'dropbox-to-mydrive' || base.startsWith('dropbox-to-mydrive-')) {
    base = base.replace(/^dropbox-to-mydrive/, 'dropbox-to-google-mydrive');
  }
  if (
    base === 'box-to-google-mydrive-shareddrive' ||
    base.startsWith('box-to-google-mydrive-shareddrive-') ||
    base === 'box-to-google-sharedrive' ||
    base.startsWith('box-to-google-sharedrive-') ||
    base === 'box-to-google-mydrive-sharedrive' ||
    base.startsWith('box-to-google-mydrive-sharedrive-')
  ) {
    base = 'box-to-google-mydrive';
  }
  base = base.replace(/-(basic|standard|advanced|premium|enterprise|std)$/, '');
  base = base.replace(/-(included|include|notincluded|not-include|notinclude|excluded)$/, '');
  base = base
    .replace(/\//g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const parts = base.split('-').filter(Boolean);
  if (parts.length > 0 && parts.length % 2 === 0) {
    const half = parts.length / 2;
    const first = parts.slice(0, half).join('-');
    const second = parts.slice(half).join('-');
    if (first === second) base = first;
  }
  base = base.replace(/-+$/, '').trim();
  return base;
}

// ---- primaryCombination selection (ExhibitSelector.tsx:642-655) ----
function primaryCombinationFor(combos) {
  if (combos.includes('google-mydrive-to-google-mydrive') && combos.includes('google-mydrive-to-google-sharedrive')) {
    return 'google-mydrive-to-google';
  } else if (combos.includes('dropbox-to-google-sharedrive')) {
    return 'dropbox-to-google-sharedrive';
  } else if (combos.includes('dropbox-to-google-mydrive') && combos.includes('dropbox-to-mydrive')) {
    return 'dropbox-to-mydrive';
  }
  return combos[0];
}

function planOf(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('advanced')) return 'advanced';
  if (n.includes('standard') || /-std|_std|std$/.test(n)) return 'standard';
  if (n.includes('basic')) return 'basic';
  if (n.includes('premium')) return 'premium';
  if (n.includes('enterprise')) return 'enterprise';
  return '(none)';
}
function includeOf(name) {
  const n = (name || '').toLowerCase();
  if (/not\s*include|notinclude|not included/.test(n)) return 'NotInclude';
  if (/include|included/.test(n)) return 'Include';
  return '(none)';
}

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const exhibits = await db.collection('exhibits').find({}).toArray();
  const combinations = await db.collection('combinations').find({}).toArray();

  console.log(`\n================ COMBINATION → EXHIBIT AUDIT ================`);
  console.log(`Exhibits: ${exhibits.length} | Combinations (dropdown): ${combinations.length}\n`);

  // 1) Build the folder map exactly as the UI does (by base combination key)
  const folderToExhibits = new Map(); // folderKey -> [{name, tags, plan, inc}]
  for (const ex of exhibits) {
    const combos = ex.combinations && ex.combinations.length ? ex.combinations : ['all'];
    const primary = primaryCombinationFor(combos);
    const base = extractBaseCombination(primary);
    const key = base && base !== 'all' && base.length >= 3 ? base : `__namegroup__:${ex.name}`;
    if (!folderToExhibits.has(key)) folderToExhibits.set(key, []);
    folderToExhibits.get(key).push({
      name: ex.name,
      tags: combos,
      plan: ex.planType || planOf(ex.name),
      inc: ex.includeType || includeOf(ex.name),
    });
  }

  // 2) Flag folders that mix exhibits from >1 distinct real combination tag
  console.log(`---- (A) FOLDERS THAT MIX MULTIPLE COMBINATIONS (cross-contamination) ----`);
  let mixed = 0;
  for (const [key, items] of folderToExhibits) {
    const tagSet = new Set();
    items.forEach(it => it.tags.forEach(t => { if (t !== 'all') tagSet.add(t.toLowerCase()); }));
    // Collapse tags through the same base extractor: tags that resolve to the SAME base
    // are intentional merges (e.g. box-to-google variants). Only flag when the base
    // combos genuinely differ.
    const baseSet = new Set([...tagSet].map(extractBaseCombination).filter(Boolean));
    if (baseSet.size > 1) {
      mixed++;
      console.log(`\n  ⚠️  Folder "${key}" mixes ${baseSet.size} combinations: [${[...baseSet].join(', ')}]`);
      items.forEach(it => console.log(`        - ${it.name}  (tags: ${it.tags.join('|')})`));
    }
  }
  if (!mixed) console.log('  ✅ None. Every folder maps to a single underlying combination.');

  // 3) Per-combination completeness: each combination should have a clean
  //    plan × include matrix (Basic/Standard/Advanced × Include/NotInclude) OR
  //    a generic Include/NotInclude pair.
  console.log(`\n---- (B) PER-COMBINATION EXHIBIT BREAKDOWN ----`);
  const byTag = new Map();
  for (const ex of exhibits) {
    const combos = ex.combinations && ex.combinations.length ? ex.combinations : ['all'];
    combos.forEach(t => {
      const k = t.toLowerCase();
      if (!byTag.has(k)) byTag.set(k, []);
      byTag.get(k).push(ex);
    });
  }
  const dropdownValues = new Set(combinations.map(c => (c.value || '').toLowerCase()));
  const sortedTags = [...byTag.keys()].sort();
  const problems = [];
  for (const tag of sortedTags) {
    const list = byTag.get(tag);
    const matrix = {};
    list.forEach(ex => {
      const p = ex.planType || planOf(ex.name);
      const i = ex.includeType || includeOf(ex.name);
      const cell = `${p}/${i}`;
      matrix[cell] = (matrix[cell] || 0) + 1;
    });
    const inDropdown = dropdownValues.has(tag) ? '' : '  (NOT in dropdown)';
    const cells = Object.entries(matrix).map(([k, v]) => `${k}×${v}`).join('  ');
    console.log(`  • ${tag}  [${list.length} files]${inDropdown}\n        ${cells}`);
    // Detect duplicates (same plan+include appearing more than once = likely dup record)
    const dupCells = Object.entries(matrix).filter(([, v]) => v > 1);
    if (dupCells.length) problems.push(`${tag}: duplicate plan/include cells -> ${dupCells.map(([k, v]) => `${k}×${v}`).join(', ')}`);
    // Detect (none) plan/include = will break tier filtering
    if (matrix['(none)/(none)']) problems.push(`${tag}: ${matrix['(none)/(none)']} exhibit(s) with NO plan and NO include type (won't filter by tier)`);
  }

  // 4) Dropdown combinations that have ZERO exhibits
  console.log(`\n---- (C) DROPDOWN COMBINATIONS WITH NO MATCHING EXHIBITS ----`);
  let empty = 0;
  for (const c of combinations) {
    const v = (c.value || '').toLowerCase();
    if (!byTag.has(v)) {
      empty++;
      console.log(`  ❌ "${c.value}" (${c.migrationType}) — no exhibits tagged with this value`);
    }
  }
  if (!empty) console.log('  ✅ Every dropdown combination has at least one exhibit.');

  // 5) Summary of data-quality problems
  console.log(`\n---- (D) DATA-QUALITY PROBLEMS ----`);
  if (!problems.length) console.log('  ✅ No duplicate/untyped exhibit problems.');
  else problems.forEach(p => console.log(`  ⚠️  ${p}`));

  console.log(`\n================ END OF AUDIT ================\n`);
  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
