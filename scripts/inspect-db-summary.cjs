/**
 * Read-only DB inventory. Lists collections in cpq_database with:
 *   - document count
 *   - data size + storage size (avg per doc)
 *   - index count
 *   - newest updatedAt / createdAt observed
 *   - sample top-level keys from one document
 *
 * Usage: node scripts/inspect-db-summary.cjs
 *        node scripts/inspect-db-summary.cjs --keys     (also print sample keys)
 *        node scripts/inspect-db-summary.cjs --indexes  (also print index names)
 */
const { MongoClient } = require('mongodb');
require('dotenv').config();

const SHOW_KEYS = process.argv.includes('--keys');
const SHOW_INDEXES = process.argv.includes('--indexes');
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'cpq_database';
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

function fmtBytes(n) {
  if (n == null) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function pad(s, n) { return String(s).padEnd(n, ' '); }

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log(`MongoDB: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);
  console.log(`DB:      ${DB_NAME}\n`);

  try {
    const s = await db.stats();
    console.log('DB STATS');
    console.log(`  collections     : ${s.collections}`);
    console.log(`  documents       : ${s.objects?.toLocaleString?.() ?? s.objects}`);
    console.log(`  dataSize        : ${fmtBytes(s.dataSize)}`);
    console.log(`  storageSize     : ${fmtBytes(s.storageSize)}`);
    console.log(`  indexes         : ${s.indexes}`);
    console.log(`  indexSize       : ${fmtBytes(s.indexSize)}\n`);
  } catch (e) {
    console.warn(`  (db.stats failed: ${e.message})\n`);
  }

  const cols = await db.listCollections({}, { nameOnly: false }).toArray();
  cols.sort((a, b) => a.name.localeCompare(b.name));

  const rows = [];
  for (const col of cols) {
    if (col.type === 'view') {
      rows.push({ name: col.name, isView: true });
      continue;
    }
    const c = db.collection(col.name);
    let count = '-', dataSize = null, storageSize = null, indexes = '-', avgObjSize = null;
    try {
      const st = await db.command({ collStats: col.name });
      count = st.count?.toLocaleString?.() ?? st.count ?? '-';
      dataSize = st.size;
      storageSize = st.storageSize;
      indexes = st.nindexes;
      avgObjSize = st.avgObjSize;
    } catch (e) {
      // capped/system collection may refuse
    }
    let newest = null;
    try {
      const projection = { updatedAt: 1, createdAt: 1, _id: 1 };
      const a = await c.find({}, { projection }).sort({ updatedAt: -1, _id: -1 }).limit(1).toArray();
      newest = a[0]?.updatedAt || a[0]?.createdAt || a[0]?._id?.getTimestamp?.();
    } catch {}
    let sampleKeys = null, indexNames = null;
    if (SHOW_KEYS) {
      try {
        const one = await c.findOne({}, { projection: {} });
        if (one) sampleKeys = Object.keys(one);
      } catch {}
    }
    if (SHOW_INDEXES) {
      try {
        const ix = await c.indexes();
        indexNames = ix.map((i) => i.name);
      } catch {}
    }
    rows.push({ name: col.name, count, dataSize, storageSize, indexes, avgObjSize, newest, sampleKeys, indexNames });
  }

  console.log('COLLECTIONS');
  console.log(`  ${pad('name', 38)} ${pad('count', 10)} ${pad('data', 11)} ${pad('storage', 11)} ${pad('idx', 4)} ${pad('avg/doc', 10)}  newest`);
  for (const r of rows) {
    if (r.isView) {
      console.log(`  ${pad(r.name + '  [view]', 38)}`);
      continue;
    }
    const newestStr = r.newest ? new Date(r.newest).toISOString().slice(0, 19).replace('T', ' ') : '-';
    console.log(`  ${pad(r.name, 38)} ${pad(r.count, 10)} ${pad(fmtBytes(r.dataSize), 11)} ${pad(fmtBytes(r.storageSize), 11)} ${pad(r.indexes, 4)} ${pad(fmtBytes(r.avgObjSize), 10)}  ${newestStr}`);
    if (SHOW_KEYS && r.sampleKeys) {
      console.log(`     keys: ${r.sampleKeys.join(', ')}`);
    }
    if (SHOW_INDEXES && r.indexNames) {
      console.log(`     indexes: ${r.indexNames.join(', ')}`);
    }
  }

  await client.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
