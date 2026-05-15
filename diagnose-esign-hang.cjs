require('dotenv').config();
const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DATABASE || 'cpq_database';
(async () => {
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db(dbName);

  // Find the largest doc and report which field is heavy.
  const docs = await db.collection('esign_documents').find({}).toArray();
  docs.sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length);
  for (const d of docs.slice(0, 3)) {
    const total = JSON.stringify(d).length;
    const fieldSizes = Object.keys(d).map(k => ({
      field: k,
      bytes: JSON.stringify(d[k]).length,
      type: Array.isArray(d[k]) ? 'array' : typeof d[k]
    })).sort((a, b) => b.bytes - a.bytes);
    console.log('---');
    console.log('doc id:', String(d._id), 'file_name:', d.file_name, 'total bytes:', total);
    console.log('top fields:');
    for (const f of fieldSizes.slice(0, 8)) {
      console.log('  ', f.field.padEnd(28), f.type.padEnd(8), f.bytes, 'bytes');
    }
  }
  await c.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
