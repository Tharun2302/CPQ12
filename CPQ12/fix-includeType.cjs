const { MongoClient } = require('mongodb');

async function main() {
  const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cpq12';
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('exhibits');
    
    console.log('\n🔧 Fixing missing includeType fields...\n');
    
    // Find exhibits with undefined or missing includeType
    const exhibits = await collection.find({}).toArray();
    
    let updateCount = 0;
    let alreadySet = 0;
    
    for (const exhibit of exhibits) {
      const hasValidIncludeType = exhibit.includeType === 'included' || exhibit.includeType === 'notincluded';
      
      if (hasValidIncludeType) {
        alreadySet++;
        continue;
      }
      
      // Infer includeType from the exhibit name
      const nameLower = (exhibit.name || '').toLowerCase();
      let inferredIncludeType = 'included'; // default
      
      if (nameLower.includes('not included') ||
          nameLower.includes('not include') ||
          nameLower.includes('notincluded') ||
          nameLower.includes('notinclude') ||
          nameLower.includes('not-include') ||
          nameLower.includes('not-included')) {
        inferredIncludeType = 'notincluded';
      }
      
      // Update the exhibit
      const result = await collection.updateOne(
        { _id: exhibit._id },
        { $set: { includeType: inferredIncludeType } }
      );
      
      if (result.modifiedCount > 0) {
        updateCount++;
        console.log(`✅ Updated: ${exhibit.name}`);
        console.log(`   Inferred includeType: ${inferredIncludeType}\n`);
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   Already had correct includeType: ${alreadySet}`);
    console.log(`   Fixed/Updated: ${updateCount}`);
    console.log(`   Total exhibits: ${exhibits.length}\n`);

  } finally {
    await client.close();
  }
}

main().catch(console.error);
