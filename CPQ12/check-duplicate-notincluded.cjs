const { MongoClient } = require('mongodb');

async function main() {
  const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cpq12';
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    const exhibits = await db.collection('exhibits').find({}).toArray();
    
    console.log('\n🔍 Checking for duplicate NOT INCLUDED exhibits...\n');
    
    const notIncludedExhibits = exhibits.filter(e => 
      e.includeType === 'notincluded' || 
      (e.name && e.name.toLowerCase().includes('not included'))
    );
    
    console.log(`Total "Not Included" exhibits: ${notIncludedExhibits.length}\n`);
    
    notIncludedExhibits.forEach(e => {
      console.log(`ID: ${e._id}`);
      console.log(`Name: ${e.name}`);
      console.log(`Combinations: ${e.combinations?.join(', ') || 'N/A'}`);
      console.log(`Include Type: ${e.includeType || 'undefined'}`);
      console.log(`Plan Type: ${e.planType || 'undefined'}`);
      console.log('---');
    });

    // Check for duplicates by name
    const nameMap = new Map();
    notIncludedExhibits.forEach(e => {
      const key = (e.name || '').toLowerCase();
      if (!nameMap.has(key)) nameMap.set(key, []);
      nameMap.get(key).push(e._id);
    });

    const duplicates = Array.from(nameMap.entries()).filter(([_, ids]) => ids.length > 1);
    if (duplicates.length > 0) {
      console.log('\n⚠️  DUPLICATES FOUND BY NAME:');
      duplicates.forEach(([name, ids]) => {
        console.log(`  Name: ${name}`);
        console.log(`  IDs: ${ids.join(', ')}`);
      });
    } else {
      console.log('\n✅ No duplicate "Not Included" exhibits found by name');
    }

  } finally {
    await client.close();
  }
}

main().catch(console.error);
