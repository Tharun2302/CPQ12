const { MongoClient } = require('mongodb');

async function checkDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cpq12';

  console.log(`🔗 Attempting to connect to: ${mongoUri}\n`);

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    console.log('✅ Successfully connected to MongoDB!\n');

    const db = client.db('cpq12');

    // Check collections
    const collections = await db.listCollections().toArray();
    console.log(`📚 Collections in database: ${collections.length}`);
    collections.forEach(c => console.log(`   • ${c.name}`));

    // Count exhibits
    const exhibitsCollection = db.collection('exhibits');
    const count = await exhibitsCollection.countDocuments();
    console.log(`\n📄 Total exhibits: ${count}`);

    if (count > 0) {
      // Show some examples
      const samples = await exhibitsCollection.find().limit(5).toArray();
      console.log(`\n📋 Sample exhibits:`);
      samples.forEach(ex => {
        console.log(`   • ${ex.name} (ID: ${ex._id})`);
      });
    }

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    console.log('\n💡 Make sure MongoDB is running and the connection string is correct.');
  } finally {
    await client.close();
  }
}

checkDB().catch(console.error);
