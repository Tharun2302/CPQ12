const { MongoClient } = require('mongodb');

async function listAllExhibits() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cpq12';
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db('cpq12');
    const exhibitsCollection = db.collection('exhibits');

    const count = await exhibitsCollection.countDocuments();
    console.log(`\n📊 Total exhibits in database: ${count}\n`);

    if (count === 0) {
      console.log('⚠️  Database is empty. Exhibits may not have been seeded yet.');
      return;
    }

    // Find all ShareFile exhibits
    const sharefileExhibits = await exhibitsCollection
      .find({ name: { $regex: 'ShareFile', $options: 'i' } })
      .sort({ name: 1 })
      .toArray();

    console.log(`📄 ShareFile exhibits (${sharefileExhibits.length}):\n`);
    sharefileExhibits.forEach(ex => {
      console.log(`• ${ex.name}`);
      console.log(`  ID: ${ex._id}`);
      console.log(`  Combinations: ${JSON.stringify(ex.combinations)}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
  }
}

listAllExhibits().catch(console.error);
