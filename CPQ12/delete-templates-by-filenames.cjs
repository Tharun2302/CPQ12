/**
 * Delete template records from MongoDB by exact fileName(s) and/or combination.
 *
 * Default behavior (no args): deletes the Egnyte -> Microsoft templates that were removed from disk.
 *
 * Usage:
 *   node delete-templates-by-filenames.cjs "file1.docx" "file2.docx"
 *
 * Notes:
 * - Uses MONGODB_URI and DB_NAME from .env (falls back to localhost + cpq_database)
 * - Matches both `fileName` and legacy `file_name`
 * - Also deletes anything with combination === 'egnyte-to-microsoft' (safety)
 */
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function main() {
  const defaultEgnyteToMicrosoft = [
    'egnyte-to-microsoft-standard.docx',
    'egnyte-to-microsoft-advanced.docx',
  ];

  const fileNames = process.argv.slice(2).filter(Boolean);
  const effectiveFileNames = fileNames.length > 0 ? fileNames : defaultEgnyteToMicrosoft;

  let client;
  try {
    console.log('🔍 Connecting to MongoDB...');
    console.log('📊 MongoDB config:', {
      uri: MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'),
      database: DB_NAME,
    });

    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    const templatesCollection = db.collection('templates');

    const query = {
      $or: [
        { fileName: { $in: effectiveFileNames } },
        { file_name: { $in: effectiveFileNames } },
        { combination: 'egnyte-to-microsoft' },
      ],
    };

    const toDelete = await templatesCollection.find(query).toArray();

    if (toDelete.length === 0) {
      console.log('ℹ️  No matching templates found to delete.');
      console.log('   Checked fileName(s):', effectiveFileNames);
      console.log("   Checked combination: 'egnyte-to-microsoft'");
      return;
    }

    console.log(`\n📋 Found ${toDelete.length} template(s) to delete:`);
    toDelete.forEach((t, idx) => {
      console.log(`   ${idx + 1}. ${t.name || '(no name)'}`);
      console.log(`      id: ${t.id || '(no id)'}`);
      console.log(`      fileName: ${t.fileName || t.file_name || '(missing)'}`);
      console.log(`      combination: ${t.combination || '(missing)'}`);
      console.log(`      planType: ${t.planType || t.plan_type || '(missing)'}`);
    });

    const result = await templatesCollection.deleteMany(query);
    console.log(`\n✅ Successfully deleted ${result.deletedCount} template(s) from the database.\n`);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Database connection closed.');
    }
  }
}

main()
  .then(() => {
    console.log('✨ Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });


