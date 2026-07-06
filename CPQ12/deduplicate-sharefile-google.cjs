const { MongoClient } = require('mongodb');

async function deduplicateShareFileGoogle() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cpq12';
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db('cpq12');
    const exhibitsCollection = db.collection('exhibits');

    console.log('🔍 Searching for ShareFile→Google Shared Drive duplicates...\n');

    // Find exhibits with "ShareFile" in name
    const allShareFileExhibits = await exhibitsCollection
      .find({ name: { $regex: 'ShareFile.*Google', $options: 'i' } })
      .sort({ name: 1, createdAt: 1 })
      .toArray();

    console.log(`📋 Found ${allShareFileExhibits.length} ShareFile→Google exhibits\n`);

    // Group by normalized name to find duplicates
    const groups = new Map();

    allShareFileExhibits.forEach(ex => {
      // Normalize name by removing spaces from "Shared Drive" -> "SharedDrive"
      const normalized = ex.name.replace(/Shared\s+Drive/gi, 'SharedDrive');

      if (!groups.has(normalized)) {
        groups.set(normalized, []);
      }
      groups.get(normalized).push(ex);
    });

    let deletedCount = 0;

    for (const [normalizedName, exhibits] of groups) {
      if (exhibits.length > 1) {
        console.log(`⚠️  Found ${exhibits.length} variants of: "${normalizedName}"`);

        // Show all variants
        exhibits.forEach((ex, i) => {
          console.log(`   [${i + 1}] ${ex.name}`);
          console.log(`       ID: ${ex._id}`);
          console.log(`       Created: ${ex.createdAt}`);
        });

        // Keep the newest (last in sorted list), delete older ones
        const toKeep = exhibits[exhibits.length - 1];
        const toDelete = exhibits.slice(0, -1);

        console.log(`   ✅ Keeping: "${toKeep.name}" (ID: ${toKeep._id})`);

        for (const ex of toDelete) {
          console.log(`   ❌ Deleting: "${ex.name}" (ID: ${ex._id})`);
          await exhibitsCollection.deleteOne({ _id: ex._id });
          deletedCount++;
        }

        console.log('');
      }
    }

    if (deletedCount > 0) {
      console.log(`\n✅ Successfully removed ${deletedCount} duplicate exhibit(s)`);

      // Clear cache if it exists
      console.log('🔄 You should restart the backend to clear the cache and reload exhibits.');
    } else {
      console.log('\n✅ No duplicates found - database is clean!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
  }
}

deduplicateShareFileGoogle().catch(console.error);
