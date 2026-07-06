const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

function safeUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (e) {
    console.warn(`⚠️ Could not delete file: ${filePath}`, e.message || e);
  }
  return false;
}

async function deleteTeamsToTeamsData() {
  let client;
  try {
    console.log('🔍 Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    console.log('✅ Connected');

    const regexes = [/teams[-\s]*to[-\s]*teams/i, /teams\s*to\s*teams/i];

    const exhibitsQuery = {
      $or: [
        { name: { $regex: /teams\s*to\s*teams/i } },
        { fileName: { $regex: /teams[-\s]*to[-\s]*teams/i } },
        { combinations: 'teams-to-teams' }
      ]
    };

    const templatesQuery = {
      $or: [
        { name: { $regex: /teams\s*to\s*teams/i } },
        { fileName: { $regex: /teams[-\s]*to[-\s]*teams/i } },
        { combination: 'teams-to-teams' }
      ]
    };

    const exhibits = await db.collection('exhibits').find(exhibitsQuery).toArray();
    const templates = await db.collection('templates').find(templatesQuery).toArray();

    console.log(`📋 Found ${exhibits.length} exhibit(s), ${templates.length} template(s) to remove`);

    const exhibitsDeleted = await db.collection('exhibits').deleteMany(exhibitsQuery);
    const templatesDeleted = await db.collection('templates').deleteMany(templatesQuery);

    console.log(`✅ Deleted exhibits from DB: ${exhibitsDeleted.deletedCount}`);
    console.log(`✅ Deleted templates from DB: ${templatesDeleted.deletedCount}`);

    const backendExhibitsDir = path.resolve(__dirname, 'backend-exhibits');
    const backendTemplatesDir = path.resolve(__dirname, 'backend-templates');
    let deletedFiles = 0;

    if (fs.existsSync(backendExhibitsDir)) {
      for (const f of fs.readdirSync(backendExhibitsDir)) {
        if (regexes.some((r) => r.test(f))) {
          if (safeUnlink(path.join(backendExhibitsDir, f))) deletedFiles++;
        }
      }
    }

    if (fs.existsSync(backendTemplatesDir)) {
      for (const f of fs.readdirSync(backendTemplatesDir)) {
        if (regexes.some((r) => r.test(f))) {
          if (safeUnlink(path.join(backendTemplatesDir, f))) deletedFiles++;
        }
      }
    }

    console.log(`✅ Deleted local files: ${deletedFiles}`);
    console.log('🎉 Teams-to-Teams cleanup complete.');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exitCode = 1;
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 DB connection closed');
    }
  }
}

deleteTeamsToTeamsData();

