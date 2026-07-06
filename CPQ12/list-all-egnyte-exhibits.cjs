const { MongoClient } = require('mongodb');

async function main() {
  const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cpq12';
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    
    // Get ALL Egnyte exhibits
    const exhibits = await db.collection('exhibits').find({
      $or: [
        { combinations: { $in: ['egnyte-to-sharepoint-online', 'egnyte-to-sharepoint'] } },
        { name: { $regex: /egnyte.*sharepoint/i } }
      ]
    }).sort({ name: 1 }).toArray();
    
    console.log(`\n Found ${exhibits.length} Egnyte to SharePoint exhibits:\n`);
    
    const byType = { included: [], notIncluded: [], other: [] };
    
    exhibits.forEach((e, idx) => {
      const typeStr = e.includeType || 'undefined';
      console.log(`${idx + 1}. [${typeStr}] ${e.name}`);
      console.log(`   ID: ${e._id}`);
      console.log(`   Plan: ${e.planType || 'undefined'}`);
      console.log(`   Combos: ${e.combinations?.join(', ')}`);
      console.log('');
      
      if (e.includeType === 'included') byType.included.push(e.name);
      else if (e.includeType === 'notincluded') byType.notIncluded.push(e.name);
      else byType.other.push(e.name);
    });

    console.log('\n📊 Summary by Type:');
    console.log(`Included (${byType.included.length}): ${byType.included.join(', ')}`);
    console.log(`Not Included (${byType.notIncluded.length}): ${byType.notIncluded.join(', ')}`);
    console.log(`Other (${byType.other.length}): ${byType.other.join(', ')}`);

  } finally {
    await client.close();
  }
}

main().catch(console.error);
