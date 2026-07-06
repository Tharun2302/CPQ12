/*
 * Restore the deleted "Slack to Teams Standard Plan - Standard Not Include" exhibit.
 * - Reads the .docx recovered from git into backend-exhibits/
 * - Inserts a DB record mirroring the existing "Standard Include" record
 * Idempotent: refuses to insert if a record with the same name already exists.
 */
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';
const FILE = path.join(__dirname, 'backend-exhibits', 'slack-to-teams-standard-plan-notincluded.docx');
const NAME = 'Slack to Teams Standard Plan - Standard Not Include';

(async () => {
  if (!fs.existsSync(FILE)) {
    console.error('❌ File not found:', FILE);
    process.exit(1);
  }
  const buf = fs.readFileSync(FILE);
  const fileData = buf.toString('base64');
  console.log(`📄 Read file: ${FILE} (${buf.length} bytes)`);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const col = db.collection('exhibits');

  const existing = await col.findOne({ name: NAME });
  if (existing) {
    console.log('ℹ️  Record already exists (_id=' + existing._id + '). Nothing inserted.');
    await client.close();
    return;
  }

  const now = new Date();
  const doc = {
    name: NAME,
    description: 'Documentation for features not included in Slack to Teams Standard Plan migration',
    fileName: 'slack-to-teams-standard-plan-notincluded.docx',
    combinations: ['slack-to-teams'],
    category: 'messaging',
    isRequired: false,
    displayOrder: 4,
    keywords: ['slack', 'teams', 'messaging', 'standard', 'not included', 'features', 'limitations'],
    fileData,
    fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileSize: buf.length,
    includeType: 'notincluded',
    planType: 'standard',
    createdAt: now,
    updatedAt: now,
  };

  const res = await col.insertOne(doc);
  console.log('✅ Inserted Standard Not-Include exhibit, _id=' + res.insertedId);

  // Verify the full slack-to-teams set now
  const all = await col.find({ combinations: 'slack-to-teams' }).sort({ displayOrder: 1 }).toArray();
  console.log('\nSlack to Teams now has ' + all.length + ' exhibits:');
  all.forEach(e => console.log('  ' + e.displayOrder + '. ' + e.name + '  [' + e.planType + '/' + e.includeType + ']'));

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
