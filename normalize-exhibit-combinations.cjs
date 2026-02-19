const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const exhibits = db.collection('exhibits');

  const mappings = [
    {
      from: 'google-my-drive-&-share-drive-to-google-my-drive-&-share-drive-',
      to: 'google-mydrive-to-google-sharedrive'
    },
    {
      from: 'google-my-drive-&-share-drive-to-google-my-drive-&-share-drive--included-advanced',
      to: 'google-mydrive-to-google-sharedrive'
    },
    {
      from: 'onedrive-sharepoint-included-advanced',
      to: 'onedrive-to-sharepoint'
    },
    {
      from: 'onedrive-sharepoint-notincluded-advanced',
      to: 'onedrive-to-sharepoint'
    },
    {
      from: 'outlook-to-outlook-included-standard',
      to: 'outlook-to-outlook'
    },
    {
      from: 'outlook-to-outlook-notincluded-standard',
      to: 'outlook-to-outlook'
    },
    {
      from: 'testingggg-to-productionnn-basic',
      to: 'testing-to-production'
    }
  ];

  let updated = 0;
  let deleted = 0;

  for (const map of mappings) {
    const docs = await exhibits.find({ combinations: map.from }).toArray();
    for (const doc of docs) {
      const combos = Array.isArray(doc.combinations) ? doc.combinations : [];
      const next = combos.map((c) => (c === map.from ? map.to : c));
      const deduped = Array.from(new Set(next));
      await exhibits.updateOne(
        { _id: doc._id },
        {
          $set: {
            combinations: deduped,
            updatedAt: new Date()
          }
        }
      );
      updated += 1;
      console.log(`✅ Updated ${doc._id.toString()}: ${map.from} -> ${map.to}`);
    }
  }

  // Per approval: remove malformed teams-to-teams combo records
  const deleteQuery = {
    combinations: { $in: ['teams-to-teams-included-advanced', 'teams-to-teams-notincluded-advanced'] }
  };
  const toDelete = await exhibits.find(deleteQuery).project({ _id: 1 }).toArray();
  if (toDelete.length > 0) {
    const ids = toDelete.map((d) => new ObjectId(d._id));
    const res = await exhibits.deleteMany({ _id: { $in: ids } });
    deleted = res.deletedCount || 0;
    console.log(`🗑️ Deleted malformed teams-to-teams records: ${deleted}`);
  } else {
    console.log('ℹ️ No malformed teams-to-teams records found to delete.');
  }

  console.log(`\nDone. Updated: ${updated}, Deleted: ${deleted}`);
  await client.close();
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});

