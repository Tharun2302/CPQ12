const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function fixAdvancedTemplate() {
  const client = new MongoClient(require('./scripts/lib/requireMongoUri.cjs')());
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('cpq_templates');
    const templates = db.collection('templates');
    
    // Check if Advanced template exists
    const existingAdvanced = await templates.findOne({ 
      name: 'SLACK TO TEAMS Advanced' 
    });
    
    if (existingAdvanced) {
      console.log('📄 Found existing Advanced template:', {
        id: existingAdvanced.id,
        name: existingAdvanced.name,
        planType: existingAdvanced.planType,
        isDefault: existingAdvanced.isDefault
      });
      
      // Update the existing template with correct metadata
      const updateResult = await templates.updateOne(
        { name: 'SLACK TO TEAMS Advanced' },
        { 
          $set: {
            planType: 'advanced',
            isDefault: false,
            category: 'messaging',
            combination: 'slack-to-teams',
            keywords: ['advanced', 'slack', 'teams', 'messaging', 'enterprise'],
            updatedAt: new Date().toISOString()
          }
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        console.log('✅ Updated Advanced template metadata');
      } else {
        console.log('⚠️ No changes made to Advanced template');
      }
    } else {
      console.log('❌ Advanced template not found, creating new one...');
      
      // Read the Advanced template file
      const filePath = path.join(__dirname, 'backend-templates', 'slack-to-teams-advanced.docx');
      
      if (!fs.existsSync(filePath)) {
        console.log('❌ Advanced template file not found:', filePath);
        return;
      }
      
      const fileBuffer = fs.readFileSync(filePath);
      const base64Data = fileBuffer.toString('base64');
      
      // Create new Advanced template
      const templateDoc = {
        id: `template-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        name: 'SLACK TO TEAMS Advanced',
        description: 'Advanced template for Slack to Teams migration - suitable for large enterprise projects',
        fileName: 'slack-to-teams-advanced.docx',
        fileSize: fileBuffer.length,
        fileData: base64Data,
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        isDefault: false,
        category: 'messaging',
        combination: 'slack-to-teams',
        planType: 'advanced',
        keywords: ['advanced', 'slack', 'teams', 'messaging', 'enterprise'],
        createdAt: new Date(),
        uploadedBy: 'system-seed',
        status: 'active'
      };
      
      const result = await templates.insertOne(templateDoc);
      
      if (result.insertedId) {
        console.log('✅ Created Advanced template:', templateDoc.name);
        console.log(`   File: ${templateDoc.fileName} (${Math.round(fileBuffer.length / 1024)}KB)`);
        console.log(`   Plan: ${templateDoc.planType} | Combination: ${templateDoc.combination}`);
      }
    }
    
    // Verify both templates exist
    const allTemplates = await templates.find({}).toArray();
    console.log('\n📋 All templates in database:');
    allTemplates.forEach(t => {
      console.log(`- ${t.name} (planType: ${t.planType}, isDefault: ${t.isDefault})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

fixAdvancedTemplate().catch(console.error);
