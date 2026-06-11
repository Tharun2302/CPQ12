const { MongoClient } = require('mongodb');

async function main() {
  const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cpq12';
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('exhibits');
    
    console.log('\n🔍 Checking Egnyte to SharePoint exhibits...\n');
    
    const exhibits = await collection.find({
      $or: [
        { combinations: { $in: ['egnyte-to-sharepoint-online', 'egnyte-to-sharepoint'] } },
        { name: { $regex: /egnyte.*sharepoint/i } }
      ]
    }).toArray();
    
    console.log(`Found ${exhibits.length} Egnyte to SharePoint exhibits:\n`);
    
    exhibits.forEach((e, idx) => {
      console.log(`${idx + 1}. ID: ${e._id}`);
      console.log(`   Name: ${e.name}`);
      console.log(`   IncludeType: ${e.includeType}`);
      console.log(`   PlanType: ${e.planType}`);
      console.log(`   Combinations: ${e.combinations?.join(', ')}`);
      console.log(`   File Size: ${e.fileSize} bytes`);
      console.log('');
    });

    // Check for duplicates
    const includedMap = new Map();
    const notIncludedMap = new Map();
    
    exhibits.forEach(e => {
      if (e.includeType === 'included') {
        const key = (e.name || '').toLowerCase();
        if (!includedMap.has(key)) includedMap.set(key, []);
        includedMap.get(key).push(e._id);
      } else if (e.includeType === 'notincluded') {
        const key = (e.name || '').toLowerCase();
        if (!notIncludedMap.has(key)) notIncludedMap.set(key, []);
        notIncludedMap.get(key).push(e._id);
      }
    });

    const includedDupes = Array.from(includedMap.entries()).filter(([_, ids]) => ids.length > 1);
    const notIncludedDupes = Array.from(notIncludedMap.entries()).filter(([_, ids]) => ids.length > 1);

    if (includedDupes.length > 0) {
      console.log('\n⚠️  DUPLICATE INCLUDED EXHIBITS:');
      includedDupes.forEach(([name, ids]) => {
        console.log(`  Name: ${name}`);
        console.log(`  IDs: ${ids.join(', ')}`);
      });
    } else {
      console.log('\n✅ No duplicate Included exhibits');
    }

    if (notIncludedDupes.length > 0) {
      console.log('\n⚠️  DUPLICATE NOT INCLUDED EXHIBITS:');
      notIncludedDupes.forEach(([name, ids]) => {
        console.log(`  Name: ${name}`);
        console.log(`  IDs: ${ids.join(', ')}`);
      });
    } else {
      console.log('✅ No duplicate Not Included exhibits');
    }

  } finally {
    await client.close();
  }
}

main().catch(console.error);
