const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * Force updates Basic Content templates in MongoDB
 * This will replace the existing Basic templates with the fixed versions
 */

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function forceUpdateBasicTemplates() {
  let client;
  
  try {
    console.log('🚀 Connecting to MongoDB...');
    console.log('📊 MongoDB config:', { uri: MONGODB_URI, database: DB_NAME });
    
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB successfully');
    
    const db = client.db(DB_NAME);
    const templatesCollection = db.collection('templates');
    
    // Define Basic templates to update
    const basicTemplates = [
      {
        name: 'DROPBOX TO MYDRIVE Basic',
        fileName: 'dropbox-to-google-mydrive-basic.docx',
        combination: 'dropbox-to-mydrive',
        planType: 'basic'
      },
      {
        name: 'DROPBOX TO SHAREDRIVE Basic',
        fileName: 'dropbox-to-google-sharedrive-basic.docx',
        combination: 'dropbox-to-sharedrive',
        planType: 'basic'
      }
    ];
    
    const templatesDir = path.join(__dirname, 'backend-templates');
    let updatedCount = 0;
    
    for (const template of basicTemplates) {
      try {
        const filePath = path.join(templatesDir, template.fileName);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
          console.log(`⚠️ Template file not found: ${template.fileName}`);
          continue;
        }
        
        // Read file and convert to base64
        const fileBuffer = fs.readFileSync(filePath);
        const base64Data = fileBuffer.toString('base64');
        const fileStats = fs.statSync(filePath);
        
        console.log(`\n🔄 Updating template: ${template.name}`);
        console.log(`   File: ${template.fileName} (${Math.round(fileBuffer.length / 1024)}KB)`);
        console.log(`   Modified: ${fileStats.mtime.toISOString()}`);
        
        // Force update the template in database
        const result = await templatesCollection.updateOne(
          { name: template.name },
          { 
            $set: {
              fileData: base64Data,
              fileSize: fileBuffer.length,
              lastModified: fileStats.mtime,
              updatedAt: new Date(),
              version: 2.0, // Increment version to show it's been updated
              fileName: template.fileName,
              combination: template.combination,
              planType: template.planType,
              category: 'content',
              status: 'active'
            }
          },
          { upsert: true } // Create if doesn't exist
        );
        
        if (result.modifiedCount > 0 || result.upsertedCount > 0) {
          console.log(`✅ Successfully updated: ${template.name}`);
          console.log(`   Modified: ${result.modifiedCount > 0 ? 'Yes' : 'No'}`);
          console.log(`   Upserted: ${result.upsertedCount > 0 ? 'Yes' : 'No'}`);
          updatedCount++;
        } else {
          console.log(`ℹ️ No changes needed for: ${template.name}`);
        }
        
      } catch (error) {
        console.error(`❌ Error updating template ${template.name}:`, error.message);
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   ✅ Updated: ${updatedCount} Basic templates`);
    console.log(`   📝 Total: ${basicTemplates.length} templates processed`);
    
    if (updatedCount > 0) {
      console.log('\n🎉 Basic templates successfully updated in MongoDB!');
      console.log('\n📌 Next Steps:');
      console.log('   1. Templates are now updated with fixed versions');
      console.log('   2. Refresh your browser (Ctrl + F5)');
      console.log('   3. Test Content migration with Basic plan');
      console.log('   4. Preview Agreement should now work without errors');
    }
    
  } catch (error) {
    console.error('\n❌ Error updating templates:', error.message);
    throw error;
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Run the script
forceUpdateBasicTemplates()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  });

