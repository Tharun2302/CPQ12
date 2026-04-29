const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

const EXHIBITS_DIR = path.join(__dirname, 'backend-exhibits');

const exhibits = [
  {
    fileName: 'Google My Drive & SharedDrive to Google My Drive & SharedDrive std Inscope.docx',
    name: 'Google My Drive & SharedDrive to Google My Drive & SharedDrive std Inscope',
    planType: 'standard',
    includeType: 'included',
    displayOrder: 0,
  },
  {
    fileName: 'Google My Drive & SharedDrive to Google My Drive & SharedDrive std Outscope.docx',
    name: 'Google My Drive & SharedDrive to Google My Drive & SharedDrive std Outscope',
    planType: 'standard',
    includeType: 'notincluded',
    displayOrder: 1,
  },
  {
    fileName: 'Google My Drive & SharedDrive to Google My Drive & SharedDrive adv Inscope.docx',
    name: 'Google My Drive & SharedDrive to Google My Drive & SharedDrive adv Inscope',
    planType: 'advanced',
    includeType: 'included',
    displayOrder: 2,
  },
  {
    fileName: 'Google My Drive & SharedDrive to Google My Drive & SharedDrive adv outscope.docx',
    name: 'Google My Drive & SharedDrive to Google My Drive & SharedDrive adv outscope',
    planType: 'advanced',
    includeType: 'notincluded',
    displayOrder: 3,
  },
];

async function run() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    const db = client.db(DB_NAME);
    const col = db.collection('exhibits');

    for (const ex of exhibits) {
      const filePath = path.join(EXHIBITS_DIR, ex.fileName);
      if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        continue;
      }
      const fileData = fs.readFileSync(filePath).toString('base64');

      // Remove any existing exhibit with the same name to avoid duplicates
      const del = await col.deleteMany({ name: ex.name });
      if (del.deletedCount > 0) console.log(`🗑️  Removed ${del.deletedCount} existing exhibit(s): ${ex.name}`);

      await col.insertOne({
        name: ex.name,
        fileName: ex.fileName,
        combinations: ['google-to-google'],
        category: 'content',
        planType: ex.planType,
        includeType: ex.includeType,
        isRequired: false,
        displayOrder: ex.displayOrder,
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileData,
      });
      console.log(`✅ Inserted: ${ex.name}`);
    }

    console.log('\n✨ All 4 Google-to-Google exhibits inserted.');
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
