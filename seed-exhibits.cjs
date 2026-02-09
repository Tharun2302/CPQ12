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
    // Teams to Teams exhibits
    {
      name: 'Teams to Teams Advanced Plan - Advanced Included',
      description: 'Documentation for features included in Teams to Teams Advanced Plan migration',
      fileName: 'Teams to Teams Advanced Plan - Advanced Included.docx',
      combinations: ['teams-to-teams'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 9,
      keywords: ['teams', 'messaging', 'advanced', 'included', 'features', 'migration']
    },
    {
      name: 'Teams to Teams Advanced Plan - Advanced Not Included',
      description: 'Documentation for features not included in Teams to Teams Advanced Plan migration',
      fileName: 'Teams to Teams Advanced Plan - Advanced Not Included.docx',
      combinations: ['teams-to-teams'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 10,
      keywords: ['teams', 'messaging', 'advanced', 'not included', 'features', 'limitations', 'migration']
    },
    // Teams to Google Chat exhibits
    {
      name: 'Teams to Google Chat - Included Features',
      description: 'Documentation for features included in Teams to Google Chat migration',
      fileName: 'Teams to Google Chat - Included Features.docx',
      combinations: ['teams-to-google-chat', 'all'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 11,
      keywords: ['teams', 'google', 'chat', 'messaging', 'included', 'features', 'migration']
    },
    {
      name: 'Teams to Google Chat - Not Included Feature',
      description: 'Documentation for features not included in Teams to Google Chat migration',
      fileName: 'Teams to Google Chat - Not Included Feature.docx',
      combinations: ['teams-to-google-chat', 'all'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 12,
      keywords: ['teams', 'google', 'chat', 'messaging', 'not included', 'features', 'limitations', 'migration']
    },
    // Meta to Google Chat exhibits
    {
      name: 'Meta to Google Chat - Included Features',
      description: 'Documentation for features included in Meta to Google Chat migration',
      fileName: 'Meta to Google Chat - Included Features.docx',
      combinations: ['meta-to-google-chat', 'all'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 13,
      keywords: ['meta', 'google', 'chat', 'messaging', 'included', 'features', 'migration']
    },
    {
      name: 'Meta to Google Chat - Not Included Feature',
      description: 'Documentation for features not included in Meta to Google Chat migration',
      fileName: 'Meta to Google Chat - Not Included Feature.docx',
      combinations: ['meta-to-google-chat', 'all'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 14,
      keywords: ['meta', 'google', 'chat', 'messaging', 'not included', 'features', 'limitations', 'migration']
    },
    // Google Chat to Google Chat exhibits (Included/Not Included)
    {
      name: 'Google Chat to Google Chat - Included',
      description: 'Documentation for features included in Google Chat to Google Chat migration',
      fileName: 'Google Chat-to-Google Chat Included.docx',
      combinations: ['google-chat-to-google-chat', 'all'],
      category: 'messaging',
      includeType: 'included',
      isRequired: false,
      displayOrder: 11,
      keywords: ['google chat', 'chat', 'messaging', 'included', 'features', 'migration']
    },
    {
      name: 'Google Chat to Google Chat - Not Included',
      description: 'Documentation for features not included in Google Chat to Google Chat migration',
      fileName: 'Google Chat-to-Google Chat Not Included.docx',
      combinations: ['google-chat-to-google-chat', 'all'],
      category: 'messaging',
      includeType: 'notincluded',
      isRequired: false,
      displayOrder: 12,
      keywords: ['google chat', 'chat', 'messaging', 'not included', 'excluded', 'limitations', 'migration']
    },
    // Email exhibits (Outlook exhibits removed — files not present in backend-exhibits/)
    {
      name: 'Gmail to Gmail Standard Plan - Standard Include',
      description: 'Documentation for features included in Gmail to Gmail Standard Plan migration',
      fileName: 'Gmail to Gmail Standard Plan - Standard Include.docx',
      combinations: ['gmail-to-gmail', 'all'],
      category: 'email',
      isRequired: false,
      displayOrder: 11,
      keywords: ['gmail', 'email', 'standard', 'included', 'features', 'migration']
    },
    {
      name: 'Gmail to Gmail Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Gmail to Gmail Standard Plan migration',
      fileName: 'Gmail to Gmail Standard Plan - Standard Not Include.docx',
      combinations: ['gmail-to-gmail', 'all'],
      category: 'email',
      isRequired: false,
      displayOrder: 12,
      keywords: ['gmail', 'email', 'standard', 'not included', 'features', 'limitations', 'migration']
    },
    {
      name: 'Gmail to Outlook Standard Plan - Standard Include',
      description: 'Documentation for features included in Gmail to Outlook Standard Plan migration',
      fileName: 'Gmail to Outlook Standard Plan - Standard Include.docx',
      combinations: ['gmail-to-outlook', 'all'],
      category: 'email',
      isRequired: false,
      displayOrder: 13,
      keywords: ['gmail', 'outlook', 'email', 'standard', 'included', 'features', 'migration']
    },
    {
      name: 'Gmail to Outlook Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Gmail to Outlook Standard Plan migration',
      fileName: 'Gmail to Outlook Standard Plan - Standard Not Include.docx',
      combinations: ['gmail-to-outlook', 'all'],
      category: 'email',
      isRequired: false,
      displayOrder: 14,
      keywords: ['gmail', 'outlook', 'email', 'standard', 'not included', 'features', 'limitations', 'migration']
    },
    // Outlook to Outlook exhibits (Included/Not Included)
    {
      name: 'Outlook to Outlook - Included Features',
      description: 'Documentation for features included in Outlook to Outlook migration',
      fileName: 'Outlook to Outlook - Included Features.docx',
      combinations: ['outlook-to-outlook', 'all'],
      category: 'email',
      isRequired: false,
      displayOrder: 15,
      keywords: ['outlook', 'email', 'included', 'features', 'migration']
    },
    {
      name: 'Outlook to Outlook - Not Included Features',
      description: 'Documentation for features not included in Outlook to Outlook migration',
      fileName: 'Outlook to Outlook - Not Included Features.docx',
      combinations: ['outlook-to-outlook', 'all'],
      category: 'email',
      isRequired: false,
      displayOrder: 16,
      keywords: ['outlook', 'email', 'not included', 'features', 'limitations', 'migration']
    },
    // Outlook to Gmail exhibits (Included/Not Included)
    {
      name: 'Outlook to Gmail - Included Features',
      description: 'Documentation for features included in Outlook to Gmail migration',
      fileName: 'Outlook to Gmail - Included Features.docx',
      combinations: ['outlook-to-gmail', 'all'],
      category: 'email',
      isRequired: false,
      displayOrder: 17,
      keywords: ['outlook', 'gmail', 'email', 'included', 'features', 'migration']
    },
    {
      name: 'Outlook to Gmail - Not Included Features',
      description: 'Documentation for features not included in Outlook to Gmail migration',
      fileName: 'Outlook to Gmail - Not Included Features.docx',
      combinations: ['outlook-to-gmail', 'all'],
      category: 'email',
      isRequired: false,
      displayOrder: 18,
      keywords: ['outlook', 'gmail', 'email', 'not included', 'features', 'limitations', 'migration']
    },
    // ShareFile to Google Shared Drive exhibits
    {
      name: 'ShareFile to Google SharedDrive Advanced Plan - Advanced Included',
      description: 'Documentation for features included in ShareFile to Google SharedDrive Advanced Plan migration',
      fileName: 'ShareFile to Google SharedDrive Advanced Plan - Advanced Included.docx',
      legacyFileNames: [
        'sharefile-to-google-sharedrive-advanced-plan-included.docx'
      ],
      combinations: ['sharefile-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 1,
      keywords: ['sharefile', 'google', 'sharedrive', 'advanced', 'included', 'features']
    },
    {
      name: 'ShareFile to Google SharedDrive Advanced Plan - Advanced Not Included',
      description: 'Documentation for features not included in ShareFile to Google SharedDrive Advanced Plan migration',
      fileName: 'ShareFile to Google SharedDrive Advanced Plan - Advanced Not Included.docx',
      legacyFileNames: [
        'sharefile-to-google-sharedrive-advanced-plan-notincluded.docx'
      ],
      combinations: ['sharefile-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 2,
      keywords: ['sharefile', 'google', 'sharedrive', 'advanced', 'not included', 'features', 'limitations']
    },
    // ShareFile to Google SharedDrive (Standard) exhibits
    {
      name: 'ShareFile to Google SharedDrive Standard Plan - Standard Included',
      description: 'Documentation for features included in ShareFile to Google SharedDrive Standard Plan migration',
      fileName: 'ShareFile to Google SharedDrive Standard Plan - Standard Included.docx',
      combinations: ['sharefile-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 3,
      keywords: ['sharefile', 'google', 'sharedrive', 'shared drive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'ShareFile to Google SharedDrive Standard Plan - Standard Not Included',
      description: 'Documentation for features not included in ShareFile to Google SharedDrive Standard Plan migration',
      fileName: 'ShareFile to Google SharedDrive Standard Plan - Standard Not Included.docx',
      combinations: ['sharefile-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 4,
      keywords: ['sharefile', 'google', 'sharedrive', 'shared drive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // ShareFile to Google Drive (MyDrive & Shared Drive) - merged Standard exhibits
    {
      name: 'ShareFile to Google Drive (MyDrive & Shared Drive) Standard Plan - Standard Include',
      description: 'Documentation for features included in ShareFile to Google Drive (MyDrive & Shared Drive) Standard Plan migration',
      fileName: 'ShareFile to Google Drive (MyDrive & Shared Drive) Standard Plan - Standard Include.docx',
      combinations: ['sharefile-to-google-mydrive', 'sharefile-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 3,
      keywords: ['sharefile', 'google', 'drive', 'mydrive', 'shared drive', 'sharedrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'ShareFile to Google Drive (MyDrive & Shared Drive) Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in ShareFile to Google Drive (MyDrive & Shared Drive) Standard Plan migration',
      fileName: 'ShareFile to Google Drive (MyDrive & Shared Drive) Standard Plan - Standard Not Include.docx',
      combinations: ['sharefile-to-google-mydrive', 'sharefile-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 4,
      keywords: ['sharefile', 'google', 'drive', 'mydrive', 'shared drive', 'sharedrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // ShareFile to Google MyDrive exhibits (Standard + Advanced)
    {
      name: 'ShareFile to Google MyDrive Standard Plan - Standard Included',
      description: 'Documentation for features included in ShareFile to Google MyDrive Standard Plan migration',
      fileName: 'ShareFile to Google MyDrive Standard Plan - Standard Included.docx',
      combinations: ['sharefile-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 5,
      keywords: ['sharefile', 'google', 'mydrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'ShareFile to Google MyDrive Standard Plan - Standard Not Included',
      description: 'Documentation for features not included in ShareFile to Google MyDrive Standard Plan migration',
      fileName: 'ShareFile to Google MyDrive Standard Plan - Standard Not Included.docx',
      combinations: ['sharefile-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 6,
      keywords: ['sharefile', 'google', 'mydrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    {
      name: 'ShareFile to Google MyDrive Advanced Plan - Advanced Included',
      description: 'Documentation for features included in ShareFile to Google MyDrive Advanced Plan migration',
      fileName: 'ShareFile to Google MyDrive Advanced Plan - Advanced Included.docx',
      legacyFileNames: [
        'ShareFile to Google MyDrive Advanced Plan - Advanced Include.docx'
      ],
      combinations: ['sharefile-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 7,
      keywords: ['sharefile', 'google', 'mydrive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'ShareFile to Google MyDrive Advanced Plan - Advanced Not Included',
      description: 'Documentation for features not included in ShareFile to Google MyDrive Advanced Plan migration',
      fileName: 'ShareFile to Google MyDrive Advanced Plan - Advanced Not Included.docx',
      legacyFileNames: [
        'ShareFile to Google MyDrive Advanced Plan - Advanced Not Include.docx'
      ],
      combinations: ['sharefile-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 8,
      keywords: ['sharefile', 'google', 'mydrive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Dropbox to Google Drive (MyDrive & Shared Drive) - merged Advanced exhibits
    {
      name: 'Dropbox to Google Drive (MyDrive & Shared Drive) Advanced Plan - Advanced Include',
      description: 'Documentation for features included in Dropbox to Google Drive (MyDrive & Shared Drive) Advanced Plan migration',
      fileName: 'Dropbox to Google Drive (MyDrive & Shared Drive) Advanced Plan - Advanced Include.docx',
      combinations: ['dropbox-to-mydrive', 'dropbox-to-google-sharedrive', 'dropbox-to-google', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 5,
      keywords: ['dropbox', 'google', 'drive', 'mydrive', 'shared drive', 'sharedrive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Dropbox to Google Drive (MyDrive & Shared Drive) Advanced Plan - Advanced Not Include',
      description: 'Documentation for features not included in Dropbox to Google Drive (MyDrive & Shared Drive) Advanced Plan migration',
      fileName: 'Dropbox to Google Drive (MyDrive & Shared Drive) Advanced Plan - Advanced Not Include.docx',
      combinations: ['dropbox-to-mydrive', 'dropbox-to-google-sharedrive', 'dropbox-to-google', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 6,
      keywords: ['dropbox', 'google', 'drive', 'mydrive', 'shared drive', 'sharedrive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Dropbox to Google MyDrive (Standard) exhibits
    {
      name: 'Dropbox to Google MyDrive Standard Plan - Standard Include',
      description: 'Documentation for features included in Dropbox to Google MyDrive Standard Plan migration',
      fileName: 'Dropbox to Google MyDrive Standard Plan - Standard Include.docx',
      combinations: ['dropbox-to-google-mydrive', 'dropbox-to-mydrive'],
      category: 'content',
      isRequired: false,
      displayOrder: 7,
      keywords: ['dropbox', 'google', 'mydrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Dropbox to Google MyDrive Standard Plan - Standard Not Included',
      description: 'Documentation for features not included in Dropbox to Google MyDrive Standard Plan migration',
      fileName: 'Dropbox to Google MyDrive Standard Plan - Standard Not Included.docx',
      combinations: ['dropbox-to-google-mydrive', 'dropbox-to-mydrive'],
      category: 'content',
      isRequired: false,
      displayOrder: 8,
      keywords: ['dropbox', 'google', 'mydrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
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
    // Egnyte to SharePoint (Standard) exhibits
    {
      name: 'Egnyte to SharePoint Standard Plan - Standard Include',
      description: 'Documentation for features included in Egnyte to SharePoint Standard Plan migration',
      fileName: 'Egnyte to SharePoint Standard Plan - Standard Include.docx',
      // Existing CPQ combination uses "egnyte-to-sharepoint-online"
      combinations: ['egnyte-to-sharepoint-online', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 19,
      keywords: ['egnyte', 'sharepoint', 'sharepoint online', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Egnyte to SharePoint Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Egnyte to SharePoint Standard Plan migration',
      fileName: 'Egnyte to SharePoint Standard Plan - Standard Not Include.docx',
      combinations: ['egnyte-to-sharepoint-online', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20,
      keywords: ['egnyte', 'sharepoint', 'sharepoint online', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Egnyte to Microsoft (Standard & Advanced) exhibits
    {
      name: 'Egnyte to Microsoft Standard Exhibit',
      description: 'Standard exhibit for Egnyte to Microsoft (OneDrive/SharePoint) migration',
      fileName: 'egnyte-to-microsoft-standard.docx',
      combinations: ['egnyte-to-microsoft', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 21,
      keywords: ['egnyte', 'microsoft', 'onedrive', 'sharepoint', 'standard', 'content', 'migration']
    },
    {
      name: 'Egnyte to Microsoft Advanced Exhibit',
      description: 'Advanced exhibit for Egnyte to Microsoft (OneDrive/SharePoint) migration',
      fileName: 'egnyte-to-microsoft-advanced.docx',
      combinations: ['egnyte-to-microsoft', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 22,
      keywords: ['egnyte', 'microsoft', 'onedrive', 'sharepoint', 'advanced', 'content', 'migration']
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
    // Google Drive (MyDrive & Shared Drive) merged exhibits
    {
      name: 'Google Drive to Google(MyDrive & Shared Drive) - Included Features',
      description: 'Documentation for features included in Google Drive to Google(MyDrive & Shared Drive) migration',
      fileName: 'Google Drive to Google(MyDrive & Shared Drive) - Included Features.docx',
      // Previously used filename (kept here to migrate/rename existing DB record instead of duplicating)
      legacyFileNames: ['Google Drive to Google Drive (MyDrive & Shared Drive) - Included Features.docx'],
      combinations: ['google-mydrive-to-google-sharedrive', 'google-sharedrive-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 5,
      keywords: ['google', 'drive', 'mydrive', 'shared drive', 'sharedrive', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google MyDrive to Google(MyDrive & Shared Drive) Standard Plan - Standard Include',
      description: 'Documentation for features included in Google MyDrive to Google(MyDrive & Shared Drive) Standard Plan migration',
      fileName: 'Google MyDrive to Google(MyDrive & Shared Drive) Standard Plan - Standard Include.docx',
      combinations: ['google-mydrive-to-google-mydrive', 'google-mydrive-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 6,
      keywords: ['google', 'drive', 'mydrive', 'shared drive', 'sharedrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google MyDrive to Google(MyDrive & Shared Drive) Standard Plan - Standard Not Include',
      description: 'Documentation for features not included in Google MyDrive to Google(MyDrive & Shared Drive) Standard Plan migration',
      fileName: 'Google MyDrive to Google(MyDrive & Shared Drive) Standard Plan - Standard Not Include.docx',
      combinations: ['google-mydrive-to-google-mydrive', 'google-mydrive-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 7,
      keywords: ['google', 'drive', 'mydrive', 'shared drive', 'sharedrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google Shared Drive to Google Shared Drive exhibits (Standard + Advanced)
    {
      name: 'Google Shared Drive to Google Shared Drive Standard Plan - Standard Included',
      description: 'Documentation for features included in Google Shared Drive to Google Shared Drive Standard Plan migration',
      fileName: 'Google Shared Drive to Google Shared Drive Standard Plan - Standard Included.docx',
      combinations: ['google-sharedrive-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 8,
      keywords: ['google', 'shared drive', 'sharedrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google Shared Drive to Google Shared Drive Standard Plan - Standard Not Included',
      description: 'Documentation for features not included in Google Shared Drive to Google Shared Drive Standard Plan migration',
      fileName: 'Google Shared Drive to Google Shared Drive Standard Plan - Standard Not Included.docx',
      combinations: ['google-sharedrive-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 9,
      keywords: ['google', 'shared drive', 'sharedrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    {
      name: 'Google Shared Drive to Google Shared Drive Advanced Plan - Advanced Included',
      description: 'Documentation for features included in Google Shared Drive to Google Shared Drive Advanced Plan migration',
      fileName: 'Google Shared Drive to Google Shared Drive Advanced Plan - Advanced Included.docx',
      combinations: ['google-sharedrive-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 10,
      keywords: ['google', 'shared drive', 'sharedrive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google Shared Drive to Google Shared Drive Advanced Plan - Advanced Not Included',
      description: 'Documentation for features not included in Google Shared Drive to Google Shared Drive Advanced Plan migration',
      fileName: 'Google Shared Drive to Google Shared Drive Advanced Plan - Advanced Not Included.docx',
      combinations: ['google-sharedrive-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 11,
      keywords: ['google', 'shared drive', 'sharedrive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google Shared Drive to SharePoint Online exhibits (Standard + Advanced)
    {
      name: 'Google Shared Drive to SharePoint Online Standard Plan - Standard Included',
      description: 'Documentation for features included in Google Shared Drive to SharePoint Online Standard Plan migration',
      fileName: 'Google Shared Drive to SharePoint Online Standard Plan - Standard Included.docx',
      combinations: ['google-sharedrive-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 12,
      keywords: ['google', 'shared drive', 'sharedrive', 'sharepoint', 'sharepoint online', 'microsoft', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google Shared Drive to SharePoint Online Standard Plan - Standard Not Included',
      description: 'Documentation for features not included in Google Shared Drive to SharePoint Online Standard Plan migration',
      fileName: 'Google Shared Drive to SharePoint Online Standard Plan - Standard Not Included.docx',
      combinations: ['google-sharedrive-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 13,
      keywords: ['google', 'shared drive', 'sharedrive', 'sharepoint', 'sharepoint online', 'microsoft', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    {
      name: 'Google Shared Drive to SharePoint Online Advanced Plan - Advanced Included',
      description: 'Documentation for features included in Google Shared Drive to SharePoint Online Advanced Plan migration',
      fileName: 'Google Shared Drive to SharePoint Online Advanced Plan - Advanced Included.docx',
      combinations: ['google-sharedrive-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 14,
      keywords: ['google', 'shared drive', 'sharedrive', 'sharepoint', 'sharepoint online', 'microsoft', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google Shared Drive to SharePoint Online Advanced Plan - Advanced Not Included',
      description: 'Documentation for features not included in Google Shared Drive to SharePoint Online Advanced Plan migration',
      fileName: 'Google Shared Drive to SharePoint Online Advanced Plan - Advanced Not Included.docx',
      combinations: ['google-sharedrive-to-sharepoint', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 15,
      keywords: ['google', 'shared drive', 'sharedrive', 'sharepoint', 'sharepoint online', 'microsoft', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google Shared Drive to Egnyte exhibits (Standard + Advanced)
    {
      name: 'Google Shared Drive to Egnyte Standard Plan - Standard Included',
      description: 'Documentation for features included in Google Shared Drive to Egnyte Standard Plan migration',
      fileName: 'Google Shared Drive to Egnyte Standard Plan - Standard Included.docx',
      combinations: ['google-sharedrive-to-egnyte', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 16,
      keywords: ['google', 'shared drive', 'sharedrive', 'egnyte', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google Shared Drive to Egnyte Standard Plan - Standard Not Included',
      description: 'Documentation for features not included in Google Shared Drive to Egnyte Standard Plan migration',
      fileName: 'Google Shared Drive to Egnyte Standard Plan - Standard Not Included.docx',
      combinations: ['google-sharedrive-to-egnyte', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 17,
      keywords: ['google', 'shared drive', 'sharedrive', 'egnyte', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    {
      name: 'Google Shared Drive to Egnyte Advanced Plan - Advanced Included',
      description: 'Documentation for features included in Google Shared Drive to Egnyte Advanced Plan migration',
      fileName: 'Google Shared Drive to Egnyte Advanced Plan - Advanced Included.docx',
      combinations: ['google-sharedrive-to-egnyte', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 18,
      keywords: ['google', 'shared drive', 'sharedrive', 'egnyte', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google Shared Drive to Egnyte Advanced Plan - Advanced Not Included',
      description: 'Documentation for features not included in Google Shared Drive to Egnyte Advanced Plan migration',
      fileName: 'Google Shared Drive to Egnyte Advanced Plan - Advanced Not Included.docx',
      combinations: ['google-sharedrive-to-egnyte', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 19,
      keywords: ['google', 'shared drive', 'sharedrive', 'egnyte', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // Google Shared Drive to OneDrive exhibits (Standard + Advanced)
    {
      name: 'Google Shared Drive to OneDrive Standard Plan - Standard Included',
      description: 'Documentation for features included in Google Shared Drive to OneDrive Standard Plan migration',
      fileName: 'Google Shared Drive to OneDrive Standard Plan - Standard Included.docx',
      combinations: ['google-sharedrive-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 20,
      keywords: ['google', 'shared drive', 'sharedrive', 'onedrive', 'microsoft', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google Shared Drive to OneDrive Standard Plan - Standard Not Included',
      description: 'Documentation for features not included in Google Shared Drive to OneDrive Standard Plan migration',
      fileName: 'Google Shared Drive to OneDrive Standard Plan - Standard Not Included.docx',
      combinations: ['google-sharedrive-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 21,
      keywords: ['google', 'shared drive', 'sharedrive', 'onedrive', 'microsoft', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    {
      name: 'Google Shared Drive to OneDrive Advanced Plan - Advanced Included',
      description: 'Documentation for features included in Google Shared Drive to OneDrive Advanced Plan migration',
      fileName: 'Google Shared Drive to OneDrive Advanced Plan - Advanced Included.docx',
      combinations: ['google-sharedrive-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 22,
      keywords: ['google', 'shared drive', 'sharedrive', 'onedrive', 'microsoft', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'Google Shared Drive to OneDrive Advanced Plan - Advanced Not Included',
      description: 'Documentation for features not included in Google Shared Drive to OneDrive Advanced Plan migration',
      fileName: 'Google Shared Drive to OneDrive Advanced Plan - Advanced Not Included.docx',
      combinations: ['google-sharedrive-to-onedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 23,
      keywords: ['google', 'shared drive', 'sharedrive', 'onedrive', 'microsoft', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // SharePoint Online to Google Shared Drive exhibits (Standard + Advanced)
    {
      name: 'SharePoint to Google Shared Drive Standard Plan - Standard Included',
      description: 'Documentation for features included in SharePoint Online to Google Shared Drive Standard Plan migration',
      fileName: 'SharePoint to Google Shared Drive Standard Plan - Standard Included.docx',
      combinations: ['sharepoint-online-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 24,
      keywords: ['sharepoint', 'sharepoint online', 'google', 'shared drive', 'sharedrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'SharePoint to Google Shared Drive Standard Plan - Standard Not Included',
      description: 'Documentation for features not included in SharePoint Online to Google Shared Drive Standard Plan migration',
      fileName: 'SharePoint to Google Shared Drive Standard Plan - Standard Not Included.docx',
      combinations: ['sharepoint-online-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 25,
      keywords: ['sharepoint', 'sharepoint online', 'google', 'shared drive', 'sharedrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    {
      name: 'SharePoint to Google Shared Drive Advanced Plan - Advanced Included',
      description: 'Documentation for features included in SharePoint Online to Google Shared Drive Advanced Plan migration',
      fileName: 'SharePoint to Google Shared Drive Advanced Plan - Advanced Included.docx',
      combinations: ['sharepoint-online-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 26,
      keywords: ['sharepoint', 'sharepoint online', 'google', 'shared drive', 'sharedrive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'SharePoint to Google Shared Drive Advanced Plan - Advanced Not Included',
      description: 'Documentation for features not included in SharePoint Online to Google Shared Drive Advanced Plan migration',
      fileName: 'SharePoint to Google Shared Drive Advanced Plan - Advanced Not Included.docx',
      combinations: ['sharepoint-online-to-google-sharedrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 27,
      keywords: ['sharepoint', 'sharepoint online', 'google', 'shared drive', 'sharedrive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // SharePoint Online to Google MyDrive exhibits (Standard + Advanced)
    {
      name: 'SharePoint to Google MyDrive Standard Plan - Standard Included',
      description: 'Documentation for features included in SharePoint Online to Google MyDrive Standard Plan migration',
      fileName: 'SharePoint to Google MyDrive Standard Plan - Standard Included.docx',
      combinations: ['sharepoint-online-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 28,
      keywords: ['sharepoint', 'sharepoint online', 'google', 'mydrive', 'standard', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'SharePoint to Google MyDrive Standard Plan - Standard Not Included',
      description: 'Documentation for features not included in SharePoint Online to Google MyDrive Standard Plan migration',
      fileName: 'SharePoint to Google MyDrive Standard Plan - Standard Not Included.docx',
      combinations: ['sharepoint-online-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 29,
      keywords: ['sharepoint', 'sharepoint online', 'google', 'mydrive', 'standard', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    {
      name: 'SharePoint to Google MyDrive Advanced Plan - Advanced Included',
      description: 'Documentation for features included in SharePoint Online to Google MyDrive Advanced Plan migration',
      fileName: 'SharePoint to Google MyDrive Advanced Plan - Advanced Included.docx',
      combinations: ['sharepoint-online-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 30,
      keywords: ['sharepoint', 'sharepoint online', 'google', 'mydrive', 'advanced', 'included', 'features', 'content', 'migration']
    },
    {
      name: 'SharePoint to Google MyDrive Advanced Plan - Advanced Not Included',
      description: 'Documentation for features not included in SharePoint Online to Google MyDrive Advanced Plan migration',
      fileName: 'SharePoint to Google MyDrive Advanced Plan - Advanced Not Included.docx',
      combinations: ['sharepoint-online-to-google-mydrive', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 31,
      keywords: ['sharepoint', 'sharepoint online', 'google', 'mydrive', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration']
    },
    // SharePoint Online to Egnyte exhibits (Standard + Advanced)
    {
      name: 'SharePoint to Egnyte Standard Plan - Standard Included',
      description: 'Documentation for features included in SharePoint Online to Egnyte Standard Plan migration',
      fileName: 'SharePoint to Egnyte Standard Plan - Standard Included.docx',
      combinations: ['sharepoint-online-to-egnyte', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 32,
      keywords: ['sharepoint', 'sharepoint online', 'egnyte', 'standard', 'included', 'features', 'content', 'migration', 'microsoft']
    },
    {
      name: 'SharePoint to Egnyte Standard Plan - Standard Not Included',
      description: 'Documentation for features not included in SharePoint Online to Egnyte Standard Plan migration',
      fileName: 'SharePoint to Egnyte Standard Plan - Standard Not Included.docx',
      combinations: ['sharepoint-online-to-egnyte', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 33,
      keywords: ['sharepoint', 'sharepoint online', 'egnyte', 'standard', 'not included', 'features', 'limitations', 'content', 'migration', 'microsoft']
    },
    {
      name: 'SharePoint to Egnyte Advanced Plan - Advanced Included',
      description: 'Documentation for features included in SharePoint Online to Egnyte Advanced Plan migration',
      fileName: 'SharePoint to Egnyte Advanced Plan - Advanced Included.docx',
      combinations: ['sharepoint-online-to-egnyte', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 34,
      keywords: ['sharepoint', 'sharepoint online', 'egnyte', 'advanced', 'included', 'features', 'content', 'migration', 'microsoft']
    },
    {
      name: 'SharePoint to Egnyte Advanced Plan - Advanced Not Included',
      description: 'Documentation for features not included in SharePoint Online to Egnyte Advanced Plan migration',
      fileName: 'SharePoint to Egnyte Advanced Plan - Advanced Not Included.docx',
      combinations: ['sharepoint-online-to-egnyte', 'all'],
      category: 'content',
      isRequired: false,
      displayOrder: 35,
      keywords: ['sharepoint', 'sharepoint online', 'egnyte', 'advanced', 'not included', 'features', 'limitations', 'content', 'migration', 'microsoft']
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
      const legacyFileNames = Array.isArray(exhibit.legacyFileNames) ? exhibit.legacyFileNames : [];
      const fileNamesToMatch = [exhibit.fileName, ...legacyFileNames].filter(Boolean);

      const existing = await db.collection('exhibits').findOne({
        fileName: { $in: fileNamesToMatch }
      });

      if (existing) {
        // PROTECTION: Check if exhibit was added via UI (not from seeding)
        // UI-added exhibits have createdAt close to updatedAt (uploaded together)
        // Seeded exhibits have createdAt much earlier than updatedAt
        const timeDiff = existing.updatedAt 
          ? (existing.updatedAt.getTime() - existing.createdAt.getTime()) 
          : 0;
        const likelyUIAdded = timeDiff < 5000; // Less than 5 seconds difference = likely UI upload
        
        // PROTECTION: Don't overwrite UI-added exhibits unless explicitly needed
        // Only update if:
        // 1. File in folder is significantly newer (more than 1 hour)
        // 2. OR metadata changed AND exhibit was seeded (not UI-added)
        const existingModified = existing.updatedAt || existing.createdAt || new Date(0);
        const fileModTime = fileStats.mtime.getTime();
        const existingModTime = existingModified.getTime();
        const oneHourInMs = 60 * 60 * 1000;
        const fileIsSignificantlyNewer = (fileModTime - existingModTime) > oneHourInMs;
        
        const metadataChanged = (() => {
          const keysToCompare = ['name', 'description', 'fileName', 'category', 'includeType', 'isRequired', 'displayOrder', 'keywords', 'combinations'];
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

        // Update conditions:
        // 1. File is significantly newer (more than 1 hour) - safe to update
        // 2. Metadata changed AND exhibit was seeded (not UI-added) - safe to update
        // 3. File is newer AND exhibit was seeded (not UI-added) - safe to update
        const shouldUpdate = fileIsSignificantlyNewer || 
                            (metadataChanged && !likelyUIAdded) || 
                            ((fileModTime > existingModTime) && !likelyUIAdded);

        if (shouldUpdate) {
          await db.collection('exhibits').updateOne(
            { _id: existing._id },
            {
              $set: {
                ...exhibitDoc,
                createdAt: existing.createdAt, // Preserve original creation date
                version: (existing.version || 0) + 1
              }
            }
          );
          const reason = fileIsSignificantlyNewer ? 'file significantly newer' : 
                        (metadataChanged ? 'metadata changed' : 'file newer');
          console.log(`✅ Updated exhibit: ${exhibit.name} (${reason})`);
          updatedCount++;
        } else {
          if (likelyUIAdded) {
            console.log(`🔒 Protected UI-added exhibit: ${exhibit.name} (skipped to prevent overwrite)`);
          } else {
            console.log(`⏭️  Skipped (up to date): ${exhibit.name}`);
          }
          skippedCount++;
        }
      } else {
        // Insert new exhibit (only if it's in the seed config)
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



