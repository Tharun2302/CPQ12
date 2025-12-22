const fs = require('fs');
const path = require('path');

/**
 * Seeds default exhibits into the database
 */
async function seedDefaultExhibits(db) {
  if (!db) {
    console.error('❌ Database connection required for seeding exhibits');
    return false;
  }

  console.log('🌱 Starting exhibits seeding process...');

  const defaultExhibits = [
    // Messaging exhibits
    {
      name: 'Slack to Teams Basic Plan - Basic Include',
      description: 'Documentation for features included in Slack to Teams Basic Plan migration',
      fileName: 'slack-to-teams-basic-plan-included.docx',
      combinations: ['slack-to-teams'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 1,
      keywords: ['slack', 'teams', 'messaging', 'basic', 'included', 'features']
    },
    {
      name: 'Slack to Teams Basic Plan - Basic Not Include',
      description: 'Documentation for features not included in Slack to Teams Basic Plan migration',
      fileName: 'slack-to-teams-basic-plan-notincluded.docx',
      combinations: ['slack-to-teams'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 2,
      keywords: ['slack', 'teams', 'messaging', 'basic', 'not included', 'features', 'limitations']
    },
    {
      name: 'Slack to Teams Standard Plan - Standard Include',
      description: 'Documentation for features included in Slack to Teams Standard Plan migration',
      fileName: 'slack-to-teams-standard-plan-included.docx',
      combinations: ['slack-to-teams'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 3,
      keywords: ['slack', 'teams', 'messaging', 'standard', 'included', 'features']
    },
    {
      name: 'Slack to Teams Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Slack to Teams Standard Plan migration',
      fileName: 'slack-to-teams-standard-plan-notincluded.docx',
      combinations: ['slack-to-teams'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 4,
      keywords: ['slack', 'teams', 'messaging', 'standard', 'not included', 'features', 'limitations']
    },
    {
      name: 'Slack to Teams Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Slack to Teams Advanced Plan migration',
      fileName: 'slack-to-teams-advanced-plan-included.docx',
      combinations: ['slack-to-teams'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 5,
      keywords: ['slack', 'teams', 'messaging', 'advanced', 'included', 'features']
    },
    {
      name: 'Slack to Teams Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Slack to Teams Advanced Plan migration',
      fileName: 'slack-to-teams-advanced-plan-notincluded.docx',
      combinations: ['slack-to-teams'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 6,
      keywords: ['slack', 'teams', 'messaging', 'advanced', 'not included', 'features', 'limitations']
    },
    // Email exhibits
    {
      name: 'Outlook to Gmail - Included Features',
      description: 'Documentation for features included in Outlook to Gmail migration',
      fileName: 'Outlook to Gmail - Included.docx',
      combinations: ['outlook-to-gmail', 'all'],
      category: 'email',
      isRequired: false,
      displayOrder: 1,
      keywords: ['outlook', 'gmail', 'email', 'included', 'features', 'migration']
    },
    {
      name: 'Outlook to Gmail - Not Included Features',
      description: 'Documentation for features not included in Outlook to Gmail migration',
      fileName: 'Outlook to Gmail - Not Included.docx',
      combinations: ['outlook-to-gmail', 'all'],
      category: 'email',
      isRequired: false,
      displayOrder: 2,
      keywords: ['outlook', 'gmail', 'email', 'not included', 'features', 'limitations']
    },
    {
      name: 'Outlook to Outlook - Included Features',
      description: 'Documentation for features included in Outlook to Outlook migration',
      fileName: 'Outlook to Outlook - Included.docx',
      combinations: ['outlook-to-outlook', 'all'],
      category: 'email',
      isRequired: false,
      displayOrder: 3,
      keywords: ['outlook', 'email', 'included', 'features', 'migration']
    },
    {
      name: 'Outlook to Outlook - Not Included Features',
      description: 'Documentation for features not included in Outlook to Outlook migration',
      fileName: 'Outlook to Outlook - Not Included.docx',
      combinations: ['outlook-to-outlook', 'all'],
      category: 'email',
      isRequired: false,
      displayOrder: 4,
      keywords: ['outlook', 'email', 'not included', 'features', 'limitations']
    },
    // ShareFile to Google Shared Drive exhibits
    {
      name: 'ShareFile to Google Shared Drive Advanced Plan - Included Features',
      description: 'Documentation for features included in ShareFile to Google Shared Drive Advanced Plan migration',
      fileName: 'sharefile-to-google-sharedrive-advanced-plan-included.docx',
      combinations: ['sharefile-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 1,
      keywords: ['sharefile', 'google', 'sharedrive', 'advanced', 'included', 'features']
    },
    {
      name: 'ShareFile to Google Shared Drive Advanced Plan - Not Included Features',
      description: 'Documentation for features not included in ShareFile to Google Shared Drive Advanced Plan migration',
      fileName: 'sharefile-to-google-sharedrive-advanced-plan-notincluded.docx',
      combinations: ['sharefile-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 2,
      keywords: ['sharefile', 'google', 'sharedrive', 'advanced', 'not included', 'features', 'limitations']
    },
    // Dropbox to Google Shared Drive (Standard) exhibits
    {
      name: 'Dropbox to Google Shared Drive Standard Plan - Standard Include',
      description: 'Documentation for features included in Dropbox to Google Shared Drive Standard Plan migration',
      fileName: 'Dropbox to Google Shared Drive Standard Plan - Standard Include.docx',
      combinations: ['dropbox-to-google', 'dropbox-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 3,
      keywords: ['dropbox', 'google', 'sharedrive', 'shared drive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Dropbox to Google Shared Drive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Dropbox to Google Shared Drive Standard Plan migration',
      fileName: 'Dropbox to Google Shared Drive Standard Plan - Standard Not Include.docx',
      combinations: ['dropbox-to-google', 'dropbox-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 4,
      keywords: ['dropbox', 'google', 'sharedrive', 'shared drive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Dropbox to Google Shared Drive (Advanced) exhibits
    {
      name: 'Dropbox to Google Shared Drive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Dropbox to Google Shared Drive Advanced Plan migration',
      fileName: 'Dropbox to Google Shared Drive Advanced Plan - Advanced Include.docx',
      combinations: ['dropbox-to-google', 'dropbox-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 5,
      keywords: ['dropbox', 'google', 'sharedrive', 'shared drive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Dropbox to Google Shared Drive Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Dropbox to Google Shared Drive Advanced Plan migration',
      fileName: 'Dropbox to Google Shared Drive Advanced Plan - Advanced Not Include.docx',
      combinations: ['dropbox-to-google', 'dropbox-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 6,
      keywords: ['dropbox', 'google', 'sharedrive', 'shared drive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Dropbox to Box (Advanced) exhibits
    {
      name: 'Dropbox to Box Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Dropbox to Box Advanced Plan migration',
      fileName: 'Dropbox to Box Advanced Plan - Included Features.docx',
      combinations: ['dropbox-to-box', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 3,
      keywords: ['dropbox', 'box', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Dropbox to Box Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Dropbox to Box Advanced Plan migration',
      fileName: 'Dropbox to Box Advanced Plan - Not Included Features.docx',
      combinations: ['dropbox-to-box', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 4,
      keywords: ['dropbox', 'box', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Dropbox to Box (Standard) exhibits
    {
      name: 'Dropbox to Box Standard Plan - Standard Include',
      description: 'Documentation for features included in Dropbox to Box Standard Plan migration',
      fileName: 'Dropbox to Box Standard Plan - Standard Include.docx',
      combinations: ['dropbox-to-box', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 5,
      keywords: ['dropbox', 'box', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Dropbox to Box Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Dropbox to Box Standard Plan migration',
      fileName: 'Dropbox to Box Standard Plan - Standard Not Include.docx',
      combinations: ['dropbox-to-box', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 6,
      keywords: ['dropbox', 'box', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Box to Box (Advanced) exhibits
    {
      name: 'Box to Box Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Box to Box Advanced Plan migration',
      fileName: 'Box to Box Advanced Plan - Advanced Include.docx',
      combinations: ['box-to-box', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 7,
      keywords: ['box', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Box to Box Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Box to Box Advanced Plan migration',
      fileName: 'Box to Box Advanced Plan - Advanced Not Include.docx',
      combinations: ['box-to-box', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 8,
      keywords: ['box', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Box to Dropbox (Standard) exhibits
    {
      name: 'Box to Dropbox Standard Plan - Standard Include',
      description: 'Documentation for features included in Box to Dropbox Standard Plan migration',
      fileName: 'Box to Dropbox Standard Plan - Standard Include.docx',
      combinations: ['box-to-dropbox', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 9,
      keywords: ['box', 'dropbox', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Box to Dropbox Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Box to Dropbox Standard Plan migration',
      fileName: 'Box to Dropbox Standard Plan - Standard Not Include.docx',
      combinations: ['box-to-dropbox', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 10,
      keywords: ['box', 'dropbox', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Box to Dropbox (Advanced) exhibits
    {
      name: 'Box to Dropbox Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Box to Dropbox Advanced Plan migration',
      fileName: 'Box to Dropbox Advanced Plan - Advanced Include.docx',
      combinations: ['box-to-dropbox', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 11,
      keywords: ['box', 'dropbox', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Box to Dropbox Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Box to Dropbox Advanced Plan migration',
      fileName: 'Box to Dropbox Advanced Plan - Advanced Not Include.docx',
      combinations: ['box-to-dropbox', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 12,
      keywords: ['box', 'dropbox', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Box to ShareFile (Advanced) exhibits
    {
      name: 'Box to ShareFile Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Box to ShareFile Advanced Plan migration',
      fileName: 'Box to ShareFile Advanced Plan - Advanced Include.docx',
      combinations: ['box-to-sharefile', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 13,
      keywords: ['box', 'sharefile', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Box to ShareFile Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Box to ShareFile Advanced Plan migration',
      fileName: 'Box to ShareFile Advanced Plan - Advanced Not Include.docx',
      combinations: ['box-to-sharefile', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 14,
      keywords: ['box', 'sharefile', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Box to ShareFile (Standard) exhibits
    {
      name: 'Box to ShareFile Standard Plan - Standard Include',
      description: 'Documentation for features included in Box to ShareFile Standard Plan migration',
      fileName: 'Box to ShareFile Standard Plan - Standard Include.docx',
      combinations: ['box-to-sharefile', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 15,
      keywords: ['box', 'sharefile', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Box to ShareFile Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Box to ShareFile Standard Plan migration',
      fileName: 'Box to ShareFile Standard Plan - Standard Not Include.docx',
      combinations: ['box-to-sharefile', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16,
      keywords: ['box', 'sharefile', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Box to Google MyDrive (Standard) exhibits
    {
      name: 'Box to Google MyDrive Standard Plan - Standard Include',
      description: 'Documentation for features included in Box to Google MyDrive Standard Plan migration',
      fileName: 'Box to Google MyDrive Standard Plan - Standard Include.docx',
      combinations: ['box-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 17,
      keywords: ['box', 'google', 'mydrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Box to Google MyDrive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Box to Google MyDrive Standard Plan migration',
      fileName: 'Box to Google MyDrive Standard Plan - Standard Not Include.docx',
      combinations: ['box-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 18,
      keywords: ['box', 'google', 'mydrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Dropbox to OneDrive (Standard) exhibits
    {
      name: 'Dropbox to OneDrive Standard Plan - Standard Include',
      description: 'Documentation for features included in Dropbox to OneDrive Standard Plan migration',
      fileName: 'Dropbox to OneDrive Standard Plan - Standard Include.docx',
      combinations: ['dropbox-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 19,
      keywords: ['dropbox', 'onedrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Dropbox to OneDrive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Dropbox to OneDrive Standard Plan migration',
      fileName: 'Dropbox to OneDrive Standard Plan - Standard Not Include.docx',
      combinations: ['dropbox-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20,
      keywords: ['dropbox', 'onedrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Dropbox to OneDrive (Advanced) exhibits
    {
      name: 'Dropbox to OneDrive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Dropbox to OneDrive Advanced Plan migration',
      fileName: 'Dropbox to OneDrive Advanced Plan - Advanced Include.docx',
      combinations: ['dropbox-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 21,
      keywords: ['dropbox', 'onedrive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Dropbox to OneDrive Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Dropbox to OneDrive Advanced Plan migration',
      fileName: 'Dropbox to OneDrive Advanced Plan - Advanced Not Include.docx',
      combinations: ['dropbox-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 22,
      keywords: ['dropbox', 'onedrive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Dropbox to Egnyte (Standard) exhibits
    {
      name: 'Dropbox to Egnyte Standard Plan - Standard Include',
      description: 'Documentation for features included in Dropbox to Egnyte Standard Plan migration',
      fileName: 'Dropbox to Egnyte Standard Plan - Standard Include.docx',
      combinations: ['dropbox-to-egnyte', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 7,
      keywords: ['dropbox', 'egnyte', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Dropbox to Egnyte Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Dropbox to Egnyte Standard Plan migration',
      fileName: 'Dropbox to Egnyte Standard Plan - Standard Not Include.docx',
      combinations: ['dropbox-to-egnyte', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 8,
      keywords: ['dropbox', 'egnyte', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Dropbox to Egnyte (Advanced) exhibits
    {
      name: 'Dropbox to Egnyte Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Dropbox to Egnyte Advanced Plan migration',
      fileName: 'Dropbox to Egnyte Advanced Plan - Advanced Include.docx',
      combinations: ['dropbox-to-egnyte', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 9,
      keywords: ['dropbox', 'egnyte', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Dropbox to Egnyte Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Dropbox to Egnyte Advanced Plan migration',
      fileName: 'Dropbox to Egnyte Advanced Plan - Advanced Not Include.docx',
      combinations: ['dropbox-to-egnyte', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 10,
      keywords: ['dropbox', 'egnyte', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Dropbox to MyDrive (Advanced) exhibits
    {
      name: 'Dropbox to MyDrive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Dropbox to MyDrive Advanced Plan migration',
      fileName: 'Dropbox to MyDrive Advanced Plan - Advanced Include.docx',
      combinations: ['dropbox-to-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 11,
      keywords: ['dropbox', 'mydrive', 'google', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Dropbox to MyDrive Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Dropbox to MyDrive Advanced Plan migration',
      fileName: 'Dropbox to MyDrive Advanced Plan - Advanced Not Include.docx',
      combinations: ['dropbox-to-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 12,
      keywords: ['dropbox', 'mydrive', 'google', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Dropbox to MyDrive (Standard) exhibits
    {
      name: 'Dropbox to MyDrive Standard Plan - Standard Include',
      description: 'Documentation for features included in Dropbox to MyDrive Standard Plan migration',
      fileName: 'Dropbox to MyDrive Standard Plan - Standard Include.docx',
      combinations: ['dropbox-to-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 13,
      keywords: ['dropbox', 'mydrive', 'google', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Dropbox to MyDrive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Dropbox to MyDrive Standard Plan migration',
      fileName: 'Dropbox to MyDrive Standard Plan - Standard Not Include.docx',
      combinations: ['dropbox-to-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 14,
      keywords: ['dropbox', 'mydrive', 'google', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // OneDrive to OneDrive exhibits
    {
      name: 'OneDrive to OneDrive Standard Plan - Included Features',
      description: 'Documentation for features included in OneDrive to OneDrive Standard Plan migration',
      fileName: 'OneDrive to OneDrive Standard Plan - Included Features.docx',
      combinations: ['onedrive-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 1,
      keywords: ['onedrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'OneDrive to OneDrive Standard Plan - Not Included Features',
      description: 'Documentation for features not included in OneDrive to OneDrive Standard Plan migration',
      fileName: 'onedrive-to-onedrive-standard-plan-notincluded.docx.docx',
      combinations: ['onedrive-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 2,
      keywords: ['onedrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    {
      name: 'MyDrive Migration Guide',
      description: 'Step-by-step preparation guide for Google MyDrive migration',
      fileName: 'exhibit-mydrive-to-mydrive-guide.docx',
      combinations: ['google-mydrive-to-google-mydrive'],
      category: 'content',
      isRequired: false,
      displayOrder: 2,
      keywords: ['google', 'mydrive', 'guide', 'migration']
    },
    {
      name: 'Workspace Permissions',
      description: 'Permissions mapping and access control documentation',
      fileName: 'exhibit-mydrive-to-mydrive-permissions.docx',
      combinations: ['google-mydrive-to-google-mydrive'],
      category: 'content',
      isRequired: false,
      displayOrder: 3,
      keywords: ['permissions', 'access', 'workspace']
    },
    {
      name: 'Drive File Structure',
      description: 'File organization and folder structure best practices',
      fileName: 'exhibit-mydrive-to-mydrive-structure.docx',
      combinations: ['google-mydrive-to-google-mydrive'],
      category: 'content',
      isRequired: false,
      displayOrder: 4,
      keywords: ['structure', 'files', 'folders']
    },
    // General exhibits (available for all combinations)
    {
      name: 'Data Privacy Agreement',
      description: 'Standard data privacy and GDPR compliance agreement',
      fileName: 'exhibit-data-privacy.docx',
      combinations: ['all'],
      category: 'content',
      isRequired: false,
      displayOrder: 10,
      keywords: ['privacy', 'gdpr', 'data', 'security']
    },
    {
      name: 'SLA Terms',
      description: 'Service Level Agreement terms and uptime guarantees',
      fileName: 'exhibit-sla-terms.docx',
      combinations: ['all'],
      category: 'content',
      isRequired: false,
      displayOrder: 11,
      keywords: ['sla', 'service', 'uptime', 'support']
    },
    {
      name: 'Migration Checklist',
      description: 'Pre-migration checklist and preparation requirements',
      fileName: 'exhibit-migration-checklist.docx',
      combinations: ['all'],
      category: 'content',
      isRequired: false,
      displayOrder: 12,
      keywords: ['checklist', 'migration', 'preparation']
    }
  ];

  const exhibitsDir = path.resolve(__dirname, 'backend-exhibits');
  let seededCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  // Check if directory exists
  if (!fs.existsSync(exhibitsDir)) {
    // Silently create directory if it doesn't exist (backend-exhibits may have been removed)
    fs.mkdirSync(exhibitsDir, { recursive: true });
  }

  for (const exhibit of defaultExhibits) {
    try {
      const filePath = path.join(exhibitsDir, exhibit.fileName);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        // Silently skip missing files (backend-exhibits directory may not exist)
        skippedCount++;
        continue;
      }

      const fileStats = fs.statSync(filePath);
      const fileBuffer = fs.readFileSync(filePath);
      const fileData = fileBuffer.toString('base64');

      const exhibitDoc = {
        ...exhibit,
        fileData,
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: fileStats.size,
        updatedAt: new Date(),
        version: 1
      };

      // Check if exhibit already exists
      const existing = await db.collection('exhibits').findOne({
        fileName: exhibit.fileName
      });

      if (existing) {
        // Update if file is newer OR metadata changed (combinations/category/name/etc).
        const existingModified = existing.updatedAt || existing.createdAt || new Date(0);
        const metadataChanged = (() => {
          const keysToCompare = ['name', 'description', 'fileName', 'category', 'isRequired', 'displayOrder', 'keywords', 'combinations'];
          for (const key of keysToCompare) {
            const a = existing[key];
            const b = exhibit[key];
            if (Array.isArray(a) || Array.isArray(b)) {
              const aArr = Array.isArray(a) ? a : [];
              const bArr = Array.isArray(b) ? b : [];
              if (aArr.length !== bArr.length) return true;
              const aSorted = [...aArr].map(String).sort();
              const bSorted = [...bArr].map(String).sort();
              for (let i = 0; i < aSorted.length; i++) {
                if (aSorted[i] !== bSorted[i]) return true;
              }
            } else if ((a ?? null) !== (b ?? null)) {
              return true;
            }
          }
          return false;
        })();

        if (fileStats.mtime > existingModified || metadataChanged) {
          await db.collection('exhibits').updateOne(
            { fileName: exhibit.fileName },
            {
              $set: {
                ...exhibitDoc,
                createdAt: existing.createdAt,
                version: (existing.version || 0) + 1
              }
            }
          );
          console.log(`✅ Updated exhibit: ${exhibit.name}${metadataChanged && fileStats.mtime <= existingModified ? ' (metadata changed)' : ''}`);
          updatedCount++;
        } else {
          console.log(`⏭️  Skipped (up to date): ${exhibit.name}`);
          skippedCount++;
        }
      } else {
        // Insert new exhibit
        exhibitDoc.createdAt = new Date();
        await db.collection('exhibits').insertOne(exhibitDoc);
        console.log(`✅ Seeded exhibit: ${exhibit.name}`);
        seededCount++;
      }

    } catch (error) {
      console.error(`❌ Error seeding exhibit ${exhibit.name}:`, error);
    }
  }

  console.log(`\n📊 Exhibits Seeding Summary:`);
  console.log(`   ✅ New: ${seededCount}`);
  console.log(`   🔄 Updated: ${updatedCount}`);
  console.log(`   ⏭️  Skipped: ${skippedCount}`);
  console.log(`   📁 Total in config: ${defaultExhibits.length}\n`);

  return true;
}

module.exports = { seedDefaultExhibits };



