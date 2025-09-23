const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * Script to clear old templates and reseed with new template files
 * This will completely refresh the template database with new files
 */
async function refreshTemplates() {
  console.log('🔄 Starting template refresh process...');
  
  // MongoDB connection
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not found in environment variables');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  
  try {
    // Connect to MongoDB
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('cpq_system');
    const templatesCollection = db.collection('templates');
    
    // Step 1: Clear all existing templates
    console.log('🗑️ Clearing existing templates...');
    const deleteResult = await templatesCollection.deleteMany({});
    console.log(`✅ Deleted ${deleteResult.deletedCount} existing templates`);
    
    // Step 2: Define new template structure
    const newTemplates = [
      {
        name: 'SLACK TO TEAMS Basic',
        description: 'Basic template for Slack to Teams migration - suitable for small to medium projects',
        fileName: 'slack-to-teams-basic.docx',
        isDefault: true,
        category: 'messaging',
        combination: 'slack-to-teams',
        planType: 'basic',
        keywords: ['basic', 'slack', 'teams', 'messaging']
      },
      {
        name: 'SLACK TO TEAMS Advanced', 
        description: 'Advanced template for Slack to Teams migration - suitable for large enterprise projects',
        fileName: 'slack-to-teams-advanced.docx',
        isDefault: false,
        category: 'messaging',
        combination: 'slack-to-teams', 
        planType: 'advanced',
        keywords: ['advanced', 'slack', 'teams', 'messaging', 'enterprise']
      }
    ];

    const templatesDir = path.join(__dirname, 'backend-templates');
    
    // Step 3: Upload new templates
    let uploadedCount = 0;
    
    for (const template of newTemplates) {
      try {
        const filePath = path.join(templatesDir, template.fileName);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
          console.log(`⚠️ Template file not found: ${template.fileName}`);
          console.log(`   Expected at: ${filePath}`);
          continue;
        }

        // Get file stats
        const stats = fs.statSync(filePath);
        console.log(`📄 Processing: ${template.fileName} (Modified: ${stats.mtime.toISOString()})`);

        // Read file and convert to base64
        const fileBuffer = fs.readFileSync(filePath);
        const base64Data = fileBuffer.toString('base64');
        
        // Create template document
        const templateDoc = {
          id: `template-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          name: template.name,
          description: template.description,
          fileName: template.fileName,
          fileSize: fileBuffer.length,
          fileData: base64Data,
          fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          isDefault: template.isDefault,
          category: template.category,
          combination: template.combination,
          planType: template.planType,
          keywords: template.keywords,
          createdAt: new Date(),
          lastModified: stats.mtime,
          uploadedBy: 'template-refresh-script',
          status: 'active',
          version: '2.0'
        };

        // Insert into database
        const result = await templatesCollection.insertOne(templateDoc);
        
        if (result.insertedId) {
          console.log(`✅ Uploaded template: ${template.name}`);
          console.log(`   File: ${template.fileName} (${Math.round(fileBuffer.length / 1024)}KB)`);
          console.log(`   Plan: ${template.planType} | Combination: ${template.combination}`);
          console.log(`   Modified: ${stats.mtime.toISOString()}`);
          uploadedCount++;
        }

      } catch (error) {
        console.error(`❌ Error uploading template ${template.name}:`, error);
      }
    }

    // Step 4: Verify templates
    console.log('\n🔍 Verifying templates in database...');
    const allTemplates = await templatesCollection.find({}).toArray();
    
    console.log(`📊 Total templates in database: ${allTemplates.length}`);
    allTemplates.forEach(template => {
      console.log(`   - ${template.name} (${template.planType}) - ${template.fileName}`);
    });
    
    console.log(`\n🎉 Template refresh completed! Uploaded ${uploadedCount} new templates`);
    
    // Step 5: Template selection verification
    console.log('\n🎯 Template auto-selection verification:');
    
    const basicTemplate = await templatesCollection.findOne({ planType: 'basic' });
    const advancedTemplate = await templatesCollection.findOne({ planType: 'advanced' });
    
    if (basicTemplate) {
      console.log(`✅ Basic plan template: ${basicTemplate.name}`);
    } else {
      console.log('❌ Basic plan template not found');
    }
    
    if (advancedTemplate) {
      console.log(`✅ Advanced plan template: ${advancedTemplate.name}`);
    } else {
      console.log('❌ Advanced plan template not found');
    }
    
    return uploadedCount > 0;
    
  } catch (error) {
    console.error('❌ Error during template refresh:', error);
    throw error;
  } finally {
    await client.close();
    console.log('🔌 MongoDB connection closed');
  }
}

// Run the script
if (require.main === module) {
  refreshTemplates()
    .then(() => {
      console.log('\n✅ Template refresh script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Template refresh script failed:', error);
      process.exit(1);
    });
}

module.exports = { refreshTemplates };
