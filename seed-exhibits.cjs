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

  // Cleanup: remove legacy/incorrectly named exhibits to avoid duplicates in UI.
  // (We key exhibits by fileName; if the fileName changes, the old record remains unless removed.)
  try {
    const legacyFileNamesToRemove = [
      // Old OneDrive->OneDrive Standard not-included exhibit used a double extension; file is now single ".docx"
      'onedrive-to-onedrive-standard-plan-notincluded.docx.docx',
      // Old Egnyte->SharePoint Online Advanced Not Include exhibit filename had a typo ("Not Includ")
      'Egnyte to SharePoint Online Advanced Plan - Advanced Not Includ.docx',
      // Old non-"Online" Egnyte->SharePoint exhibits (keep only the "Egnyte to SharePoint Online ..." variants)
      'Egnyte to SharePoint Standard Plan - Standard Include.docx',
      'Egnyte to SharePoint Standard Plan - Standard Not Include.docx',
    ];
    const result = await db.collection('exhibits').deleteMany({
      fileName: { $in: legacyFileNamesToRemove },
    });
    if (result.deletedCount) {
      console.log(`🧹 Removed ${result.deletedCount} legacy exhibit record(s)`);
    }
  } catch (e) {
    console.warn('⚠️ Could not cleanup legacy exhibits:', e?.message || e);
  }

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
    {
      name: 'Slack to Google Chat Basic Plan - Basic Include',
      description: 'Documentation for features included in Slack to Google Chat Basic Plan migration',
      fileName: 'Slack to Google Chat Basic Plan - Basic Include.docx',
      combinations: ['slack-to-google-chat'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 6.5,
      keywords: ['slack', 'google', 'chat', 'google chat', 'messaging', 'basic', 'included', 'features']
    },
    {
      name: 'Slack to Google Chat Basic Plan - Basic Not Include',
      description: 'Documentation for features not included in Slack to Google Chat Basic Plan migration',
      fileName: 'Slack to Google Chat Basic Plan - Basic Not Include.docx',
      combinations: ['slack-to-google-chat'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 6.6,
      keywords: ['slack', 'google', 'chat', 'google chat', 'messaging', 'basic', 'not included', 'features', 'limitations']
    },
    {
      name: 'Slack to Google Chat Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Slack to Google Chat Advanced Plan migration',
      fileName: 'Slack to Google Chat Advanced Plan - Advanced Include.docx',
      combinations: ['slack-to-google-chat'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 6.7,
      keywords: ['slack', 'google', 'chat', 'google chat', 'messaging', 'advanced', 'included', 'features']
    },
    {
      name: 'Slack to Google Chat Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Slack to Google Chat Advanced Plan migration',
      fileName: 'Slack to Google Chat Advanced Plan - Advanced Not Include.docx',
      combinations: ['slack-to-google-chat'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 6.8,
      keywords: ['slack', 'google', 'chat', 'google chat', 'messaging', 'advanced', 'not included', 'features', 'limitations']
    },
    // Slack to Slack exhibits (no plan tier; only included / not included)
    {
      name: 'Slack to Slack - Included Features',
      description: 'Documentation for features included in Slack to Slack migration',
      fileName: 'Slack to Slack - Included.docx.docx',
      combinations: ['slack-to-slack', 'all'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 7,
      keywords: ['slack', 'messaging', 'included', 'features', 'migration']
    },
    {
      name: 'Slack to Slack - Not Included Features',
      description: 'Documentation for features not included in Slack to Slack migration',
      fileName: 'Slack to Slack - Not Included.docx.docx',
      combinations: ['slack-to-slack', 'all'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 8,
      keywords: ['slack', 'messaging', 'not included', 'features', 'limitations', 'migration']
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
    // Standard plan
    {
      name: 'ShareFile to Google Shared Drive Standard Plan - Standard Include',
      description: 'Documentation for features included in ShareFile to Google Shared Drive Standard Plan migration',
      fileName: 'ShareFile to Google Shared Drive Standard Plan - Standard Include.docx',
      combinations: ['sharefile-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 0.9,
      keywords: ['sharefile', 'google', 'sharedrive', 'shared drive', 'standard', 'included', 'features']
    },
    {
      name: 'ShareFile to Google Shared Drive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in ShareFile to Google Shared Drive Standard Plan migration',
      fileName: 'ShareFile to Google Shared Drive Standard Plan - Standard Not Include.docx',
      combinations: ['sharefile-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 0.95,
      keywords: ['sharefile', 'google', 'sharedrive', 'shared drive', 'standard', 'not included', 'features', 'limitations']
    },
    // Advanced plan
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
    // Box to Box (Standard) exhibits
    {
      name: 'Box to Box Standard Plan - Standard Include',
      description: 'Documentation for features included in Box to Box Standard Plan migration',
      fileName: 'Box to Box Standard Plan - Standard Include.docx',
      combinations: ['box-to-box', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 6.9,
      keywords: ['box', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Box to Box Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Box to Box Standard Plan migration',
      fileName: 'Box to Box Standard Plan - Standard Not Include.docx',
      combinations: ['box-to-box', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 6.95,
      keywords: ['box', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
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
    // ShareFile to ShareFile (Standard) exhibits
    {
      name: 'ShareFile to ShareFile Standard Plan - Standard Include',
      description: 'Documentation for features included in ShareFile to ShareFile Standard Plan migration',
      fileName: 'ShareFile to ShareFile Standard Plan - Standard Include.docx',
      combinations: ['sharefile-to-sharefile', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.45,
      keywords: ['sharefile', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'ShareFile to ShareFile Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in ShareFile to ShareFile Standard Plan migration',
      fileName: 'ShareFile to ShareFile Standard Plan - Standard Not Include.docx',
      combinations: ['sharefile-to-sharefile', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.46,
      keywords: ['sharefile', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // ShareFile to ShareFile (Advanced) exhibits
    {
      name: 'ShareFile to ShareFile Advanced Plan - Advanced Include',
      description: 'Documentation for features included in ShareFile to ShareFile Advanced Plan migration',
      fileName: 'ShareFile to ShareFile Advanced Plan - Advanced Include.docx',
      combinations: ['sharefile-to-sharefile', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.5,
      keywords: ['sharefile', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'ShareFile to ShareFile Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in ShareFile to ShareFile Advanced Plan migration',
      fileName: 'ShareFile to ShareFile Advanced Plan - Advanced Not Include.docx',
      combinations: ['sharefile-to-sharefile', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.6,
      keywords: ['sharefile', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // ShareFile to OneDrive (Standard) exhibits
    {
      name: 'ShareFile to OneDrive Standard Plan - Standard Include',
      description: 'Documentation for features included in ShareFile to OneDrive Standard Plan migration',
      fileName: 'ShareFile to OneDrive Standard Plan - Standard Include.docx',
      combinations: ['sharefile-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.65,
      keywords: ['sharefile', 'onedrive', 'microsoft', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'ShareFile to OneDrive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in ShareFile to OneDrive Standard Plan migration',
      fileName: 'ShareFile to OneDrive Standard Plan - Standard Not Include.docx',
      combinations: ['sharefile-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.66,
      keywords: ['sharefile', 'onedrive', 'microsoft', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // ShareFile to OneDrive (Advanced) exhibits
    {
      name: 'ShareFile to OneDrive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in ShareFile to OneDrive Advanced Plan migration',
      fileName: 'ShareFile to OneDrive Advanced Plan - Advanced Include.docx',
      combinations: ['sharefile-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.7,
      keywords: ['sharefile', 'onedrive', 'microsoft', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'ShareFile to OneDrive Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in ShareFile to OneDrive Advanced Plan migration',
      fileName: 'ShareFile to OneDrive Advanced Plan - Advanced Not Include.docx',
      combinations: ['sharefile-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.8,
      keywords: ['sharefile', 'onedrive', 'microsoft', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // ShareFile to Google MyDrive (Standard) exhibits
    {
      name: 'ShareFile to Google MyDrive Standard Plan - Standard Include',
      description: 'Documentation for features included in ShareFile to Google MyDrive Standard Plan migration',
      fileName: 'ShareFile to Google MyDrive Standard Plan - Standard Include.docx',
      combinations: ['sharefile-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.85,
      keywords: ['sharefile', 'google', 'mydrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'ShareFile to Google MyDrive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in ShareFile to Google MyDrive Standard Plan migration',
      fileName: 'ShareFile to Google MyDrive Standard Plan - Standard Not Include.docx',
      combinations: ['sharefile-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.86,
      keywords: ['sharefile', 'google', 'mydrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // ShareFile to Google MyDrive (Advanced) exhibits
    {
      name: 'ShareFile to Google MyDrive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in ShareFile to Google MyDrive Advanced Plan migration',
      fileName: 'ShareFile to Google MyDrive Advanced Plan - Advanced Include.docx',
      combinations: ['sharefile-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.9,
      keywords: ['sharefile', 'google', 'mydrive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'ShareFile to Google MyDrive Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in ShareFile to Google MyDrive Advanced Plan migration',
      fileName: 'ShareFile to Google MyDrive Advanced Plan - Advanced Not Include.docx',
      combinations: ['sharefile-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 17.0,
      keywords: ['sharefile', 'google', 'mydrive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
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
    // Box to Google MyDrive (Advanced) exhibits
    {
      name: 'Box to Google MyDrive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Box to Google MyDrive Advanced Plan migration',
      fileName: 'Box to Google MyDrive Advanced Plan - Advanced Include.docx',
      combinations: ['box-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 19,
      keywords: ['box', 'google', 'mydrive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Box to Google Shared Drive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Box to Google Shared Drive Advanced Plan migration',
      fileName: 'Box to Google Shared Drive Advanced Plan - Advanced Include.docx',
      combinations: ['box-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 19.5,
      keywords: ['box', 'google', 'sharedrive', 'shared drive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Box to Google Shared Drive Standard Plan - Standard Include',
      description: 'Documentation for features included in Box to Google Shared Drive Standard Plan migration',
      fileName: 'Box to Google Shared Drive Standard Plan - Standard Include.docx',
      combinations: ['box-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 19.6,
      keywords: ['box', 'google', 'sharedrive', 'shared drive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Box to Google Shared Drive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Box to Google Shared Drive Standard Plan migration',
      fileName: 'Box to Google Shared Drive Standard Plan - Standard Not Include.docx',
      combinations: ['box-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 19.7,
      keywords: ['box', 'google', 'sharedrive', 'shared drive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Box to OneDrive exhibits
    {
      name: 'Box to OneDrive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Box to OneDrive Advanced Plan migration',
      fileName: 'Box to OneDrive Advanced Plan - Advanced Include.docx',
      combinations: ['box-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 19.8,
      keywords: ['box', 'onedrive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Box to OneDrive Standard Plan - Standard Include',
      description: 'Documentation for features included in Box to OneDrive Standard Plan migration',
      fileName: 'Box to OneDrive Standard Plan - Standard Include.docx',
      combinations: ['box-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 19.9,
      keywords: ['box', 'onedrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Box to OneDrive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Box to OneDrive Standard Plan migration',
      fileName: 'Box to OneDrive Standard Plan - Standard Not Include.docx',
      combinations: ['box-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 19.95,
      keywords: ['box', 'onedrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Box to SharePoint Online exhibits
    {
      name: 'Box to SharePoint Online Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Box to SharePoint Online Advanced Plan migration',
      fileName: 'Box to SharePoint Online Advanced Plan - Advanced Include.docx',
      combinations: ['box-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 19.96,
      keywords: ['box', 'sharepoint', 'sharepoint online', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Box to SharePoint Online Standard Plan - Standard Include',
      description: 'Documentation for features included in Box to SharePoint Online Standard Plan migration',
      fileName: 'Box to SharePoint Online Standard Plan - Standard Include.docx',
      combinations: ['box-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 19.97,
      keywords: ['box', 'sharepoint', 'sharepoint online', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Box to SharePoint Online Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Box to SharePoint Online Standard Plan migration',
      fileName: 'Box to SharePoint Online Standard Plan - Standard Not Include.docx',
      combinations: ['box-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 19.98,
      keywords: ['box', 'sharepoint', 'sharepoint online', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Egnyte to OneDrive exhibits (Standard)
    {
      name: 'Egnyte to OneDrive Standard Plan - Standard Include',
      description: 'Documentation for features included in Egnyte to OneDrive Standard Plan migration',
      fileName: 'Egnyte to OneDrive Standard Plan - Standard Include.docx',
      combinations: ['egnyte-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 19.99,
      keywords: ['egnyte', 'onedrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Egnyte to OneDrive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Egnyte to OneDrive Standard Plan migration',
      fileName: 'Egnyte to OneDrive Standard Plan - Standard Not Include.docx',
      combinations: ['egnyte-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20.0,
      keywords: ['egnyte', 'onedrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Egnyte to OneDrive exhibits (Advanced)
    {
      name: 'Egnyte to OneDrive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Egnyte to OneDrive Advanced Plan migration',
      fileName: 'Egnyte to OneDrive Advanced Plan - Advanced Include.docx',
      combinations: ['egnyte-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20.01,
      keywords: ['egnyte', 'onedrive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Egnyte to OneDrive Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Egnyte to OneDrive Advanced Plan migration',
      fileName: 'Egnyte to OneDrive Advanced Plan - Advanced Not Include.docx',
      combinations: ['egnyte-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20.02,
      keywords: ['egnyte', 'onedrive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Egnyte to Google Shared Drive exhibits (Standard)
    {
      name: 'Egnyte to Google Shared Drive Standard Plan - Standard Include',
      description: 'Documentation for features included in Egnyte to Google Shared Drive Standard Plan migration',
      fileName: 'Egnyte to Google Shared Drive Standard Plan - Standard Include.docx',
      combinations: ['egnyte-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20.1,
      keywords: ['egnyte', 'google', 'sharedrive', 'shared drive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Egnyte to Google Shared Drive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Egnyte to Google Shared Drive Standard Plan migration',
      fileName: 'Egnyte to Google Shared Drive Standard Plan - Standard Not Include.docx',
      combinations: ['egnyte-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20.2,
      keywords: ['egnyte', 'google', 'sharedrive', 'shared drive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Egnyte to Google MyDrive exhibits (Standard)
    {
      name: 'Egnyte to Google MyDrive Standard Plan - Standard Include',
      description: 'Documentation for features included in Egnyte to Google MyDrive Standard Plan migration',
      fileName: 'Egnyte to Google MyDrive Standard Plan - Standard Include.docx',
      combinations: ['egnyte-to-google', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20.3,
      keywords: ['egnyte', 'google', 'mydrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Egnyte to Google MyDrive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Egnyte to Google MyDrive Standard Plan migration',
      fileName: 'Egnyte to Google MyDrive Standard Plan - Standard Not Include.docx',
      combinations: ['egnyte-to-google', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20.4,
      keywords: ['egnyte', 'google', 'mydrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Egnyte to SharePoint Online exhibits (Standard)
    {
      name: 'Egnyte to SharePoint Online Standard Plan - Standard Include',
      description: 'Documentation for features included in Egnyte to SharePoint Online Standard Plan migration',
      fileName: 'Egnyte to SharePoint Online Standard Plan - Standard Include.docx',
      combinations: ['egnyte-to-sharepoint-online', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20.41,
      keywords: ['egnyte', 'sharepoint', 'sharepoint online', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Egnyte to SharePoint Online Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Egnyte to SharePoint Online Standard Plan migration',
      fileName: 'Egnyte to SharePoint Online Standard Plan - Standard Not Include.docx',
      combinations: ['egnyte-to-sharepoint-online', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20.42,
      keywords: ['egnyte', 'sharepoint', 'sharepoint online', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Egnyte to SharePoint Online exhibits (Advanced)
    {
      name: 'Egnyte to SharePoint Online Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Egnyte to SharePoint Online Advanced Plan migration',
      fileName: 'Egnyte to SharePoint Online Advanced Plan - Advanced Include.docx',
      combinations: ['egnyte-to-sharepoint-online', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20.5,
      keywords: ['egnyte', 'sharepoint', 'sharepoint online', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Egnyte to SharePoint Online Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Egnyte to SharePoint Online Advanced Plan migration',
      fileName: 'Egnyte to SharePoint Online Advanced Plan - Advanced Not Include.docx',
      combinations: ['egnyte-to-sharepoint-online', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20.6,
      keywords: ['egnyte', 'sharepoint', 'sharepoint online', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Dropbox to OneDrive (Standard) exhibits
    {
      name: 'Dropbox to OneDrive Standard Plan - Standard Include',
      description: 'Documentation for features included in Dropbox to OneDrive Standard Plan migration',
      fileName: 'Dropbox to OneDrive Standard Plan - Standard Include.docx',
      combinations: ['dropbox-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20,
      keywords: ['dropbox', 'onedrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Dropbox to OneDrive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Dropbox to OneDrive Standard Plan migration',
      fileName: 'Dropbox to OneDrive Standard Plan - Standard Not Include.docx',
      combinations: ['dropbox-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 21,
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
      displayOrder: 22,
      keywords: ['dropbox', 'onedrive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Dropbox to OneDrive Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Dropbox to OneDrive Advanced Plan migration',
      fileName: 'Dropbox to OneDrive Advanced Plan - Advanced Not Include.docx',
      combinations: ['dropbox-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 23,
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
    // Dropbox to SharePoint Online (Standard) exhibits
    {
      name: 'Dropbox to SharePoint Online Standard Plan - Standard Include',
      description: 'Documentation for features included in Dropbox to SharePoint Online Standard Plan migration',
      fileName: 'Dropbox to SharePoint Online Standard Plan - Standard Include.docx',
      // Use existing SharePoint combination key; name clarifies "Online" for the exhibit folder.
      combinations: ['dropbox-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 15,
      keywords: ['dropbox', 'sharepoint', 'sharepoint online', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Dropbox to SharePoint Online Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Dropbox to SharePoint Online Standard Plan migration',
      fileName: 'Dropbox to SharePoint Online Standard Plan - Standard Not Include.docx',
      combinations: ['dropbox-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16,
      keywords: ['dropbox', 'sharepoint', 'sharepoint online', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google MyDrive to SharePoint Online (Standard) exhibits
    {
      name: 'Google MyDrive to SharePoint Online Standard Plan - Standard Include',
      description: 'Documentation for features included in Google MyDrive to SharePoint Online Standard Plan migration',
      fileName: 'Google MyDrive to SharePoint Online Standard Plan - Standard Include.docx',
      // Canonical CPQ combination is "google-mydrive-to-sharepoint"; exhibit name clarifies "Online" for the folder.
      combinations: ['google-mydrive-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.05,
      keywords: ['google', 'mydrive', 'sharepoint', 'sharepoint online', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google MyDrive to SharePoint Online Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Google MyDrive to SharePoint Online Standard Plan migration',
      fileName: 'Google MyDrive to SharePoint Online Standard Plan - Standard Not Include.docx',
      combinations: ['google-mydrive-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.06,
      keywords: ['google', 'mydrive', 'sharepoint', 'sharepoint online', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google MyDrive to SharePoint Online (Advanced) exhibits
    {
      name: 'Google MyDrive to SharePoint Online Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Google MyDrive to SharePoint Online Advanced Plan migration',
      fileName: 'Google MyDrive to SharePoint Online Advanced Plan - Advanced Include.docx',
      combinations: ['google-mydrive-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.061,
      keywords: ['google', 'mydrive', 'sharepoint', 'sharepoint online', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google MyDrive to SharePoint Online Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Google MyDrive to SharePoint Online Advanced Plan migration',
      fileName: 'Google MyDrive to SharePoint Online Advanced Plan - Advanced Not Include.docx',
      combinations: ['google-mydrive-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.062,
      keywords: ['google', 'mydrive', 'sharepoint', 'sharepoint online', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google MyDrive to OneDrive (Standard) exhibits
    {
      name: 'Google MyDrive to OneDrive Standard Plan - Standard Include',
      description: 'Documentation for features included in Google MyDrive to OneDrive Standard Plan migration',
      fileName: 'Google MyDrive to OneDrive Standard Plan - Standard Include.docx',
      combinations: ['google-mydrive-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.07,
      keywords: ['google', 'mydrive', 'onedrive', 'microsoft', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google MyDrive to OneDrive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Google MyDrive to OneDrive Standard Plan migration',
      fileName: 'Google MyDrive to OneDrive Standard Plan - Standard Not Include.docx',
      combinations: ['google-mydrive-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.08,
      keywords: ['google', 'mydrive', 'onedrive', 'microsoft', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google MyDrive to OneDrive (Advanced) exhibits
    {
      name: 'Google MyDrive to OneDrive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Google MyDrive to OneDrive Advanced Plan migration',
      fileName: 'Google MyDrive to OneDrive Advanced Plan - Advanced Include.docx',
      combinations: ['google-mydrive-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.081,
      keywords: ['google', 'mydrive', 'onedrive', 'microsoft', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google MyDrive to OneDrive Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Google MyDrive to OneDrive Advanced Plan migration',
      fileName: 'Google MyDrive to OneDrive Advanced Plan - Advanced Not Include.docx',
      combinations: ['google-mydrive-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.082,
      keywords: ['google', 'mydrive', 'onedrive', 'microsoft', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google MyDrive to Google Shared Drive (Standard) exhibits
    {
      name: 'Google MyDrive to Google Shared Drive Standard Plan - Standard Include',
      description: 'Documentation for features included in Google MyDrive to Google Shared Drive Standard Plan migration',
      fileName: 'Google MyDrive to Google Shared Drive Standard Plan - Standard Include.docx',
      combinations: ['google-mydrive-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.09,
      keywords: ['google', 'mydrive', 'sharedrive', 'shared drive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google MyDrive to Google Shared Drive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Google MyDrive to Google Shared Drive Standard Plan migration',
      fileName: 'Google MyDrive to Google Shared Drive Standard Plan - Standard Not Include.docx',
      combinations: ['google-mydrive-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.10,
      keywords: ['google', 'mydrive', 'sharedrive', 'shared drive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google MyDrive to Google Shared Drive (Advanced) exhibits
    {
      name: 'Google MyDrive to Google Shared Drive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Google MyDrive to Google Shared Drive Advanced Plan migration',
      fileName: 'Google MyDrive to Google Shared Drive Advanced Plan - Advanced Include.docx',
      combinations: ['google-mydrive-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.101,
      keywords: ['google', 'mydrive', 'sharedrive', 'shared drive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google MyDrive to Google Shared Drive Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Google MyDrive to Google Shared Drive Advanced Plan migration',
      fileName: 'Google MyDrive to Google Shared Drive Advanced Plan - Advanced Not Include.docx',
      combinations: ['google-mydrive-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.102,
      keywords: ['google', 'mydrive', 'sharedrive', 'shared drive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google MyDrive to Google MyDrive (Standard) exhibits
    {
      name: 'Google MyDrive to Google MyDrive Standard Plan - Standard Include',
      description: 'Documentation for features included in Google MyDrive to Google MyDrive Standard Plan migration',
      fileName: 'Google MyDrive to Google MyDrive Standard Plan - Standard Include.docx',
      combinations: ['google-mydrive-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.11,
      keywords: ['google', 'mydrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google MyDrive to Google MyDrive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Google MyDrive to Google MyDrive Standard Plan migration',
      fileName: 'Google MyDrive to Google MyDrive Standard Plan - Standard Not Include.docx',
      combinations: ['google-mydrive-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.12,
      keywords: ['google', 'mydrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google MyDrive to Google MyDrive (Advanced) exhibits
    {
      name: 'Google MyDrive to Google MyDrive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Google MyDrive to Google MyDrive Advanced Plan migration',
      fileName: 'Google MyDrive to Google MyDrive Advanced Plan - Advanced Include.docx',
      combinations: ['google-mydrive-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.125,
      keywords: ['google', 'mydrive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google MyDrive to Google MyDrive Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Google MyDrive to Google MyDrive Advanced Plan migration',
      fileName: 'Google MyDrive to Google MyDrive Advanced Plan - Advanced Not Include.docx',
      combinations: ['google-mydrive-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.126,
      keywords: ['google', 'mydrive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google MyDrive to Egnyte (Standard) exhibits
    {
      name: 'Google MyDrive to Egnyte Standard Plan - Standard Include',
      description: 'Documentation for features included in Google MyDrive to Egnyte Standard Plan migration',
      fileName: 'Google MyDrive to Egnyte Standard Plan - Standard Include.docx',
      combinations: ['google-mydrive-to-egnyte', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.13,
      keywords: ['google', 'mydrive', 'egnyte', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google MyDrive to Egnyte Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Google MyDrive to Egnyte Standard Plan migration',
      fileName: 'Google MyDrive to Egnyte Standard Plan - Standard Not Include.docx',
      combinations: ['google-mydrive-to-egnyte', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.14,
      keywords: ['google', 'mydrive', 'egnyte', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google MyDrive to Egnyte (Advanced) exhibits
    {
      name: 'Google MyDrive to Egnyte Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Google MyDrive to Egnyte Advanced Plan migration',
      fileName: 'Google MyDrive to Egnyte Advanced Plan - Advanced Include.docx',
      combinations: ['google-mydrive-to-egnyte', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.141,
      keywords: ['google', 'mydrive', 'egnyte', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google MyDrive to Egnyte Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Google MyDrive to Egnyte Advanced Plan migration',
      fileName: 'Google MyDrive to Egnyte Advanced Plan - Advanced Not Include.docx',
      combinations: ['google-mydrive-to-egnyte', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.142,
      keywords: ['google', 'mydrive', 'egnyte', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google MyDrive to Dropbox (Standard) exhibits
    {
      name: 'Google MyDrive to Dropbox Standard Plan - Standard Include',
      description: 'Documentation for features included in Google MyDrive to Dropbox Standard Plan migration',
      fileName: 'Google MyDrive to Dropbox Standard Plan - Standard Include.docx',
      combinations: ['google-mydrive-to-dropbox', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.15,
      keywords: ['google', 'mydrive', 'dropbox', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google MyDrive to Dropbox Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Google MyDrive to Dropbox Standard Plan migration',
      fileName: 'Google MyDrive to Dropbox Standard Plan - Standard Not Include.docx',
      combinations: ['google-mydrive-to-dropbox', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.16,
      keywords: ['google', 'mydrive', 'dropbox', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google MyDrive to Dropbox (Advanced) exhibits
    {
      name: 'Google MyDrive to Dropbox Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Google MyDrive to Dropbox Advanced Plan migration',
      fileName: 'Google MyDrive to Dropbox Advanced Plan - Advanced Include.docx',
      combinations: ['google-mydrive-to-dropbox', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.161,
      keywords: ['google', 'mydrive', 'dropbox', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google MyDrive to Dropbox Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Google MyDrive to Dropbox Advanced Plan migration',
      fileName: 'Google MyDrive to Dropbox Advanced Plan - Advanced Not Include.docx',
      combinations: ['google-mydrive-to-dropbox', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.162,
      keywords: ['google', 'mydrive', 'dropbox', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google MyDrive to Box (Standard) exhibits
    {
      name: 'Google MyDrive to Box Standard Plan - Standard Include',
      description: 'Documentation for features included in Google MyDrive to Box Standard Plan migration',
      fileName: 'Google MyDrive to Box Standard Plan - Standard Include.docx',
      // No dedicated CPQ combination key exists yet for Google MyDrive -> Box; keep available for all.
      combinations: ['all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.165,
      keywords: ['google', 'mydrive', 'box', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google MyDrive to Box Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Google MyDrive to Box Standard Plan migration',
      fileName: 'Google MyDrive to Box Standard Plan - Standard Not Include.docx',
      combinations: ['all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.166,
      keywords: ['google', 'mydrive', 'box', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google MyDrive to Box (Advanced) exhibits
    {
      name: 'Google MyDrive to Box Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Google MyDrive to Box Advanced Plan migration',
      fileName: 'Google MyDrive to Box Advanced Plan - Advanced Include.docx',
      // No dedicated CPQ combination key exists yet for Google MyDrive -> Box; keep available for all.
      combinations: ['all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.167,
      keywords: ['google', 'mydrive', 'box', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google MyDrive to Box Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Google MyDrive to Box Advanced Plan migration',
      fileName: 'Google MyDrive to Box Advanced Plan - Advanced Not Include.docx',
      combinations: ['all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.168,
      keywords: ['google', 'mydrive', 'box', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // NFS to SharePoint Online (Standard) exhibits
    {
      name: 'NFS to SharePoint Online Standard Plan - Standard Include',
      description: 'Documentation for features included in NFS to SharePoint Online Standard Plan migration',
      fileName: 'NFS to SharePoint Online Standard Plan - Standard Include.docx',
      // NFS uses a combined Microsoft route (OneDrive/SharePoint) in CPQ: nfs-to-microsoft
      combinations: ['nfs-to-microsoft', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.1,
      keywords: ['nfs', 'sharepoint', 'sharepoint online', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'NFS to SharePoint Online Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in NFS to SharePoint Online Standard Plan migration',
      fileName: 'NFS to SharePoint Online Standard Plan - Standard Not Include.docx',
      combinations: ['nfs-to-microsoft', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.2,
      keywords: ['nfs', 'sharepoint', 'sharepoint online', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // NFS to OneDrive (Standard) exhibits
    {
      name: 'NFS to OneDrive Standard Plan - Standard Include',
      description: 'Documentation for features included in NFS to OneDrive Standard Plan migration',
      fileName: 'NFS to OneDrive Standard Plan - Standard Include.docx',
      combinations: ['nfs-to-microsoft', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.25,
      keywords: ['nfs', 'onedrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'NFS to OneDrive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in NFS to OneDrive Standard Plan migration',
      fileName: 'NFS to OneDrive Standard Plan - Standard Not Include.docx',
      combinations: ['nfs-to-microsoft', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.26,
      keywords: ['nfs', 'onedrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // NFS to OneDrive (Advanced) exhibits
    {
      name: 'NFS to OneDrive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in NFS to OneDrive Advanced Plan migration',
      fileName: 'NFS to OneDrive Advanced Plan - Advanced Include.docx',
      combinations: ['nfs-to-microsoft', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.27,
      keywords: ['nfs', 'onedrive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'NFS to OneDrive Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in NFS to OneDrive Advanced Plan migration',
      fileName: 'NFS to OneDrive Advanced Plan - Advanced Not Include.docx',
      combinations: ['nfs-to-microsoft', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.28,
      keywords: ['nfs', 'onedrive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // NFS to Google Shared Drive (Advanced) exhibits
    {
      name: 'NFS to Google Shared Drive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in NFS to Google Shared Drive Advanced Plan migration',
      fileName: 'NFS to Google Shared Drive Advanced Plan - Advanced Include.docx',
      // NFS uses a combined Google route (MyDrive/Shared Drive) in CPQ: nfs-to-google
      combinations: ['nfs-to-google', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.29,
      keywords: ['nfs', 'google', 'sharedrive', 'shared drive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'NFS to Google Shared Drive Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in NFS to Google Shared Drive Advanced Plan migration',
      fileName: 'NFS to Google Shared Drive Advanced Plan - Advanced Not Include.docx',
      combinations: ['nfs-to-google', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.30,
      keywords: ['nfs', 'google', 'sharedrive', 'shared drive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // NFS to Google Shared Drive (Standard) exhibits
    {
      name: 'NFS to Google Shared Drive Standard Plan - Standard Include',
      description: 'Documentation for features included in NFS to Google Shared Drive Standard Plan migration',
      fileName: 'NFS to Google Shared Drive Standard Plan - Standard Include.docx',
      combinations: ['nfs-to-google', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.31,
      keywords: ['nfs', 'google', 'sharedrive', 'shared drive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'NFS to Google Shared Drive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in NFS to Google Shared Drive Standard Plan migration',
      fileName: 'NFS to Google Shared Drive Standard Plan - Standard Not Include.docx',
      combinations: ['nfs-to-google', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.32,
      keywords: ['nfs', 'google', 'sharedrive', 'shared drive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // NFS to Google MyDrive (Standard) exhibits
    {
      name: 'NFS to Google MyDrive Standard Plan - Standard Include',
      description: 'Documentation for features included in NFS to Google MyDrive Standard Plan migration',
      fileName: 'NFS to Google MyDrive Standard Plan - Standard Include.docx',
      combinations: ['nfs-to-google', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.33,
      keywords: ['nfs', 'google', 'mydrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'NFS to Google MyDrive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in NFS to Google MyDrive Standard Plan migration',
      fileName: 'NFS to Google MyDrive Standard Plan - Standard Not Include.docx',
      combinations: ['nfs-to-google', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.34,
      keywords: ['nfs', 'google', 'mydrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // NFS to Google MyDrive (Advanced) exhibits
    {
      name: 'NFS to Google MyDrive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in NFS to Google MyDrive Advanced Plan migration',
      fileName: 'NFS to Google MyDrive Advanced Plan - Advanced Include.docx',
      combinations: ['nfs-to-google', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.35,
      keywords: ['nfs', 'google', 'mydrive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'NFS to Google MyDrive Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in NFS to Google MyDrive Advanced Plan migration',
      fileName: 'NFS to Google MyDrive Advanced Plan - Advanced Not Include.docx',
      combinations: ['nfs-to-google', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.36,
      keywords: ['nfs', 'google', 'mydrive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // NFS to SharePoint Online (Advanced) exhibits
    {
      name: 'NFS to SharePoint Online Advanced Plan - Advanced Include',
      description: 'Documentation for features included in NFS to SharePoint Online Advanced Plan migration',
      fileName: 'NFS to SharePoint Online Advanced Plan - Advanced Include.docx',
      combinations: ['nfs-to-microsoft', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.3,
      keywords: ['nfs', 'sharepoint', 'sharepoint online', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'NFS to SharePoint Online Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in NFS to SharePoint Online Advanced Plan migration',
      fileName: 'NFS to SharePoint Online Advanced Plan - Advanced Not Include.docx',
      combinations: ['nfs-to-microsoft', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16.4,
      keywords: ['nfs', 'sharepoint', 'sharepoint online', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Dropbox to SharePoint Online (Advanced) exhibits
    {
      name: 'Dropbox to SharePoint Online Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Dropbox to SharePoint Online Advanced Plan migration',
      fileName: 'Dropbox to SharePoint Online Advanced Plan - Advanced Include.docx',
      combinations: ['dropbox-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 17,
      keywords: ['dropbox', 'sharepoint', 'sharepoint online', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Dropbox to SharePoint Online Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Dropbox to SharePoint Online Advanced Plan migration',
      fileName: 'Dropbox to SharePoint Online Advanced Plan - Advanced Not Include.docx',
      combinations: ['dropbox-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 18,
      keywords: ['dropbox', 'sharepoint', 'sharepoint online', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // ShareFile to SharePoint Online (Standard) exhibits
    {
      name: 'ShareFile to SharePoint Online Standard Plan - Standard Include',
      description: 'Documentation for features included in ShareFile to SharePoint Online Standard Plan migration',
      fileName: 'ShareFile to SharePoint Online Standard Plan - Standard Include.docx',
      // Canonical CPQ combination is "sharefile-to-sharepoint"; exhibit name clarifies "Online" for the folder.
      combinations: ['sharefile-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 18.45,
      keywords: ['sharefile', 'sharepoint', 'sharepoint online', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'ShareFile to SharePoint Online Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in ShareFile to SharePoint Online Standard Plan migration',
      fileName: 'ShareFile to SharePoint Online Standard Plan - Standard Not Include.docx',
      combinations: ['sharefile-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 18.46,
      keywords: ['sharefile', 'sharepoint', 'sharepoint online', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // ShareFile to SharePoint Online (Advanced) exhibits
    {
      name: 'ShareFile to SharePoint Online Advanced Plan - Advanced Include',
      description: 'Documentation for features included in ShareFile to SharePoint Online Advanced Plan migration',
      fileName: 'ShareFile to SharePoint Online Advanced Plan - Advanced Include.docx',
      // Canonical CPQ combination is "sharefile-to-sharepoint"; exhibit name clarifies "Online" for the folder.
      combinations: ['sharefile-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 18.5,
      keywords: ['sharefile', 'sharepoint', 'sharepoint online', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'ShareFile to SharePoint Online Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in ShareFile to SharePoint Online Advanced Plan migration',
      fileName: 'ShareFile to SharePoint Online Advanced Plan - Advanced Not Include.docx',
      combinations: ['sharefile-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 18.6,
      keywords: ['sharefile', 'sharepoint', 'sharepoint online', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // SharePoint to SharePoint Online (Standard) exhibits
    {
      name: 'SharePoint to SharePoint Online Standard Plan - Standard Include',
      description: 'Documentation for features included in SharePoint to SharePoint Online Standard Plan migration',
      fileName: 'SharePoint to SharePoint Online Standard Plan - Standard Include.docx',
      // No dedicated SharePoint->SharePoint Online combination key exists yet; keep available for all.
      combinations: ['all'],
      category: 'content',
      isRequired: false,
      displayOrder: 18.55,
      keywords: ['sharepoint', 'sharepoint online', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'SharePoint to SharePoint Online Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in SharePoint to SharePoint Online Standard Plan migration',
      fileName: 'SharePoint to SharePoint Online Standard Plan - Standard Not Include.docx',
      combinations: ['all'],
      category: 'content',
      isRequired: false,
      displayOrder: 18.56,
      keywords: ['sharepoint', 'sharepoint online', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // SharePoint to SharePoint Online (Advanced) exhibits
    {
      name: 'SharePoint to SharePoint Online Advanced Plan - Advanced Include',
      description: 'Documentation for features included in SharePoint to SharePoint Online Advanced Plan migration',
      fileName: 'SharePoint to SharePoint Online Advanced Plan - Advanced Include.docx',
      // No dedicated SharePoint->SharePoint Online combination key exists yet; keep available for all.
      combinations: ['all'],
      category: 'content',
      isRequired: false,
      displayOrder: 18.61,
      keywords: ['sharepoint', 'sharepoint online', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'SharePoint to SharePoint Online Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in SharePoint to SharePoint Online Advanced Plan migration',
      fileName: 'SharePoint to SharePoint Online Advanced Plan - Advanced Not Include.docx',
      combinations: ['all'],
      category: 'content',
      isRequired: false,
      displayOrder: 18.62,
      keywords: ['sharepoint', 'sharepoint online', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Egnyte to Google MyDrive (Advanced) exhibits
    {
      name: 'Egnyte to Google MyDrive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Egnyte to Google MyDrive Advanced Plan migration',
      fileName: 'Egnyte to Google MyDrive Advanced Plan - Advanced Include.docx',
      combinations: ['egnyte-to-google', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20.5,
      keywords: ['egnyte', 'google', 'mydrive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Egnyte to Google MyDrive Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Egnyte to Google MyDrive Advanced Plan migration',
      fileName: 'Egnyte to Google MyDrive Advanced Plan - Advanced Not Include.docx',
      combinations: ['egnyte-to-google', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20.6,
      keywords: ['egnyte', 'google', 'mydrive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Egnyte to Google Shared Drive (Advanced) exhibits
    {
      name: 'Egnyte to Google Shared Drive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Egnyte to Google Shared Drive Advanced Plan migration',
      fileName: 'Egnyte to Google Shared Drive Advanced Plan - Advanced Include.docx',
      combinations: ['egnyte-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20.3,
      keywords: ['egnyte', 'google', 'sharedrive', 'shared drive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Egnyte to Google Shared Drive Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Egnyte to Google Shared Drive Advanced Plan migration',
      fileName: 'Egnyte to Google Shared Drive Advanced Plan - Advanced Not Include.docx',
      combinations: ['egnyte-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20.4,
      keywords: ['egnyte', 'google', 'sharedrive', 'shared drive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
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
      fileName: 'onedrive-to-onedrive-standard-plan-notincluded.docx',
      combinations: ['onedrive-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 2,
      keywords: ['onedrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    {
      name: 'OneDrive to OneDrive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in OneDrive to OneDrive Advanced Plan migration',
      fileName: 'OneDrive to OneDrive Advanced Plan - Advanced Include.docx',
      combinations: ['onedrive-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 2.5,
      keywords: ['onedrive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'OneDrive to OneDrive Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in OneDrive to OneDrive Advanced Plan migration',
      fileName: 'OneDrive to OneDrive Advanced Plan - Advanced Not Include.docx',
      combinations: ['onedrive-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 2.6,
      keywords: ['onedrive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // OneDrive to Google MyDrive (Standard) exhibits
    {
      name: 'OneDrive to Google MyDrive Standard Plan - Standard Include',
      description: 'Documentation for features included in OneDrive to Google MyDrive Standard Plan migration',
      fileName: 'OneDrive to Google MyDrive Standard Plan - Standard Include.docx',
      combinations: ['onedrive-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 3,
      keywords: ['onedrive', 'google', 'mydrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'OneDrive to Google MyDrive Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in OneDrive to Google MyDrive Standard Plan migration',
      fileName: 'OneDrive to Google MyDrive Standard Plan - Standard Not Include.docx',
      combinations: ['onedrive-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 4,
      keywords: ['onedrive', 'google', 'mydrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // OneDrive to Google MyDrive (Advanced) exhibits
    {
      name: 'OneDrive to Google MyDrive Advanced Plan - Advanced Include',
      description: 'Documentation for features included in OneDrive to Google MyDrive Advanced Plan migration',
      fileName: 'OneDrive to Google MyDrive Advanced Plan - Advanced Include.docx',
      combinations: ['onedrive-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 4.5,
      keywords: ['onedrive', 'google', 'mydrive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'OneDrive to Google MyDrive Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in OneDrive to Google MyDrive Advanced Plan migration',
      fileName: 'OneDrive to Google MyDrive Advanced Plan - Advanced Not Include.docx',
      combinations: ['onedrive-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 4.6,
      keywords: ['onedrive', 'google', 'mydrive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
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



