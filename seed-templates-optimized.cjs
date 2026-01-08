const fs = require('fs');
const path = require('path');

/**
 * OPTIMIZED VERSION - Seeds templates using bulk operations
 * This should be run once to populate templates that users can automatically select
 */
async function seedDefaultTemplates(db) {
  if (!db) {
    console.error('❌ Database connection required for seeding templates');
    return false;
  }

  console.log('🌱 Starting OPTIMIZED template seeding process...');
  console.log('⚡ Using bulk operations and indexes for maximum speed');

  const templatesDir = path.join(__dirname, 'backend-templates');
  const templatesCollection = db.collection('templates');

  // Create indexes FIRST for faster lookups
  try {
    console.log('📊 Creating database indexes...');
    await templatesCollection.createIndex({ name: 1 }, { unique: true });
    await templatesCollection.createIndex({ combination: 1, category: 1, planType: 1 });
    console.log('✅ Database indexes ready');
  } catch (e) {
    console.log('ℹ️  Indexes already exist');
  }

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
    // EMAIL TEMPLATES
    // We seed one template per tier so App.tsx can auto-select via exact (planType + combination).
    {
      name: 'GMAIL TO GMAIL Basic',
      description: 'Basic template for Gmail to Gmail migration',
      fileName: 'gmail-to-gmail.docx',
      isDefault: false,
      category: 'email',
      combination: 'gmail-to-gmail',
      planType: 'basic',
      keywords: ['gmail', 'email', 'basic', 'migration']
    },
    {
      name: 'GMAIL TO GMAIL Standard',
      description: 'Standard template for Gmail to Gmail migration',
      fileName: 'gmail-to-gmail.docx',
      isDefault: false,
      category: 'email',
      combination: 'gmail-to-gmail',
      planType: 'standard',
      keywords: ['gmail', 'email', 'standard', 'migration']
    },
    {
      name: 'GMAIL TO GMAIL Advanced',
      description: 'Advanced template for Gmail to Gmail migration',
      fileName: 'gmail-to-gmail.docx',
      isDefault: false,
      category: 'email',
      combination: 'gmail-to-gmail',
      planType: 'advanced',
      keywords: ['gmail', 'email', 'advanced', 'migration']
    },
    {
      name: 'GMAIL TO OUTLOOK Standard',
      description: 'Standard template for Gmail to Outlook migration',
      fileName: 'gmail-to-outlook.docx',
      isDefault: false,
      category: 'email',
      combination: 'gmail-to-outlook',
      planType: 'standard',
      keywords: ['gmail', 'outlook', 'email', 'standard', 'migration']
    },
    {
      name: 'OUTLOOK TO OUTLOOK Standard',
      description: 'Standard template for Outlook to Outlook migration',
      fileName: 'outlook-to-outlook.docx',
      isDefault: false,
      category: 'email',
      combination: 'outlook-to-outlook',
      planType: 'standard',
      keywords: ['outlook', 'email', 'standard', 'migration']
    },
    {
      name: 'OUTLOOK TO GMAIL Standard',
      description: 'Standard template for Outlook to Gmail migration',
      fileName: 'outlook-to-gmail.docx',
      isDefault: false,
      category: 'email',
      combination: 'outlook-to-gmail',
      planType: 'standard',
      keywords: ['outlook', 'gmail', 'email', 'standard', 'migration']
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
    {
      name: 'DROPBOX TO SHAREPOINT Standard',
      description: 'Standard template for Dropbox to SharePoint migration',
      fileName: 'dropbox-to-sharepoint-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-sharepoint',
      planType: 'standard',
      keywords: ['standard', 'dropbox', 'sharepoint', 'content', 'microsoft']
    },
    {
      name: 'DROPBOX TO SHAREPOINT Advanced',
      description: 'Advanced template for Dropbox to SharePoint migration',
      fileName: 'dropbox-to-sharepoint-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-sharepoint',
      planType: 'advanced',
      keywords: ['advanced', 'dropbox', 'sharepoint', 'content', 'microsoft', 'enterprise']
    },
    {
      name: 'DROPBOX TO ONEDRIVE Standard',
      description: 'Standard template for Dropbox to OneDrive migration',
      fileName: 'dropbox-to-onedrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-onedrive',
      planType: 'standard',
      keywords: ['standard', 'dropbox', 'onedrive', 'content', 'microsoft']
    },
    {
      name: 'DROPBOX TO ONEDRIVE Advanced',
      description: 'Advanced template for Dropbox to OneDrive migration',
      fileName: 'dropbox-to-onedrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-onedrive',
      planType: 'advanced',
      keywords: ['advanced', 'dropbox', 'onedrive', 'content', 'microsoft', 'enterprise']
    },
    {
      name: 'BOX TO BOX Standard',
      description: 'Standard template for Box to Box migration',
      fileName: 'box-to-box-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-box',
      planType: 'standard',
      keywords: ['standard', 'box', 'content']
    },
    {
      name: 'BOX TO BOX Advanced',
      description: 'Advanced template for Box to Box migration',
      fileName: 'box-to-box-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-box',
      planType: 'advanced',
      keywords: ['advanced', 'box', 'content', 'enterprise']
    },
    {
      name: 'BOX TO GOOGLE MYDRIVE Advanced',
      description: 'Advanced template for Box to Google MyDrive migration',
      fileName: 'box-to-google-mydrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-google-mydrive',
      planType: 'advanced',
      keywords: ['advanced', 'box', 'google', 'mydrive', 'content', 'enterprise']
    },
    {
      name: 'BOX TO GOOGLE SHAREDRIVE Advanced',
      description: 'Advanced template for Box to Google SharedDrive migration',
      fileName: 'box-to-google-sharedrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-google-sharedrive',
      planType: 'advanced',
      keywords: ['advanced', 'box', 'google', 'sharedrive', 'content', 'enterprise']
    },
    {
      name: 'BOX TO ONEDRIVE Advanced',
      description: 'Advanced template for Box to OneDrive migration',
      fileName: 'box-to-onedrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-onedrive',
      planType: 'advanced',
      keywords: ['advanced', 'box', 'onedrive', 'microsoft', 'content', 'enterprise']
    },
    {
      name: 'GOOGLE SHARED DRIVE TO EGNYTE Standard',
      description: 'Standard template for Google SharedDrive to Egnyte migration',
      fileName: 'google-sharedrive-to-egnyte-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-sharedrive-to-egnyte',
      planType: 'standard',
      keywords: ['standard', 'google', 'sharedrive', 'egnyte', 'content']
    },
    // OVERAGE AGREEMENT TEMPLATES
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

  // OPTIMIZATION: Prepare bulk operations
  const bulkOps = [];
  let preparedCount = 0;

  console.log(`📝 Processing ${defaultTemplates.length} templates...`);
  const startTime = Date.now();

  for (const template of defaultTemplates) {
    try {
      const filePath = path.join(templatesDir, template.fileName);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Template file not found: ${template.fileName}`);
        continue;
      }

      // OPTIMIZATION: Get file stats FIRST (lightweight)
      const fileStats = fs.statSync(filePath);

      // Check if template already exists in database
      const existing = await templatesCollection.findOne({ name: template.name });
      
      if (existing) {
        // Check if the file has been modified
        const existingModified = existing.lastModified ? new Date(existing.lastModified) : new Date(0);
        
        if (fileStats.mtime > existingModified) {
          console.log(`🔄 File changed: ${template.name}`);
          
          // ONLY NOW read the file (expensive operation)
          const fileBuffer = fs.readFileSync(filePath);
          const base64Data = fileBuffer.toString('base64');
          
          bulkOps.push({
            updateOne: {
              filter: { name: template.name },
              update: {
                $set: {
                  fileData: base64Data,
                  fileSize: fileBuffer.length,
                  lastModified: fileStats.mtime,
                  updatedAt: new Date(),
                  version: (existing.version || 1) + 0.1
                }
              }
            }
          });
          preparedCount++;
        }
        continue;
      }

      // OPTIMIZATION: Only read file for NEW templates
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
        lastModified: fileStats.mtime,
        uploadedBy: 'system-seed',
        status: 'active',
        version: 1.0
      };

      bulkOps.push({
        insertOne: {
          document: templateDoc
        }
      });
      console.log(`📝 ${template.name} (${Math.round(fileBuffer.length / 1024)}KB)`);
      preparedCount++;

    } catch (error) {
      console.error(`❌ Error preparing template ${template.name}:`, error);
    }
  }

  // EXECUTE ALL OPERATIONS IN ONE BULK CALL - Much faster!
  if (bulkOps.length > 0) {
    try {
      console.log(`\n⚡ Executing ${bulkOps.length} operations in bulk...`);
      const result = await templatesCollection.bulkWrite(bulkOps, { ordered: false });
      const endTime = Date.now();
      
      console.log(`\n✅ BULK OPERATION COMPLETED IN ${endTime - startTime}ms`);
      console.log(`   📊 Inserted: ${result.insertedCount || 0}`);
      console.log(`   📊 Modified: ${result.modifiedCount || 0}`);
      console.log(`   ⚡ Performance: ${Math.round((endTime - startTime) / bulkOps.length)}ms per template`);
      
      return preparedCount > 0;
    } catch (error) {
      console.error('❌ Error executing bulk operations:', error);
      // Some operations might have succeeded even if there's an error
      return false;
    }
  } else {
    console.log('\n✅ All templates are up-to-date, no changes needed');
    return false;
  }
}

module.exports = { seedDefaultTemplates };

