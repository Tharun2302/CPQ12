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
        continue;
      }

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
        uploadedBy: 'system-seed',
        status: 'active'
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
