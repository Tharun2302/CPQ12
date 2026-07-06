require('dotenv').config();
const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DATABASE || 'cpq_database';
(async () => {
  const c = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  console.time('connect');
  await c.connect();
  console.timeEnd('connect');
  const db = c.db(dbName);
  console.time('count');
  const n = await db.collection('esign_documents').estimatedDocumentCount();
  console.timeEnd('count');
  console.log('esign_documents estimated count:', n);
  console.time('find-no-sort');
  const a = await db.collection('esign_documents').find({}).limit(5).project({ _id: 1, file_name: 1, status: 1 }).toArray();
  console.timeEnd('find-no-sort');
  console.log('sample:', a.length, a.map(x => ({ id: String(x._id), file_name: x.file_name, status: x.status })));
  console.time('find-with-sort-limit5');
  const b = await db.collection('esign_documents').find({}).sort({ created_at: -1 }).limit(5).project({ _id: 1, file_name: 1 }).toArray();
  console.timeEnd('find-with-sort-limit5');
  console.log('sorted sample count:', b.length);
  console.time('find-all-toArray');
  try {
    const all = await db.collection('esign_documents').find({}).sort({ created_at: -1 }).toArray();
    console.timeEnd('find-all-toArray');
    console.log('total in collection:', all.length);
    const avgSize = all.length ? JSON.stringify(all).length / all.length : 0;
    console.log('avg doc JSON size bytes:', Math.round(avgSize));
  } catch (e) {
    console.timeEnd('find-all-toArray');
    console.log('full toArray failed:', e.message);
  }
  await c.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
