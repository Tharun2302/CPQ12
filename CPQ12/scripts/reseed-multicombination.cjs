const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config();

// One-off: force-reseed ONLY the "Multi Combination" backend template from disk.
// The normal seeder (seed-templates.cjs) skips updates when the file mtime isn't
// newer than the DB copy, so this script bypasses that and always pushes the file.

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

const TEMPLATE_NAME = 'Multi Combination';
const FILE_NAME = 'MultiCombinations.docx';

(async () => {
  const filePath = path.join(__dirname, '..', 'backend-templates', FILE_NAME);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Template file not found: ${filePath}`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');
  const fileStats = fs.statSync(filePath);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const existing = await db.collection('templates').findOne({ name: TEMPLATE_NAME });

  if (existing) {
    const newVersion = +(((existing.version || 1) + 0.1).toFixed(1));
    await db.collection('templates').updateOne(
      { name: TEMPLATE_NAME },
      {
        $set: {
          fileName: FILE_NAME,
          fileData: base64Data,
          fileSize: fileBuffer.length,
          fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          lastModified: fileStats.mtime,
          updatedAt: new Date(),
          version: newVersion,
          status: 'active'
        }
      }
    );
    console.log(`✅ Reseeded "${TEMPLATE_NAME}" from ${FILE_NAME}`);
    console.log(`   Size: ${Math.round(fileBuffer.length / 1024)}KB | v${newVersion} | mtime ${fileStats.mtime.toLocaleString()}`);
  } else {
    const templateDoc = {
      id: `template-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      name: TEMPLATE_NAME,
      description: 'Universal template for Multi combination migrations (supports all combinations)',
      fileName: FILE_NAME,
      fileSize: fileBuffer.length,
      fileData: base64Data,
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      isDefault: false,
      category: 'multi',
      combination: 'multi-combination',
      planType: 'multi',
      keywords: ['multi', 'combination', 'universal', 'all'],
      createdAt: new Date(),
      lastModified: fileStats.mtime,
      uploadedBy: 'system-seed',
      status: 'active',
      version: 1.0
    };
    await db.collection('templates').insertOne(templateDoc);
    console.log(`✅ Inserted new "${TEMPLATE_NAME}" template from ${FILE_NAME} (${Math.round(fileBuffer.length / 1024)}KB)`);
  }

  await client.close();
})().catch(e => { console.error('❌ Reseed failed:', e); process.exit(1); });
