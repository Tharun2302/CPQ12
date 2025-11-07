const express = require('express');
const cors = require('cors');
const axios = require('axios');
const sgMail = require('@sendgrid/mail');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
let libre;
try {
  libre = require('libreoffice-convert');
  // Don't promisify if it's already a promise-based function
  if (typeof libre.convert === 'function' && !libre.convertAsync) {
    libre.convertAsync = require('util').promisify(libre.convert);
  }
  console.log('✅ libreoffice-convert package loaded successfully');
} catch (e) {
  console.log('⚠️ libreoffice-convert not available, will use system LibreOffice');
  console.error('libreoffice-convert error:', e.message);
}
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware - Configure CORS to allow frontend requests
app.use(cors({
  origin: [
    'http://localhost:5173', 
    'http://localhost:3000', 
    'http://localhost:3001',
    'https://zenop.ai',
    'https://www.zenop.ai',
    'http://159.89.175.168:3001'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-KEY']
}));

// Extra CORS guard to overwrite any conflicting headers and satisfy strict preflight checks
app.use((req, res, next) => {
  const allowedOrigins = new Set([
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:3001',
    'https://zenop.ai',
    'https://www.zenop.ai',
    'http://159.89.175.168:3001',
    process.env.APP_BASE_URL?.replace(/\/$/, '')
  ].filter(Boolean));

  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-KEY');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
// Middleware to capture raw body for webhook signature verification
const rawBodySaver = (req, res, buf, encoding) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
};

app.use(express.json({ limit: '50mb', verify: rawBodySaver }));
app.use(express.urlencoded({ extended: true, limit: '50mb', verify: rawBodySaver }));

// Serve static files from the React app build
app.use(express.static(path.join(__dirname, 'dist')));

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// MongoDB configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

// MongoDB client
let client;
let db;

// Initialize MongoDB connection
async function initializeDatabase() {
  try {
    // Check if database connection is available
    console.log('🔍 Checking database connection...');
    console.log('📊 MongoDB config:', {
      uri: MONGODB_URI,
      database: DB_NAME
    });
    
    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ MongoDB connection successful');
    
    // Create signature_forms collection if it doesn't exist
    const signatureFormsCollection = db.collection('signature_forms');
    await signatureFormsCollection.createIndex({ form_id: 1 }, { unique: true });
    await signatureFormsCollection.createIndex({ quote_id: 1 });
    await signatureFormsCollection.createIndex({ status: 1 });
    await signatureFormsCollection.createIndex({ expires_at: 1 });
    
    // Create templates collection if it doesn't exist
    const templatesCollection = db.collection('templates');
    await templatesCollection.createIndex({ file_type: 1 });
    await templatesCollection.createIndex({ is_default: 1 });
    await templatesCollection.createIndex({ created_at: 1 });
    
    // Create documents collection with indexes
    const documentsCollection = db.collection('documents');
    await documentsCollection.createIndex({ id: 1 }, { unique: true });
    await documentsCollection.createIndex({ company: 1 });
    await documentsCollection.createIndex({ clientEmail: 1 });
    await documentsCollection.createIndex({ generatedDate: -1 });
    await documentsCollection.createIndex({ status: 1 });
    console.log('✅ Documents collection ready with indexes');
    
    console.log('✅ Connected to MongoDB Atlas successfully');
    console.log('📊 Database name:', DB_NAME);
    
    // Test the connection
    await db.admin().ping();
    
    // Auto-seed default templates on server startup
    try {
      const { seedDefaultTemplates } = require('./seed-templates.cjs');
      await seedDefaultTemplates(db);
    } catch (error) {
      console.log('⚠️ Template seeding skipped:', error.message);
    }
    console.log('✅ MongoDB Atlas ping successful');
    
    // Create users collection with proper indexes
    const usersCollection = db.collection('users');
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await usersCollection.createIndex({ provider: 1 });
    await usersCollection.createIndex({ created_at: -1 });
    console.log('✅ Users collection ready with indexes');

    // Ensure collections exist
    const collections = ['signature_forms', 'quotes', 'templates', 'pricing_tiers'];
    for (const collectionName of collections) {
      try {
        await db.createCollection(collectionName);
        console.log(`✅ Collection '${collectionName}' ready`);
  } catch (error) {
        console.log(`ℹ️ Collection '${collectionName}' already exists`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ MongoDB Atlas connection failed:', error);
    console.log('⚠️ Database features will be disabled');
    console.log('📝 To enable database features, set up MongoDB Atlas and configure:');
    console.log('   MONGODB_URI, DB_NAME environment variables');
    return false;
  }
}

// Initialize database on startup
let databaseAvailable = false;

// Environment variables
const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY || 'demo-key';
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = process.env.EMAIL_PORT || 587;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const GOTENBERG_URL = process.env.GOTENBERG_URL || '';
const LIBREOFFICE_SERVICE_URL = process.env.LIBREOFFICE_SERVICE_URL || 'http://localhost:3002';

// Email configuration
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}
const isEmailConfigured = process.env.SENDGRID_API_KEY;

// Verified sender configuration for SendGrid deliverability
const VERIFIED_FROM_ADDRESS = (process.env.SENDGRID_VERIFIED_FROM || process.env.EMAIL_FROM || 'cpq@zenop.ai').trim();
const VERIFIED_DOMAINS = (process.env.SENDGRID_VERIFIED_DOMAINS || 'zenop.ai')
  .split(',')
  .map(d => d.trim().toLowerCase())
  .filter(Boolean);
const EMAIL_DEBUG_BCC = (process.env.EMAIL_DEBUG_BCC || '').trim();

function chooseVerifiedFrom(requestedFrom) {
  if (!requestedFrom) return VERIFIED_FROM_ADDRESS;
  const parts = String(requestedFrom).split('@');
  if (parts.length !== 2) return VERIFIED_FROM_ADDRESS;
  const domain = parts[1].toLowerCase();
  return VERIFIED_DOMAINS.includes(domain) ? requestedFrom : VERIFIED_FROM_ADDRESS;
}

// Default recipient emails for approval workflow
// These values are used to auto-fill missing emails when a workflow is created
const DEFAULT_RECIPIENTS_BY_ROLE = {
  'Technical Team': (process.env.TECHNICAL_TEAM_EMAIL || 'abhilasha.kandakatla@cloudfuze.com').trim(),
  'Legal Team': (process.env.LEGAL_TEAM_EMAIL || 'abhilasha.kandakatla@cloudfuze.com').trim(),
  'Client': (process.env.CLIENT_EMAIL || 'anush.dasari@cloudfuze.com').trim(),
  'Deal Desk': (process.env.DEAL_DESK_EMAIL || '').trim()
};

// Email template functions
function generateManagerEmailHTML(workflowData) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Technical Team Approval Required</title>
    </head>
    <body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f5f5; padding: 20px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background: white; border-radius: 8px; overflow: hidden;">
              <!-- Header -->
              <tr>
                <td style="background: #3B82F6; color: white; padding: 30px 20px; text-align: center;">
                  <h1 style="margin: 0; font-size: 24px;">Document Approval Request</h1>
                  <p style="margin: 10px 0 0; font-size: 14px;">CloudFuze CPQ System</p>
                </td>
              </tr>
              
              <!-- Body -->
              <tr>
                <td style="padding: 30px 20px;">
                  <p style="margin: 0 0 20px; font-size: 16px;">Hello Technical Team,</p>
                  
                  <p style="margin: 0 0 20px;">A new document requires your review and approval.</p>
                  
                  <!-- Document Details -->
                  <table width="100%" cellpadding="10" cellspacing="0" border="0" style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; margin: 20px 0;">
                    <tr><td colspan="2" style="font-weight: bold; border-bottom: 1px solid #e5e7eb;">Document Information</td></tr>
                    <tr><td style="width: 40%; font-weight: bold;">Document ID:</td><td>${workflowData.documentId}</td></tr>
                    <tr><td style="font-weight: bold;">Client Name:</td><td>${workflowData.clientName}</td></tr>
                    <tr><td style="font-weight: bold;">Amount:</td><td>$${workflowData.amount.toLocaleString()}</td></tr>
                    <tr><td style="font-weight: bold;">Workflow ID:</td><td>${workflowData.workflowId}</td></tr>
                    <tr><td style="font-weight: bold;">Attachment:</td><td>PDF document attached</td></tr>
                  </table>
                  
                  <p style="margin: 20px 0; font-size: 14px;">Please review the attached document and click the button below to access the approval portal:</p>
                  
                  <!-- CTA Button -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                    <tr>
                      <td align="center">
                        <a href="${process.env.BASE_URL || 'http://localhost:5173'}/manager-approval?workflow=${workflowData.workflowId}" 
                           style="display: inline-block; background: #3B82F6; color: white; padding: 14px 30px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">
                          Access Approval Portal
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="margin: 20px 0 0; font-size: 13px; color: #666;">
                    <strong>Note:</strong> This approval link will expire in 7 days. If you have any questions, please contact your system administrator.
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0; font-size: 12px; color: #666;">
                    This is an automated notification from CloudFuze CPQ System.<br>
                    Internal workflow notification - no action required if already processed.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

// Generate plain text version
function generateManagerEmailPlainText(workflowData) {
  return `
DOCUMENT APPROVAL REQUEST
CloudFuze CPQ System

Hello Technical Team,

A new document requires your review and approval.

DOCUMENT INFORMATION:
- Document ID: ${workflowData.documentId}
- Client Name: ${workflowData.clientName}
- Amount: $${workflowData.amount.toLocaleString()}
- Workflow ID: ${workflowData.workflowId}
- Attachment: PDF document attached

Please review the attached document and access the approval portal using this link:
${process.env.BASE_URL || 'http://localhost:5173'}/manager-approval?workflow=${workflowData.workflowId}

Note: This approval link will expire in 7 days. If you have any questions, please contact your system administrator.

---
This is an automated notification from CloudFuze CPQ System.
Internal workflow notification - no action required if already processed.
  `.trim();
}

function generateCEOEmailHTML(workflowData) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Legal Team Approval Required</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #8B5CF6, #7C3AED); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1>👑 Legal Team Approval Required</h1>
        </div>
        
        <div style="background: white; padding: 30px; border: 1px solid #E5E7EB;">
          <h2>Hello Legal Team,</h2>
          
          <p>A new document requires your <strong>Legal Team</strong> approval:</p>
          
          <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>📄 Document Details</h3>
            <p><strong>Document ID:</strong> ${workflowData.documentId}</p>
            <p><strong>Client:</strong> ${workflowData.clientName}</p>
            <p><strong>Amount:</strong> $${workflowData.amount.toLocaleString()}</p>
            <p><strong>Workflow ID:</strong> ${workflowData.workflowId}</p>
            <p><strong>📎 Document:</strong> The PDF document is attached to this email for your review.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <table cellspacing="0" cellpadding="0" style="margin: 0 auto;">
              <tr>
                <td style="padding: 10px;">
                  <a href="${process.env.BASE_URL || 'http://localhost:5173'}/ceo-approval?workflow=${workflowData.workflowId}" 
                     style="background: #10B981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                    ✅ Review & Approve
                  </a>
                </td>
                <td style="padding: 10px;">
                  <a href="${process.env.BASE_URL || 'http://localhost:5173'}/ceo-approval?workflow=${workflowData.workflowId}" 
                     style="background: #DC2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                    ❌ Deny Request
                  </a>
                </td>
              </tr>
            </table>
          </div>
          
          <div style="background: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #F59E0B;">
            <p style="margin: 0; color: #92400E; font-weight: bold;">📋 Action Required</p>
            <p style="margin: 5px 0 0 0; color: #92400E; font-size: 14px;">
              Please review the document and either approve or deny. If you deny, you can provide comments explaining your decision.
            </p>
          </div>
          
          <p><strong>Note:</strong> This approval link is secure and will expire in 7 days.</p>
        </div>
        
        <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
          <p>This is an automated message from your approval system.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateClientEmailHTML(workflowData) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Document Submitted for Approval</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #10B981, #059669); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1>📋 Document Submitted for Approval</h1>
        </div>
        
        <div style="background: white; padding: 30px; border: 1px solid #E5E7EB;">
          <h2>Hello ${workflowData.clientName},</h2>
          
          <p>Your document has been submitted for approval:</p>
          
          <div style="background: #F0FDF4; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #BBF7D0;">
            <h3>📄 Document Details</h3>
            <p><strong>Document ID:</strong> ${workflowData.documentId}</p>
            <p><strong>Amount:</strong> $${workflowData.amount.toLocaleString()}</p>
            <p><strong>Status:</strong> Pending Approval</p>
            <p><strong>📎 Document:</strong> The PDF document is attached to this email for your review.</p>
          </div>
          
          <p>Our team will review your document and get back to you soon.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <table cellspacing="0" cellpadding="0" style="margin: 0 auto;">
              <tr>
                <td style="padding: 10px;">
                  <a href="${process.env.BASE_URL || 'http://localhost:5173'}/client-notification?workflow=${workflowData.workflowId}" 
                     style="background: #10B981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                    ✅ Review & Approve
                  </a>
                </td>
                <td style="padding: 10px;">
                  <a href="${process.env.BASE_URL || 'http://localhost:5173'}/client-notification?workflow=${workflowData.workflowId}" 
                     style="background: #DC2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                    ❌ Deny Request
                  </a>
                </td>
              </tr>
            </table>
          </div>
          
          <div style="background: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #F59E0B;">
            <p style="margin: 0; color: #92400E; font-weight: bold;">📋 Action Required</p>
            <p style="margin: 5px 0 0 0; color: #92400E; font-size: 14px;">
              Please review the document details and approve or deny this request. Your decision is required to complete the approval process. If you deny, you must provide a reason.
            </p>
          </div>
        </div>
        
        <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
          <p>This is an automated message from your approval system.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateDealDeskEmailHTML(workflowData) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Approval Workflow Completed</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #3B82F6, #1D4ED8); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1>✅ Approval Workflow Completed</h1>
        </div>
        
        <div style="background: white; padding: 30px; border: 1px solid #E5E7EB;">
          <h2>Hello Deal Desk Team,</h2>
          
          <p>The approval workflow has been completed successfully:</p>
          
          <div style="background: #EFF6FF; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #93C5FD;">
            <h3>📄 Document Details</h3>
            <p><strong>Document ID:</strong> ${workflowData.documentId}</p>
            <p><strong>Client:</strong> ${workflowData.clientName}</p>
            <p><strong>Amount:</strong> $${workflowData.amount.toLocaleString()}</p>
            <p><strong>Status:</strong> All Approvals Complete</p>
            <p><strong>📎 Document:</strong> The approved PDF document is attached to this email.</p>
          </div>
          
          <div style="background: #F0FDF4; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #BBF7D0;">
            <h3>✅ Approval Summary</h3>
            <ul style="margin: 0; padding-left: 20px;">
              <li>✅ Technical Team - Approved</li>
              <li>✅ Legal Team - Approved</li>
              <li>✅ Client - Approved</li>
            </ul>
          </div>
          
          <p>The document is now ready for your review and any necessary follow-up actions.</p>
          
          <div style="background: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #F59E0B;">
            <p style="margin: 0; color: #92400E; font-weight: bold;">📋 Next Steps</p>
            <p style="margin: 5px 0 0 0; color: #92400E; font-size: 14px;">
              Please review the approved document and proceed with any necessary deal desk processes.
            </p>
          </div>
        </div>
        
        <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
          <p>This is an automated notification from your approval system.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Email validation helper
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

// Email sending function using SendGrid
async function sendEmail(to, subject, html, attachments = [], plainText = null) {
  try {
    // Validate recipient email
    if (!to) {
      console.error('❌ Email send failed: No recipient email provided');
      return { success: false, error: 'No recipient email provided' };
    }

    // Validate email format
    const recipientEmails = Array.isArray(to) ? to : [to];
    const invalidEmails = recipientEmails.filter(email => !isValidEmail(email));
    
    if (invalidEmails.length > 0) {
      console.error('❌ Email send failed: Invalid email addresses:', invalidEmails);
      return { 
        success: false, 
        error: `Invalid email addresses: ${invalidEmails.join(', ')}`,
        invalidEmails: invalidEmails
      };
    }

    const requestedFrom = process.env.EMAIL_FROM || 'noreply@yourdomain.com';
    const resolvedFrom = chooseVerifiedFrom(requestedFrom);

    const emailPayload = {
      from: {
        email: resolvedFrom,
        name: 'CloudFuze CPQ System'
      },
      to: to,
      subject: subject,
      html: html,
      text: plainText || html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
      attachments: attachments.map(att => ({
        content: att.content.toString('base64'),
        filename: att.filename,
        type: att.contentType,
        disposition: 'attachment'
      })),
      // Add headers to improve deliverability and reduce spam score
      headers: {
        'X-Entity-Ref-ID': `CPQ-${Date.now()}`,
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
        'Precedence': 'bulk',
        'X-Mailer': 'CloudFuze CPQ System'
      },
      categories: ['cpq-approval', 'workflow'],
      customArgs: {
        'internal_system': 'cpq',
        'email_type': 'approval_workflow'
      }
    };

    if (resolvedFrom !== requestedFrom) {
      emailPayload.replyTo = {
        email: requestedFrom,
        name: 'CloudFuze Team'
      };
    }

    if (EMAIL_DEBUG_BCC) {
      emailPayload.bcc = [EMAIL_DEBUG_BCC];
    }
    
    console.log('📧 Sending email with SendGrid payload:', JSON.stringify({
      from: emailPayload.from,
      replyTo: emailPayload.replyTo || null,
      to: emailPayload.to,
      bcc: EMAIL_DEBUG_BCC || null,
      subject: emailPayload.subject,
      attachments: attachments.length > 0 ? `${attachments.length} attachment(s)` : 'No attachments'
    }, null, 2));
    
    const result = await sgMail.send(emailPayload);

    // Log full SendGrid response for debugging
    const statusCode = result?.[0]?.statusCode;
    const headers = result?.[0]?.headers || {};
    const messageId = headers['x-message-id'];
    
    console.log('📬 SendGrid API Response:', {
      statusCode: statusCode,
      messageId: messageId,
      headers: headers,
      fullResponse: JSON.stringify(result, null, 2)
    });

    // SendGrid returns 202 for accepted emails, but that doesn't guarantee delivery
    if (statusCode === 202) {
      console.log('✅ Email accepted by SendGrid (status 202)');
      console.log('⚠️  Note: Status 202 means SendGrid accepted the email, but delivery is not guaranteed.');
      console.log('⚠️  Check SendGrid dashboard for actual delivery status, bounces, or spam reports.');
      console.log(`📧 Recipient: ${to}`);
      console.log(`📧 Message ID: ${messageId || 'N/A'}`);
    } else {
      console.warn('⚠️  Unexpected SendGrid status code:', statusCode);
    }

    return { 
      success: true, 
      data: result,
      statusCode: statusCode,
      messageId: messageId,
      warning: 'Email accepted by SendGrid but delivery not guaranteed. Check SendGrid dashboard for delivery status.'
    };
  } catch (error) {
    // Enhanced error logging
    console.error('❌ Email send error - Full details:', {
      error: error.message,
      code: error.code,
      response: error.response ? {
        statusCode: error.response.statusCode,
        statusMessage: error.response.statusMessage,
        body: error.response.body,
        headers: error.response.headers
      } : null,
      stack: error.stack
    });

    // Extract SendGrid-specific error details
    let errorMessage = error.message;
    let errorDetails = null;
    
    if (error.response) {
      const body = error.response.body;
      if (body && body.errors) {
        errorDetails = body.errors;
        errorMessage = body.errors.map(e => e.message).join('; ');
        console.error('❌ SendGrid API Errors:', body.errors);
      }
    }

    return { 
      success: false, 
      error: errorMessage,
      errorDetails: errorDetails,
      code: error.code
    };
  }
}

// Serve static files
app.use(express.static(path.join(__dirname, 'dist')));

// Main route - serve the React app with deal data
app.get('/', (req, res) => {
  // Deal Information
  const dealId = req.query.dealId;
  const dealName = req.query.dealName;
  const amount = req.query.amount;
  const closeDate = req.query.closeDate;
  const stage = req.query.stage;
  const ownerId = req.query.ownerId;
  
  // Contact Information (from fetched_objects.fetched_object_176195683)
  const contactEmail = req.query.ContactEmail;
  const contactFirstName = req.query.ContactFirstName;
  const contactLastName = req.query.ContactLastName;
  
  // Company Information (from fetched_objects.fetched_object_176195685)
  const companyName = req.query.CompanyName;
  const companyByContact = req.query.CompanyByContact || req.query.CompanyFromContact;
  
  // Log all the captured data
  console.log({
    deal: { dealId, dealName, amount, closeDate, stage, ownerId },
    contact: { email: contactEmail, firstName: contactFirstName, lastName: contactLastName },
    company: { name: companyName, byContact: companyByContact }
  });
  
  // Create a more comprehensive response
  const fullContactName = `${contactFirstName} ${contactLastName}`.trim();
  
  res.send(`
    <h2>Deal Information</h2>
    <p><strong>Deal:</strong> ${dealName} (ID: ${dealId})</p>
    <p><strong>Amount:</strong> ${amount}</p>
    <p><strong>Stage:</strong> ${stage || 'N/A'}</p>
    <p><strong>Close Date:</strong> ${closeDate || 'N/A'}</p>
    <p><strong>Owner ID:</strong> ${ownerId || 'N/A'}</p>
    
    <h2>Contact Information</h2>
    <p><strong>Name:</strong> ${fullContactName}</p>
    <p><strong>Email:</strong> ${contactEmail}</p>
    
    <h2>Company Information</h2>
    <p><strong>Company:</strong> ${companyName}</p>
    <p><strong>Company by Contact:</strong> ${companyByContact}</p>
  `);
});

// Database health check endpoint
app.get('/api/database/health', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false,
        message: 'MongoDB not connected',
        error: 'Database connection not available'
      });
    }
    
    await db.admin().ping();
    res.json({
      success: true,
      message: 'MongoDB connection successful',
      database: DB_NAME,
      host: 'MongoDB Atlas'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'MongoDB connection failed',
      error: error.message
    });
  }
});

// Download document for BoldSign (free plan workaround)
app.get('/api/boldsign/download-document/:documentId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, message: 'Database not available' });
    }

    const { documentId } = req.params;
    
    // Try documents collection first
    const documentsCollection = db.collection('documents');
    const document = await documentsCollection.findOne({ id: documentId });

    if (document && document.fileData) {
      let fileBuffer;
      if (Buffer.isBuffer(document.fileData)) {
        fileBuffer = document.fileData;
      } else if (document.fileData.buffer) {
        fileBuffer = Buffer.from(document.fileData.buffer);
      } else if (document.fileData.data) {
        fileBuffer = Buffer.from(document.fileData.data);
      }

      const fileName = document.fileName || `${documentId}.pdf`;
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': fileBuffer.length
      });
      return res.send(fileBuffer);
    }

    // Fallback: try templates collection (in case approved file is stored as a template)
    const templatesCollection = db.collection('templates');
    const template = await templatesCollection.findOne({ id: documentId });
    if (template && template.fileData) {
      let fileBuffer;
      if (Buffer.isBuffer(template.fileData)) {
        fileBuffer = template.fileData;
      } else if (template.fileData.buffer) {
        fileBuffer = Buffer.from(template.fileData.buffer);
      } else if (template.fileData.data) {
        fileBuffer = Buffer.from(template.fileData.data);
      }

      const isPdf = (template.fileType || '').toLowerCase() === 'pdf';
      const contentType = isPdf
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const fileExt = isPdf ? 'pdf' : 'docx';
      const fileName = template.fileName || `${documentId}.${fileExt}`;

      res.set({
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': fileBuffer.length
      });
      return res.send(fileBuffer);
    }

    return res.status(404).json({ success: false, message: 'Document not found' });
  } catch (error) {
    console.error('❌ Error downloading document:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to download document', 
      error: error.message 
    });
  }
});

// Create BoldSign redirect (free plan compatible)
app.post('/api/boldsign/create-embedded-send', async (req, res) => {
  try {
    const { documentId, clientEmail, clientName } = req.body || {};
    
    if (!documentId) {
      return res.status(400).json({ success: false, message: 'documentId is required' });
    }

    // Determine best download URL based on where the file exists
    const baseAppUrl = (process.env.APP_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
    let resolvedDownloadUrl = null;

    try {
      // Prefer documents/:id/file if present
      const doc = await db.collection('documents').findOne({ id: documentId });
      if (doc && doc.fileData) {
        resolvedDownloadUrl = `${baseAppUrl}/api/documents/${documentId}/file`;
      } else {
        // Fallback to templates/:id/file if present
        const tpl = await db.collection('templates').findOne({ id: documentId });
        if (tpl && tpl.fileData) {
          resolvedDownloadUrl = `${baseAppUrl}/api/templates/${documentId}/file`;
        }
      }
    } catch (e) {
      console.warn('⚠️ Could not resolve download URL for documentId:', documentId, e?.message);
    }

    // As a last resort, keep previous fallback (combined resolver)
    if (!resolvedDownloadUrl) {
      resolvedDownloadUrl = `${baseAppUrl}/api/boldsign/download-document/${documentId}`;
    }

    // For free plan: provide BoldSign upload page + resolved download URL
    const APP_BASE = (process.env.BOLDSIGN_APP_URL || 'https://app.boldsign.com').replace(/\/$/, '');
    const uploadUrl = `${APP_BASE}/document/new`;
    
    return res.json({ 
      success: true, 
      url: uploadUrl,
      downloadUrl: resolvedDownloadUrl,
      clientEmail,
      clientName,
      instructions: 'Free plan: Download the document and upload it manually to BoldSign',
      freePlanMode: true
    });
  } catch (error) {
    console.error('❌ BoldSign redirect error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to create BoldSign redirect', 
      error: error.message 
    });
  }
});

// Authentication endpoints

// User registration
app.post('/api/auth/register', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false,
        error: 'Database not available',
        message: 'Cannot register users without database connection'
      });
    }

    const { name, email, password } = req.body;
    
    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    // Check if user already exists
    const existingUser = await db.collection('users').findOne({ email: email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = {
      id: `user_${Date.now()}`,
      name: name,
      email: email,
      password: hashedPassword,
      provider: 'email',
      created_at: new Date(),
      updated_at: new Date()
    };

    await db.collection('users').insertOne(user);

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      message: 'User registered successfully',
      user: userWithoutPassword,
      token: token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register user',
      error: error.message
    });
  }
});

// User login
app.post('/api/auth/login', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false,
        error: 'Database not available',
        message: 'Cannot login without database connection'
      });
    }

    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user
    const user = await db.collection('users').findOne({ email: email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      message: 'Login successful',
      user: userWithoutPassword,
      token: token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to login',
      error: error.message
    });
  }
});

// Get user by token
app.get('/api/auth/me', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false,
        error: 'Database not available',
        message: 'Cannot verify user without database connection'
      });
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    // Only verify server-issued JWTs (tokens with 3 parts)
    if (token.split('.').length !== 3) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format'
      });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.collection('users').findOne({ id: decoded.userId });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token',
      error: error.message
    });
  }
});

// Microsoft OAuth user creation/update
app.post('/api/auth/microsoft', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false,
        error: 'Database not available',
        message: 'Cannot process Microsoft auth without database connection'
      });
    }

    const { id, name, email, accessToken } = req.body;
    
    // Check if user exists
    let user = await db.collection('users').findOne({ email: email });
    
    if (user) {
      // Update existing user
      await db.collection('users').updateOne(
        { email: email },
        { 
          $set: { 
            name: name,
            provider: 'microsoft',
            updated_at: new Date()
          }
        }
      );
      user = await db.collection('users').findOne({ email: email });
    } else {
      // Create new user
      user = {
        id: id || `microsoft_${Date.now()}`,
        name: name,
        email: email,
        provider: 'microsoft',
        created_at: new Date(),
        updated_at: new Date()
      };
      await db.collection('users').insertOne(user);
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      message: 'Microsoft authentication successful',
      user: userWithoutPassword,
      token: token
    });
  } catch (error) {
    console.error('Microsoft auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process Microsoft authentication',
      error: error.message
    });
  }
});

// Save quote to database
app.post('/api/quotes', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false,
        error: 'Database not available',
        message: 'Cannot save quotes without database connection'
      });
    }

    const { id, clientName, clientEmail, company, configuration, selectedTier, calculation, status } = req.body;
    
    const quote = {
      id,
      client_name: clientName,
      client_email: clientEmail,
      company,
      configuration,
      selected_tier: selectedTier,
      calculation,
      status,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    await db.collection('quotes').replaceOne(
      { id: id },
      quote,
      { upsert: true }
    );
    
    res.json({ success: true, message: 'Quote saved successfully' });
  } catch (error) {
    console.error('Save quote error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save quote',
      error: error.message
    });
  }
});

// Get all quotes from database
app.get('/api/quotes', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false,
        error: 'Database not available',
        message: 'Cannot fetch quotes without database connection'
      });
    }

    const quotes = await db.collection('quotes').find({}).sort({ created_at: -1 }).toArray();
    
    const formattedQuotes = quotes.map(quote => {
      return {
        ...quote,
        configuration: quote.configuration || {},
        selectedTier: quote.selected_tier || {},
        calculation: quote.calculation || {}
      };
    });
    
    res.json({ success: true, quotes: formattedQuotes });
  } catch (error) {
    console.error('Get quotes error:', error);
      res.status(500).json({
        success: false,
      message: 'Failed to fetch quotes',
      error: error.message
    });
  }
});

// Update quote status in database
app.put('/api/quotes/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false,
        error: 'Database not available',
        message: 'Cannot update quotes without database connection'
      });
    }

    const { id } = req.params;
    const { status } = req.body;
    
    await db.collection('quotes').updateOne(
      { id: id },
      { 
        $set: { 
          status: status,
          updated_at: new Date()
        }
      }
    );
    
    res.json({ success: true, message: 'Quote status updated successfully' });
  } catch (error) {
    console.error('Update quote error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update quote',
      error: error.message
    });
  }
});

// Delete quote from database
app.delete('/api/quotes/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database not available',
        message: 'Cannot delete quotes without database connection'
      });
    }

    const { id } = req.params;
    
    await db.collection('quotes').deleteOne({ id: id });
    
    res.json({ success: true, message: 'Quote deleted successfully' });
  } catch (error) {
    console.error('Delete quote error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete quote',
      error: error.message
    });
  }
});

// Save pricing tier to database
app.post('/api/pricing-tiers', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database not available',
        message: 'Cannot save pricing tiers without database connection'
      });
    }

    const { id, name, perUserCost, perGBCost, managedMigrationCost, instanceCost, userLimits, gbLimits, features } = req.body;
    
    const pricingTier = {
      id,
      name,
      per_user_cost: perUserCost,
      per_gb_cost: perGBCost,
      managed_migration_cost: managedMigrationCost,
      instance_cost: instanceCost,
      user_limits: userLimits,
      gb_limits: gbLimits,
      features,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    await db.collection('pricing_tiers').replaceOne(
      { id: id },
      pricingTier,
      { upsert: true }
    );
    
    res.json({ success: true, message: 'Pricing tier saved successfully' });
  } catch (error) {
    console.error('Save pricing tier error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save pricing tier',
      error: error.message
    });
  }
});

// Get all pricing tiers from database
app.get('/api/pricing-tiers', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database not available',
        message: 'Cannot fetch pricing tiers without database connection'
      });
    }

    const tiers = await db.collection('pricing_tiers').find({}).sort({ name: 1 }).toArray();
    
    const formattedTiers = tiers.map(tier => ({
      id: tier.id,
      name: tier.name,
      perUserCost: tier.per_user_cost,
      perGBCost: tier.per_gb_cost,
      managedMigrationCost: tier.managed_migration_cost,
      instanceCost: tier.instance_cost,
      userLimits: tier.user_limits,
      gbLimits: tier.gb_limits,
      features: tier.features,
      createdAt: tier.created_at,
      updatedAt: tier.updated_at
    }));
    
    res.json({ success: true, tiers: formattedTiers });
  } catch (error) {
    console.error('Get pricing tiers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pricing tiers',
      error: error.message
    });
  }
});

// Signature Forms Endpoints

// Create signature form
app.post('/api/signature/create-form', async (req, res) => {
  try {
    if (!db) {
        return res.status(500).json({ 
          success: false, 
        error: 'Database not available',
        message: 'Cannot create signature forms without database connection'
      });
    }

    const { formId, quoteId, clientEmail, clientName, quoteData } = req.body;
    
    const signatureForm = {
      form_id: formId,
      quote_id: quoteId,
      client_email: clientEmail,
      client_name: clientName,
      quote_data: quoteData,
      status: 'pending',
      created_at: new Date(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      interactions: [],
      signature_data: null,
      approval_status: 'pending'
    };
    
    await db.collection('signature_forms').insertOne(signatureForm);

    res.json({
      success: true,
      message: 'Signature form created successfully',
      formId: formId
    });
  } catch (error) {
    console.error('Create signature form error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create signature form',
      error: error.message
    });
  }
});

// Get signature form
app.get('/api/signature/form/:formId', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database not available',
        message: 'Cannot fetch signature forms without database connection'
      });
    }

    const { formId } = req.params;
    
    const form = await db.collection('signature_forms').findOne({ form_id: formId });
    
    if (!form) {
      return res.status(404).json({ 
        success: false, 
        message: 'Signature form not found' 
      });
    }
    
    res.json({
      success: true,
      form: form
    });
  } catch (error) {
    console.error('Get signature form error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch signature form',
      error: error.message
    });
  }
});

// Submit signature form
app.post('/api/signature/submit', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database not available',
        message: 'Cannot submit signature forms without database connection'
      });
    }

    const { formId, signatureData, clientComments } = req.body;
    
    await db.collection('signature_forms').updateOne(
      { form_id: formId },
      { 
        $set: { 
          signature_data: signatureData,
          client_comments: clientComments,
          status: 'completed',
          approval_status: 'approved',
          completed_at: new Date()
        }
      }
    );
    
    res.json({
      success: true,
      message: 'Signature form submitted successfully'
    });
  } catch (error) {
    console.error('Submit signature form error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit signature form',
      error: error.message
    });
  }
});

// Get signature forms by quote ID
app.get('/api/signature/forms-by-quote/:quoteId', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false,
        error: 'Database not available',
        message: 'Cannot fetch signature forms without database connection'
      });
    }

    const { quoteId } = req.params;
    
    const forms = await db.collection('signature_forms')
      .find({ quote_id: quoteId })
      .sort({ created_at: -1 })
      .toArray();

    res.json({
      success: true,
      forms: forms
    });
  } catch (error) {
    console.error('Get signature forms by quote error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch signature forms',
      error: error.message
    });
  }
});

// Get signature analytics
app.get('/api/signature/analytics', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database not available',
        message: 'Cannot fetch analytics without database connection'
      });
    }

    const totalForms = await db.collection('signature_forms').countDocuments();
    const pendingForms = await db.collection('signature_forms').countDocuments({ status: 'pending' });
    const completedForms = await db.collection('signature_forms').countDocuments({ status: 'completed' });
    const approvedForms = await db.collection('signature_forms').countDocuments({ approval_status: 'approved' });
    const rejectedForms = await db.collection('signature_forms').countDocuments({ approval_status: 'rejected' });
    
    const recentActivity = await db.collection('signature_forms')
      .find({})
      .sort({ created_at: -1 })
      .limit(10)
      .toArray();

    res.json({
      success: true,
      analytics: {
        totalForms,
        pendingForms,
        completedForms,
        approvedForms,
        rejectedForms,
      recentActivity
      }
    });
  } catch (error) {
    console.error('Get signature analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
});

// Template Endpoints

// Upload template
app.post('/api/templates', upload.single('template'), async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
      success: false, 
        error: 'Database not available',
        message: 'Cannot save templates without database connection'
      });
    }
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No template file provided' 
      });
    }

    const { name, description, isDefault } = req.body;
    const file = req.file;
    
    // Generate unique ID for template
    const templateId = `template-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    // Determine file type
    const fileType = file.originalname.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf';
    
    console.log('📄 Processing template:', {
      id: templateId,
      name: name || file.originalname,
      fileName: file.originalname,
      fileType,
      fileSize: file.size
    });

    const template = {
      id: templateId,
      name: name || file.originalname,
      description: description || '',
      fileName: file.originalname,
      fileType: fileType,
      fileSize: file.size,
      fileData: file.buffer,
      isDefault: isDefault === 'true' || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await db.collection('templates').insertOne(template);

      console.log('✅ Template saved to database:', templateId);
      
      res.json({
        success: true,
        message: 'Template uploaded successfully',
        template: {
          id: templateId,
          name: name || file.originalname,
          description: description || '',
          fileName: file.originalname,
          fileType,
          fileSize: file.size,
          isDefault: isDefault === 'true' || false,
          createdAt: new Date().toISOString()
        }
      });
    
  } catch (error) {
    console.error('❌ Error uploading template:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload template',
      details: error.message 
    });
  }
});

// Get all templates
app.get('/api/templates', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database not available',
        message: 'Cannot fetch templates without database connection'
      });
    }

    console.log('📄 Fetching templates from database...');
    
    const templates = await db.collection('templates')
      .find({}, { fileData: 0 }) // Exclude file data from list
      .sort({ createdAt: -1 })
      .toArray();
    
    console.log(`✅ Fetched ${templates.length} templates from database`);

      res.json({
        success: true,
      templates: templates,
        count: templates.length
      });
  } catch (error) {
    console.error('❌ Error fetching templates:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch templates',
      details: error.message 
    });
  }
});

// Get template file
app.get('/api/templates/:id/file', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database not available',
        message: 'Cannot fetch template files without database connection'
      });
    }

    const { id } = req.params;
    
    console.log('📄 Fetching template file:', id);
    
    const template = await db.collection('templates').findOne({ id: id });
    
    if (!template) {
        return res.status(404).json({ 
          success: false, 
          error: 'Template not found' 
        });
      }

    // Determine content type based on stored fileType (supports both short type and full MIME)
    let contentType = 'application/octet-stream';
    const ft = (template.fileType || '').toString().toLowerCase();
    if (ft === 'docx' || ft.includes('wordprocessingml')) {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (ft === 'pdf' || ft.includes('application/pdf')) {
      contentType = 'application/pdf';
    }
    
    // Normalize fileData to Buffer (support Buffer, BSON Binary, or base64 string)
    let fileBuffer;
    if (Buffer.isBuffer(template.fileData)) {
      fileBuffer = template.fileData;
    } else if (template.fileData && template.fileData.buffer) {
      // Some drivers store Binary with .buffer
      fileBuffer = Buffer.from(template.fileData.buffer);
    } else if (typeof template.fileData === 'string') {
      // Base64 string
      fileBuffer = Buffer.from(template.fileData, 'base64');
    } else {
      throw new Error('Unsupported template fileData format');
    }
    
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${template.fileName}"`,
      'Content-Length': fileBuffer.length
    });
    
    res.send(fileBuffer);
  } catch (error) {
    console.error('❌ Error fetching template file:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch template file',
      details: error.message 
    });
  }
});

// ============================================
// PDF DOCUMENTS API ENDPOINTS
// ============================================

// Get PDF document by ID
app.get('/api/documents/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    const { id } = req.params;
    console.log('📄 Fetching document:', id);

    const documentsCollection = db.collection('documents');
    const document = await documentsCollection.findOne({ id: id });

    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    console.log('📄 Document found:', {
      id: document.id,
      fileName: document.fileName,
      fileDataType: typeof document.fileData,
      isBuffer: Buffer.isBuffer(document.fileData),
      hasBuffer: !!document.fileData?.buffer,
      hasData: !!document.fileData?.data
    });

    // Convert document data to buffer
    let fileBuffer;
    if (Buffer.isBuffer(document.fileData)) {
      fileBuffer = document.fileData;
    } else if (document.fileData.buffer) {
      fileBuffer = Buffer.from(document.fileData.buffer);
    } else if (document.fileData.data) {
      fileBuffer = Buffer.from(document.fileData.data);
    } else if (typeof document.fileData === 'string') {
      // Handle base64 string
      fileBuffer = Buffer.from(document.fileData, 'base64');
    } else {
      console.error('❌ Unknown document data format:', typeof document.fileData);
      return res.status(500).json({
        success: false,
        error: 'Invalid document data format'
      });
    }

    console.log('✅ Document found, size:', fileBuffer.length, 'bytes');

    // Convert to base64 for JSON response
    const base64Data = fileBuffer.toString('base64');
    
    console.log('📄 Converting to base64 for BoldSign...');
    console.log('📄 Base64 preview:', base64Data.substring(0, 50) + '...');

    res.json({
      success: true,
      id: document.id,
      fileName: document.fileName,
      fileSize: document.fileSize,
      fileData: base64Data,
      clientName: document.clientName,
      clientEmail: document.clientEmail,
      company: document.company,
      templateName: document.templateName,
      generatedDate: document.generatedDate,
      metadata: document.metadata
    });

  } catch (error) {
    console.error('❌ Error fetching document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch document',
      details: error.message
    });
  }
});

// Save PDF document to MongoDB (similar to template save)
app.post('/api/documents', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { fileName, fileData, fileSize, clientName, clientEmail, company, templateName, quoteId, metadata } = req.body;

    if (!fileName || !fileData) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    console.log('📄 Saving PDF document to MongoDB:', {
      fileName,
      company,
      fileSize,
      clientName
    });
    
    console.log('🔍 Document ID generation data:', {
      clientName: clientName,
      company: company,
      clientNameType: typeof clientName,
      companyType: typeof company
    });

    // Convert base64 to Buffer (same as templates)
    const fileBuffer = Buffer.from(fileData, 'base64');

    // Generate document ID with client and company names
    const sanitizeForId = (str) => {
      if (!str) return 'Unknown';
      return str
        .replace(/[^a-zA-Z0-9]/g, '') // Remove special characters
        .substring(0, 20) // Limit length
        .replace(/^[0-9]/, 'C$&'); // Ensure doesn't start with number
    };
    
    const sanitizedCompany = sanitizeForId(company);
    const sanitizedClient = sanitizeForId(clientName);
    const timestamp = Date.now().toString().slice(-5); // Keep only last 5 digits
    
    const document = {
      id: `${sanitizedCompany}_${sanitizedClient}_${timestamp}`,
      fileName,
      fileData: fileBuffer, // Store as Buffer like templates
      fileSize,
      clientName,
      clientEmail,
      company,
      templateName,
      generatedDate: new Date(),
      quoteId,
      metadata,
      createdAt: new Date(),
      status: 'active'
    };

    const documentsCollection = db.collection('documents');
    const result = await documentsCollection.insertOne(document);

    if (result.insertedId) {
      console.log('✅ PDF document saved to MongoDB:', document.id);
      console.log('   MongoDB _id:', result.insertedId);
      console.log('   Company:', company);
      console.log('   File size:', Math.round(fileSize / 1024), 'KB');
    }

    res.json({ 
      success: true, 
      message: 'Document saved successfully',
      documentId: document.id
    });
  } catch (error) {
    console.error('❌ Error saving document:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save document',
      details: error.message 
    });
  }
});

// Get all PDF documents (convert Buffer to base64 for frontend)
app.get('/api/documents', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const documentsCollection = db.collection('documents');
    const documents = await documentsCollection
      .find({})
      .sort({ generatedDate: -1 })
      .toArray();

    console.log('✅ Retrieved documents from MongoDB:', documents.length);

    // Convert Buffer to base64 for frontend (same as templates)
    const documentsWithBase64 = documents.map(doc => {
      let base64 = '';
      try {
        // Handle both Buffer and BSON Binary
        if (doc.fileData) {
          if (Buffer.isBuffer(doc.fileData)) {
            base64 = doc.fileData.toString('base64');
          } else if (doc.fileData.buffer) {
            base64 = Buffer.from(doc.fileData.buffer).toString('base64');
          } else if (doc.fileData.data) {
            base64 = Buffer.from(doc.fileData.data).toString('base64');
          }
        }
      } catch (e) {
        console.warn('⚠️ Could not convert document Buffer to base64 for id:', doc.id, e?.message);
      }
      return { ...doc, fileData: base64 };
    });

    res.json({ 
      success: true, 
      documents: documentsWithBase64
    });
  } catch (error) {
    console.error('❌ Error retrieving documents:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve documents',
      details: error.message 
    });
  }
});

// Get single PDF document by ID (convert Buffer to base64)
app.get('/api/documents/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const documentsCollection = db.collection('documents');
    const document = await documentsCollection.findOne({ id: req.params.id });

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    console.log('✅ Retrieved document from MongoDB:', document.id);

    // Convert Buffer to base64 for frontend
    let base64 = '';
    try {
      if (document.fileData) {
        if (Buffer.isBuffer(document.fileData)) {
          base64 = document.fileData.toString('base64');
        } else if (document.fileData.buffer) {
          base64 = Buffer.from(document.fileData.buffer).toString('base64');
        } else if (document.fileData.data) {
          base64 = Buffer.from(document.fileData.data).toString('base64');
        }
      }
    } catch (e) {
      console.warn('⚠️ Could not convert single document Buffer to base64 for id:', document.id, e?.message);
    }
    const documentWithBase64 = { ...document, fileData: base64 };

    res.json({ 
      success: true, 
      document: documentWithBase64
    });
  } catch (error) {
    console.error('❌ Error retrieving document:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve document',
      details: error.message 
    });
  }
});

// Delete PDF document by ID
app.delete('/api/documents/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const documentsCollection = db.collection('documents');
    const result = await documentsCollection.deleteOne({ id: req.params.id });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    console.log('✅ Deleted document from MongoDB:', req.params.id);

    res.json({ 
      success: true, 
      message: 'Document deleted successfully' 
    });
  } catch (error) {
    console.error('❌ Error deleting document:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete document',
      details: error.message 
    });
  }
});

// ============================================
// DOCX TO PDF CONVERSION
// ============================================

// Convert DOCX to PDF using multiple fallback methods
app.post('/api/convert/docx-to-pdf', upload.single('file'), async (req, res) => {
  // Set longer timeout for conversion
  req.setTimeout(60000); // 60 seconds
  res.setTimeout(60000);
  
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No DOCX file provided' });
    }

    console.log('🔄 Starting DOCX to PDF conversion...');
    console.log('📄 File size:', req.file.size, 'bytes');
    console.log('📄 File type:', req.file.mimetype);

    // Method 1: Direct LibreOffice system call (most reliable for exact formatting)
    console.log('📄 Trying direct LibreOffice conversion...');
    try {
      const os = require('os');
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpq-'));
      const inputPath = path.join(tmpDir, `${uuidv4()}.docx`);
      const outputPath = path.join(tmpDir, `${uuidv4()}.pdf`);
      
      // Write DOCX to temp file
      fs.writeFileSync(inputPath, req.file.buffer);
      console.log('📄 Temp DOCX written:', inputPath);
      
      // Use LibreOffice to convert
      const isWindows = os.platform() === 'win32';
      const sofficeCmd = process.env.SOFFICE_PATH || (isWindows ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe' : 'libreoffice');
      console.log('📄 Using LibreOffice:', sofficeCmd);
      
      const { spawn } = require('child_process');
      const conversion = spawn(sofficeCmd, [
        '--headless',
        '--convert-to', 'pdf',
        '--outdir', tmpDir,
        inputPath
      ], { stdio: 'pipe' });
      
      let stdout = '';
      let stderr = '';
      conversion.stdout.on('data', (data) => { stdout += data.toString(); });
      conversion.stderr.on('data', (data) => { stderr += data.toString(); });
      
      const conversionPromise = new Promise((resolve, reject) => {
        conversion.on('close', (code) => {
          console.log('📄 LibreOffice exit code:', code);
          console.log('📄 LibreOffice stdout:', stdout);
          console.log('📄 LibreOffice stderr:', stderr);
          
          if (code !== 0) {
            reject(new Error(`LibreOffice conversion failed with code ${code}: ${stderr}`));
            return;
          }
          
          // Find the generated PDF
          const expectedPdfPath = inputPath.replace(/\.docx$/i, '.pdf');
          console.log('📄 Looking for PDF at:', expectedPdfPath);
          
          if (!fs.existsSync(expectedPdfPath)) {
            reject(new Error(`PDF not found at expected location: ${expectedPdfPath}`));
            return;
          }
          
          const pdfBuffer = fs.readFileSync(expectedPdfPath);
          console.log('✅ PDF generated successfully with LibreOffice');
          console.log('📄 PDF size:', pdfBuffer.length, 'bytes');
          
          // Cleanup
          try { fs.unlinkSync(inputPath); } catch {}
          try { fs.unlinkSync(expectedPdfPath); } catch {}
          try { fs.rmdirSync(tmpDir); } catch {}
          
          resolve(pdfBuffer);
        });
        
        conversion.on('error', (error) => {
          console.error('❌ LibreOffice spawn error:', error);
          reject(error);
        });
      });
      
      const pdfBuffer = await conversionPromise;
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="agreement.pdf"',
        'Content-Length': pdfBuffer.length
      });
      return res.send(pdfBuffer);
      
    } catch (libreError) {
      console.error('❌ Direct LibreOffice conversion failed:', libreError);
      console.error('Error details:', libreError.message);
      // Continue to next method
    }

    // Method 2: Try remote Gotenberg service
    if (GOTENBERG_URL) {
      try {
        console.log('📄 Trying Gotenberg service...');
        const baseUrl = GOTENBERG_URL.replace(/\/$/, '');
        const endpoint = `${baseUrl}/forms/libreoffice/convert`;
        const form = new FormData();
        const blob = new Blob([req.file.buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        form.append('files', blob, 'document.docx');
        form.append('outputFilename', 'agreement');
        const resp = await fetch(endpoint, { method: 'POST', body: form });
        if (!resp.ok) {
          const txt = await resp.text();
          console.error('Gotenberg conversion failed:', resp.status, txt);
        } else {
          const ab = await resp.arrayBuffer();
          const pdfBuffer = Buffer.from(ab);
          console.log('✅ PDF converted successfully with Gotenberg');
          res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="agreement.pdf"',
            'Content-Length': pdfBuffer.length
          });
          return res.send(pdfBuffer);
        }
      } catch (e) {
        console.error('❌ Gotenberg request error:', e);
      }
    }

    // Method 3: Simple text-based PDF generation
    console.log('📄 Trying simple text-based PDF generation...');
    try {
      const mammoth = require('mammoth');
      
      // Convert DOCX to plain text
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      const textContent = result.value;
      
      console.log('📄 Extracted text length:', textContent.length);
      console.log('📄 Text preview:', textContent.substring(0, 200) + '...');
      
      if (!textContent || textContent.trim().length === 0) {
        throw new Error('No text content extracted from DOCX');
      }
      
       // Create a simple PDF using jsPDF
       const { jsPDF } = require('jspdf');
       const pdf = new jsPDF();
      
      // Set font and size
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(12);
      
      // Split text into lines that fit the page width
      const pageWidth = 180; // Usable width in mm (210 - 30 for margins)
      const lineHeight = 7; // Line height in mm
      const maxLinesPerPage = 35; // Approximate lines per page
      
      const lines = pdf.splitTextToSize(textContent, pageWidth);
      
      let currentLine = 0;
      let currentPage = 1;
      
      // Add title
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('SERVICE AGREEMENT', 15, 20);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      
      let yPosition = 35;
      
      for (let i = 0; i < lines.length; i++) {
        if (yPosition > 280) { // Near bottom of page
          pdf.addPage();
          yPosition = 20;
          currentPage++;
        }
        
        pdf.text(lines[i], 15, yPosition);
        yPosition += lineHeight;
      }
      
      // Add page numbers
      const totalPages = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(10);
        pdf.text(`Page ${i} of ${totalPages}`, 180, 290);
      }
      
      const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));
      
      console.log('✅ PDF generated successfully with text fallback');
      console.log('📄 PDF size:', pdfBuffer.length, 'bytes');
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="agreement.pdf"',
        'Content-Length': pdfBuffer.length
      });
      return res.send(pdfBuffer);
      
    } catch (textError) {
      console.error('❌ Text-based PDF generation failed:', textError);
    }

    // All conversion methods failed
    console.error('❌ All conversion methods failed');
    return res.status(500).json({ 
      success: false, 
      error: 'PDF conversion not available. All conversion methods failed.',
      details: {
        libreofficeConvert: libre ? 'failed' : 'not available',
        gotenberg: GOTENBERG_URL ? 'failed' : 'not configured',
        htmlFallback: 'failed',
        systemLibreOffice: 'not used (relying on libreoffice-convert package)'
      }
    });

  } catch (error) {
    console.error('❌ DOCX->PDF conversion error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test DOCX to PDF conversion capabilities
app.get('/api/convert/test', async (req, res) => {
  try {
    console.log('🧪 Testing conversion capabilities...');
    const status = {
      libreofficeConvert: libre ? 'available' : 'not available',
      gotenberg: GOTENBERG_URL ? `configured: ${GOTENBERG_URL}` : 'not configured',
      systemLibreOffice: 'not tested (use libreoffice-convert instead)'
    };
    
    res.json({ success: true, status });
  } catch (error) {
    console.error('❌ Test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete template
app.delete('/api/templates/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database not available',
        message: 'Cannot delete templates without database connection'
      });
    }

    const { id } = req.params;
    
    console.log('🗑️ Deleting template:', id);
    
    const result = await db.collection('templates').deleteOne({ id: id });
    
    if (result.deletedCount === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Template not found' 
        });
      }

    console.log('✅ Template deleted successfully:', id);
      
      res.json({
        success: true,
        message: 'Template deleted successfully'
      });
  } catch (error) {
    console.error('❌ Error deleting template:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete template',
      details: error.message 
    });
  }
});

// Update template metadata
app.put('/api/templates/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database not available',
        message: 'Cannot update templates without database connection'
      });
    }

    const { id } = req.params;
    const { name, description, isDefault } = req.body;
    
    console.log('📝 Updating template metadata:', id, { name, description, isDefault });
    
    const updateData = {
      updatedAt: new Date().toISOString()
    };
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    
    const result = await db.collection('templates').updateOne(
      { id: id },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Template not found' 
        });
      }

    console.log('✅ Template updated successfully:', id);
      
      res.json({
        success: true,
        message: 'Template updated successfully'
      });
  } catch (error) {
    console.error('❌ Error updating template:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update template',
      details: error.message 
    });
  }
});

// HubSpot API endpoints for authentication
// Get HubSpot contact by ID
app.get('/api/hubspot/contacts/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;
    
    if (!HUBSPOT_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'HubSpot API key not configured'
      });
    }

    const response = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HubSpot API error: ${response.status}`);
    }

    const data = await response.json();
    
    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('❌ Error fetching HubSpot contact:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get HubSpot deal by ID
app.get('/api/hubspot/deals/:dealId', async (req, res) => {
  try {
    const { dealId } = req.params;
    
    if (!HUBSPOT_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'HubSpot API key not configured'
      });
    }

    const response = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HubSpot API error: ${response.status}`);
    }

    const data = await response.json();
    
    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('❌ Error fetching HubSpot deal:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test MongoDB connection
app.get('/api/test-mongodb', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false, 
        error: 'MongoDB not connected',
        message: 'Database connection not available'
      });
    }

    const testDoc = { 
      message: 'MongoDB Atlas connection test', 
      timestamp: new Date(),
      test: true,
      database: DB_NAME
    };
    
    const result = await db.collection('test').insertOne(testDoc);
    
    res.json({ 
      success: true, 
      message: 'MongoDB Atlas working!', 
      id: result.insertedId,
      database: DB_NAME,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      database: DB_NAME,
      message: 'MongoDB connection failed'
    });
  }
});

// HubSpot API endpoints
app.get('/api/hubspot/contacts', async (req, res) => {
  try {
    console.log('🔍 HubSpot contacts endpoint called');
    
    // For now, return demo data since we don't have real HubSpot integration
    const demoContacts = [
      {
        id: 'contact_1',
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Example Corp',
        phone: '+1-555-0123'
      },
      {
        id: 'contact_2', 
        email: 'jane.smith@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        company: 'Tech Solutions',
        phone: '+1-555-0456'
      }
    ];
    
    res.json({
      success: true,
      data: demoContacts,
      isDemo: true,
      message: 'Demo HubSpot contacts data'
    });
  } catch (error) {
    console.error('❌ Error fetching HubSpot contacts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contacts',
      message: error.message
    });
  }
});

app.get('/api/hubspot/deals', async (req, res) => {
  try {
    console.log('🔍 HubSpot deals endpoint called');
    
    // For now, return demo data since we don't have real HubSpot integration
    const demoDeals = [
      {
        id: 'deal_1',
        dealName: 'Cloud Migration Project',
        amount: '$25,000',
        stage: 'Proposal',
        closeDate: '2024-12-31',
        ownerId: 'owner_1'
      },
      {
        id: 'deal_2',
        dealName: 'Digital Transformation',
        amount: '$50,000', 
        stage: 'Negotiation',
        closeDate: '2024-11-15',
        ownerId: 'owner_2'
      }
    ];
    
    res.json({
      success: true,
      data: demoDeals,
      isDemo: true,
      message: 'Demo HubSpot deals data'
    });
  } catch (error) {
    console.error('❌ Error fetching HubSpot deals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch deals',
      message: error.message
    });
  }
});

app.post('/api/hubspot/contacts', async (req, res) => {
  try {
    console.log('🔍 Creating HubSpot contact:', req.body);
    
    // For now, simulate contact creation
    const newContact = {
      id: `contact_${Date.now()}`,
      ...req.body,
      createdAt: new Date().toISOString()
    };
    
    res.json({
      success: true,
      contact: newContact,
      isDemo: true,
      message: 'Demo contact created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating HubSpot contact:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create contact',
      message: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true,
    message: 'CPQ Server is running',
    timestamp: new Date(),
    database: databaseAvailable ? 'Connected' : 'Disconnected',
    email: isEmailConfigured ? 'Configured' : 'Not configured',
    hubspot: HUBSPOT_API_KEY !== 'demo-key' ? 'Configured' : 'Demo mode'
  });
});

// Email sending endpoint (supports attachments e.g., DOCX/PDF)
app.post('/api/email/send', upload.single('attachment'), async (req, res) => {
  try {
    console.log('📧 Email send request received');
    console.log('📧 Email configured:', isEmailConfigured);
    console.log('📧 SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? 'Set (hidden)' : 'Not set');
    console.log('📧 EMAIL_FROM:', process.env.EMAIL_FROM || 'Not set');
    
    if (!isEmailConfigured) {
      console.log('❌ Email not configured - missing credentials');
      return res.status(500).json({
        success: false,
        message: 'Email configuration not set. Set SENDGRID_API_KEY in environment.',
        instructions: [
          '1. Create .env file in project root',
          '2. Add: SENDGRID_API_KEY=your-sendgrid-api-key',
          '3. Add: EMAIL_FROM=your-verified-email@domain.com',
          '4. Restart the server'
        ]
      });
    }

    const to = req.body?.to;
    const subject = req.body?.subject;
    const message = req.body?.message;

    if (!to || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: to, subject, message'
      });
    }

    let attachments = [];
    if (req.file) {
      attachments.push({
        filename: req.file.originalname || 'attachment',
        content: req.file.buffer,
        contentType: req.file.mimetype || 'application/octet-stream'
      });
    }

    console.log('📧 Attempting to send email...');
    console.log('📧 To:', to);
    console.log('📧 Subject:', subject);
    console.log('📧 Attachment:', req.file ? req.file.originalname : 'None');
    
    const result = await sendEmail(to, subject, String(message).replace(/\n/g, '<br>'), attachments);
    
    if (result.success) {
      console.log('✅ Email sent successfully:', result.data);
      console.log('📧 SendGrid response status:', result.data?.[0]?.statusCode);
      console.log('📧 SendGrid message ID:', result.data?.[0]?.headers?.['x-message-id']);
      return res.json({ 
        success: true, 
        messageId: result.data?.[0]?.headers?.['x-message-id'], 
        statusCode: result.data?.[0]?.statusCode,
        data: result.data 
      });
    } else {
      console.error('❌ Email send failed:', result.error);
      throw new Error(result.error?.message || 'Failed to send email');
    }
  } catch (error) {
    console.error('❌ Email send error:', error);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error response:', error.response);
    
    let userFriendlyMessage = 'Failed to send email';
    
    if (error.message?.includes('API key') || error.message?.includes('Invalid API key')) {
      userFriendlyMessage = 'SendGrid API key is invalid. Please check your SENDGRID_API_KEY environment variable.';
    } else if (error.message?.includes('from') || error.message?.includes('domain')) {
      userFriendlyMessage = 'Email sender not verified. Please verify your sender email in SendGrid dashboard.';
    } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      userFriendlyMessage = 'Could not connect to SendGrid servers. Please check your internet connection.';
    } else if (error.message?.includes('rate limit')) {
      userFriendlyMessage = 'Rate limit exceeded. Please wait before sending more emails.';
    }
    
    return res.status(500).json({ 
      success: false, 
      message: userFriendlyMessage, 
      error: error.message,
      code: error.code 
    });
  }
});

// API endpoint for sending approval workflow emails
// Sequential email sending - Manager only
app.post('/api/send-manager-email', async (req, res) => {
  try {
    if (!isEmailConfigured) {
      return res.status(500).json({
        success: false,
        message: 'Email not configured. Check SENDGRID_API_KEY in .env file.'
      });
    }

    const { managerEmail, workflowData } = req.body;
    
    console.log('📧 Sending email to Manager only (sequential approval)...');
    console.log('Manager:', managerEmail);
    console.log('Workflow Data:', workflowData);

    // Fetch document attachment
    let attachments = [];
    if (workflowData.documentId && db) {
      try {
        console.log('📄 Fetching document for attachment:', workflowData.documentId);
        const documentsCollection = db.collection('documents');
        const document = await documentsCollection.findOne({ id: workflowData.documentId });
        
        if (document && document.fileData) {
          // Convert document data to attachment
          let fileBuffer;
          if (Buffer.isBuffer(document.fileData)) {
            fileBuffer = document.fileData;
          } else if (document.fileData.buffer) {
            fileBuffer = Buffer.from(document.fileData.buffer);
          } else if (document.fileData.data) {
            fileBuffer = Buffer.from(document.fileData.data);
          }
          
          if (fileBuffer) {
            attachments.push({
              filename: document.fileName || `${workflowData.documentId}.pdf`,
              content: fileBuffer,
              contentType: 'application/pdf'
            });
            console.log('✅ Document attachment prepared:', document.fileName);
          }
        } else {
          console.log('⚠️ Document not found or no file data:', workflowData.documentId);
        }
      } catch (docError) {
        console.error('❌ Error fetching document for attachment:', docError);
        // Continue without attachment rather than failing
      }
    }

    // Determine recipient (provided or default) and validate
    const managerEmailToUse = (managerEmail && managerEmail.trim()) || DEFAULT_RECIPIENTS_BY_ROLE['Technical Team'];
    console.log('📧 Preparing to send email to Manager:', managerEmailToUse);
    if (!managerEmailToUse || !isValidEmail(managerEmailToUse)) {
      console.error('❌ Invalid Manager email address (after default fallback):', managerEmailToUse);
      return res.status(400).json({
        success: false,
        message: `Invalid Manager email address: ${managerEmailToUse || '(empty)'}`,
        error: 'Invalid email format'
      });
    }

    // Send email to Manager only with attachment and plain text version
    const managerResult = await sendEmail(
      managerEmailToUse,
      `Approval Required: ${workflowData.documentId} - ${workflowData.clientName}`,
      generateManagerEmailHTML(workflowData),
      attachments,
      generateManagerEmailPlainText(workflowData)
    );

    console.log('📬 Manager email result:', {
      success: managerResult.success,
      statusCode: managerResult.statusCode,
      messageId: managerResult.messageId,
      error: managerResult.error,
      warning: managerResult.warning
    });

    res.json({
      success: managerResult.success,
      message: 'Manager email sent successfully',
      result: { role: 'Manager', email: managerEmailToUse, success: managerResult.success },
      workflowData: workflowData,
      attachmentCount: attachments.length
    });

  } catch (error) {
    console.error('❌ Error sending Manager email:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Sequential email sending - CEO only (after Manager approves)
app.post('/api/send-ceo-email', async (req, res) => {
  try {
    if (!isEmailConfigured) {
      return res.status(500).json({
        success: false,
        message: 'Email not configured. Check SENDGRID_API_KEY in .env file.'
      });
    }

    const { ceoEmail, workflowData } = req.body;
    
    console.log('📧 Sending email to CEO (after Technical Team approval)...');
    console.log('CEO:', ceoEmail);
    console.log('Workflow Data:', workflowData);

    // Fetch document attachment
    let attachments = [];
    if (workflowData.documentId && db) {
      try {
        console.log('📄 Fetching document for attachment:', workflowData.documentId);
        const documentsCollection = db.collection('documents');
        const document = await documentsCollection.findOne({ id: workflowData.documentId });
        
        if (document && document.fileData) {
          // Convert document data to attachment
          let fileBuffer;
          if (Buffer.isBuffer(document.fileData)) {
            fileBuffer = document.fileData;
          } else if (document.fileData.buffer) {
            fileBuffer = Buffer.from(document.fileData.buffer);
          } else if (document.fileData.data) {
            fileBuffer = Buffer.from(document.fileData.data);
          }
          
          if (fileBuffer) {
            attachments.push({
              filename: document.fileName || `${workflowData.documentId}.pdf`,
              content: fileBuffer,
              contentType: 'application/pdf'
            });
            console.log('✅ Document attachment prepared:', document.fileName);
          }
        } else {
          console.log('⚠️ Document not found or no file data:', workflowData.documentId);
        }
      } catch (docError) {
        console.error('❌ Error fetching document for attachment:', docError);
        // Continue without attachment rather than failing
      }
    }

    // Validate and log CEO email before sending
    console.log('📧 Preparing to send email to CEO:', ceoEmail);
    if (!ceoEmail || !isValidEmail(ceoEmail)) {
      console.error('❌ Invalid CEO email address:', ceoEmail);
      return res.status(400).json({
        success: false,
        message: `Invalid CEO email address: ${ceoEmail}`,
        error: 'Invalid email format'
      });
    }

    // Send email to CEO only with attachment
    const ceoResult = await sendEmail(
      ceoEmail,
      `Approval Required: ${workflowData.documentId} - ${workflowData.clientName}`,
      generateCEOEmailHTML(workflowData),
      attachments
    );

    console.log('📬 CEO email result:', {
      success: ceoResult.success,
      statusCode: ceoResult.statusCode,
      messageId: ceoResult.messageId,
      error: ceoResult.error,
      warning: ceoResult.warning
    });

    res.json({
      success: ceoResult.success,
      message: 'CEO email sent successfully',
      result: { role: 'CEO', email: ceoEmail, success: ceoResult.success },
      workflowData: workflowData,
      attachmentCount: attachments.length
    });

  } catch (error) {
    console.error('❌ Error sending CEO email:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Sequential email sending - Client only (after CEO approves)
app.post('/api/send-client-email', async (req, res) => {
  try {
    if (!isEmailConfigured) {
      return res.status(500).json({
        success: false,
        message: 'Email not configured. Check SENDGRID_API_KEY in .env file.'
      });
    }

    const { clientEmail, workflowData } = req.body;
    
    console.log('📧 Sending email to Client (after Legal Team approval)...');
    console.log('Client:', clientEmail);
    console.log('Workflow Data:', workflowData);

    // Fetch document attachment
    let attachments = [];
    if (workflowData.documentId && db) {
      try {
        console.log('📄 Fetching document for attachment:', workflowData.documentId);
        const documentsCollection = db.collection('documents');
        const document = await documentsCollection.findOne({ id: workflowData.documentId });
        
        if (document && document.fileData) {
          // Convert document data to attachment
          let fileBuffer;
          if (Buffer.isBuffer(document.fileData)) {
            fileBuffer = document.fileData;
          } else if (document.fileData.buffer) {
            fileBuffer = Buffer.from(document.fileData.buffer);
          } else if (document.fileData.data) {
            fileBuffer = Buffer.from(document.fileData.data);
          }
          
          if (fileBuffer) {
            attachments.push({
              filename: document.fileName || `${workflowData.documentId}.pdf`,
              content: fileBuffer,
              contentType: 'application/pdf'
            });
            console.log('✅ Document attachment prepared:', document.fileName);
          }
        } else {
          console.log('⚠️ Document not found or no file data:', workflowData.documentId);
        }
      } catch (docError) {
        console.error('❌ Error fetching document for attachment:', docError);
        // Continue without attachment rather than failing
      }
    }

    // Send email to Client only with attachment
    const clientResult = await sendEmail(
      clientEmail,
      `Document Submitted for Approval: ${workflowData.documentId}`,
      generateClientEmailHTML(workflowData),
      attachments
    );

    console.log('✅ Client email sent:', clientResult.success);

    res.json({
      success: clientResult.success,
      message: 'Client email sent successfully',
      result: { role: 'Client', email: clientEmail, success: clientResult.success },
      workflowData: workflowData,
      attachmentCount: attachments.length
    });

  } catch (error) {
    console.error('❌ Error sending Client email:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Send Deal Desk notification email (after client approval)
app.post('/api/send-deal-desk-email', async (req, res) => {
  try {
    if (!isEmailConfigured) {
      return res.status(500).json({
        success: false,
        message: 'Email not configured. Check SENDGRID_API_KEY in .env file.'
      });
    }

    const { dealDeskEmail, workflowData } = req.body;
    
    console.log('📧 Sending notification email to Deal Desk (after client approval)...');
    console.log('Deal Desk:', dealDeskEmail);
    console.log('Workflow Data:', workflowData);

    // Fetch document attachment
    let attachments = [];
    if (workflowData.documentId && db) {
      try {
        console.log('📄 Fetching document for attachment:', workflowData.documentId);
        const documentsCollection = db.collection('documents');
        const document = await documentsCollection.findOne({ id: workflowData.documentId });
        
        if (document && document.fileData) {
          // Convert document data to attachment
          let fileBuffer;
          if (Buffer.isBuffer(document.fileData)) {
            fileBuffer = document.fileData;
          } else if (document.fileData.buffer) {
            fileBuffer = Buffer.from(document.fileData.buffer);
          } else if (document.fileData.data) {
            fileBuffer = Buffer.from(document.fileData.data);
          }
          
          if (fileBuffer) {
            attachments.push({
              filename: document.fileName || `${workflowData.documentId}.pdf`,
              content: fileBuffer,
              contentType: 'application/pdf'
            });
            console.log('✅ Document attachment prepared:', document.fileName);
          }
        } else {
          console.log('⚠️ Document not found or no file data:', workflowData.documentId);
        }
      } catch (docError) {
        console.error('❌ Error fetching document for attachment:', docError);
        // Continue without attachment rather than failing
      }
    }

    // Send notification email to Deal Desk
    const dealDeskResult = await sendEmail(
      dealDeskEmail,
      `Approval Workflow Completed: ${workflowData.documentId}`,
      generateDealDeskEmailHTML(workflowData),
      attachments
    );

    console.log('✅ Deal Desk notification email sent:', dealDeskResult.success);

    res.json({
      success: dealDeskResult.success,
      message: 'Deal Desk notification email sent successfully',
      result: { role: 'Deal Desk', email: dealDeskEmail, success: dealDeskResult.success },
      workflowData: workflowData,
      attachmentCount: attachments.length
    });

  } catch (error) {
    console.error('❌ Error sending Deal Desk email:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Legacy endpoint - kept for backward compatibility
app.post('/api/send-approval-emails', async (req, res) => {
  try {
    if (!isEmailConfigured) {
      return res.status(500).json({
        success: false,
        message: 'Email not configured. Check SENDGRID_API_KEY in .env file.'
      });
    }

    const { managerEmail, ceoEmail, clientEmail, workflowData } = req.body;
    
    console.log('📧 Sending approval workflow emails (legacy - all at once)...');
    console.log('Manager:', managerEmail);
    console.log('CEO:', ceoEmail);
    console.log('Client:', clientEmail);
    console.log('Workflow Data:', workflowData);

    const results = [];

    // Send email to Manager
    try {
      console.log('📧 Sending email to Manager:', managerEmail);
      if (!managerEmail || !isValidEmail(managerEmail)) {
        console.error('❌ Invalid Manager email:', managerEmail);
        results.push({ role: 'Manager', email: managerEmail, success: false, error: 'Invalid email format' });
      } else {
        const managerResult = await sendEmail(
          managerEmail,
          `Approval Required: ${workflowData.documentId} - ${workflowData.clientName}`,
          generateManagerEmailHTML(workflowData),
          [],
          generateManagerEmailPlainText(workflowData)
        );
        results.push({ 
          role: 'Manager', 
          email: managerEmail, 
          success: managerResult.success,
          messageId: managerResult.messageId,
          warning: managerResult.warning,
          error: managerResult.error
        });
      }
    } catch (error) {
      console.error('❌ Manager email failed:', error);
      results.push({ role: 'Manager', email: managerEmail, success: false, error: error.message });
    }

    // Send email to CEO
    try {
      console.log('📧 Sending email to CEO:', ceoEmail);
      if (!ceoEmail || !isValidEmail(ceoEmail)) {
        console.error('❌ Invalid CEO email:', ceoEmail);
        results.push({ role: 'CEO', email: ceoEmail, success: false, error: 'Invalid email format' });
      } else {
        const ceoResult = await sendEmail(
          ceoEmail,
          `Approval Required: ${workflowData.documentId} - ${workflowData.clientName}`,
          generateCEOEmailHTML(workflowData)
        );
        results.push({ 
          role: 'CEO', 
          email: ceoEmail, 
          success: ceoResult.success,
          messageId: ceoResult.messageId,
          warning: ceoResult.warning,
          error: ceoResult.error
        });
      }
    } catch (error) {
      console.error('❌ CEO email failed:', error);
      results.push({ role: 'CEO', email: ceoEmail, success: false, error: error.message });
    }

    // Send email to Client
    try {
      console.log('📧 Sending email to Client:', clientEmail);
      if (!clientEmail || !isValidEmail(clientEmail)) {
        console.error('❌ Invalid Client email:', clientEmail);
        results.push({ role: 'Client', email: clientEmail, success: false, error: 'Invalid email format' });
      } else {
        const clientResult = await sendEmail(
          clientEmail,
          `Document Submitted for Approval: ${workflowData.documentId}`,
          generateClientEmailHTML(workflowData)
        );
        results.push({ 
          role: 'Client', 
          email: clientEmail, 
          success: clientResult.success,
          messageId: clientResult.messageId,
          warning: clientResult.warning,
          error: clientResult.error
        });
      }
    } catch (error) {
      console.error('❌ Client email failed:', error);
      results.push({ role: 'Client', email: clientEmail, success: false, error: error.message });
    }

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    console.log(`✅ Approval emails sent: ${successCount}/${totalCount}`);

    res.json({
      success: successCount > 0,
      message: `Approval emails sent: ${successCount}/${totalCount}`,
      results: results,
      workflowData: workflowData
    });

  } catch (error) {
    console.error('❌ Error sending approval emails:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to save PDF documents to MongoDB
app.post('/api/documents', upload.single('file'), async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available',
        message: 'Cannot save documents without database connection'
      });
    }

    // Check if we have file data (either from upload or base64)
    if (!req.file && !fileData) {
      return res.status(400).json({
        success: false,
        error: 'No document file provided'
      });
    }

    const { clientName, company, quoteId, totalCost, fileName, fileData, fileSize } = req.body;
    const file = req.file;
    
    // Generate document ID with client and company names
    const sanitizeForId = (str) => {
      if (!str) return 'Unknown';
      return str
        .replace(/[^a-zA-Z0-9]/g, '') // Remove special characters
        .substring(0, 20) // Limit length
        .replace(/^[0-9]/, 'C$&'); // Ensure doesn't start with number
    };
    
    const sanitizedCompany = sanitizeForId(company);
    const sanitizedClient = sanitizeForId(clientName);
    const timestamp = Date.now().toString().slice(-5); // Keep only last 5 digits
    
    const documentId = `${sanitizedCompany}_${sanitizedClient}_${timestamp}`;
    
    // Handle both file upload and base64 data
    let finalFileName, finalFileData, finalFileSize;
    
    if (req.file) {
      // File upload
      finalFileName = file.originalname;
      finalFileData = file.buffer;
      finalFileSize = file.size;
    } else {
      // Base64 data
      finalFileName = fileName || `document_${documentId}.pdf`;
      finalFileData = Buffer.from(fileData, 'base64');
      finalFileSize = parseInt(fileSize) || finalFileData.length;
    }
    
    console.log('📄 Processing document:', {
      id: documentId,
      fileName: finalFileName,
      fileSize: finalFileSize,
      clientName,
      company,
      quoteId,
      source: req.file ? 'upload' : 'base64'
    });
    
    console.log('🔍 Document ID generation data (endpoint 2):', {
      clientName: clientName,
      company: company,
      clientNameType: typeof clientName,
      companyType: typeof company,
      sanitizedCompany: sanitizedCompany,
      sanitizedClient: sanitizedClient,
      timestamp: timestamp
    });

    const document = {
      id: documentId,
      fileName: finalFileName,
      fileData: finalFileData,
      fileSize: finalFileSize,
      clientName: clientName || 'Unknown Client',
      company: company || 'Unknown Company',
      quoteId: quoteId || null,
      metadata: {
        totalCost: totalCost ? parseFloat(totalCost) : 0
      },
      status: 'active',
      createdAt: new Date().toISOString(),
      generatedDate: new Date().toISOString()
    };
    
    await db.collection('documents').insertOne(document);

    console.log('✅ Document saved to database:', documentId);
    
    res.json({
      success: true,
      message: 'Document uploaded successfully',
      document: {
        id: documentId,
        fileName: file.originalname,
        clientName: document.clientName,
        company: document.company,
        quoteId: document.quoteId,
        fileSize: file.size,
        createdAt: document.createdAt
      }
    });
    
  } catch (error) {
    console.error('❌ Error uploading document:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to fetch PDF documents from MongoDB
app.get('/api/documents', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available',
        message: 'Cannot fetch documents without database connection'
      });
    }

    console.log('📄 Fetching PDF documents from database...');
    
    const documents = await db.collection('documents')
      .find({}, { fileData: 0 }) // Exclude file data from list for performance
      .sort({ createdAt: -1 })
      .toArray();
    
    console.log(`✅ Found ${documents.length} documents in database`);
    
    res.json({
      success: true,
      documents: documents,
      count: documents.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching documents:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to get specific PDF document file
app.get('/api/documents/:id/file', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available',
        message: 'Cannot fetch document files without database connection'
      });
    }

    const { id } = req.params;
    
    console.log('📄 Fetching document file:', id);
    
    const document = await db.collection('documents').findOne({ id: id });
    
    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    // Normalize fileData to Buffer (support Buffer, BSON Binary, or base64 string)
    let fileBuffer;
    if (Buffer.isBuffer(document.fileData)) {
      fileBuffer = document.fileData;
    } else if (document.fileData && document.fileData.buffer) {
      // Some drivers store Binary with .buffer
      fileBuffer = Buffer.from(document.fileData.buffer);
    } else if (typeof document.fileData === 'string') {
      // Base64 string
      fileBuffer = Buffer.from(document.fileData, 'base64');
    } else {
      throw new Error('Unsupported document fileData format');
    }
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${document.fileName}"`,
      'Content-Length': fileBuffer.length
    });
    
    res.send(fileBuffer);
    
  } catch (error) {
    console.error('❌ Error fetching document file:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get PDF preview data (base64 encoded for inline display)
app.get('/api/documents/:id/preview', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available',
        message: 'Cannot fetch document previews without database connection'
      });
    }

    const { id } = req.params;
    
    console.log('📄 Fetching document preview:', id);
    
    const document = await db.collection('documents').findOne({ id: id });
    
    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    // Normalize fileData to Buffer (support Buffer, BSON Binary, or base64 string)
    let fileBuffer;
    if (Buffer.isBuffer(document.fileData)) {
      fileBuffer = document.fileData;
    } else if (document.fileData && document.fileData.buffer) {
      // Some drivers store Binary with .buffer
      fileBuffer = Buffer.from(document.fileData.buffer);
    } else if (typeof document.fileData === 'string') {
      // Base64 string
      fileBuffer = Buffer.from(document.fileData, 'base64');
    } else {
      throw new Error('Unsupported document fileData format');
    }
    
    console.log('✅ PDF preview data found:', document.fileName);
    
    // Convert binary data to base64 for inline display
    const base64Data = fileBuffer.toString('base64');
    const dataUrl = `data:application/pdf;base64,${base64Data}`;
    
    res.json({
      success: true,
      dataUrl: dataUrl,
      fileName: document.fileName,
      fileSize: document.fileSize
    });
    
  } catch (error) {
    console.error('❌ Error fetching PDF preview:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to create test documents
app.post('/api/documents/test', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available',
        message: 'Cannot create test documents without database connection'
      });
    }

    console.log('📄 Creating test documents...');

    const testDocuments = [
      {
        id: `doc_${Date.now()}_test1`,
        fileName: 'Contact_Company_Inc__2025-10-07.pdf',
        fileData: Buffer.from('Test PDF content 1'),
        fileSize: 206427,
        clientName: 'John Smith',
        company: 'Contact Company Inc.',
        quoteId: 'Q-509892-Z51G3F',
        metadata: {
          totalCost: 21527.2
        },
        status: 'active',
        createdAt: new Date().toISOString(),
        generatedDate: new Date().toISOString()
      },
      {
        id: `doc_${Date.now()}_test2`,
        fileName: 'Test_Client_2025-10-08.pdf',
        fileData: Buffer.from('Test PDF content 2'),
        fileSize: 156789,
        clientName: 'Jane Doe',
        company: 'Test Company Ltd.',
        quoteId: 'Q-692746-ZR6R2F',
        metadata: {
          totalCost: 18450.0
        },
        status: 'active',
        createdAt: new Date().toISOString(),
        generatedDate: new Date().toISOString()
      },
      {
        id: `doc_${Date.now()}_test3`,
        fileName: 'Sample_Quote_2025-10-08.pdf',
        fileData: Buffer.from('Test PDF content 3'),
        fileSize: 98765,
        clientName: 'Bob Wilson',
        company: 'Sample Corp',
        quoteId: 'Q-514467-J0776B',
        metadata: {
          totalCost: 32400.0
        },
        status: 'active',
        createdAt: new Date().toISOString(),
        generatedDate: new Date().toISOString()
      }
    ];

    // Insert test documents
    const result = await db.collection('documents').insertMany(testDocuments);

    console.log(`✅ Created ${result.insertedCount} test documents`);

    res.json({
      success: true,
      message: `Successfully created ${result.insertedCount} test documents`,
      documents: testDocuments.map(doc => ({
        id: doc.id,
        fileName: doc.fileName,
        clientName: doc.clientName,
        company: doc.company,
        quoteId: doc.quoteId,
        totalCost: doc.metadata.totalCost
      }))
    });

  } catch (error) {
    console.error('❌ Error creating test documents:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Simple email test endpoint (no attachment)
app.post('/api/email/test', async (req, res) => {
  try {
    if (!isEmailConfigured) {
      return res.status(500).json({
        success: false,
        message: 'Email not configured. Check SENDGRID_API_KEY in .env file.'
      });
    }
    
    const testTo = process.env.EMAIL_FROM; // Send to the configured from address for testing
    console.log('📧 Testing email configuration...');
    
    const result = await sendEmail(
      testTo, 
      'CPQ Email Test', 
      'This is a test email from CPQ system using Resend. If you receive this, email is working correctly!'
    );
    
    if (result.success) {
      return res.json({
        success: true,
        message: 'Test email sent successfully!',
        messageId: result.data?.id,
        sentTo: testTo,
        data: result.data
      });
    } else {
      throw new Error(result.error?.message || 'Failed to send test email');
    }
  } catch (error) {
    console.error('❌ Email test failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Email test failed',
      error: error.message,
      code: error.code
    });
  }
});

// ============================================
// APPROVAL WORKFLOW ENDPOINTS
// ============================================

// Create approval workflow
app.post('/api/approval-workflows', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available',
        message: 'Cannot create workflow without database connection'
      });
    }

    const workflowData = req.body;
    console.log('📋 Creating approval workflow:', workflowData);

    // Auto-fill emails for known roles if not provided by the client
    if (Array.isArray(workflowData.workflowSteps)) {
      workflowData.workflowSteps = workflowData.workflowSteps.map(step => {
        const roleName = step && step.role ? String(step.role) : '';
        const providedEmail = step && step.email ? String(step.email).trim() : '';
        const defaultEmail = DEFAULT_RECIPIENTS_BY_ROLE[roleName];
        return {
          ...step,
          email: providedEmail || defaultEmail || step.email
        };
      });
    } else {
      // Also support flat fields if present (technicalEmail, legalEmail, clientEmail)
      if (!workflowData.technicalEmail && DEFAULT_RECIPIENTS_BY_ROLE['Technical Team']) {
        workflowData.technicalEmail = DEFAULT_RECIPIENTS_BY_ROLE['Technical Team'];
      }
      if (!workflowData.legalEmail && DEFAULT_RECIPIENTS_BY_ROLE['Legal Team']) {
        workflowData.legalEmail = DEFAULT_RECIPIENTS_BY_ROLE['Legal Team'];
      }
      if (!workflowData.clientEmail && DEFAULT_RECIPIENTS_BY_ROLE['Client']) {
        workflowData.clientEmail = DEFAULT_RECIPIENTS_BY_ROLE['Client'];
      }
    }

    // Generate unique ID
    const workflowId = `WF-${Date.now()}`;
    
    const workflow = {
      id: workflowId,
      ...workflowData,
      status: 'pending',
      currentStep: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save to MongoDB
    console.log('💾 Attempting to save workflow to database...');
    console.log('💾 Database object:', !!db);
    console.log('💾 Collection exists:', !!db?.collection);
    
    const result = await db.collection('approval_workflows').insertOne(workflow);
    console.log('💾 Insert result:', result);
    
    if (result.insertedId) {
      console.log('✅ Approval workflow created:', workflowId);
      res.json({
        success: true,
        workflowId: workflowId,
        workflow: workflow
      });
    } else {
      console.log('❌ Failed to insert workflow - no insertedId');
      throw new Error('Failed to insert workflow');
    }
  } catch (error) {
    console.error('❌ Error creating approval workflow:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create approval workflow',
      details: error.message
    });
  }
});

// Get all approval workflows
app.get('/api/approval-workflows', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available',
        message: 'Cannot fetch workflows without database connection'
      });
    }

    console.log('📄 Fetching approval workflows from MongoDB...');
    
    const workflows = await db.collection('approval_workflows')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    
    console.log(`✅ Found ${workflows.length} workflows in database`);
    
    res.json({
      success: true,
      workflows: workflows,
      count: workflows.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching approval workflows:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single approval workflow
app.get('/api/approval-workflows/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    const { id } = req.params;
    console.log('📄 Fetching approval workflow:', id);
    console.log('📄 Database available:', !!db);
    console.log('📄 Collection available:', !!db?.collection);
    
    const workflow = await db.collection('approval_workflows').findOne({ id: id });
    console.log('📄 Workflow found:', !!workflow);
    console.log('📄 Workflow data:', workflow ? { id: workflow.id, status: workflow.status, currentStep: workflow.currentStep } : 'null');
    
    if (!workflow) {
      console.log('❌ Workflow not found in database for ID:', id);
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }
    
    res.json({
      success: true,
      workflow: workflow
    });
    
  } catch (error) {
    console.error('❌ Error fetching approval workflow:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update approval workflow
app.put('/api/approval-workflows/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    const { id } = req.params;
    const updates = req.body;
    
    console.log('📝 Updating approval workflow:', id, updates);
    
    // Add updatedAt timestamp
    updates.updatedAt = new Date().toISOString();
    
    const result = await db.collection('approval_workflows').updateOne(
      { id: id },
      { $set: updates }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }
    
    console.log('✅ Approval workflow updated');
    res.json({
      success: true,
      message: 'Workflow updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Error updating approval workflow:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update workflow step
app.put('/api/approval-workflows/:id/step/:stepNumber', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    const { id, stepNumber } = req.params;
    const stepUpdates = req.body;
    
    console.log('📝 Updating workflow step:', id, stepNumber, stepUpdates);
    
    // Get current workflow
    const workflow = await db.collection('approval_workflows').findOne({ id: id });
    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }
    
    // Update the specific step
    const updatedSteps = workflow.workflowSteps.map(step =>
      step.step === parseInt(stepNumber)
        ? { ...step, ...stepUpdates, timestamp: new Date().toISOString() }
        : step
    );
    
    // Update current step and status based on step updates
    let newCurrentStep = workflow.currentStep;
    let newStatus = workflow.status;

    if (stepUpdates.status === 'approved') {
      if (parseInt(stepNumber) < workflow.totalSteps) {
        newCurrentStep = parseInt(stepNumber) + 1;
        newStatus = 'in_progress';
      } else {
        newStatus = 'approved';
      }
    } else if (stepUpdates.status === 'denied') {
      newStatus = 'denied';
    }
    
    const updateData = {
      workflowSteps: updatedSteps,
      currentStep: newCurrentStep,
      status: newStatus,
      updatedAt: new Date().toISOString()
    };
    
    await db.collection('approval_workflows').updateOne(
      { id: id },
      { $set: updateData }
    );
    
    console.log('✅ Workflow step updated');
    res.json({
      success: true,
      message: 'Workflow step updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Error updating workflow step:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete approval workflow
app.delete('/api/approval-workflows/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    const { id } = req.params;
    console.log('🗑️ Deleting approval workflow:', id);
    
    const result = await db.collection('approval_workflows').deleteOne({ id: id });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }
    
    console.log('✅ Approval workflow deleted');
    res.json({
      success: true,
      message: 'Workflow deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting approval workflow:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// BOLDSIGN INTEGRATION ENDPOINTS
// =====================================================

/**
 * Send document to BoldSign for signature
 * This endpoint is called after all approval stages are completed
 */
app.post('/api/boldsign/send-document', async (req, res) => {
  try {
    const { 
      documentBase64, 
      fileName, 
      legalTeamEmail, 
      clientEmail, 
      documentTitle,
      clientName 
    } = req.body;

    console.log('📤 BoldSign: Sending document for signature...');
    console.log('  Document:', fileName);
    console.log('  Legal Team Email:', legalTeamEmail);
    console.log('  Client Email:', clientEmail);

    // Validate required fields
    if (!documentBase64 || !fileName || !legalTeamEmail || !clientEmail) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Get BoldSign API key from environment
    const BOLDSIGN_API_KEY = process.env.BOLDSIGN_API_KEY;
    if (!BOLDSIGN_API_KEY || BOLDSIGN_API_KEY === 'your-boldsign-api-key-here') {
      console.error('❌ BoldSign API key not configured');
      return res.status(500).json({
        success: false,
        message: 'BoldSign API key not configured. Please add BOLDSIGN_API_KEY to your .env file'
      });
    }

    // Prepare form fields for both signers
    // Legal Team signs first (signerOrder: 1), Client signs second (signerOrder: 2)
    const legalTeamFields = [
      {
        id: 'legal_signature',
        name: 'By',
        fieldType: 'Signature',
        pageNumber: 3,
        // Move down to align signature box on the "By:" underline
        bounds: { x: 120, y: 270, width: 180, height: 30 },
        isRequired: true,
        value: '', // Explicitly set empty value
        placeholder: '' // Explicitly set empty placeholder
      },
      {
        id: 'legal_name',
        name: 'Name',
        fieldType: 'TextBox',
        pageNumber: 3,
        // Move down to sit on the underline
        bounds: { x: 120, y: 320, width: 180, height: 25 },
        isRequired: true,
        value: '',
        placeholder: '' // Explicitly set empty placeholder
      },
      {
        id: 'legal_title',
        name: 'Title',
        fieldType: 'TextBox',
        pageNumber: 3,
        // Move down to sit on the underline
        bounds: { x: 120, y: 370, width: 180, height: 25 },
        isRequired: true,
        value: '',
        placeholder: '' // Explicitly set empty placeholder
      },
      {
        id: 'legal_date',
        name: 'Date',
        fieldType: 'DateSigned',
        pageNumber: 3,
        // Move up slightly to sit above the underline like other fields
        bounds: { x: 120, y: 410, width: 180, height: 25 },
        isRequired: true,
        value: '', // Explicitly set empty value
        placeholder: 'DD/MM/YYYY', // Add helpful placeholder for date format
        dateFormat: 'DD/MM/YYYY' // Specify date format for calendar picker
      }
    ];

    const clientFields = [
      {
        id: 'client_signature',
        name: 'By',
        fieldType: 'Signature',
        pageNumber: 3,
        // Move much further right to avoid overlapping with "By:" label
        bounds: { x: 480, y: 270, width: 180, height: 30 },
        isRequired: true,
        value: '', // Explicitly set empty value
        placeholder: '' // Explicitly set empty placeholder
      },
      {
        id: 'client_name',
        name: 'Name',
        fieldType: 'TextBox',
        pageNumber: 3,
        // Move much further right to avoid overlapping with "Name:" label
        bounds: { x: 480, y: 320, width: 180, height: 25 },
        isRequired: true,
        value: '',
        placeholder: '' // Explicitly set empty placeholder
      },
      {
        id: 'client_title',
        name: 'Title',
        fieldType: 'TextBox',
        pageNumber: 3,
        // Move much further right to avoid overlapping with "Title:" label
        bounds: { x: 480, y: 370, width: 180, height: 25 },
        isRequired: true,
        value: '',
        placeholder: '' // Explicitly set empty placeholder
      },
      {
        id: 'client_date',
        name: 'Date',
        fieldType: 'DateSigned',
        pageNumber: 3,
        // Move much further right to avoid overlapping with "Date:" label
        bounds: { x: 480, y: 410, width: 180, height: 25 },
        isRequired: true,
        value: '', // Explicitly set empty value
        placeholder: 'DD/MM/YYYY', // Add helpful placeholder for date format
        dateFormat: 'DD/MM/YYYY' // Specify date format for calendar picker
      }
    ];

    // Helper to map our internal field model to BoldSign's expected schema
    const mapToBoldSignFields = (fields) =>
      fields.map(f => {
        const mappedField = {
          FieldType: f.fieldType,
          Name: f.name,
          PageNumber: f.pageNumber,
          IsRequired: f.isRequired,
          Bounds: {
            X: f.bounds.x,
            Y: f.bounds.y,
            Width: f.bounds.width,
            Height: f.bounds.height
          }
        };
        
        // Only add Value and Placeholder if they exist and are not empty
        if (f.value !== undefined && f.value !== '') {
          mappedField.Value = f.value;
        }
        if (f.placeholder !== undefined && f.placeholder !== '') {
          mappedField.Placeholder = f.placeholder;
        }
        
        return mappedField;
      });

    // Validate base64 data
    console.log('📄 Validating base64 data...');
    console.log('  Base64 length:', documentBase64.length);
    console.log('  Base64 preview:', documentBase64.substring(0, 50));
    
    // Remove any whitespace or newlines from base64
    const cleanBase64 = documentBase64.replace(/\s/g, '');
    console.log('  Cleaned base64 length:', cleanBase64.length);

    // Prepare BoldSign request with correct casing as per API schema
    const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3001';
    const boldSignRequest = {
      Title: documentTitle || `Agreement - ${clientName}`,
      Message: `Please review and sign this agreement. Legal Team will sign first, followed by the Client.\n\nIf you have concerns or need to decline this signature request, please visit: ${APP_BASE_URL}/deny-signature to provide your reason.`,
      EnableSigningOrder: true,
      Files: [
        {
          FileName: fileName,
          ContentType: 'application/pdf',
          Base64: `data:application/pdf;base64,${cleanBase64}`
        }
      ],
      Signers: [
        {
          Name: 'Legal Team',
          EmailAddress: legalTeamEmail,
          SignerOrder: 1,
          FormFields: mapToBoldSignFields(legalTeamFields)
        },
        {
          Name: clientName || 'Client',
          EmailAddress: clientEmail,
          SignerOrder: 2,
          FormFields: mapToBoldSignFields(clientFields)
        }
      ]
    };

    console.log('📋 BoldSign request prepared:', {
      Title: boldSignRequest.Title,
      Signers: boldSignRequest.Signers.map(s => ({ email: s.EmailAddress, order: s.SignerOrder })),
      Files: boldSignRequest.Files.map(f => ({ fileName: f.FileName, contentType: f.ContentType, base64Length: f.Base64.length })),
      EnableSigningOrder: boldSignRequest.EnableSigningOrder
    });
    
    // Log form fields for debugging
    console.log('📋 Legal Team Form Fields:', mapToBoldSignFields(legalTeamFields));
    console.log('📋 Client Form Fields:', mapToBoldSignFields(clientFields));

    // Store workflow ID for deny functionality
    const workflowId = req.body.workflowId || '';
    
    // Send to BoldSign API
    const response = await axios.post(
      'https://api.boldsign.com/v1/document/send',
      boldSignRequest,
      {
        headers: {
          'X-API-KEY': BOLDSIGN_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ BoldSign: Document sent successfully');
    console.log('  Document ID:', response.data.documentId);
    
    // Store BoldSign document ID in workflow for tracking
    if (workflowId && response.data.documentId) {
      try {
        await db.collection('approval_workflows').updateOne(
          { id: workflowId },
          {
            $set: {
              boldSignDocumentId: response.data.documentId,
              boldSignSentAt: new Date().toISOString()
            }
          }
        );
        console.log('✅ BoldSign document ID stored in workflow');
      } catch (err) {
        console.error('⚠️ Could not store BoldSign document ID in workflow:', err.message);
      }
    }

    // Send custom emails with Deny button to both Legal Team and Client
    try {
      const isEmailConfigured = process.env.SENDGRID_API_KEY && 
                               process.env.SENDGRID_API_KEY !== 'your-sendgrid-api-key-here';
      
      if (isEmailConfigured && workflowId) {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        
        // Get workflow details for email
        const workflow = await db.collection('approval_workflows').findOne({ id: workflowId });
        
        if (workflow) {
          const denyUrl = `${APP_BASE_URL}/deny-signature?workflow=${workflowId}&document=${response.data.documentId}`;
          
          // Email to Legal Team (first signer)
          const legalTeamMsg = {
            to: legalTeamEmail,
            from: process.env.SENDGRID_FROM_EMAIL || 'noreply@cloudfuze.com',
            subject: `Action Required: Sign Agreement - ${clientName}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #2563eb; padding: 30px; text-align: center;">
                  <h1 style="color: white; margin: 0;">Signature Request</h1>
                </div>
                
                <div style="padding: 30px; background-color: #f9fafb;">
                  <h2 style="color: #1f2937;">Hi Legal Team,</h2>
                  
                  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                    CloudFuze has requested you to review and sign the document:
                  </p>
                  
                  <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #1f2937; margin-top: 0;">Document Details:</h3>
                    <ul style="color: #4b5563; line-height: 1.8;">
                      <li><strong>Document:</strong> ${documentTitle || 'Agreement'}</li>
                      <li><strong>Client:</strong> ${clientName}</li>
                      <li><strong>Your Role:</strong> Legal Team (First Signer)</li>
                    </ul>
                  </div>
                  
                  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                    You will also receive a separate email from BoldSign with the signing link.
                  </p>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <table cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                      <tr>
                        <td style="padding: 10px;">
                          <a href="${response.data.signers?.find(s => s.signerEmail === legalTeamEmail)?.signUrl || '#'}" 
                             style="background-color: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                            📝 Review and Sign
                          </a>
                        </td>
                        <td style="padding: 10px;">
                          <a href="${denyUrl}&email=${encodeURIComponent(legalTeamEmail)}&name=Legal%20Team" 
                             style="background-color: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                            ❌ Decline with Reason
                          </a>
                        </td>
                      </tr>
                    </table>
                  </div>
                  
                  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                    <p style="margin: 0; color: #92400e;">
                      <strong>⚠️ Have concerns?</strong> Click the "Decline with Reason" button to explain your doubts. 
                      All participants will be notified.
                    </p>
                  </div>
                  
                  <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                    This is an automated message. Please do not reply to this email.
                  </p>
                </div>
              </div>
            `
          };
          
          // Email to Client (second signer)
          const clientMsg = {
            to: clientEmail,
            from: process.env.SENDGRID_FROM_EMAIL || 'noreply@cloudfuze.com',
            subject: `Action Required: Sign Agreement - ${clientName}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #2563eb; padding: 30px; text-align: center;">
                  <h1 style="color: white; margin: 0;">Signature Request</h1>
                </div>
                
                <div style="padding: 30px; background-color: #f9fafb;">
                  <h2 style="color: #1f2937;">Hi ${clientName},</h2>
                  
                  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                    CloudFuze has requested you to review and sign the document:
                  </p>
                  
                  <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #1f2937; margin-top: 0;">Document Details:</h3>
                    <ul style="color: #4b5563; line-height: 1.8;">
                      <li><strong>Document:</strong> ${documentTitle || 'Agreement'}</li>
                      <li><strong>Client:</strong> ${clientName}</li>
                      <li><strong>Your Role:</strong> Client (Second Signer)</li>
                      <li><strong>Note:</strong> You'll receive signing link after Legal Team signs</li>
                    </ul>
                  </div>
                  
                  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                    You will receive a separate email from BoldSign with the signing link once the Legal Team has signed.
                  </p>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${denyUrl}&email=${encodeURIComponent(clientEmail)}&name=${encodeURIComponent(clientName)}" 
                       style="background-color: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                      ❌ Decline with Reason
                    </a>
                  </div>
                  
                  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                    <p style="margin: 0; color: #92400e;">
                      <strong>⚠️ Have concerns?</strong> Click the "Decline with Reason" button to explain your doubts. 
                      All participants will be notified and the signing process will be stopped.
                    </p>
                  </div>
                  
                  <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                    This is an automated message. Please do not reply to this email.
                  </p>
                </div>
              </div>
            `
          };
          
          // Send both emails
          await Promise.all([
            sgMail.send(legalTeamMsg),
            sgMail.send(clientMsg)
          ]);
          
          console.log('✅ Custom signature request emails sent with Deny button');
        }
      }
    } catch (emailError) {
      console.error('⚠️ Could not send custom signature emails:', emailError.message);
      // Continue even if custom emails fail - BoldSign emails will still be sent
    }

    res.json({
      success: true,
      message: 'Document sent to BoldSign successfully',
      data: {
        documentId: response.data.documentId,
        signers: response.data.signers
      }
    });

  } catch (error) {
    console.error('❌ BoldSign Error Details:');
    console.error('  Status:', error.response?.status);
    console.error('  Status Text:', error.response?.statusText);
    console.error('  Response Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('  Request URL:', error.config?.url);
    console.error('  Request Method:', error.config?.method);
    
    // Handle specific BoldSign API errors
    if (error.response?.data) {
      const errorMessage = error.response.data.message || error.response.data.error || 'BoldSign API error';
      console.error('❌ BoldSign API Error Message:', errorMessage);
      
      return res.status(error.response.status || 500).json({
        success: false,
        message: `BoldSign API error: ${errorMessage}`,
        error: error.response.data,
        status: error.response.status
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to send document to BoldSign',
      error: error.message
    });
  }
});

/**
 * Deny BoldSign signature request with reason
 */
app.post('/api/boldsign/deny-signature', async (req, res) => {
  try {
    const { workflowId, signerEmail, signerName, reason, documentId } = req.body;

    if (!workflowId || !signerEmail || !reason) {
      return res.status(400).json({
        success: false,
        message: 'workflowId, signerEmail, and reason are required'
      });
    }

    console.log('❌ Signature denied by:', signerEmail);
    console.log('  Workflow ID:', workflowId);
    console.log('  Reason:', reason);

    // Find the workflow
    const workflow = await db.collection('approval_workflows').findOne({ id: workflowId });
    
    if (!workflow) {
      return res.status(404).json({
        success: false,
        message: 'Workflow not found'
      });
    }

    // Determine which signer denied (Legal Team or Client)
    const legalTeamStep = workflow.workflowSteps?.find(s => s.role === 'Legal Team');
    const clientStep = workflow.workflowSteps?.find(s => s.role === 'Client');
    
    let deniedBy = 'Unknown';
    let deniedStep = null;

    if (legalTeamStep && legalTeamStep.email === signerEmail) {
      deniedBy = 'Legal Team';
      deniedStep = legalTeamStep.step;
    } else if (clientStep && clientStep.email === signerEmail) {
      deniedBy = 'Client';
      deniedStep = clientStep.step;
    }

    // Update workflow status to denied
    await db.collection('approval_workflows').updateOne(
      { id: workflowId },
      {
        $set: {
          status: 'signature_denied',
          deniedBy: deniedBy,
          deniedAt: new Date().toISOString(),
          denialReason: reason,
          updatedAt: new Date().toISOString()
        }
      }
    );

    // Update the specific workflow step
    if (deniedStep) {
      await db.collection('approval_workflows').updateOne(
        { id: workflowId, 'workflowSteps.step': deniedStep },
        {
          $set: {
            'workflowSteps.$.status': 'signature_denied',
            'workflowSteps.$.comments': `Signature denied: ${reason}`,
            'workflowSteps.$.timestamp': new Date().toISOString()
          }
        }
      );
    }

    // Cancel the BoldSign document if documentId is provided
    if (documentId) {
      try {
        const BOLDSIGN_API_KEY = process.env.BOLDSIGN_API_KEY;
        if (BOLDSIGN_API_KEY && BOLDSIGN_API_KEY !== 'your-boldsign-api-key-here') {
          await axios.delete(
            `https://api.boldsign.com/v1/document/revoke/${documentId}`,
            {
              headers: {
                'X-API-KEY': BOLDSIGN_API_KEY
              }
            }
          );
          console.log('✅ BoldSign document revoked:', documentId);
        }
      } catch (boldSignError) {
        console.error('⚠️ Could not revoke BoldSign document:', boldSignError.message);
        // Continue even if BoldSign revocation fails
      }
    }

    // Send notification emails to relevant parties
    try {
      const isEmailConfigured = process.env.SENDGRID_API_KEY && 
                               process.env.SENDGRID_API_KEY !== 'your-sendgrid-api-key-here';
      
      if (isEmailConfigured) {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);

        // Notify all workflow participants about the denial
        const notificationEmails = [
          workflow.workflowSteps?.find(s => s.role === 'Technical Team')?.email,
          workflow.workflowSteps?.find(s => s.role === 'Legal Team')?.email,
          workflow.workflowSteps?.find(s => s.role === 'Client')?.email,
          workflow.workflowSteps?.find(s => s.role === 'Deal Desk')?.email
        ].filter(Boolean);

        const emailPromises = notificationEmails.map(email => {
          const msg = {
            to: email,
            from: process.env.SENDGRID_FROM_EMAIL || 'noreply@cloudfuze.com',
            subject: `Signature Denied: ${workflow.documentType} - ${workflow.clientName}`,
            html: `
              <h2>Signature Request Denied</h2>
              <p><strong>${deniedBy}</strong> has declined to sign the document.</p>
              
              <h3>Document Details:</h3>
              <ul>
                <li><strong>Document:</strong> ${workflow.documentType}</li>
                <li><strong>Client:</strong> ${workflow.clientName}</li>
                <li><strong>Denied By:</strong> ${deniedBy} (${signerEmail})</li>
                <li><strong>Date:</strong> ${new Date().toLocaleString()}</li>
              </ul>
              
              <h3>Reason for Denial:</h3>
              <p style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #dc3545;">
                ${reason}
              </p>
              
              <p>The workflow has been stopped and marked as <strong>Signature Denied</strong>.</p>
              <p>Please review the reason and take appropriate action.</p>
            `
          };
          return sgMail.send(msg);
        });

        await Promise.all(emailPromises);
        console.log('✅ Denial notification emails sent');
      }
    } catch (emailError) {
      console.error('⚠️ Could not send denial notification emails:', emailError.message);
      // Continue even if email fails
    }

    res.json({
      success: true,
      message: 'Signature denied successfully',
      deniedBy: deniedBy,
      reason: reason
    });

  } catch (error) {
    console.error('❌ Error denying signature:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deny signature',
      error: error.message
    });
  }
});

/**
 * Check BoldSign document status
 */
app.get('/api/boldsign/document-status/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;

    const BOLDSIGN_API_KEY = process.env.BOLDSIGN_API_KEY;
    if (!BOLDSIGN_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'BoldSign API key not configured'
      });
    }

    const response = await axios.get(
      `https://api.boldsign.com/v1/document/properties?documentId=${documentId}`,
      {
        headers: {
          'X-API-KEY': BOLDSIGN_API_KEY
        }
      }
    );

    res.json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error('❌ Error checking BoldSign status:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to check document status',
      error: error.message
    });
  }
});

/**
 * Trigger BoldSign integration after workflow approval
 * This endpoint fetches document from MongoDB and sends to BoldSign
 */
app.post('/api/trigger-boldsign', async (req, res) => {
  try {
    const { 
      documentId, 
      workflowId, 
      clientName,
      legalTeamEmail,
      clientEmail
    } = req.body;

    console.log('🎯 Triggering BoldSign integration...');
    console.log('  Document ID:', documentId);
    console.log('  Workflow ID:', workflowId);
    console.log('  Legal Team Email:', legalTeamEmail);
    console.log('  Client Email:', clientEmail);

    // Validate required fields
    if (!documentId || !legalTeamEmail || !clientEmail) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: documentId, legalTeamEmail, clientEmail'
      });
    }

    // Get BoldSign API key from environment
    const BOLDSIGN_API_KEY = process.env.BOLDSIGN_API_KEY;
    if (!BOLDSIGN_API_KEY || BOLDSIGN_API_KEY === 'your-boldsign-api-key-here') {
      console.error('❌ BoldSign API key not configured');
      return res.status(500).json({
        success: false,
        message: 'BoldSign API key not configured. Please add BOLDSIGN_API_KEY to your .env file'
      });
    }

    // Fetch document from MongoDB
    console.log('📄 Fetching document from MongoDB...');
    const documentsCollection = db.collection('documents');
    const document = await documentsCollection.findOne({ id: documentId });
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    console.log('✅ Document found:', document.fileName);

    // Prepare form fields for both signers
    const legalTeamFields = [
      {
        id: 'legal_signature',
        name: 'By',
        fieldType: 'Signature',
        pageNumber: 3,
        x: 120,
        y: 275,
        width: 180,
        height: 30
      },
      {
        id: 'legal_name',
        name: 'Name',
        fieldType: 'TextBox',
        pageNumber: 3,
        x: 120,
        y: 320,
        width: 180,
        height: 25
      },
      {
        id: 'legal_title',
        name: 'Title',
        fieldType: 'TextBox',
        pageNumber: 3,
        x: 120,
        y: 360,
        width: 180,
        height: 25
      },
      {
        id: 'legal_date',
        name: 'Date',
        fieldType: 'DateSigned',
        pageNumber: 3,
        x: 120,
        y: 410,
        width: 180,
        height: 25
      }
    ];

    const clientFields = [
      {
        id: 'client_signature',
        name: 'By',
        fieldType: 'Signature',
        pageNumber: 3,
        x: 480,
        y: 275,
        width: 180,
        height: 30
      },
      {
        id: 'client_name',
        name: 'Name',
        fieldType: 'TextBox',
        pageNumber: 3,
        x: 480,
        y: 320,
        width: 180,
        height: 25
      },
      {
        id: 'client_title',
        name: 'Title',
        fieldType: 'TextBox',
        pageNumber: 3,
        x: 480,
        y: 360,
        width: 180,
        height: 25
      },
      {
        id: 'client_date',
        name: 'Date',
        fieldType: 'DateSigned',
        pageNumber: 3,
        x: 480,
        y: 410,
        width: 180,
        height: 25
      }
    ];

    // Helper function to map form fields to BoldSign format
    const mapToBoldSignFields = (fields) => {
      return fields.map(field => ({
        FieldId: field.id,
        FieldType: field.fieldType,
        PageNumber: field.pageNumber,
        Bounds: {
          X: field.x,
          Y: field.y,
          Width: field.width,
          Height: field.height
        },
        IsRequired: true
      }));
    };

    // Clean the base64 data (remove data URL prefix if present)
    let cleanBase64;
    
    console.log('🔍 Document fileData type:', typeof document.fileData);
    console.log('🔍 Document fileData is Buffer?', Buffer.isBuffer(document.fileData));
    console.log('🔍 Document fileData constructor:', document.fileData?.constructor?.name);
    
    // Handle Buffer, BSON Binary, and string formats
    if (Buffer.isBuffer(document.fileData)) {
      // Convert Buffer to base64 string
      cleanBase64 = document.fileData.toString('base64');
      console.log('📄 Converted Buffer to base64, length:', cleanBase64.length);
    } else if (document.fileData && document.fileData.buffer && Buffer.isBuffer(document.fileData.buffer)) {
      // Handle BSON Binary type (has a buffer property)
      cleanBase64 = document.fileData.buffer.toString('base64');
      console.log('📄 Converted BSON Binary to base64, length:', cleanBase64.length);
    } else if (typeof document.fileData === 'string') {
      cleanBase64 = document.fileData;
      console.log('📄 Using string fileData, length:', cleanBase64.length);
    } else if (document.fileData && typeof document.fileData.toString === 'function') {
      // Try converting to string if it has a toString method
      cleanBase64 = document.fileData.toString('base64');
      console.log('📄 Converted using toString method, length:', cleanBase64.length);
    } else {
      console.error('❌ Document fileData is in unexpected format');
      console.error('   Type:', typeof document.fileData);
      console.error('   Constructor:', document.fileData?.constructor?.name);
      console.error('   Has buffer property:', !!document.fileData?.buffer);
      return res.status(500).json({
        success: false,
        message: 'Document fileData is not in the expected format',
        debug: {
          type: typeof document.fileData,
          constructor: document.fileData?.constructor?.name,
          hasBuffer: !!document.fileData?.buffer
        }
      });
    }
    
    if (cleanBase64.startsWith('data:application/pdf;base64,')) {
      cleanBase64 = cleanBase64.replace('data:application/pdf;base64,', '');
    }

    console.log('  Cleaned base64 length:', cleanBase64.length);

    // Prepare BoldSign request
    const boldSignRequest = {
      Title: `Agreement - ${clientName}`,
      Message: `CloudFuze has requested you to review and sign this agreement. Legal Team will sign first, followed by the Client.`,
      EnableSigningOrder: true,
      BrandId: null, // Use default brand settings from BoldSign account
      Files: [
        {
          FileName: document.fileName,
          ContentType: 'application/pdf',
          Base64: `data:application/pdf;base64,${cleanBase64}`
        }
      ],
      Signers: [
        {
          Name: 'Legal Team',
          EmailAddress: legalTeamEmail,
          SignerOrder: 1,
          FormFields: mapToBoldSignFields(legalTeamFields)
        },
        {
          Name: clientName || 'Client',
          EmailAddress: clientEmail,
          SignerOrder: 2,
          FormFields: mapToBoldSignFields(clientFields)
        }
      ]
    };

    console.log('📋 BoldSign request prepared:', {
      Title: boldSignRequest.Title,
      Signers: boldSignRequest.Signers.map(s => ({ email: s.EmailAddress, order: s.SignerOrder })),
      Files: boldSignRequest.Files.map(f => ({ fileName: f.FileName, contentType: f.ContentType, base64Length: f.Base64.length })),
      EnableSigningOrder: boldSignRequest.EnableSigningOrder
    });

    // Send to BoldSign API
    const response = await axios.post(
      'https://api.boldsign.com/v1/document/send',
      boldSignRequest,
      {
        headers: {
          'X-API-KEY': BOLDSIGN_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ BoldSign: Document sent successfully');
    console.log('  Document ID:', response.data.documentId);

    res.json({
      success: true,
      message: 'Document sent to BoldSign successfully',
      data: {
        documentId: response.data.documentId,
        signers: [
          {
            signerEmail: legalTeamEmail,
            signUrl: response.data.signers?.[0]?.signUrl || 'Generated by BoldSign',
            signerId: response.data.signers?.[0]?.signerId || 'legal-signer'
          },
          {
            signerEmail: clientEmail,
            signUrl: response.data.signers?.[1]?.signUrl || 'Generated by BoldSign',
            signerId: response.data.signers?.[1]?.signerId || 'client-signer'
          }
        ]
      }
    });

  } catch (error) {
    console.error('❌ Error triggering BoldSign integration:', error);
    console.error('❌ Error response data:', error.response?.data);
    console.error('❌ Error status:', error.response?.status);
    console.error('❌ Error headers:', error.response?.headers);
    
    res.status(500).json({
      success: false,
      message: 'Failed to trigger BoldSign integration',
      error: error.message,
      boldSignError: error.response?.data,
      statusCode: error.response?.status
    });
  }
});

/**
 * Verify webhook signature using HMAC SHA256
 * Supports multiple signature formats:
 * - sha256=hexvalue (GitHub, etc.)
 * - hexvalue (direct hex)
 * - base64value (base64 encoded)
 * @param {string} payload - Raw request body as string
 * @param {string} signature - Signature from webhook header
 * @param {string} secret - Webhook secret key
 * @returns {boolean} - True if signature is valid
 */
function verifyWebhookSignature(payload, signature, secret) {
  if (!secret || !signature || !payload) {
    return false;
  }
  
  try {
    // Remove common prefixes (sha256=, sha1=, etc.)
    const cleanSignature = signature.replace(/^(sha256|sha1|sha512)=/i, '').trim();
    
    // Calculate expected signature using HMAC SHA256
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expectedHex = hmac.digest('hex');
    
    // Normalize both signatures to lowercase for comparison
    const receivedLower = cleanSignature.toLowerCase();
    const expectedLower = expectedHex.toLowerCase();
    
    // Ensure same length before comparison
    if (receivedLower.length !== expectedLower.length) {
      return false;
    }
    
    // Use constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(receivedLower),
      Buffer.from(expectedLower)
    );
  } catch (error) {
    console.error('❌ Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Webhook endpoint for BoldSign events
 * Receives real-time status updates for documents and signatures
 * Features:
 * - Event logging and persistence
 * - Webhook signature verification
 * - Real-time status tracking
 * - Automatic notifications
 */
app.post('/api/boldsign/webhook', async (req, res) => {
  try {
    const event = req.body || {};
    const rawBody = req.rawBody || JSON.stringify(event);
    
    console.log('📨 BoldSign Webhook Request Received');
    console.log('  Request Body:', JSON.stringify(event, null, 2));
    console.log('  Request Method:', req.method);
    console.log('  Request URL:', req.url);
    console.log('  Headers:', JSON.stringify(req.headers, null, 2));
    console.log('  Timestamp:', new Date().toISOString());

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.BOLDSIGN_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers['x-boldsign-signature'] || 
                       req.headers['x-signature'] || 
                       req.headers['signature'];
      
      if (signature) {
        const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
        if (!isValid) {
          console.warn('⚠️ Invalid webhook signature - rejecting request');
          return res.status(401).json({
            success: false,
            message: 'Invalid webhook signature',
            timestamp: new Date().toISOString()
          });
        }
        console.log('✅ Webhook signature verified');
      } else {
        console.warn('⚠️ Webhook secret configured but no signature header found');
      }
    }

    // Handle BoldSign verification request - accept ANY POST request and return 200 OK
    // BoldSign sends a verification POST to test the endpoint, and we need to accept it
    const isVerificationRequest = !event || 
                                  Object.keys(event).length === 0 || 
                                  (!event.eventType && !event.documentId) ||
                                  (typeof event === 'string' && event.length === 0);
    
    if (isVerificationRequest) {
      console.log('✅ BoldSign verification request received - returning 200 OK');
      return res.status(200).json({ 
        success: true, 
        message: 'Webhook endpoint is active and ready to receive events',
        timestamp: new Date().toISOString()
      });
    }

    // Validate webhook data for actual events
    if (!event.eventType || !event.documentId) {
      console.warn('⚠️ Invalid webhook data - missing eventType or documentId');
      console.warn('  Received data:', JSON.stringify(event, null, 2));
      // Return 200 OK to avoid webhook failures - BoldSign just needs 200 OK
      return res.status(200).json({ 
        success: true, 
        message: 'Webhook received',
        warning: 'Missing required fields (eventType or documentId)',
        received: event,
        timestamp: new Date().toISOString()
      });
    }

    console.log('📨 BoldSign Webhook Event Received');
    console.log('  Event Type:', event.eventType);
    console.log('  Document ID:', event.documentId);
    console.log('  Status:', event.status);

    // Create webhook event log entry
    const webhookLog = {
      id: uuidv4(),
      eventType: event.eventType,
      documentId: event.documentId,
      status: event.status,
      signerEmail: event.signerEmail || null,
      signerName: event.signerName || null,
      workflowId: event.workflowId || null,
      timestamp: new Date(),
      eventData: event,
      processed: false,
      processedAt: null,
      error: null
    };

    // Save webhook event to MongoDB for audit trail
    if (db) {
      try {
        const webhookLogsCollection = db.collection('boldsign_webhook_logs');
        await webhookLogsCollection.insertOne(webhookLog);
        console.log('✅ Webhook event logged to MongoDB');
      } catch (dbError) {
        console.error('❌ Error logging webhook to database:', dbError.message);
        // Don't fail the webhook, just log the error
      }
    }

    // Handle different event types with detailed logging
    let processingResult = {};
    
    switch (event.eventType) {
      case 'DocumentSigned':
        processingResult = await handleDocumentSigned(event);
        console.log('✅ Document signed event processed');
        console.log('  Signer Email:', event.signerEmail);
        console.log('  Signer Name:', event.signerName || 'N/A');
        break;
      
      case 'DocumentCompleted':
        processingResult = await handleDocumentCompleted(event);
        console.log('🎉 Document completed event processed');
        console.log('  All signatures collected');
        break;
      
      case 'DocumentDeclined':
        processingResult = await handleDocumentDeclined(event);
        console.log('❌ Document declined event processed');
        console.log('  Declined by:', event.signerEmail);
        console.log('  Reason:', event.reason || 'Not provided');
        break;

      case 'DocumentViewed':
        processingResult = await handleDocumentViewed(event);
        console.log('👁️ Document viewed event processed');
        console.log('  Viewed by:', event.signerEmail);
        break;

      case 'DocumentExpired':
        processingResult = await handleDocumentExpired(event);
        console.log('⏰ Document expired event processed');
        break;

      case 'DocumentRevoked':
        processingResult = await handleDocumentRevoked(event);
        console.log('🚫 Document revoked event processed');
        break;

      default:
        console.log('ℹ️ Other event type received:', event.eventType);
        console.log('  Full event data:', JSON.stringify(event, null, 2));
    }

    // Update webhook log with processing result
    if (db) {
      try {
        const webhookLogsCollection = db.collection('boldsign_webhook_logs');
        await webhookLogsCollection.updateOne(
          { id: webhookLog.id },
          { 
            $set: { 
              processed: true,
              processedAt: new Date(),
              processingResult: processingResult
            }
          }
        );
      } catch (dbError) {
        console.error('❌ Error updating webhook log:', dbError.message);
      }
    }

    // Acknowledge the webhook to BoldSign
    res.json({ 
      success: true,
      eventId: webhookLog.id,
      message: 'Webhook received and processed successfully'
    });

  } catch (error) {
    console.error('❌ Error processing BoldSign webhook:', error);
    console.error('   Stack trace:', error.stack);
    
    // Return 200 OK even on error to prevent webhook failures
    // BoldSign needs 200 OK response for verification
    res.status(200).json({ 
      success: true, 
      message: 'Webhook endpoint is active',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Generic webhook endpoint for external services
 * Supports signature verification and event logging
 * Usage: POST /api/webhooks/:serviceName
 * 
 * Example: POST /api/webhooks/hubspot
 *          POST /api/webhooks/stripe
 *          POST /api/webhooks/custom
 */
app.post('/api/webhooks/:serviceName', async (req, res) => {
  try {
    const serviceName = req.params.serviceName;
    const event = req.body || {};
    const rawBody = req.rawBody || JSON.stringify(event);
    
    console.log(`📨 Generic Webhook Request Received for: ${serviceName}`);
    console.log('  Request Body:', JSON.stringify(event, null, 2));
    console.log('  Headers:', JSON.stringify(req.headers, null, 2));
    console.log('  Timestamp:', new Date().toISOString());

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env[`${serviceName.toUpperCase()}_WEBHOOK_SECRET`] || 
                         process.env.WEBHOOK_SECRET;
    
    if (webhookSecret) {
      // Check common signature header names
      const signature = req.headers['x-hub-signature-256'] || 
                       req.headers['x-hub-signature'] ||
                       req.headers['x-signature'] || 
                       req.headers[`x-${serviceName}-signature`] ||
                       req.headers['signature'];
      
      if (signature) {
        const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
        if (!isValid) {
          console.warn(`⚠️ Invalid webhook signature for ${serviceName} - rejecting request`);
          return res.status(401).json({
            success: false,
            message: 'Invalid webhook signature',
            service: serviceName,
            timestamp: new Date().toISOString()
          });
        }
        console.log(`✅ Webhook signature verified for ${serviceName}`);
      } else {
        console.warn(`⚠️ Webhook secret configured for ${serviceName} but no signature header found`);
      }
    }

    // Log webhook event to MongoDB
    const webhookLog = {
      id: uuidv4(),
      serviceName: serviceName,
      eventType: event.type || event.event || event.eventType || 'unknown',
      timestamp: new Date(),
      eventData: event,
      headers: req.headers,
      processed: false,
      processedAt: null,
      error: null
    };

    if (db) {
      try {
        const webhookLogsCollection = db.collection('webhook_logs');
        await webhookLogsCollection.insertOne(webhookLog);
        console.log(`✅ Webhook event logged to MongoDB for ${serviceName}`);
      } catch (dbError) {
        console.error(`❌ Error logging webhook to database for ${serviceName}:`, dbError.message);
      }
    }

    // Update webhook log as processed
    if (db) {
      try {
        const webhookLogsCollection = db.collection('webhook_logs');
        await webhookLogsCollection.updateOne(
          { id: webhookLog.id },
          { 
            $set: { 
              processed: true,
              processedAt: new Date()
            }
          }
        );
      } catch (dbError) {
        console.error(`❌ Error updating webhook log for ${serviceName}:`, dbError.message);
      }
    }

    // Return success response
    res.json({ 
      success: true,
      eventId: webhookLog.id,
      service: serviceName,
      message: 'Webhook received and processed successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`❌ Error processing webhook for ${req.params.serviceName}:`, error);
    console.error('   Stack trace:', error.stack);
    
    // Return 200 OK to prevent webhook retries
    res.status(200).json({ 
      success: true, 
      message: 'Webhook endpoint is active',
      service: req.params.serviceName,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get webhook logs for a specific service
 * GET /api/webhooks/:serviceName/logs
 */
app.get('/api/webhooks/:serviceName/logs', async (req, res) => {
  try {
    const serviceName = req.params.serviceName;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    if (!db) {
      return res.status(503).json({
        success: false,
        message: 'Database not available'
      });
    }

    const webhookLogsCollection = db.collection('webhook_logs');
    const filter = { serviceName: serviceName };
    
    const total = await webhookLogsCollection.countDocuments(filter);
    const logs = await webhookLogsCollection
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    res.json({
      success: true,
      service: serviceName,
      total,
      limit,
      skip,
      logs
    });

  } catch (error) {
    console.error(`❌ Error retrieving webhook logs for ${req.params.serviceName}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving webhook logs',
      error: error.message
    });
  }
});

/**
 * Handle DocumentSigned event
 * Called when a signer completes their signature
 */
async function handleDocumentSigned(event) {
  try {
    console.log('📋 Processing DocumentSigned event...');
    
    const { documentId, signerEmail, signerName, workflowId } = event;

    // Update document status in collection
    if (db) {
      const documentsCollection = db.collection('documents');
      const signatureStatusCollection = db.collection('signature_status');

      // Create or update signature status record
      const signatureStatus = {
        documentId,
        signerEmail,
        signerName: signerName || 'Unknown',
        signedAt: new Date(),
        status: 'signed',
        eventData: event
      };

      await signatureStatusCollection.updateOne(
        { documentId, signerEmail },
        { $set: signatureStatus },
        { upsert: true }
      );

      // Update document with latest signer info
      await documentsCollection.updateOne(
        { id: documentId },
        { 
          $set: {
            lastSignerEmail: signerEmail,
            lastSignerName: signerName,
            lastSignedAt: new Date(),
            lastEvent: 'DocumentSigned'
          },
          $push: {
            signingHistory: signatureStatus
          }
        }
      );

      console.log('✅ Signature status updated in MongoDB');
    }

    // Send notification email (optional)
    if (isEmailConfigured) {
      await sendSignatureNotification(signerEmail, signerName, documentId, 'signed');
    }

    return { 
      status: 'processed',
      action: 'signature_recorded',
      signer: signerEmail
    };

  } catch (error) {
    console.error('❌ Error handling DocumentSigned event:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Handle DocumentCompleted event
 * Called when all signers have completed signing
 */
async function handleDocumentCompleted(event) {
  try {
    console.log('📋 Processing DocumentCompleted event...');
    
    const { documentId, workflowId } = event;

    // Update document status
    if (db) {
      const documentsCollection = db.collection('documents');
      const workflowsCollection = db.collection('approval_workflows');

      await documentsCollection.updateOne(
        { id: documentId },
        { 
          $set: {
            status: 'fully_signed',
            completedAt: new Date(),
            lastEvent: 'DocumentCompleted'
          }
        }
      );

      // Update workflow if linked
      if (workflowId) {
        await workflowsCollection.updateOne(
          { id: workflowId },
          { 
            $set: {
              signingCompleted: true,
              signingCompletedAt: new Date()
            }
          }
        );
      }

      console.log('✅ Document completion status updated');
    }

    // Send completion notification
    if (isEmailConfigured) {
      await sendCompletionNotification(documentId, 'Document is fully signed');
    }

    return { 
      status: 'processed',
      action: 'document_completed',
      documentId: documentId
    };

  } catch (error) {
    console.error('❌ Error handling DocumentCompleted event:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Handle DocumentDeclined event
 * Called when a signer declines to sign
 */
async function handleDocumentDeclined(event) {
  try {
    console.log('📋 Processing DocumentDeclined event...');
    
    const { documentId, signerEmail, signerName, reason, workflowId } = event;

    // Record decline in database
    if (db) {
      const declineRecordsCollection = db.collection('signature_declines');
      const documentsCollection = db.collection('documents');

      const declineRecord = {
        documentId,
        signerEmail,
        signerName: signerName || 'Unknown',
        reason: reason || 'Not provided',
        declinedAt: new Date(),
        eventData: event
      };

      await declineRecordsCollection.insertOne(declineRecord);

      // Update document with decline status
      await documentsCollection.updateOne(
        { id: documentId },
        { 
          $set: {
            status: 'declined',
            declinedBy: signerEmail,
            declinedAt: new Date(),
            lastEvent: 'DocumentDeclined'
          }
        }
      );

      console.log('✅ Decline record created and document updated');
    }

    // Send decline notification to stakeholders
    if (isEmailConfigured) {
      await sendDeclineNotification(signerEmail, signerName, documentId, reason);
    }

    return { 
      status: 'processed',
      action: 'document_declined',
      declinedBy: signerEmail,
      reason: reason
    };

  } catch (error) {
    console.error('❌ Error handling DocumentDeclined event:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Handle DocumentViewed event
 * Called when a signer views the document
 */
async function handleDocumentViewed(event) {
  try {
    console.log('📋 Processing DocumentViewed event...');
    
    const { documentId, signerEmail } = event;

    if (db) {
      const documentViewsCollection = db.collection('document_views');

      await documentViewsCollection.insertOne({
        documentId,
        signerEmail,
        viewedAt: new Date(),
        eventData: event
      });

      console.log('✅ Document view recorded');
    }

    return { 
      status: 'processed',
      action: 'document_viewed',
      viewedBy: signerEmail
    };

  } catch (error) {
    console.error('❌ Error handling DocumentViewed event:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Handle DocumentExpired event
 * Called when a document signing link expires
 */
async function handleDocumentExpired(event) {
  try {
    console.log('📋 Processing DocumentExpired event...');
    
    const { documentId } = event;

    if (db) {
      const documentsCollection = db.collection('documents');

      await documentsCollection.updateOne(
        { id: documentId },
        { 
          $set: {
            status: 'expired',
            expiredAt: new Date(),
            lastEvent: 'DocumentExpired'
          }
        }
      );

      console.log('✅ Document marked as expired');
    }

    return { 
      status: 'processed',
      action: 'document_expired',
      documentId: documentId
    };

  } catch (error) {
    console.error('❌ Error handling DocumentExpired event:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Handle DocumentRevoked event
 * Called when a document is revoked
 */
async function handleDocumentRevoked(event) {
  try {
    console.log('📋 Processing DocumentRevoked event...');
    
    const { documentId } = event;

    if (db) {
      const documentsCollection = db.collection('documents');

      await documentsCollection.updateOne(
        { id: documentId },
        { 
          $set: {
            status: 'revoked',
            revokedAt: new Date(),
            lastEvent: 'DocumentRevoked'
          }
        }
      );

      console.log('✅ Document marked as revoked');
    }

    return { 
      status: 'processed',
      action: 'document_revoked',
      documentId: documentId
    };

  } catch (error) {
    console.error('❌ Error handling DocumentRevoked event:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Helper: Send signature notification email
 */
async function sendSignatureNotification(signerEmail, signerName, documentId, action) {
  try {
    if (!isEmailConfigured) return;

    const subject = action === 'signed' ? '✅ Signature Received' : '📝 Signature Pending';
    const message = action === 'signed' 
      ? `Signature has been received from ${signerName} (${signerEmail})`
      : `Awaiting signature from ${signerName}`;

    const mailOptions = {
      to: process.env.NOTIFICATION_EMAIL || 'team@example.com',
      subject,
      html: `
        <h2>${subject}</h2>
        <p>${message}</p>
        <p><strong>Document ID:</strong> ${documentId}</p>
        <p><strong>Signer:</strong> ${signerName} (${signerEmail})</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
      `
    };

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send(mailOptions);
    console.log('✅ Notification email sent');
  } catch (error) {
    console.error('❌ Error sending notification email:', error.message);
  }
}

/**
 * Helper: Send completion notification email
 */
async function sendCompletionNotification(documentId, message) {
  try {
    if (!isEmailConfigured) return;

    const mailOptions = {
      to: process.env.NOTIFICATION_EMAIL || 'team@example.com',
      subject: '✨ Document Fully Signed',
      html: `
        <h2>✨ Document Fully Signed</h2>
        <p>${message}</p>
        <p><strong>Document ID:</strong> ${documentId}</p>
        <p><strong>Completion Time:</strong> ${new Date().toLocaleString()}</p>
      `
    };

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send(mailOptions);
    console.log('✅ Completion notification email sent');
  } catch (error) {
    console.error('❌ Error sending completion email:', error.message);
  }
}

/**
 * Helper: Send decline notification email
 */
async function sendDeclineNotification(signerEmail, signerName, documentId, reason) {
  try {
    if (!isEmailConfigured) return;

    const mailOptions = {
      to: process.env.NOTIFICATION_EMAIL || 'team@example.com',
      subject: '⚠️ Document Signing Declined',
      html: `
        <h2>⚠️ Document Signing Declined</h2>
        <p><strong>Signer:</strong> ${signerName} (${signerEmail})</p>
        <p><strong>Reason:</strong> ${reason || 'Not provided'}</p>
        <p><strong>Document ID:</strong> ${documentId}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
      `
    };

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send(mailOptions);
    console.log('✅ Decline notification email sent');
  } catch (error) {
    console.error('❌ Error sending decline email:', error.message);
  }
}

// Serve the React app for the Microsoft callback (SPA handles the code)
app.get('/auth/microsoft/callback', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Health check endpoint for webhook verification
app.get('/api/boldsign/webhook', (req, res) => {
  res.status(200).json({ 
    success: true, 
    message: 'BoldSign webhook endpoint is active',
    method: 'POST',
    url: '/api/boldsign/webhook',
    timestamp: new Date().toISOString()
  });
});

// Catch-all (serve React for any non-API route)
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start server after database initialization
async function startServer() {
  try {
    console.log('🔍 Initializing database connection...');
    databaseAvailable = await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Database available: ${databaseAvailable}`);
      console.log(`📧 Email configured: ${isEmailConfigured ? 'Yes' : 'No'}`);
      console.log(`🔗 HubSpot API key: ${HUBSPOT_API_KEY !== 'demo-key' ? 'Configured' : 'Demo mode'}`);
      console.log(`🌐 Available endpoints:`);
      console.log(`   - GET  /`);
      console.log(`   - GET  /api/health`);
      console.log(`   - GET  /api/database/health`);
      console.log(`   - GET  /api/test-mongodb`);
      console.log(`   - POST /api/auth/register`);
      console.log(`   - POST /api/auth/login`);
      console.log(`   - GET  /api/auth/me`);
      console.log(`   - POST /api/auth/microsoft`);
      console.log(`   - GET  /api/quotes`);
      console.log(`   - POST /api/quotes`);
      console.log(`   - PUT  /api/quotes/:id`);
      console.log(`   - DELETE /api/quotes/:id`);
      console.log(`   - GET  /api/pricing-tiers`);
      console.log(`   - POST /api/pricing-tiers`);
      console.log(`   - POST /api/signature/create-form`);
      console.log(`   - GET  /api/signature/form/:formId`);
      console.log(`   - POST /api/signature/submit`);
      console.log(`   - GET  /api/signature/forms-by-quote/:quoteId`);
      console.log(`   - GET  /api/signature/analytics`);
      console.log(`   - GET  /api/hubspot/contacts`);
      console.log(`   - GET  /api/hubspot/deals`);
      console.log(`   - POST /api/hubspot/contacts`);
      console.log(`   - POST /api/templates`);
      console.log(`   - GET  /api/templates`);
      console.log(`   - GET  /api/templates/:id/file`);
      console.log(`   - PUT  /api/templates/:id`);
      console.log(`   - DELETE /api/templates/:id`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}


// LibreOffice system health check
app.get('/api/libreoffice/health', async (req, res) => {
  try {
    // Test if LibreOffice is available
    const isWindows = os.platform() === 'win32';
    const sofficeCmd = process.env.SOFFICE_PATH || (isWindows ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe' : 'libreoffice');
    
    await new Promise((resolve, reject) => {
      exec(`${sofficeCmd} --version`, { timeout: 5000 }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
    
    res.json({
      success: true,
      service: 'LibreOffice System',
      status: 'Available',
      type: 'System LibreOffice'
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'LibreOffice is not installed or not in PATH',
      error: error.message,
      instructions: [
        '1. Install LibreOffice from https://www.libreoffice.org/download/',
        '2. Add LibreOffice to your system PATH',
        '3. Restart the server after installation'
      ]
    });
  }
});

// Start the server
startServer();

/**
 * Get webhook logs for a specific document
 * Retrieve all webhook events associated with a document
 */
app.get('/api/boldsign/webhook-logs/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const webhookLogsCollection = db.collection('boldsign_webhook_logs');
    
    // Get total count
    const total = await webhookLogsCollection.countDocuments({ documentId });
    
    // Get paginated logs
    const logs = await webhookLogsCollection
      .find({ documentId })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .toArray();

    res.json({
      success: true,
      data: {
        documentId,
        total,
        logs,
        pagination: {
          skip: parseInt(skip),
          limit: parseInt(limit),
          hasMore: parseInt(skip) + parseInt(limit) < total
        }
      }
    });

  } catch (error) {
    console.error('❌ Error retrieving webhook logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get real-time document signing status
 * Returns current status of a document and all signers
 */
app.get('/api/boldsign/document-status/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;

    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const documentsCollection = db.collection('documents');
    const signatureStatusCollection = db.collection('signature_status');
    const declineRecordsCollection = db.collection('signature_declines');

    // Get document info
    const document = await documentsCollection.findOne({ id: documentId });
    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    // Get all signature statuses for this document
    const signatures = await signatureStatusCollection
      .find({ documentId })
      .toArray();

    // Get any decline records
    const declines = await declineRecordsCollection
      .find({ documentId })
      .toArray();

    // Calculate completion percentage
    const totalSigners = signatures.length;
    const completedSignatures = signatures.filter(s => s.status === 'signed').length;
    const completionPercentage = totalSigners > 0 ? Math.round((completedSignatures / totalSigners) * 100) : 0;

    res.json({
      success: true,
      data: {
        document: {
          id: documentId,
          fileName: document.fileName,
          status: document.status,
          createdAt: document.createdAt,
          lastEvent: document.lastEvent,
          lastEventAt: document.lastSignedAt || document.declinedAt || document.expiredAt
        },
        signing: {
          totalSigners,
          completedSignatures,
          completionPercentage,
          status: document.status
        },
        signers: signatures.map(s => ({
          email: s.signerEmail,
          name: s.signerName,
          status: s.status,
          signedAt: s.signedAt,
          viewedAt: s.viewedAt
        })),
        declines: declines.map(d => ({
          declinedBy: d.signerEmail,
          declinedAt: d.declinedAt,
          reason: d.reason
        })),
        timeline: {
          created: document.createdAt,
          lastUpdated: document.lastSignedAt || document.declinedAt || document.createdAt,
          completed: document.completedAt || null,
          expired: document.expiredAt || null
        }
      }
    });

  } catch (error) {
    console.error('❌ Error retrieving document status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get signing history for a document
 * Returns detailed timeline of all signing events
 */
app.get('/api/boldsign/signing-history/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;

    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const webhookLogsCollection = db.collection('boldsign_webhook_logs');

    // Get all events in chronological order
    const events = await webhookLogsCollection
      .find({ documentId })
      .sort({ timestamp: 1 })
      .toArray();

    // Transform events into timeline
    const timeline = events.map((event, index) => ({
      sequence: index + 1,
      eventType: event.eventType,
      timestamp: event.timestamp,
      signer: event.signerEmail ? {
        email: event.signerEmail,
        name: event.signerName
      } : null,
      details: event.processingResult,
      status: event.processed ? 'processed' : 'pending'
    }));

    res.json({
      success: true,
      data: {
        documentId,
        totalEvents: events.length,
        timeline
      }
    });

  } catch (error) {
    console.error('❌ Error retrieving signing history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get all webhook logs (for monitoring)
 * Returns recent webhook events across all documents
 */
app.get('/api/boldsign/webhook-logs', async (req, res) => {
  try {
    const { limit = 100, skip = 0, eventType, status } = req.query;

    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const webhookLogsCollection = db.collection('boldsign_webhook_logs');

    // Build filter
    const filter = {};
    if (eventType) filter.eventType = eventType;
    if (status !== undefined) filter.processed = status === 'processed';

    // Get total count
    const total = await webhookLogsCollection.countDocuments(filter);

    // Get paginated logs
    const logs = await webhookLogsCollection
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .toArray();

    // Group by event type
    const eventCounts = await webhookLogsCollection.aggregate([
      { $group: { _id: '$eventType', count: { $sum: 1 } } }
    ]).toArray();

    res.json({
      success: true,
      data: {
        total,
        logs,
        statistics: {
          eventCounts: Object.fromEntries(
            eventCounts.map(e => [e._id, e.count])
          ),
          processed: logs.filter(l => l.processed).length,
          failed: logs.filter(l => l.error).length
        },
        pagination: {
          skip: parseInt(skip),
          limit: parseInt(limit),
          hasMore: parseInt(skip) + parseInt(limit) < total
        }
      }
    });

  } catch (error) {
    console.error('❌ Error retrieving webhook logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get document view analytics
 * Returns when and who viewed the document
 */
app.get('/api/boldsign/document-views/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;

    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const documentViewsCollection = db.collection('document_views');

    const views = await documentViewsCollection
      .find({ documentId })
      .sort({ viewedAt: -1 })
      .toArray();

    res.json({
      success: true,
      data: {
        documentId,
        totalViews: views.length,
        views: views.map(v => ({
          viewedBy: v.signerEmail,
          viewedAt: v.viewedAt
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error retrieving document views:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
