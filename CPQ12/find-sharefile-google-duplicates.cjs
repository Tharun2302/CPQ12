const { MongoClient } = require('mongodb');

async function findShareFileGoogleDuplicates() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cpq12';
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db('cpq12');
    const exhibitsCollection = db.collection('exhibits');

    // Find all exhibits containing "ShareFile" and "Google"
    const sharefileGoogleExhibits = await exhibitsCollection
      .find({
        $and: [
          { name: { $regex: 'ShareFile', $options: 'i' } },
          { name: { $regex: 'Google', $options: 'i' } },
          { name: { $regex: 'Shared.?Drive|SharedDrive', $options: 'i' } }
        ]
      })
      .toArray();

    console.log(`\n📋 Found ${sharefileGoogleExhibits.length} ShareFile→Google Shared Drive exhibits:\n`);

    // Group by name to find duplicates
    const byName = new Map();
    sharefileGoogleExhibits.forEach(ex => {
      if (!byName.has(ex.name)) {
        byName.set(ex.name, []);
      }
      byName.get(ex.name).push(ex);
    });

    byName.forEach((exhibits, name) => {
      console.log(`\n📌 "${name}"`);
      console.log(`   Count: ${exhibits.length}`);
      exhibits.forEach((ex, i) => {
        console.log(`   [${i + 1}] ID: ${ex._id}`);
        console.log(`       fileName: ${ex.fileName}`);
        console.log(`       combinations: ${JSON.stringify(ex.combinations)}`);
        console.log(`       createdAt: ${ex.createdAt}`);
        console.log(`       updatedAt: ${ex.updatedAt}`);
      });
    });

    // Check for exhibits with "Shared Drive" (space) vs "SharedDrive" (no space)
    const withSpace = sharefileGoogleExhibits.filter(ex => ex.name.includes('Shared Drive'));
    const noSpace = sharefileGoogleExhibits.filter(ex => ex.name.includes('SharedDrive') && !ex.name.includes('Shared Drive'));

    console.log(`\n🔍 Summary:`);
    console.log(`   With space "Shared Drive": ${withSpace.length}`);
    console.log(`   No space "SharedDrive": ${noSpace.length}`);
    console.log(`   Total: ${sharefileGoogleExhibits.length}`);

    if (withSpace.length > 0 && noSpace.length > 0) {
      console.log(`\n⚠️  DUPLICATES FOUND - exhibits with both "Shared Drive" and "SharedDrive" naming exist!`);
      console.log(`    You likely want to remove the older "Shared Drive" variants (with space).`);
    }

  } finally {
    await client.close();
  }
}

findShareFileGoogleDuplicates().catch(console.error);
