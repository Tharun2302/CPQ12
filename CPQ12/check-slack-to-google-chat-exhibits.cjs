const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function checkSlackToGoogleChat() {
  let client;
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    const exhibits = await db
      .collection('exhibits')
      .find({
        $or: [
          { name: { $regex: /Slack to Google Chat/i } },
          { fileName: { $regex: /Slack to Google Chat/i } },
          { combinations: 'slack-to-google-chat' },
        ],
      })
      .project({ fileData: 0 })
      .sort({ displayOrder: 1, name: 1 })
      .toArray();

    console.log(`Found ${exhibits.length} Slack -> Google Chat exhibit(s):`);
    for (const ex of exhibits) {
      console.log(`- ${ex.name}`);
      console.log(`  fileName: ${ex.fileName}`);
      console.log(`  category: ${ex.category}`);
      console.log(`  combinations: ${(ex.combinations || []).join(',')}`);
    }
  } finally {
    if (client) await client.close();
  }
}

checkSlackToGoogleChat()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });





