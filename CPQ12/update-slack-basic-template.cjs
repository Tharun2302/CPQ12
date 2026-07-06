const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * Force updates SLACK TO TEAMS Basic template in MongoDB
 * This will replace the existing template with the version from backend-templates/
 */

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function updateSlackBasicTemplate() {
  let client;
  
  try {
    console.log('🚀 Connecting to MongoDB...');
    console.log('📊 MongoDB config:', { uri: MONGODB_URI, database: DB_NAME });
    
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB successfully');
    
    const db = client.db(DB_NAME);
    const templatesCollection = db.collection('templates');
    
    // Template to update
    const template = {
      name: 'SLACK TO TEAMS Basic',
      fileName: 'slack-to-teams-basic.docx',
      combination: 'slack-to-teams',
      planType: 'basic',
      category: 'messaging'
    };
    
    const templatesDir = path.join(__dirname, 'backend-templates');
    const filePath = path.join(templatesDir, template.fileName);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`❌ Template file not found: ${template.fileName}`);
      console.log(`   Expected at: ${filePath}`);
      process.exit(1);
    }
    
    // Read file and convert to base64
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');
    const fileStats = fs.statSync(filePath);
    
    console.log(`\n🔄 Updating template: ${template.name}`);
    console.log(`   File: ${template.fileName} (${Math.round(fileBuffer.length / 1024)}KB)`);
    console.log(`   Modified: ${fileStats.mtime.toISOString()}`);
    
    // Check if template exists
    const existing = await templatesCollection.findOne({ name: template.name });
    
    if (existing) {
      console.log(`   Found existing template in database (ID: ${existing.id})`);
      
      // Force update the template in database
      const result = await templatesCollection.updateOne(
        { name: template.name },
        { 
          $set: {
            fileData: base64Data,
            fileSize: fileBuffer.length,
            lastModified: fileStats.mtime,
            updatedAt: new Date(),
            version: (existing.version || 1) + 0.1,
            fileName: template.fileName,
            combination: template.combination,
            planType: template.planType,
            category: template.category,
            status: 'active'
          }
        }
      );
      
      if (result.modifiedCount > 0) {
        console.log(`✅ Successfully updated: ${template.name}`);
        console.log(`   Modified count: ${result.modifiedCount}`);
      } else {
        console.log(`ℹ️ Template found but no changes detected`);
      }
    } else {
      console.log(`⚠️ Template not found in database, creating new entry...`);
      
      // Create new template document
      const templateDoc = {
        id: `template-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        name: template.name,
        description: 'Basic template for Slack to Teams migration - suitable for small to medium projects',
        fileName: template.fileName,
        fileSize: fileBuffer.length,
        fileData: base64Data,
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        isDefault: true,
        category: template.category,
        combination: template.combination,
        planType: template.planType,
        keywords: ['basic', 'slack', 'teams', 'messaging'],
        createdAt: new Date(),
        lastModified: fileStats.mtime,
        uploadedBy: 'template-update-script',
        status: 'active',
        version: 1.0
      };
      
      const result = await templatesCollection.insertOne(templateDoc);
      
      if (result.insertedId) {
        console.log(`✅ Successfully created: ${template.name}`);
        console.log(`   Template ID: ${result.insertedId}`);
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   ✅ Template updated: ${template.name}`);
    console.log(`   📝 File: ${template.fileName} (${Math.round(fileBuffer.length / 1024)}KB)`);
    
    console.log('\n🎉 Template successfully updated in MongoDB!');
    console.log('\n📌 Next Steps:');
    console.log('   1. Clear browser cache (Ctrl + Shift + Delete) or use Incognito mode');
    console.log('   2. Hard refresh the page (Ctrl + F5)');
    console.log('   3. Generate a new agreement to see the updated template');
    console.log('   4. The bundled pricing column and CloudFuze Manage row should now appear');
    
  } catch (error) {
    console.error('\n❌ Error updating template:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Run the script
updateSlackBasicTemplate()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  });

