/**
 * Read-only diagnostic: dumps planType / includeType / combinations / category
 * for the 4 Google MyDrive to Box exhibits, so we can see what's actually stored
 * vs. what the agreement generator expects.
 *
 * Usage: node scripts/inspect-google-mydrive-to-box-exhibits.cjs
 */
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'cpq_database';
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const docs = await db.collection('exhibits')
    .find({ name: { $regex: /Google MyDrive to Box/i } })
    .project({ _id: 1, name: 1, fileName: 1, category: 1, planType: 1, includeType: 1, combinations: 1, updatedAt: 1 })
    .sort({ name: 1 })
    .toArray();

  console.log(`Found ${docs.length} exhibit(s) matching /Google MyDrive to Box/i\n`);
  for (const d of docs) {
    console.log('---');
    console.log('  _id          :', d._id.toString());
    console.log('  name         :', d.name);
    console.log('  fileName     :', d.fileName);
    console.log('  category     :', d.category);
    console.log('  planType     :', JSON.stringify(d.planType));
    console.log('  includeType  :', JSON.stringify(d.includeType));
    console.log('  combinations :', JSON.stringify(d.combinations));
    console.log('  updatedAt    :', d.updatedAt);
  }

  await client.close();
})().catch(err => { console.error('FATAL:', err); process.exit(1); });
