const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function updateAdvancedTemplate() {
  // Use the same connection string as the server
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const DB_NAME = process.env.DB_NAME || 'cpq_templates';
  
  console.log('🔍 MongoDB Configuration:');
  console.log(`   URI: ${MONGODB_URI.replace(/\/\/.*@/, '//***:***@')}`);
  console.log(`   Database: ${DB_NAME}\n`);
  
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db(DB_NAME);
    const templates = db.collection('templates');
    
    // Read the updated Advanced template file
    const filePath = path.join(__dirname, 'backend-templates', 'slack-to-teams-advanced.docx');
    
    if (!fs.existsSync(filePath)) {
      console.log('❌ Advanced template file not found:', filePath);
      return;
    }
    
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');
    
    console.log('📄 Template file info:');
    console.log(`   File: ${filePath}`);
    console.log(`   Size: ${Math.round(fileBuffer.length / 1024)}KB`);
    console.log(`   Base64 length: ${base64Data.length} characters`);
    
    // Check if Advanced template exists
    const existing = await templates.findOne({ 
      name: 'SLACK TO TEAMS Advanced' 
    });
    
    if (existing) {
      console.log('📄 Found existing Advanced template, updating with new file...');
      console.log(`   Current ID: ${existing.id}`);
      console.log(`   Current file size: ${existing.fileSize}`);
      console.log(`   New file size: ${fileBuffer.length}`);
      
      // Update the existing template with the new file data
      const updateResult = await templates.updateOne(
        { name: 'SLACK TO TEAMS Advanced' },
        { 
          $set: {
            fileData: base64Data,
            fileSize: fileBuffer.length,
            updatedAt: new Date().toISOString(),
            planType: 'advanced',
            isDefault: false,
            category: 'messaging',
            combination: 'slack-to-teams',
            keywords: ['advanced', 'slack', 'teams', 'messaging', 'enterprise'],
            description: 'Advanced template for Slack to Teams migration with updated tokens - suitable for large enterprise projects'
          }
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        console.log('✅ Successfully updated Advanced template with new token-enabled file!');
        console.log('🎯 Template now includes your token changes from the DOCX file');
      } else {
        console.log('⚠️ No changes were made to the template');
      }
    } else {
      console.log('❌ Advanced template not found, creating new one...');
      
      // Create new Advanced template
      const templateDoc = {
        id: `template-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        name: 'SLACK TO TEAMS Advanced',
        description: 'Advanced template for Slack to Teams migration with updated tokens - suitable for large enterprise projects',
        fileName: 'slack-to-teams-advanced.docx',
        fileSize: fileBuffer.length,
        fileData: base64Data,
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        isDefault: false,
        category: 'messaging',
        combination: 'slack-to-teams',
        planType: 'advanced',
        keywords: ['advanced', 'slack', 'teams', 'messaging', 'enterprise'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        uploadedBy: 'system-update',
        status: 'active'
      };
      
      const result = await templates.insertOne(templateDoc);
      
      if (result.insertedId) {
        console.log('✅ Created new Advanced template:', templateDoc.name);
        console.log(`   File: ${templateDoc.fileName} (${Math.round(fileBuffer.length / 1024)}KB)`);
        console.log(`   Plan: ${templateDoc.planType} | Combination: ${templateDoc.combination}`);
      }
    }
    
    // Verify the update
    const updatedTemplate = await templates.findOne({ 
      name: 'SLACK TO TEAMS Advanced' 
    });
    
    if (updatedTemplate) {
      console.log('\n📋 Updated template verification:');
      console.log(`   ID: ${updatedTemplate.id}`);
      console.log(`   Name: ${updatedTemplate.name}`);
      console.log(`   Plan Type: ${updatedTemplate.planType}`);
      console.log(`   File Size: ${Math.round(updatedTemplate.fileSize / 1024)}KB`);
      console.log(`   Updated At: ${updatedTemplate.updatedAt}`);
      console.log(`   Has File Data: ${updatedTemplate.fileData ? 'Yes' : 'No'}`);
      console.log(`   File Data Length: ${updatedTemplate.fileData ? updatedTemplate.fileData.length : 0} characters`);
    }
    
    // List all templates
    const allTemplates = await templates.find({}).toArray();
    console.log('\n📋 All templates in database:');
    allTemplates.forEach(t => {
      console.log(`   - ${t.name} (${t.planType}) - ${Math.round(t.fileSize / 1024)}KB`);
    });
    
    console.log('\n🎉 Template update completed successfully!');
    console.log('📝 Next steps:');
    console.log('   1. Restart your server to load the updated template');
    console.log('   2. Go to Quote session and select Advanced plan');
    console.log('   3. Generate agreement to test the new tokens');
    
  } catch (error) {
    console.error('❌ Error updating template:', error);
    throw error;
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the update
if (require.main === module) {
  updateAdvancedTemplate()
    .then(() => {
      console.log('✅ Update script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Update script failed:', error);
      process.exit(1);
    });
}

module.exports = updateAdvancedTemplate;
