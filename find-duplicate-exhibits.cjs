const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log('\n================ DUPLICATE EXHIBITS TO DELETE ================\n');

  // Find the old OneDrive/SharePoint duplicates
  const duplicates = await db.collection('exhibits')
    .find({
      $or: [
        { fileName: "One drive _ Sharepoint  Inscope.docx" },
        { fileName: "OneDrive -SharePoint adv Included.docx" },
        { fileName: "OneDrive-SharePoint adv Not Included.docx" }
      ]
    })
    .project({
      _id: 1,
      name: 1,
      fileName: 1,
      combinations: 1,
      createdAt: 1,
      displayOrder: 1
    })
    .toArray();

  if (duplicates.length === 0) {
    console.log('✅ No duplicate records found!');
  } else {
    console.log(`Found ${duplicates.length} duplicate record(s) to DELETE:\n`);
    
    duplicates.forEach((record, i) => {
      console.log(`${i + 1}. DELETE THIS RECORD:`);
      console.log(`   MongoDB ID: ${record._id}`);
      console.log(`   Name: ${record.name}`);
      console.log(`   FileName: ${record.fileName}`);
      console.log(`   Combinations: ${JSON.stringify(record.combinations)}`);
      console.log(`   Created: ${record.createdAt}`);
      console.log(`   Display Order: ${record.displayOrder}`);
      console.log();
    });

    console.log('\n================ DELETE COMMAND ================\n');
    console.log('Run this in MongoDB to delete all duplicates:\n');
    console.log('db.exhibits.deleteMany({');
    console.log('  fileName: {');
    console.log('    $in: [');
    console.log('      "One drive _ Sharepoint  Inscope.docx",');
    console.log('      "OneDrive -SharePoint adv Included.docx",');
    console.log('      "OneDrive-SharePoint adv Not Included.docx"');
    console.log('    ]');
    console.log('  }');
    console.log('})');
    console.log();
  }

  await client.close();
})().catch(e => { console.error('❌ ERROR:', e.message); process.exit(1); });
