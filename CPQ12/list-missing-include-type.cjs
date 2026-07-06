const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.DB_NAME || 'cpq_database';

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const docs = await db.collection('exhibits')
    .find({
      $or: [
        { includeType: { $exists: false } },
        { includeType: '' },
        { includeType: null }
      ]
    })
    .project({ name: 1, fileName: 1, category: 1, combinations: 1, planType: 1, includeType: 1 })
    .toArray();

  console.log('missing_includeType_count', docs.length);
  docs.forEach((d, i) => {
    console.log(JSON.stringify({
      idx: i + 1,
      id: d._id.toString(),
      name: d.name || '',
      fileName: d.fileName || '',
      category: d.category || '',
      combinations: d.combinations || [],
      planType: d.planType || '',
      includeType: d.includeType || ''
    }));
  });

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

