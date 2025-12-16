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
    // DROPBOX TO BOX templates (Standard & Advanced only)
    {
      name: 'DROPBOX TO BOX Standard',
      description: 'Standard template for Dropbox to Box migration - suitable for medium to large projects',
      fileName: 'dropbox-to-box-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-box',
      planType: 'standard',
      keywords: ['standard', 'dropbox', 'box', 'content', 'migration']
    },
    {
      name: 'DROPBOX TO BOX Advanced',
      description: 'Advanced template for Dropbox to Box migration - suitable for large enterprise projects',
      fileName: 'dropbox-to-box-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-box',
      planType: 'advanced',
      keywords: ['advanced', 'dropbox', 'box', 'content', 'migration', 'enterprise']
    },
    // DROPBOX TO EGNYTE templates (Standard & Advanced only)
    {
      name: 'DROPBOX TO EGNYTE Standard',
      description: 'Standard template for Dropbox to Egnyte migration - suitable for medium to large projects',
      fileName: 'dropbox-to-egnyte-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-egnyte',
      planType: 'standard',
      keywords: ['standard', 'dropbox', 'egnyte', 'content', 'migration']
    },
    {
      name: 'DROPBOX TO EGNYTE Advanced',
      description: 'Advanced template for Dropbox to Egnyte migration - suitable for large enterprise projects',
      fileName: 'dropbox-to-egnyte-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'dropbox-to-egnyte',
      planType: 'advanced',
      keywords: ['advanced', 'dropbox', 'egnyte', 'content', 'migration', 'enterprise']
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
    // BOX TO DROPBOX templates (Standard & Advanced only)
    {
      name: 'BOX TO DROPBOX Standard',
      description: 'Standard template for Box to Dropbox migration - suitable for medium to large projects',
      fileName: 'box-to-dropbox-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-dropbox',
      planType: 'standard',
      keywords: ['standard', 'box', 'dropbox', 'content', 'migration']
    },
    {
      name: 'BOX TO DROPBOX Advanced',
      description: 'Advanced template for Box to Dropbox migration - suitable for large enterprise projects',
      fileName: 'box-to-dropbox-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-dropbox',
      planType: 'advanced',
      keywords: ['advanced', 'box', 'dropbox', 'content', 'migration', 'enterprise']
    },
    // BOX TO AWS S3 templates (Basic & Advanced only)
    {
      name: 'BOX TO AWS S3 Basic',
      description: 'Basic template for Box to AWS S3 migration - suitable for small to medium projects',
      fileName: 'box-to-aws-s3-basic.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-aws-s3',
      planType: 'basic',
      keywords: ['basic', 'box', 'aws', 's3', 'content', 'migration']
    },
    {
      name: 'BOX TO AWS S3 Advanced',
      description: 'Advanced template for Box to AWS S3 migration - suitable for large enterprise projects',
      fileName: 'box-to-aws-s3-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'box-to-aws-s3',
      planType: 'advanced',
      keywords: ['advanced', 'box', 'aws', 's3', 'content', 'migration', 'enterprise']
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
    // EGNYTE TO SHAREPOINT ONLINE templates (Standard & Advanced only)
    {
      name: 'EGNYTE TO SHAREPOINT ONLINE Standard',
      description: 'Standard template for Egnyte to SharePoint Online migration - suitable for medium to large projects',
      fileName: 'egnyte-to-sharepoint-online-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'egnyte-to-sharepoint-online',
      planType: 'standard',
      keywords: ['standard', 'egnyte', 'sharepoint', 'online', 'content', 'migration', 'microsoft']
    },
    {
      name: 'EGNYTE TO SHAREPOINT ONLINE Advanced',
      description: 'Advanced template for Egnyte to SharePoint Online migration - suitable for large enterprise projects',
      fileName: 'egnyte-to-sharepoint-online-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'egnyte-to-sharepoint-online',
      planType: 'advanced',
      keywords: ['advanced', 'egnyte', 'sharepoint', 'online', 'content', 'migration', 'microsoft', 'enterprise']
    },
    // EGNYTE TO GOOGLE SHARED DRIVE templates (Standard & Advanced only)
    {
      name: 'EGNYTE TO GOOGLE SHARED DRIVE Standard',
      description: 'Standard template for Egnyte to Google Shared Drive migration - suitable for medium to large projects',
      fileName: 'egnyte-to-google-sharedrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'egnyte-to-google-sharedrive',
      planType: 'standard',
      keywords: ['standard', 'egnyte', 'google', 'sharedrive', 'content', 'migration']
    },
    {
      name: 'EGNYTE TO GOOGLE SHARED DRIVE Advanced',
      description: 'Advanced template for Egnyte to Google Shared Drive migration - suitable for large enterprise projects',
      fileName: 'egnyte-to-google-sharedrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'egnyte-to-google-sharedrive',
      planType: 'advanced',
      keywords: ['advanced', 'egnyte', 'google', 'sharedrive', 'content', 'migration', 'enterprise']
    },
    // EGNYTE TO GOOGLE MYDRIVE templates (Standard & Advanced only)
    {
      name: 'EGNYTE TO GOOGLE MYDRIVE Standard',
      description: 'Standard template for Egnyte to Google MyDrive migration - suitable for medium to large projects',
      fileName: 'egnyte-to-google-mydrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'egnyte-to-google-mydrive',
      planType: 'standard',
      keywords: ['standard', 'egnyte', 'google', 'mydrive', 'content', 'migration']
    },
    {
      name: 'EGNYTE TO GOOGLE MYDRIVE Advanced',
      description: 'Advanced template for Egnyte to Google MyDrive migration - suitable for large enterprise projects',
      fileName: 'egnyte-to-google-mydrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'egnyte-to-google-mydrive',
      planType: 'advanced',
      keywords: ['advanced', 'egnyte', 'google', 'mydrive', 'content', 'migration', 'enterprise']
    },
    // EGNYTE TO ONEDRIVE templates (Standard & Advanced only)
    {
      name: 'EGNYTE TO ONEDRIVE Standard',
      description: 'Standard template for Egnyte to OneDrive migration - suitable for medium to large projects',
      fileName: 'egnyte-to-onedrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'egnyte-to-onedrive',
      planType: 'standard',
      keywords: ['standard', 'egnyte', 'onedrive', 'microsoft', 'content', 'migration']
    },
    {
      name: 'EGNYTE TO ONEDRIVE Advanced',
      description: 'Advanced template for Egnyte to OneDrive migration - suitable for large enterprise projects',
      fileName: 'egnyte-to-onedrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'egnyte-to-onedrive',
      planType: 'advanced',
      keywords: ['advanced', 'egnyte', 'onedrive', 'microsoft', 'content', 'migration', 'enterprise']
    },
    // GOOGLE MYDRIVE TO DROPBOX templates (Standard & Advanced only)
    {
      name: 'GOOGLE MYDRIVE TO DROPBOX Standard',
      description: 'Standard template for Google MyDrive to Dropbox migration - suitable for medium to large projects',
      fileName: 'google-mydrive-to-dropbox-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-mydrive-to-dropbox',
      planType: 'standard',
      keywords: ['standard', 'google', 'mydrive', 'dropbox', 'content', 'migration']
    },
    {
      name: 'GOOGLE MYDRIVE TO DROPBOX Advanced',
      description: 'Advanced template for Google MyDrive to Dropbox migration - suitable for large enterprise projects',
      fileName: 'google-mydrive-to-dropbox-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-mydrive-to-dropbox',
      planType: 'advanced',
      keywords: ['advanced', 'google', 'mydrive', 'dropbox', 'content', 'migration', 'enterprise']
    },
    // GOOGLE MYDRIVE TO EGNYTE templates (Standard & Advanced only)
    {
      name: 'GOOGLE MYDRIVE TO EGNYTE Standard',
      description: 'Standard template for Google MyDrive to Egnyte migration - suitable for medium to large projects',
      fileName: 'google-mydrive-to-egnyte-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-mydrive-to-egnyte',
      planType: 'standard',
      keywords: ['standard', 'google', 'mydrive', 'egnyte', 'content', 'migration']
    },
    {
      name: 'GOOGLE MYDRIVE TO EGNYTE Advanced',
      description: 'Advanced template for Google MyDrive to Egnyte migration - suitable for large enterprise projects',
      fileName: 'google-mydrive-to-egnyte-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-mydrive-to-egnyte',
      planType: 'advanced',
      keywords: ['advanced', 'google', 'mydrive', 'egnyte', 'content', 'migration', 'enterprise']
    },
    // GOOGLE MYDRIVE TO ONEDRIVE templates (Standard & Advanced only)
    {
      name: 'GOOGLE MYDRIVE TO ONEDRIVE Standard',
      description: 'Standard template for Google MyDrive to OneDrive migration - suitable for medium to large projects',
      fileName: 'google-mydrive-to-onedrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-mydrive-to-onedrive',
      planType: 'standard',
      keywords: ['standard', 'google', 'mydrive', 'onedrive', 'content', 'microsoft', 'migration']
    },
    {
      name: 'GOOGLE MYDRIVE TO ONEDRIVE Advanced',
      description: 'Advanced template for Google MyDrive to OneDrive migration - suitable for large enterprise projects',
      fileName: 'google-mydrive-to-onedrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-mydrive-to-onedrive',
      planType: 'advanced',
      keywords: ['advanced', 'google', 'mydrive', 'onedrive', 'content', 'microsoft', 'migration', 'enterprise']
    },
    // GOOGLE MYDRIVE TO SHAREPOINT templates (Standard & Advanced only)
    {
      name: 'GOOGLE MYDRIVE TO SHAREPOINT Standard',
      description: 'Standard template for Google MyDrive to SharePoint migration - suitable for medium to large projects',
      fileName: 'google-mydrive-to-sharepoint-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-mydrive-to-sharepoint',
      planType: 'standard',
      keywords: ['standard', 'google', 'mydrive', 'sharepoint', 'content', 'microsoft', 'migration']
    },
    {
      name: 'GOOGLE MYDRIVE TO SHAREPOINT Advanced',
      description: 'Advanced template for Google MyDrive to SharePoint migration - suitable for large enterprise projects',
      fileName: 'google-mydrive-to-sharepoint-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-mydrive-to-sharepoint',
      planType: 'advanced',
      keywords: ['advanced', 'google', 'mydrive', 'sharepoint', 'content', 'microsoft', 'migration', 'enterprise']
    },
    // GOOGLE MYDRIVE TO GOOGLE SHARED DRIVE templates (Standard & Advanced only)
    {
      name: 'GOOGLE MYDRIVE TO GOOGLE SHARED DRIVE Standard',
      description: 'Standard template for Google MyDrive to Google Shared Drive migration - suitable for medium to large projects',
      fileName: 'google-mydrive-to-google-sharedrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-mydrive-to-google-sharedrive',
      planType: 'standard',
      keywords: ['standard', 'google', 'mydrive', 'sharedrive', 'content', 'migration']
    },
    {
      name: 'GOOGLE MYDRIVE TO GOOGLE SHARED DRIVE Advanced',
      description: 'Advanced template for Google MyDrive to Google Shared Drive migration - suitable for large enterprise projects',
      fileName: 'google-mydrive-to-google-sharedrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-mydrive-to-google-sharedrive',
      planType: 'advanced',
      keywords: ['advanced', 'google', 'mydrive', 'sharedrive', 'content', 'migration', 'enterprise']
    },
    // GOOGLE MYDRIVE TO GOOGLE MYDRIVE templates (Standard & Advanced only)
    {
      name: 'GOOGLE MYDRIVE TO GOOGLE MYDRIVE Standard',
      description: 'Standard template for Google MyDrive to Google MyDrive migration - suitable for medium to large projects',
      fileName: 'google-mydrive-to-google-mydrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-mydrive-to-google-mydrive',
      planType: 'standard',
      keywords: ['standard', 'google', 'mydrive', 'content', 'migration']
    },
    {
      name: 'GOOGLE MYDRIVE TO GOOGLE MYDRIVE Advanced',
      description: 'Advanced template for Google MyDrive to Google MyDrive migration - suitable for large enterprise projects',
      fileName: 'google-mydrive-to-google-mydrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'google-mydrive-to-google-mydrive',
      planType: 'advanced',
      keywords: ['advanced', 'google', 'mydrive', 'content', 'migration', 'enterprise']
    },
    // SHAREFILE TO GOOGLE MYDRIVE templates (Standard & Advanced only)
    {
      name: 'SHAREFILE TO GOOGLE MYDRIVE Standard',
      description: 'Standard template for ShareFile to Google MyDrive migration - suitable for medium to large projects',
      fileName: 'sharefile-to-google-mydrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'sharefile-to-google-mydrive',
      planType: 'standard',
      keywords: ['standard', 'sharefile', 'google', 'mydrive', 'content', 'migration']
    },
    {
      name: 'SHAREFILE TO GOOGLE MYDRIVE Advanced',
      description: 'Advanced template for ShareFile to Google MyDrive migration - suitable for large enterprise projects',
      fileName: 'sharefile-to-google-mydrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'sharefile-to-google-mydrive',
      planType: 'advanced',
      keywords: ['advanced', 'sharefile', 'google', 'mydrive', 'content', 'migration', 'enterprise']
    },
    // SHAREFILE TO GOOGLE SHARED DRIVE templates (Standard & Advanced only)
    {
      name: 'SHAREFILE TO GOOGLE SHARED DRIVE Standard',
      description: 'Standard template for ShareFile to Google Shared Drive migration - suitable for medium to large projects',
      fileName: 'sharefile-to-google-sharedrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'sharefile-to-google-sharedrive',
      planType: 'standard',
      keywords: ['standard', 'sharefile', 'google', 'sharedrive', 'shared drive', 'content', 'migration']
    },
    {
      name: 'SHAREFILE TO GOOGLE SHARED DRIVE Advanced',
      description: 'Advanced template for ShareFile to Google Shared Drive migration - suitable for large enterprise projects',
      fileName: 'sharefile-to-google-sharedrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'sharefile-to-google-sharedrive',
      planType: 'advanced',
      keywords: ['advanced', 'sharefile', 'google', 'sharedrive', 'shared drive', 'content', 'migration', 'enterprise']
    },
    // SHAREFILE TO ONEDRIVE templates (Standard & Advanced only)
    {
      name: 'SHAREFILE TO ONEDRIVE Standard',
      description: 'Standard template for ShareFile to OneDrive migration - suitable for medium to large projects',
      fileName: 'sharefile-to-onedrive-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'sharefile-to-onedrive',
      planType: 'standard',
      keywords: ['standard', 'sharefile', 'onedrive', 'microsoft', 'content', 'migration']
    },
    {
      name: 'SHAREFILE TO ONEDRIVE Advanced',
      description: 'Advanced template for ShareFile to OneDrive migration - suitable for large enterprise projects',
      fileName: 'sharefile-to-onedrive-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'sharefile-to-onedrive',
      planType: 'advanced',
      keywords: ['advanced', 'sharefile', 'onedrive', 'microsoft', 'content', 'migration', 'enterprise']
    },
    // SHAREFILE TO SHAREFILE templates (Standard & Advanced only)
    {
      name: 'SHAREFILE TO SHAREFILE Standard',
      description: 'Standard template for ShareFile to ShareFile migration - suitable for medium to large projects',
      fileName: 'sharefile-to-sharefile-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'sharefile-to-sharefile',
      planType: 'standard',
      keywords: ['standard', 'sharefile', 'content', 'migration']
    },
    {
      name: 'SHAREFILE TO SHAREFILE Advanced',
      description: 'Advanced template for ShareFile to ShareFile migration - suitable for large enterprise projects',
      fileName: 'sharefile-to-sharefile-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'sharefile-to-sharefile',
      planType: 'advanced',
      keywords: ['advanced', 'sharefile', 'content', 'migration', 'enterprise']
    },
    // SHAREFILE TO SHAREPOINT templates (Standard & Advanced only)
    {
      name: 'SHAREFILE TO SHAREPOINT Standard',
      description: 'Standard template for ShareFile to SharePoint migration - suitable for medium to large projects',
      fileName: 'sharefile-to-sharepoint-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'sharefile-to-sharepoint',
      planType: 'standard',
      keywords: ['standard', 'sharefile', 'sharepoint', 'microsoft', 'content', 'migration']
    },
    {
      name: 'SHAREFILE TO SHAREPOINT Advanced',
      description: 'Advanced template for ShareFile to SharePoint migration - suitable for large enterprise projects',
      fileName: 'sharefile-to-sharepoint-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'sharefile-to-sharepoint',
      planType: 'advanced',
      keywords: ['advanced', 'sharefile', 'sharepoint', 'microsoft', 'content', 'migration', 'enterprise']
    },
    // NFS TO GOOGLE templates (Standard & Advanced only, Basic to be added later)
    {
      name: 'NFS TO GOOGLE Standard',
      description: 'Standard template for NFS to Google (MyDrive/Shared Drive) migration - suitable for medium to large projects',
      fileName: 'nfs-to-google-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'nfs-to-google',
      planType: 'standard',
      keywords: ['standard', 'nfs', 'google', 'mydrive', 'sharedrive', 'content', 'migration']
    },
    {
      name: 'NFS TO GOOGLE Advanced',
      description: 'Advanced template for NFS to Google (MyDrive/Shared Drive) migration - suitable for large enterprise projects',
      fileName: 'nfs-to-google-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'nfs-to-google',
      planType: 'advanced',
      keywords: ['advanced', 'nfs', 'google', 'mydrive', 'sharedrive', 'content', 'migration', 'enterprise']
    },
    // EGNYTE TO GOOGLE templates (Standard & Advanced only, Basic to be added later)
    {
      name: 'EGNYTE TO GOOGLE Standard',
      description: 'Standard template for Egnyte to Google (Shared Drive / MyDrive) migration - suitable for medium to large projects',
      fileName: 'egnyte-to-google-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'egnyte-to-google',
      planType: 'standard',
      keywords: ['standard', 'egnyte', 'google', 'sharedrive', 'mydrive', 'content', 'migration']
    },
    {
      name: 'EGNYTE TO GOOGLE Advanced',
      description: 'Advanced template for Egnyte to Google (Shared Drive / MyDrive) migration - suitable for large enterprise projects',
      fileName: 'egnyte-to-google-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'egnyte-to-google',
      planType: 'advanced',
      keywords: ['advanced', 'egnyte', 'google', 'sharedrive', 'mydrive', 'content', 'migration', 'enterprise']
    },
    // EGNYTE TO MICROSOFT templates (Standard & Advanced only, Basic to be added later)
    {
      name: 'EGNYTE TO MICROSOFT Standard',
      description: 'Standard template for Egnyte to Microsoft (OneDrive/SharePoint) migration - suitable for medium to large projects',
      fileName: 'egnyte-to-microsoft-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'egnyte-to-microsoft',
      planType: 'standard',
      keywords: ['standard', 'egnyte', 'microsoft', 'onedrive', 'sharepoint', 'content', 'migration']
    },
    {
      name: 'EGNYTE TO MICROSOFT Advanced',
      description: 'Advanced template for Egnyte to Microsoft (OneDrive/SharePoint) migration - suitable for large enterprise projects',
      fileName: 'egnyte-to-microsoft-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'egnyte-to-microsoft',
      planType: 'advanced',
      keywords: ['advanced', 'egnyte', 'microsoft', 'onedrive', 'sharepoint', 'content', 'migration', 'enterprise']
    },
    // NFS TO MICROSOFT templates (Standard & Advanced only, Basic to be added later)
    {
      name: 'NFS TO MICROSOFT Standard',
      description: 'Standard template for NFS to Microsoft (OneDrive/SharePoint) migration - suitable for medium to large projects',
      fileName: 'nfs-to-microsoft-standard.docx',
      isDefault: false,
      category: 'content',
      combination: 'nfs-to-microsoft',
      planType: 'standard',
      keywords: ['standard', 'nfs', 'microsoft', 'onedrive', 'sharepoint', 'content', 'migration']
    },
    {
      name: 'NFS TO MICROSOFT Advanced',
      description: 'Advanced template for NFS to Microsoft (OneDrive/SharePoint) migration - suitable for large enterprise projects',
      fileName: 'nfs-to-microsoft-advanced.docx',
      isDefault: false,
      category: 'content',
      combination: 'nfs-to-microsoft',
      planType: 'advanced',
      keywords: ['advanced', 'nfs', 'microsoft', 'onedrive', 'sharepoint', 'content', 'migration', 'enterprise']
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
    },
    // MULTI COMBINATION - Universal template for Multi combination migration type
    {
      name: 'Multi Combination',
      description: 'Universal template for Multi combination migrations (supports all combinations)',
      fileName: 'Multi Combination.docx',
      isDefault: true,
      category: 'multi',
      combination: 'multi-combination',
      planType: 'multi',
      keywords: ['multi', 'combination', 'universal', 'all']
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
        // Check if the file has been modified and update if needed
        const fileStats = fs.statSync(filePath);
        const existingModified = existing.lastModified ? new Date(existing.lastModified) : new Date(0);
        
        if (fileStats.mtime > existingModified) {
          console.log(`🔄 Template file modified, updating: ${template.name}`);
          console.log(`   File modified: ${fileStats.mtime.toLocaleString()}`);
          console.log(`   DB version: ${existingModified.toLocaleString()}`);
          
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
          
          console.log(`✅ Updated template: ${template.name} (${Math.round(fileBuffer.length / 1024)}KB, v${((existing.version || 1) + 0.1).toFixed(1)})`);
          uploadedCount++;
        } else {
          console.log(`✓ Template up-to-date: ${template.name}`);
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

  if (uploadedCount > 0) {
    console.log(`🎉 Template seeding completed! Updated/uploaded ${uploadedCount} templates`);
  } else {
    console.log(`✅ Template seeding completed! All templates are up-to-date`);
  }
  console.log(`📊 Total templates defined: 4 Messaging + 62 Content + 2 Overage Agreement (68 templates total)`);
  console.log(`   - Messaging: SLACK TO TEAMS, SLACK TO GOOGLE CHAT (Basic, Advanced)`);
  console.log(`   - Content: DROPBOX TO MYDRIVE, DROPBOX TO SHAREDRIVE (Basic, Standard, Advanced)`);
  console.log(`   - Content: DROPBOX TO SHAREPOINT, DROPBOX TO ONEDRIVE, DROPBOX TO GOOGLE, DROPBOX TO MICROSOFT (Standard, Advanced only)`);
  console.log(`   - Content: BOX TO BOX, BOX TO GOOGLE MYDRIVE, BOX TO GOOGLE SHARED DRIVE, BOX TO ONEDRIVE, BOX TO MICROSOFT, BOX TO GOOGLE (Standard, Advanced only)`);
  console.log(`   - Content: GOOGLE SHARED DRIVE TO EGNYTE, GOOGLE SHARED DRIVE TO GOOGLE SHARED DRIVE (Standard, Advanced only)`);
  console.log(`   - Content: GOOGLE SHARED DRIVE TO ONEDRIVE, GOOGLE SHARED DRIVE TO SHAREPOINT (Standard, Advanced only)`);
  console.log(`   - Content: GOOGLE MYDRIVE TO DROPBOX, GOOGLE MYDRIVE TO EGNYTE, GOOGLE MYDRIVE TO ONEDRIVE, GOOGLE MYDRIVE TO SHAREPOINT (Standard, Advanced only)`);
  console.log(`   - Content: GOOGLE MYDRIVE TO GOOGLE SHARED DRIVE, GOOGLE MYDRIVE TO GOOGLE MYDRIVE (Standard, Advanced only)`);
  console.log(`   - Content: SHAREFILE TO GOOGLE MYDRIVE, SHAREFILE TO GOOGLE SHARED DRIVE, SHAREFILE TO ONEDRIVE, SHAREFILE TO SHAREFILE, SHAREFILE TO SHAREPOINT (Standard, Advanced only)`);
  console.log(`   - Content: EGNYTE TO GOOGLE SHARED DRIVE, EGNYTE TO SHAREPOINT ONLINE, EGNYTE TO GOOGLE MYDRIVE (Standard, Advanced only)`);
  console.log(`   - Overage: OVERAGE AGREEMENT (Messaging, Content)`);
  return uploadedCount > 0;
}

module.exports = { seedDefaultTemplates };

// Execute seeding if run directly
if (require.main === module) {
  seedDefaultTemplates()
    .then(success => {
      if (success) {
        console.log('✅ Seeding completed successfully');
        process.exit(0);
      } else {
        console.log('⚠️ Seeding completed with warnings');
        process.exit(0);
      }
    })
    .catch(error => {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}
