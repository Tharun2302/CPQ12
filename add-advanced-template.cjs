const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function addAdvancedTemplate() {
  // Use the same connection string as the server
  const client = new MongoClient('mongodb+srv://tharunp:TharunP123@cluster0.8qjqj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('cpq_templates');
    const templates = db.collection('templates');
    
    // Check if Advanced template already exists
    const existing = await templates.findOne({ 
      name: 'SLACK TO TEAMS Advanced' 
    });
    
    if (existing) {
      console.log('📄 Advanced template already exists, updating metadata...');
      
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
      console.log('📄 Creating new Advanced template...');
      
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

addAdvancedTemplate().catch(console.error);
