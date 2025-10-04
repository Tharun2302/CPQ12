const fs = require('fs');
const path = require('path');

/**
 * Seeds default templates into the database
 * This should be run once to populate templates that users can automatically select
 */
async function seedDefaultTemplates(db) {
  if (!db) {
    console.error('❌ Database connection required for seeding templates');
    return false;
  }

  console.log('🌱 Starting template seeding process...');

  // Define default templates structure
  const defaultTemplates = [
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
    },
    {
      name: 'SLACK TO GOOGLE CHAT Basic',
      description: 'Basic template for Slack to Google Chat migration - suitable for small to medium projects',
      fileName: 'slack-to-google-chat-basic.docx',
      isDefault: false,
      category: 'messaging',
      combination: 'slack-to-google-chat',
      planType: 'basic',
      keywords: ['basic', 'slack', 'google-chat', 'messaging']
    },
    {
      name: 'SLACK TO GOOGLE CHAT Advanced',
      description: 'Advanced template for Slack to Google Chat migration - suitable for large enterprise projects',
      fileName: 'slack-to-google-chat-advanced.docx',
      isDefault: false,
      category: 'messaging',
      combination: 'slack-to-google-chat',
      planType: 'advanced',
      keywords: ['advanced', 'slack', 'google-chat', 'messaging', 'enterprise']
    }
  ];

  const templatesDir = path.join(__dirname, 'backend-templates');
  
  // Create templates directory if it doesn't exist
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
    console.log('📁 Created backend-templates directory');
    console.log('📝 Please place your DOCX template files in:', templatesDir);
    console.log('📝 Expected files:');
    defaultTemplates.forEach(template => {
      console.log(`   - ${template.fileName}`);
    });
    return false;
  }

  let uploadedCount = 0;

  for (const template of defaultTemplates) {
    try {
      const filePath = path.join(templatesDir, template.fileName);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️ Template file not found: ${template.fileName}`);
        console.log(`   Expected at: ${filePath}`);
        continue;
      }

      // Check if template already exists in database
      const existing = await db.collection('templates').findOne({ 
        name: template.name 
      });

      if (existing) {
        console.log(`⏭️ Template already exists: ${template.name}`);
        
        // Check if the file has been modified and update if needed
        const fileStats = fs.statSync(filePath);
        const existingModified = existing.lastModified ? new Date(existing.lastModified) : new Date(0);
        
        if (fileStats.mtime > existingModified) {
          console.log(`🔄 Template file is newer, updating: ${template.name}`);
          
          // Read updated file
          const fileBuffer = fs.readFileSync(filePath);
          const base64Data = fileBuffer.toString('base64');
          
          // Update the existing template
          await db.collection('templates').updateOne(
            { name: template.name },
            { 
              $set: {
                fileData: base64Data,
                fileSize: fileBuffer.length,
                lastModified: fileStats.mtime,
                updatedAt: new Date(),
                version: (existing.version || 1) + 0.1
              }
            }
          );
          
          console.log(`✅ Updated template: ${template.name} (${Math.round(fileBuffer.length / 1024)}KB)`);
          uploadedCount++;
        }
        continue;
      }

      // Read file and convert to base64
      const fileBuffer = fs.readFileSync(filePath);
      const base64Data = fileBuffer.toString('base64');
      
      // Get file modification time
      const fileStats = fs.statSync(filePath);
      
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
        lastModified: fileStats.mtime,
        uploadedBy: 'system-seed',
        status: 'active',
        version: 1.0
      };

      // Insert into database
      const result = await db.collection('templates').insertOne(templateDoc);
      
      if (result.insertedId) {
        console.log(`✅ Uploaded template: ${template.name}`);
        console.log(`   File: ${template.fileName} (${Math.round(fileBuffer.length / 1024)}KB)`);
        console.log(`   Plan: ${template.planType} | Combination: ${template.combination}`);
        uploadedCount++;
      }

    } catch (error) {
      console.error(`❌ Error uploading template ${template.name}:`, error);
    }
  }

  console.log(`🎉 Template seeding completed! Uploaded ${uploadedCount} templates`);
  return uploadedCount > 0;
}

module.exports = { seedDefaultTemplates };
