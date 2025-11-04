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
  console.log('⚡ Performance mode: Metadata-only seeding for speed');

  // Define default templates structure (Messaging + Content)
  const defaultTemplates = [
    // MESSAGING TEMPLATES
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
    },
    // CONTENT TEMPLATES (Basic, Standard, Advanced)
    {
      name: 'DROPBOX TO MYDRIVE Basic',
      description: 'Basic template for Dropbox to Google MyDrive migration - suitable for small to medium projects',
      fileName: 'dropbox-to-google-mydrive-basic.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-mydrive',
      planType: 'basic',
      keywords: ['basic', 'dropbox', 'mydrive', 'content', 'google']
    },
    {
      name: 'DROPBOX TO MYDRIVE Standard',
      description: 'Standard template for Dropbox to Google MyDrive migration - suitable for medium to large projects',
      fileName: 'dropbox-to-google-mydrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-mydrive',
      planType: 'standard',
      keywords: ['standard', 'dropbox', 'mydrive', 'content', 'google']
    },
    {
      name: 'DROPBOX TO MYDRIVE Advanced',
      description: 'Advanced template for Dropbox to Google MyDrive migration - suitable for large enterprise projects',
      fileName: 'dropbox-to-google-mydrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-mydrive',
      planType: 'advanced',
      keywords: ['advanced', 'dropbox', 'mydrive', 'content', 'google', 'enterprise']
    },
    {
      name: 'DROPBOX TO SHAREDRIVE Basic',
      description: 'Basic template for Dropbox to Google SharedDrive migration - suitable for small to medium projects',
      fileName: 'dropbox-to-google-sharedrive-basic.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-sharedrive',
      planType: 'basic',
      keywords: ['basic', 'dropbox', 'sharedrive', 'content', 'google']
    },
    {
      name: 'DROPBOX TO SHAREDRIVE Standard',
      description: 'Standard template for Dropbox to Google SharedDrive migration - suitable for medium to large projects',
      fileName: 'dropbox-to-google-sharedrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-sharedrive',
      planType: 'standard',
      keywords: ['standard', 'dropbox', 'sharedrive', 'content', 'google']
    },
    {
      name: 'DROPBOX TO SHAREDRIVE Advanced',
      description: 'Advanced template for Dropbox to Google SharedDrive migration - suitable for large enterprise projects',
      fileName: 'dropbox-to-google-sharedrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-sharedrive',
      planType: 'advanced',
      keywords: ['advanced', 'dropbox', 'sharedrive', 'content', 'google', 'enterprise']
    },
    // DROPBOX TO SHAREPOINT templates (Standard & Advanced only)
    {
      name: 'DROPBOX TO SHAREPOINT Standard',
      description: 'Standard template for Dropbox to SharePoint migration - suitable for medium to large projects',
      fileName: 'dropbox-to-sharepoint-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-sharepoint',
      planType: 'standard',
      keywords: ['standard', 'dropbox', 'sharepoint', 'content', 'microsoft']
    },
    {
      name: 'DROPBOX TO SHAREPOINT Advanced',
      description: 'Advanced template for Dropbox to SharePoint migration - suitable for large enterprise projects',
      fileName: 'dropbox-to-sharepoint-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-sharepoint',
      planType: 'advanced',
      keywords: ['advanced', 'dropbox', 'sharepoint', 'content', 'microsoft', 'enterprise']
    },
    // DROPBOX TO ONEDRIVE templates (Standard & Advanced only)
    {
      name: 'DROPBOX TO ONEDRIVE Standard',
      description: 'Standard template for Dropbox to OneDrive migration - suitable for medium to large projects',
      fileName: 'dropbox-to-onedrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-onedrive',
      planType: 'standard',
      keywords: ['standard', 'dropbox', 'onedrive', 'content', 'microsoft']
    },
    {
      name: 'DROPBOX TO ONEDRIVE Advanced',
      description: 'Advanced template for Dropbox to OneDrive migration - suitable for large enterprise projects',
      fileName: 'dropbox-to-onedrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-onedrive',
      planType: 'advanced',
      keywords: ['advanced', 'dropbox', 'onedrive', 'content', 'microsoft', 'enterprise']
    },
    // DROPBOX TO GOOGLE templates (Standard & Advanced only)
    {
      name: 'DROPBOX TO GOOGLE Standard',
      description: 'Standard template for Dropbox to Google migration - suitable for medium to large projects',
      fileName: 'dropbox-to-google-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-google',
      planType: 'standard',
      keywords: ['standard', 'dropbox', 'google', 'content', 'migration']
    },
    {
      name: 'DROPBOX TO GOOGLE Advanced',
      description: 'Advanced template for Dropbox to Google migration - suitable for large enterprise projects',
      fileName: 'dropbox-to-google-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-google',
      planType: 'advanced',
      keywords: ['advanced', 'dropbox', 'google', 'content', 'migration', 'enterprise']
    },
    // DROPBOX TO MICROSOFT templates (Standard & Advanced only)
    {
      name: 'DROPBOX TO MICROSOFT Standard',
      description: 'Standard template for Dropbox to Microsoft migration - suitable for medium to large projects',
      fileName: 'dropbox-to-microsoft-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-microsoft',
      planType: 'standard',
      keywords: ['standard', 'dropbox', 'microsoft', 'content', 'migration']
    },
    {
      name: 'DROPBOX TO MICROSOFT Advanced',
      description: 'Advanced template for Dropbox to Microsoft migration - suitable for large enterprise projects',
      fileName: 'dropbox-to-microsoft-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-microsoft',
      planType: 'advanced',
      keywords: ['advanced', 'dropbox', 'microsoft', 'content', 'migration', 'enterprise']
    },
    // BOX TO BOX templates (Standard & Advanced only)
    {
      name: 'BOX TO BOX Standard',
      description: 'Standard template for Box to Box migration - suitable for medium to large projects',
      fileName: 'box-to-box-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-box',
      planType: 'standard',
      keywords: ['standard', 'box', 'content', 'migration']
    },
    {
      name: 'BOX TO BOX Advanced',
      description: 'Advanced template for Box to Box migration - suitable for large enterprise projects',
      fileName: 'box-to-box-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-box',
      planType: 'advanced',
      keywords: ['advanced', 'box', 'content', 'migration', 'enterprise']
    },
    // BOX TO GOOGLE MYDRIVE templates (Standard & Advanced only)
    {
      name: 'BOX TO GOOGLE MYDRIVE Standard',
      description: 'Standard template for Box to Google MyDrive migration - suitable for medium to large projects',
      fileName: 'box-to-google-mydrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-google-mydrive',
      planType: 'standard',
      keywords: ['standard', 'box', 'google', 'mydrive', 'content', 'migration']
    },
    {
      name: 'BOX TO GOOGLE MYDRIVE Advanced',
      description: 'Advanced template for Box to Google MyDrive migration - suitable for large enterprise projects',
      fileName: 'box-to-google-mydrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-google-mydrive',
      planType: 'advanced',
      keywords: ['advanced', 'box', 'google', 'mydrive', 'content', 'migration', 'enterprise']
    },
    // BOX TO GOOGLE SHARED DRIVE templates (Standard & Advanced only)
    {
      name: 'BOX TO GOOGLE SHARED DRIVE Standard',
      description: 'Standard template for Box to Google Shared Drive migration - suitable for medium to large projects',
      fileName: 'box-to-google-sharedrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-google-sharedrive',
      planType: 'standard',
      keywords: ['standard', 'box', 'google', 'sharedrive', 'shared drive', 'content', 'migration']
    },
    {
      name: 'BOX TO GOOGLE SHARED DRIVE Advanced',
      description: 'Advanced template for Box to Google Shared Drive migration - suitable for large enterprise projects',
      fileName: 'box-to-google-sharedrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-google-sharedrive',
      planType: 'advanced',
      keywords: ['advanced', 'box', 'google', 'sharedrive', 'shared drive', 'content', 'migration', 'enterprise']
    },
    // BOX TO ONEDRIVE templates (Standard & Advanced only)
    {
      name: 'BOX TO ONEDRIVE Standard',
      description: 'Standard template for Box to OneDrive migration - suitable for medium to large projects',
      fileName: 'box-to-onedrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-onedrive',
      planType: 'standard',
      keywords: ['standard', 'box', 'onedrive', 'microsoft', 'content', 'migration']
    },
    {
      name: 'BOX TO ONEDRIVE Advanced',
      description: 'Advanced template for Box to OneDrive migration - suitable for large enterprise projects',
      fileName: 'box-to-onedrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-onedrive',
      planType: 'advanced',
      keywords: ['advanced', 'box', 'onedrive', 'microsoft', 'content', 'migration', 'enterprise']
    },
    // BOX TO MICROSOFT templates (Standard & Advanced only)
    {
      name: 'BOX TO MICROSOFT Standard',
      description: 'Standard template for Box to Microsoft migration - suitable for medium to large projects',
      fileName: 'box-to-microsoft-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-microsoft',
      planType: 'standard',
      keywords: ['standard', 'box', 'microsoft', 'content', 'migration']
    },
    {
      name: 'BOX TO MICROSOFT Advanced',
      description: 'Advanced template for Box to Microsoft migration - suitable for large enterprise projects',
      fileName: 'box-to-microsoft-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-microsoft',
      planType: 'advanced',
      keywords: ['advanced', 'box', 'microsoft', 'content', 'migration', 'enterprise']
    },
    // BOX TO GOOGLE templates (Standard & Advanced only)
    {
      name: 'BOX TO GOOGLE Standard',
      description: 'Standard template for Box to Google migration - suitable for medium to large projects',
      fileName: 'box-to-google-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-google',
      planType: 'standard',
      keywords: ['standard', 'box', 'google', 'content', 'migration']
    },
    {
      name: 'BOX TO GOOGLE Advanced',
      description: 'Advanced template for Box to Google migration - suitable for large enterprise projects',
      fileName: 'box-to-google-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-google',
      planType: 'advanced',
      keywords: ['advanced', 'box', 'google', 'content', 'migration', 'enterprise']
    },
    // GOOGLE SHARED DRIVE TO EGNYTE templates (Standard & Advanced only)
    {
      name: 'GOOGLE SHARED DRIVE TO EGNYTE Standard',
      description: 'Standard template for Google Shared Drive to Egnyte migration - suitable for medium to large projects',
      fileName: 'google-sharedrive-to-egnyte-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-sharedrive-to-egnyte',
      planType: 'standard',
      keywords: ['standard', 'google', 'sharedrive', 'egnyte', 'content', 'migration']
    },
    {
      name: 'GOOGLE SHARED DRIVE TO EGNYTE Advanced',
      description: 'Advanced template for Google Shared Drive to Egnyte migration - suitable for large enterprise projects',
      fileName: 'google-sharedrive-to-egnyte-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-sharedrive-to-egnyte',
      planType: 'advanced',
      keywords: ['advanced', 'google', 'sharedrive', 'egnyte', 'content', 'migration', 'enterprise']
    },
    // GOOGLE SHARED DRIVE TO GOOGLE SHARED DRIVE templates (Standard & Advanced only)
    {
      name: 'GOOGLE SHARED DRIVE TO GOOGLE SHARED DRIVE Standard',
      description: 'Standard template for Google Shared Drive to Google Shared Drive migration - suitable for medium to large projects',
      fileName: 'google-sharedrive-to-google-sharedrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-sharedrive-to-google-sharedrive',
      planType: 'standard',
      keywords: ['standard', 'google', 'sharedrive', 'content', 'migration']
    },
    {
      name: 'GOOGLE SHARED DRIVE TO GOOGLE SHARED DRIVE Advanced',
      description: 'Advanced template for Google Shared Drive to Google Shared Drive migration - suitable for large enterprise projects',
      fileName: 'google-sharedrive-to-google-sharedrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-sharedrive-to-google-sharedrive',
      planType: 'advanced',
      keywords: ['advanced', 'google', 'sharedrive', 'content', 'migration', 'enterprise']
    },
    // GOOGLE SHARED DRIVE TO ONEDRIVE templates (Standard & Advanced only)
    {
      name: 'GOOGLE SHARED DRIVE TO ONEDRIVE Standard',
      description: 'Standard template for Google Shared Drive to OneDrive migration - suitable for medium to large projects',
      fileName: 'google-sharedrive-to-onedrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-sharedrive-to-onedrive',
      planType: 'standard',
      keywords: ['standard', 'google', 'sharedrive', 'onedrive', 'content', 'microsoft', 'migration']
    },
    {
      name: 'GOOGLE SHARED DRIVE TO ONEDRIVE Advanced',
      description: 'Advanced template for Google Shared Drive to OneDrive migration - suitable for large enterprise projects',
      fileName: 'google-sharedrive-to-onedrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-sharedrive-to-onedrive',
      planType: 'advanced',
      keywords: ['advanced', 'google', 'sharedrive', 'onedrive', 'content', 'microsoft', 'migration', 'enterprise']
    },
    // GOOGLE SHARED DRIVE TO SHAREPOINT templates (Standard & Advanced only)
    {
      name: 'GOOGLE SHARED DRIVE TO SHAREPOINT Standard',
      description: 'Standard template for Google Shared Drive to SharePoint migration - suitable for medium to large projects',
      fileName: 'google-sharedrive-to-sharepoint-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-sharedrive-to-sharepoint',
      planType: 'standard',
      keywords: ['standard', 'google', 'sharedrive', 'sharepoint', 'content', 'microsoft', 'migration']
    },
    {
      name: 'GOOGLE SHARED DRIVE TO SHAREPOINT Advanced',
      description: 'Advanced template for Google Shared Drive to SharePoint migration - suitable for large enterprise projects',
      fileName: 'google-sharedrive-to-sharepoint-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-sharedrive-to-sharepoint',
      planType: 'advanced',
      keywords: ['advanced', 'google', 'sharedrive', 'sharepoint', 'content', 'microsoft', 'migration', 'enterprise']
    },
    // OVERAGE AGREEMENT - Single template for BOTH migration types
    {
      name: 'OVERAGE AGREEMENT Messaging',
      description: 'Overage agreement template for Messaging migration',
      fileName: 'overage-agreement.docx',
      isDefault: false,
      category: 'messaging',
      combination: 'overage-agreement',
      planType: 'overage',
      keywords: ['overage', 'agreement', 'messaging']
    },
    {
      name: 'OVERAGE AGREEMENT Content',
      description: 'Overage agreement template for Content migration',
      fileName: 'overage-agreement.docx',
      isDefault: false,
      category: 'content',
      combination: 'overage-agreement',
      planType: 'overage',
      keywords: ['overage', 'agreement', 'content']
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
  console.log(`📊 Total templates: 4 Messaging + 24 Content + 2 Overage Agreement (30 templates total)`);
  console.log(`   - Messaging: SLACK TO TEAMS, SLACK TO GOOGLE CHAT (Basic, Advanced)`);
  console.log(`   - Content: DROPBOX TO MYDRIVE, DROPBOX TO SHAREDRIVE (Basic, Standard, Advanced)`);
  console.log(`   - Content: DROPBOX TO SHAREPOINT, DROPBOX TO ONEDRIVE, DROPBOX TO GOOGLE, DROPBOX TO MICROSOFT (Standard, Advanced only)`);
  console.log(`   - Content: BOX TO BOX, BOX TO GOOGLE MYDRIVE, BOX TO GOOGLE SHARED DRIVE, BOX TO ONEDRIVE, BOX TO MICROSOFT, BOX TO GOOGLE (Standard, Advanced only)`);
  console.log(`   - Content: GOOGLE SHARED DRIVE TO EGNYTE, GOOGLE SHARED DRIVE TO GOOGLE SHARED DRIVE (Standard, Advanced only)`);
  console.log(`   - Content: GOOGLE SHARED DRIVE TO ONEDRIVE, GOOGLE SHARED DRIVE TO SHAREPOINT (Standard, Advanced only)`);
  console.log(`   - Overage: OVERAGE AGREEMENT (Messaging, Content)`);
  return uploadedCount > 0;
}

module.exports = { seedDefaultTemplates };
