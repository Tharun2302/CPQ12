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
// IMPORTANT: dotenv values are strings. If PORT is provided as a string (e.g. "3001"),
// Node can treat it as a named pipe instead of a TCP port. Always coerce to number.
const PORT = Number.parseInt(process.env.PORT, 10) || 3001;

// Middleware - Configure CORS to allow frontend requests
app.use(cors({
  origin: [
    'http://localhost:5173', 
    'http://localhost:3000', 
    'http://localhost:3001',
    'https://zenop.ai',
    'https://www.zenop.ai'
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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
    await documentsCollection.createIndex({ createdAt: -1 }); // For fast sorting in GET /api/documents
    await documentsCollection.createIndex({ status: 1 });
    console.log('✅ Documents collection ready with indexes');
    
    console.log('✅ Connected to MongoDB Atlas successfully');
    console.log('📊 Database name:', DB_NAME);
    
    // Test the connection
    await db.admin().ping();
    
    // Auto-seed default templates on server startup (optional)
    //
    // NOTE:
    // - This seeding checks for file modifications and auto-updates templates in database
    // - It compares file modification time with database version
    // - Only updated templates are re-uploaded (efficient)
    // - Set SEED_TEMPLATES_ON_STARTUP=true to enable auto-sync
    //
    // To force seeding on a given environment, set:
    //   SEED_TEMPLATES_ON_STARTUP=true
    // in your .env file and restart the server.
    const shouldSeedTemplates =
      process.env.SEED_TEMPLATES_ON_STARTUP &&
      process.env.SEED_TEMPLATES_ON_STARTUP.toLowerCase() === 'true';

    if (shouldSeedTemplates) {
      try {
        const { seedDefaultTemplates } = require('./seed-templates.cjs');
        const { seedDefaultExhibits } = require('./seed-exhibits.cjs');
        
        console.log('🌱 Seeding templates and exhibits...');
        await seedDefaultTemplates(db);
        await seedDefaultExhibits(db);
        console.log('✅ Seeding complete');
      } catch (error) {
        console.log('⚠️ Template/exhibit seeding skipped due to error:', error.message);
      }
    } else {
      console.log('⏭️ Skipping template/exhibit seeding on startup (SEED_TEMPLATES_ON_STARTUP not set to true)');
      console.log('💡 Tip: Set SEED_TEMPLATES_ON_STARTUP=true in .env to auto-sync backend template changes');
    }

    console.log('✅ MongoDB Atlas ping successful');
    
    // Function to sync exhibits from MongoDB to backend-exhibits folder
    // This restores UI-added exhibits to folder after Docker restart
    async function syncExhibitsToFolder(db) {
      try {
        const exhibitsDir = path.join(__dirname, 'backend-exhibits');
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(exhibitsDir)) {
          try {
            fs.mkdirSync(exhibitsDir, { recursive: true, mode: 0o755 });
            console.log(`📁 Created backend-exhibits directory: ${exhibitsDir}`);
          } catch (mkdirError) {
            console.warn(`⚠️ Cannot create backend-exhibits directory: ${mkdirError.message}`);
            return; // Skip sync if can't create directory
          }
        }

        // Check write permissions
        try {
          fs.accessSync(exhibitsDir, fs.constants.W_OK);
        } catch (accessError) {
          console.warn(`⚠️ No write permission for backend-exhibits directory: ${accessError.message}`);
          return; // Skip sync if no write permission
        }

        console.log('🔄 Syncing exhibits from MongoDB to backend-exhibits folder...');
        
        // Get all exhibits from MongoDB
        const exhibits = await db.collection('exhibits').find({}).toArray();
        let syncedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const exhibit of exhibits) {
          try {
            if (!exhibit.fileName || !exhibit.fileData) {
              skippedCount++;
              continue;
            }

            const filePath = path.join(exhibitsDir, exhibit.fileName);
            
            // Skip if file already exists (don't overwrite)
            if (fs.existsSync(filePath)) {
              skippedCount++;
              continue;
            }

            // Convert base64 to buffer and write to file
            let fileBuffer;
            if (Buffer.isBuffer(exhibit.fileData)) {
              fileBuffer = exhibit.fileData;
            } else if (typeof exhibit.fileData === 'string') {
              fileBuffer = Buffer.from(exhibit.fileData, 'base64');
            } else {
              console.warn(`⚠️ Unknown fileData format for exhibit: ${exhibit.fileName}`);
              skippedCount++;
              continue;
            }

            fs.writeFileSync(filePath, fileBuffer, { mode: 0o644 });
            console.log(`✅ Synced exhibit to folder: ${exhibit.fileName}`);
            syncedCount++;
          } catch (fileError) {
            console.error(`❌ Error syncing exhibit ${exhibit.fileName}:`, fileError.message);
            errorCount++;
          }
        }

        console.log(`📊 Folder Sync Summary:`);
        console.log(`   ✅ Synced: ${syncedCount}`);
        console.log(`   ⏭️  Skipped (already exists): ${skippedCount}`);
        console.log(`   ❌ Errors: ${errorCount}`);
        console.log(`   📁 Total exhibits in MongoDB: ${exhibits.length}\n`);
      } catch (error) {
        console.error('❌ Error syncing exhibits to folder:', error.message);
        // Don't throw - this is non-critical
      }
    }

    // Sync MongoDB exhibits back to backend-exhibits folder (reverse sync)
    // This restores UI-added exhibits to folder after Docker restart
    try {
      await syncExhibitsToFolder(db);
    } catch (error) {
      console.log('⚠️ Exhibit folder sync skipped due to error:', error.message);
    }
    
    // Create users collection with proper indexes
    const usersCollection = db.collection('users');
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await usersCollection.createIndex({ provider: 1 });
    await usersCollection.createIndex({ created_at: -1 });
    console.log('✅ Users collection ready with indexes');

    // Create daily_logins collection with proper indexes
    const dailyLoginsCollection = db.collection('daily_logins');
    await dailyLoginsCollection.createIndex({ date: 1 }, { unique: true });
    await dailyLoginsCollection.createIndex({ date: -1 });
    console.log('✅ Daily logins collection ready with indexes');

    // Ensure collections exist
    const collections = ['signature_forms', 'quotes', 'templates', 'pricing_tiers', 'exhibits'];
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

// Helper to generate a friendly document ID
function generateDocumentId(clientName = 'UnknownClient', company = 'UnknownCompany') {
  const sanitize = (str) =>
    String(str)
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 20)
      .replace(/^[0-9]/, 'C$&');

  const sanitizedCompany = sanitize(company);
  const sanitizedClient = sanitize(clientName);
  const timestamp = Date.now().toString().slice(-5);

  return `${sanitizedCompany}_${sanitizedClient}_${timestamp}`;
}

// Helper function to track daily user logins
async function trackDailyLogin(userId, loginMethod = 'email', userEmail = null) {
  try {
    if (!db) {
      console.warn('⚠️ Cannot track daily login: Database not available');
      return;
    }

    // Get user email if not provided
    let email = userEmail;
    if (!email) {
      const user = await db.collection('users').findOne({ id: userId });
      if (user) {
        email = user.email;
      } else {
        email = 'unknown@example.com';
      }
    }

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const dateString = today.toISOString().split('T')[0]; // e.g., "2024-01-15"

    const dailyLoginsCollection = db.collection('daily_logins');

    // Find or create today's login record
    const todayRecord = await dailyLoginsCollection.findOne({ date: dateString });

    if (todayRecord) {
      // Update existing record - add user ID and email if not already present
      if (!todayRecord.user_ids.includes(userId)) {
        await dailyLoginsCollection.updateOne(
          { date: dateString },
          {
            $addToSet: { 
              user_ids: userId,
              user_emails: email // Store email alongside user ID
            },
            $set: {
              count: todayRecord.user_ids.length + 1,
              updated_at: new Date()
            }
          }
        );
        console.log(`✅ Tracked daily login for user ${userId} (${email}) on ${dateString}`);
      } else {
        console.log(`ℹ️ User ${userId} (${email}) already logged in today (${dateString})`);
      }
    } else {
      // Create new record for today
      await dailyLoginsCollection.insertOne({
        date: dateString,
        user_ids: [userId],
        user_emails: [email], // Store email alongside user ID
        count: 1,
        login_methods: [loginMethod],
        created_at: new Date(),
        updated_at: new Date()
      });
      console.log(`✅ Created daily login record for ${dateString} with user ${userId} (${email})`);
    }
  } catch (error) {
    console.error('❌ Error tracking daily login:', error);
    // Don't throw - login should still succeed even if tracking fails
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

// Email template functions
function generateTeamEmailHTML(workflowData) {
  const teamLabel = (workflowData && workflowData.teamGroup) ? String(workflowData.teamGroup).toUpperCase() : null;
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Team Approval Required</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #0ea5e9, #0369a1); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1>🧩 Team Approval Required${teamLabel ? ` - ${teamLabel}` : ''}</h1>
        </div>
        
        <div style="background: white; padding: 30px; border: 1px solid #E5E7EB;">
          <h2>Hello Team${teamLabel ? ` (${teamLabel})` : ''},</h2>
          
          <p>A new document requires your <strong>Team Approval</strong>:</p>
          
          <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>📄 Document Details</h3>
            ${teamLabel ? `<p><strong>Team Group:</strong> ${teamLabel}</p>` : ''}
            <p><strong>Document ID:</strong> ${workflowData.documentId}</p>
            <p><strong>Client:</strong> ${workflowData.clientName}</p>
            <p><strong>Amount:</strong> $${workflowData.amount.toLocaleString()}</p>
            <p><strong>Workflow ID:</strong> ${workflowData.workflowId}</p>
            <p><strong>📎 Document:</strong> The PDF document is attached to this email for your review.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.BASE_URL || 'http://localhost:5173'}/team-approval?workflow=${workflowData.workflowId}" 
               style="background: #0ea5e9; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Review & Approve
            </a>
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
function generateManagerEmailHTML(workflowData) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Technical Team Approval Required</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #3B82F6, #1E40AF); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1>🔔 Technical Team Approval Required</h1>
        </div>
        
        <div style="background: white; padding: 30px; border: 1px solid #E5E7EB;">
          <h2>Hello Technical Team,</h2>
          
          <p>A new document requires your <strong>Technical Team</strong> approval:</p>
          
          <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>📄 Document Details</h3>
            <p><strong>Document ID:</strong> ${workflowData.documentId}</p>
            <p><strong>Client:</strong> ${workflowData.clientName}</p>
            <p><strong>Amount:</strong> $${workflowData.amount.toLocaleString()}</p>
            <p><strong>Workflow ID:</strong> ${workflowData.workflowId}</p>
            <p><strong>📎 Document:</strong> The PDF document is attached to this email for your review.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.BASE_URL || 'http://localhost:5173'}/technical-approval?workflow=${workflowData.workflowId}" 
               style="background: #3B82F6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Review & Approve
            </a>
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
            <a href="${process.env.BASE_URL || 'http://localhost:5173'}/legal-approval?workflow=${workflowData.workflowId}" 
               style="background: #8B5CF6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Review & Approve
            </a>
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
            <a href="${process.env.BASE_URL || 'http://localhost:5173'}/client-notification?workflow=${workflowData.workflowId}" 
               style="background: #10B981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Review & Approve Document
            </a>
          </div>
          
          <div style="background: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #F59E0B;">
            <p style="margin: 0; color: #92400E; font-weight: bold;">📋 Action Required</p>
            <p style="margin: 5px 0 0 0; color: #92400E; font-size: 14px;">
              Please review the document details and approve or deny this request. Your decision is required to complete the approval process.
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

// Denial notification to workflow creator
function generateDenialEmailHTML(data) {
  const { workflowData, deniedBy, comments } = data;
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Approval Denied - ${deniedBy}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #EF4444, #B91C1C); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1>❌ Approval Denied</h1>
        </div>
        <div style="background: white; padding: 30px; border: 1px solid #E5E7EB;">
          <p>Your approval workflow has been <strong>denied</strong> by <strong>${deniedBy}</strong>.</p>
          <div style="background: #FEF2F2; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #FCA5A5;">
            <h3>📄 Document Details</h3>
            <p><strong>Document ID:</strong> ${workflowData.documentId}</p>
            <p><strong>Client:</strong> ${workflowData.clientName}</p>
            <p><strong>Amount:</strong> $${Number(workflowData.amount || 0).toLocaleString()}</p>
            <p><strong>Workflow ID:</strong> ${workflowData.workflowId || workflowData.id || ''}</p>
          </div>
          ${comments ? `<p><strong>Reason:</strong> ${comments}</p>` : ''}
          <p>You can review and take action by visiting your dashboard.</p>
        </div>
        <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
          <p>This is an automated notification from your approval system.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Email sending function using SendGrid
async function sendEmail(to, subject, html, attachments = []) {
  try {
    const emailPayload = {
      from: process.env.EMAIL_FROM || 'noreply@yourdomain.com',
      to: to,
      subject: subject,
      html: html,
      attachments: attachments.map(att => ({
        content: att.content.toString('base64'),
        filename: att.filename,
        type: att.contentType,
        disposition: 'attachment'
      }))
    };
    
    console.log('📧 Sending email with SendGrid payload:', JSON.stringify({
      from: emailPayload.from,
      to: emailPayload.to,
      subject: emailPayload.subject,
      attachments: attachments.length > 0 ? `${attachments.length} attachment(s)` : 'No attachments'
    }, null, 2));
    
    const result = await sgMail.send(emailPayload);

    console.log('✅ Email sent successfully via SendGrid:', result);
    return { success: true, data: result };
  } catch (error) {
    console.error('❌ Email send error:', error);
    
    // Check if it's a bounce/suppression error
    if (error.response) {
      const errorBody = error.response.body;
      if (errorBody && Array.isArray(errorBody.errors)) {
        errorBody.errors.forEach(err => {
          if (err.message && (err.message.includes('bounce') || err.message.includes('suppression') || err.message.includes('invalid'))) {
            console.error('🚨 BOUNCE/SUPPRESSION ERROR:', err.message);
            console.error('📧 Email address may be on suppression list:', to);
            console.error('💡 ACTION REQUIRED: Remove', to, 'from SendGrid suppression list at https://app.sendgrid.com/suppressions/bounces');
          }
        });
      }
    }
    
    return { success: false, error: error };
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

    // Track daily login
    await trackDailyLogin(user.id, 'email', user.email);

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

    // Track daily login
    await trackDailyLogin(user.id, 'microsoft', user.email);

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

// Get daily login statistics
app.get('/api/auth/daily-logins', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false,
        error: 'Database not available',
        message: 'Cannot retrieve login statistics without database connection'
      });
    }

    const { startDate, endDate, limit = 30 } = req.query;
    
    const dailyLoginsCollection = db.collection('daily_logins');
    let query = {};

    // Filter by date range if provided
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    // Get daily login records, sorted by date (newest first)
    const records = await dailyLoginsCollection
      .find(query)
      .sort({ date: -1 })
      .limit(parseInt(limit))
      .toArray();

    // Get user details for each login record
    const usersCollection = db.collection('users');
    const recordsWithUserDetails = await Promise.all(
      records.map(async (record) => {
        // Use stored emails if available, otherwise fetch from users collection
        const userEmails = record.user_emails || [];
        const userDetails = await Promise.all(
          record.user_ids.map(async (userId, index) => {
            // Try to get email from stored array first
            const storedEmail = userEmails[index] || null;
            
            // Fetch user details for additional info
            const user = await usersCollection.findOne({ id: userId });
            return user ? {
              id: user.id,
              email: storedEmail || user.email,
              name: user.name || 'N/A',
              provider: user.provider || 'email'
            } : { 
              id: userId, 
              email: storedEmail || 'Unknown', 
              name: 'Unknown User', 
              provider: 'N/A' 
            };
          })
        );
        return {
          date: record.date,
          count: record.count,
          user_ids: record.user_ids,
          user_emails: record.user_emails || [],
          users: userDetails,
          created_at: record.created_at,
          updated_at: record.updated_at
        };
      })
    );

    // Calculate total statistics
    const totalLogins = records.reduce((sum, record) => sum + record.count, 0);
    const uniqueUsers = new Set();
    records.forEach(record => {
      record.user_ids.forEach(userId => uniqueUsers.add(userId));
    });

    res.json({
      success: true,
      data: {
        records: recordsWithUserDetails,
        summary: {
          total_days: records.length,
          total_logins: totalLogins,
          unique_users: uniqueUsers.size,
          date_range: {
            start: records.length > 0 ? records[records.length - 1].date : null,
            end: records.length > 0 ? records[0].date : null
          }
        }
      }
    });
  } catch (error) {
    console.error('Error fetching daily login statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve login statistics',
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

    const queryStart = Date.now();

    // IMPORTANT: In MongoDB Node.js driver v6+, projection must be specified
    // via the "projection" option. Passing { fileData: 0 } as the second
    // argument no longer works and was causing the full (large) fileData
    // blobs to be read from the database and sent over the network.
    //
    // Restrict the fields we return to keep the payload small and fast.
    const templatesCursor = db.collection('templates')
      .find(
        {},
        {
          projection: {
            fileData: 0, // never send the big binary/base64 data in the list call
          }
        }
      )
      .sort({ createdAt: -1 });

    const templates = await templatesCursor.toArray();
    const queryDuration = Date.now() - queryStart;

    console.log(`✅ Fetched ${templates.length} templates from database (${queryDuration}ms)`);

    res.json({
      success: true,
      templates,
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

// Reseed default templates/exhibits from disk into the database
// This syncs files from ./backend-templates and ./backend-exhibits into MongoDB.
// Useful when you updated a DOCX on disk but the UI still serves an older DB copy.
app.post('/api/templates/reseed', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available',
        message: 'Cannot reseed templates without database connection'
      });
    }

    console.log('🌱 Reseeding templates/exhibits on demand...');
    const { seedDefaultTemplates } = require('./seed-templates.cjs');
    const { seedDefaultExhibits } = require('./seed-exhibits.cjs');

    const templatesUpdated = await seedDefaultTemplates(db);
    const exhibitsUpdated = await seedDefaultExhibits(db);

    console.log('✅ Reseed completed:', { templatesUpdated, exhibitsUpdated });

    return res.json({
      success: true,
      message: 'Templates/exhibits reseeded successfully',
      templatesUpdated,
      exhibitsUpdated
    });
  } catch (error) {
    console.error('❌ Error reseeding templates/exhibits:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to reseed templates/exhibits',
      details: error?.message || String(error)
    });
  }
});

// ============================================
// EXHIBITS API ENDPOINTS
// ============================================

// Get all exhibits (with optional filters)
app.get('/api/exhibits', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database not available'
      });
    }

    const { combination, category } = req.query;
    
    console.log('📎 Fetching exhibits from database...');
    console.log('   Filters:', { combination, category });

    const query = {};
    
    // Filter by category if provided
    if (category) {
      query.category = category;
    }

    // Fetch all exhibits (without fileData for listing)
    const exhibitsCursor = db.collection('exhibits')
      .find(query, {
        projection: {
          fileData: 0, // Exclude large binary data
        }
      })
      .sort({ displayOrder: 1, name: 1 });

    let exhibits = await exhibitsCursor.toArray();

    // Filter by combination on the backend
    if (combination) {
      exhibits = exhibits.filter(exhibit => 
        exhibit.combinations.includes('all') || 
        exhibit.combinations.includes(combination)
      );
    }

    console.log(`✅ Fetched ${exhibits.length} exhibits for combination: ${combination}`);

    res.json({
      success: true,
      exhibits,
      count: exhibits.length
    });
  } catch (error) {
    console.error('❌ Error fetching exhibits:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch exhibits',
      details: error.message 
    });
  }
});

// Get single exhibit file by ID
app.get('/api/exhibits/:id/file', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database not available'
      });
    }

    const { id } = req.params;
    const { ObjectId } = require('mongodb');

    console.log(`📎 Fetching exhibit file: ${id}`);

    const exhibit = await db.collection('exhibits').findOne({
      _id: new ObjectId(id)
    });

    if (!exhibit) {
      return res.status(404).json({
        success: false,
        error: 'Exhibit not found'
      });
    }

    // Convert base64 to buffer
    const fileBuffer = Buffer.from(exhibit.fileData, 'base64');

    res.setHeader('Content-Type', exhibit.fileType);
    res.setHeader('Content-Disposition', `attachment; filename="${exhibit.fileName}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    
    console.log(`✅ Exhibit file sent: ${exhibit.fileName}`);
    res.send(fileBuffer);

  } catch (error) {
    console.error('❌ Error fetching exhibit file:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch exhibit file',
      details: error.message 
    });
  }
});

// ============================================
// EXHIBIT UPLOAD/MANAGEMENT API ENDPOINTS
// ============================================

// Upload new exhibit (POST)
app.post('/api/exhibits', upload.single('file'), async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'Database not available' 
      });
    }

    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }

    // Validate file type
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    
    if (!allowedTypes.includes(req.file.mimetype) && !req.file.originalname.toLowerCase().endsWith('.docx')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid file type. Only DOCX files are allowed.' 
      });
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (req.file.size > maxSize) {
      return res.status(400).json({ 
        success: false, 
        error: 'File size exceeds 10MB limit' 
      });
    }

    // Get metadata from request body
    const {
      name,
      description = '',
      category,
      combinations,
      planType = '',
      displayOrder,
      keywords,
      isRequired = false
    } = req.body;

    // Validate required fields
    if (!category) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required field: category is required' 
      });
    }

    // Validate plan type (required)
    if (!planType || planType.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required field: planType is required. Please select Basic, Standard, or Advanced.' 
      });
    }

    // Validate plan type value
    const validPlanTypes = ['basic', 'standard', 'advanced'];
    if (!validPlanTypes.includes(planType.toLowerCase())) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid plan type: ${planType}. Must be one of: Basic, Standard, or Advanced.` 
      });
    }

    // Parse combinations FIRST (needed for name generation)
    let combinationsArray = [];
    if (combinations) {
      try {
        combinationsArray = typeof combinations === 'string' 
          ? JSON.parse(combinations) 
          : Array.isArray(combinations) 
            ? combinations 
            : [combinations];
      } catch (e) {
        combinationsArray = [combinations];
      }
    }

    // Auto-generate name from combination if not provided
    let finalName = name ? name.trim() : '';
    if (!finalName && combinationsArray.length > 0 && combinationsArray[0] !== 'all') {
      const combination = combinationsArray[0];
      // Convert "slack-to-teams" to "Slack to Teams"
      // Also handles single words like "testing" -> "Testing"
      const parts = combination.split('-');
      const formatted = parts
        .filter(part => part.trim() !== '' && part !== 'to')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
      
      // If formatted is empty, capitalize the original combination
      finalName = formatted || (combination.charAt(0).toUpperCase() + combination.slice(1).toLowerCase());
    }
    if (!finalName) {
      finalName = 'New Exhibit';
    }

    // Parse keywords (can be string or array)
    let keywordsArray = [];
    if (keywords) {
      try {
        keywordsArray = typeof keywords === 'string' 
          ? JSON.parse(keywords) 
          : Array.isArray(keywords) 
            ? keywords 
            : [keywords];
      } catch (e) {
        keywordsArray = keywords.split(',').map(k => k.trim()).filter(Boolean);
      }
    }

    // Convert file to base64
    const fileData = req.file.buffer.toString('base64');

    // Create exhibit document
    const exhibitDoc = {
      name: finalName,
      description: description.trim() || '',
      fileName: req.file.originalname,
      fileData: fileData,
      fileType: req.file.mimetype || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: req.file.size,
      combinations: combinationsArray.length > 0 ? combinationsArray : ['all'],
      category: category.toLowerCase(),
      planType: planType ? planType.toLowerCase() : '', // Store plan type (basic, standard, advanced)
      displayOrder: displayOrder ? parseInt(displayOrder) : 999,
      keywords: keywordsArray,
      isRequired: isRequired === true || isRequired === 'true',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1
    };

    // Check if exhibit with same filename already exists (in MongoDB)
    const existing = await db.collection('exhibits').findOne({
      fileName: exhibitDoc.fileName
    });

    if (existing) {
      return res.status(409).json({ 
        success: false, 
        error: 'Exhibit with this filename already exists',
        existingId: existing._id
      });
    }

    // Check if file already exists in folder (to prevent overwriting manually added files)
    const exhibitsDir = path.join(__dirname, 'backend-exhibits');
    const filePath = path.join(exhibitsDir, exhibitDoc.fileName);
    
    // Only check folder if directory exists
    if (fs.existsSync(exhibitsDir) && fs.existsSync(filePath)) {
      // File exists in folder but not in MongoDB - warn but allow (might be orphaned file)
      console.warn(`⚠️ File exists in folder but not in MongoDB: ${exhibitDoc.fileName}`);
      console.warn(`   Proceeding with upload - file will be overwritten in folder`);
    }

    // Insert into database
    const result = await db.collection('exhibits').insertOne(exhibitDoc);

    // Also save to backend-exhibits folder for easy file access
    try {
      // Create directory if it doesn't exist
      if (!fs.existsSync(exhibitsDir)) {
        try {
          fs.mkdirSync(exhibitsDir, { recursive: true, mode: 0o755 });
          console.log(`📁 Created backend-exhibits directory: ${exhibitsDir}`);
        } catch (mkdirError) {
          // Check if it's a permission error
          if (mkdirError.code === 'EACCES' || mkdirError.code === 'EPERM') {
            console.error(`❌ Permission denied creating directory: ${exhibitsDir}`);
            console.error(`   Error: ${mkdirError.message}`);
            throw new Error(`Permission denied: Cannot create backend-exhibits directory. Check file system permissions.`);
          }
          throw mkdirError;
        }
      }
      
      // Check write permissions before attempting to write
      try {
        fs.accessSync(exhibitsDir, fs.constants.W_OK);
      } catch (accessError) {
        console.error(`❌ No write permission for directory: ${exhibitsDir}`);
        throw new Error(`Permission denied: Cannot write to backend-exhibits directory. Check file system permissions.`);
      }
      
      // Save file to folder
      fs.writeFileSync(filePath, req.file.buffer, { mode: 0o644 });
      console.log(`💾 Exhibit file saved to folder: ${filePath}`);
    } catch (folderError) {
      // Log detailed error information
      const errorDetails = {
        message: folderError.message,
        code: folderError.code,
        path: exhibitsDir,
        stack: folderError.stack
      };
      
      console.error(`❌ Failed to save exhibit to backend-exhibits folder:`, errorDetails);
      console.warn(`⚠️ Exhibit saved to MongoDB but NOT to folder`);
      console.warn(`   This is non-critical - exhibit is still accessible from MongoDB`);
      
      // In production, you might want to send this to error tracking service
      // For now, we continue without failing the upload
    }

    console.log(`✅ Exhibit uploaded: ${exhibitDoc.name} (ID: ${result.insertedId})`);

    res.json({
      success: true,
      message: 'Exhibit uploaded successfully',
      exhibit: {
        id: result.insertedId.toString(),
        name: exhibitDoc.name,
        fileName: exhibitDoc.fileName,
        category: exhibitDoc.category,
        combinations: exhibitDoc.combinations
      }
    });

  } catch (error) {
    console.error('❌ Error uploading exhibit:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload exhibit',
      details: error.message 
    });
  }
});

// Update exhibit (PUT)
app.put('/api/exhibits/:id', upload.single('file'), async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'Database not available' 
      });
    }

    const { id } = req.params;
    const { ObjectId } = require('mongodb');

    // Get existing exhibit
    const existing = await db.collection('exhibits').findOne({
      _id: new ObjectId(id)
    });

    if (!existing) {
      return res.status(404).json({ 
        success: false, 
        error: 'Exhibit not found' 
      });
    }

    // Prepare update data
    const updateData = {
      updatedAt: new Date()
    };

    // Update metadata if provided
    // Auto-generate name from combination if not provided or if name is "New Exhibit"
    if (req.body.name) {
      updateData.name = req.body.name.trim();
    }
    
    // Parse combinations first to use for name generation
    let parsedCombinations = existing.combinations || [];
    if (req.body.combinations) {
      try {
        parsedCombinations = typeof req.body.combinations === 'string' 
          ? JSON.parse(req.body.combinations) 
          : Array.isArray(req.body.combinations) 
            ? req.body.combinations 
            : [req.body.combinations];
      } catch (e) {
        parsedCombinations = [req.body.combinations];
      }
    }
    
    // Auto-generate name if not provided or if current name is "New Exhibit"
    if (!updateData.name || updateData.name === 'New Exhibit') {
      if (parsedCombinations.length > 0 && parsedCombinations[0] !== 'all') {
        const combination = parsedCombinations[0];
        const parts = combination.split('-');
        const formatted = parts
          .filter(part => part.trim() !== '' && part !== 'to')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join(' ');
        updateData.name = formatted || (combination.charAt(0).toUpperCase() + combination.slice(1).toLowerCase());
      }
    }
    if (req.body.description !== undefined) updateData.description = req.body.description.trim() || '';
    if (req.body.category) updateData.category = req.body.category.toLowerCase();
    if (req.body.planType !== undefined) {
      const planTypeValue = req.body.planType ? req.body.planType.toLowerCase().trim() : '';
      if (!planTypeValue) {
        return res.status(400).json({ 
          success: false, 
          error: 'Plan Type is required. Please select Basic, Standard, or Advanced.' 
        });
      }
      const validPlanTypes = ['basic', 'standard', 'advanced'];
      if (!validPlanTypes.includes(planTypeValue)) {
        return res.status(400).json({ 
          success: false, 
          error: `Invalid plan type: ${req.body.planType}. Must be one of: Basic, Standard, or Advanced.` 
        });
      }
      updateData.planType = planTypeValue;
    }
    if (req.body.displayOrder) updateData.displayOrder = parseInt(req.body.displayOrder);
    if (req.body.isRequired !== undefined) {
      updateData.isRequired = req.body.isRequired === true || req.body.isRequired === 'true';
    }

    // Update combinations (already parsed above for name generation)
    if (req.body.combinations) {
      updateData.combinations = parsedCombinations;
    }

    // Update keywords
    if (req.body.keywords) {
      try {
        updateData.keywords = typeof req.body.keywords === 'string' 
          ? JSON.parse(req.body.keywords) 
          : Array.isArray(req.body.keywords) 
            ? req.body.keywords 
            : req.body.keywords.split(',').map((k) => k.trim()).filter(Boolean);
      } catch (e) {
        updateData.keywords = [req.body.keywords];
      }
    }

    // Update file if new file provided
    if (req.file) {
      // Validate file type
      const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword'
      ];
      
      if (!allowedTypes.includes(req.file.mimetype) && !req.file.originalname.toLowerCase().endsWith('.docx')) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid file type. Only DOCX files are allowed.' 
        });
      }

      // Validate file size
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (req.file.size > maxSize) {
        return res.status(400).json({ 
          success: false, 
          error: 'File size exceeds 10MB limit' 
        });
      }

      // Check if new filename conflicts with another exhibit
      if (req.file.originalname !== existing.fileName) {
        const conflictingExhibit = await db.collection('exhibits').findOne({
          fileName: req.file.originalname,
          _id: { $ne: new ObjectId(id) } // Exclude current exhibit
        });
        
        if (conflictingExhibit) {
          return res.status(409).json({ 
            success: false, 
            error: 'Another exhibit with this filename already exists',
            conflictingId: conflictingExhibit._id
          });
        }
      }

      updateData.fileName = req.file.originalname;
      updateData.fileData = req.file.buffer.toString('base64');
      updateData.fileType = req.file.mimetype || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      updateData.fileSize = req.file.size;
      updateData.version = (existing.version || 0) + 1;
      
      // Also update file in backend-exhibits folder
      try {
        const exhibitsDir = path.join(__dirname, 'backend-exhibits');
        
        // Ensure directory exists
        if (!fs.existsSync(exhibitsDir)) {
          fs.mkdirSync(exhibitsDir, { recursive: true, mode: 0o755 });
        }
        
        // Check write permissions
        try {
          fs.accessSync(exhibitsDir, fs.constants.W_OK);
        } catch (accessError) {
          throw new Error(`Permission denied: Cannot write to backend-exhibits directory`);
        }
        
        // Delete old file if filename changed
        if (existing.fileName && existing.fileName !== req.file.originalname) {
          const oldFilePath = path.join(exhibitsDir, existing.fileName);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
            console.log(`🗑️ Deleted old exhibit file: ${oldFilePath}`);
          }
        }
        
        // Save new file
        const filePath = path.join(exhibitsDir, req.file.originalname);
        fs.writeFileSync(filePath, req.file.buffer, { mode: 0o644 });
        console.log(`💾 Exhibit file updated in folder: ${filePath}`);
      } catch (folderError) {
        const errorDetails = {
          message: folderError.message,
          code: folderError.code,
          path: path.join(__dirname, 'backend-exhibits')
        };
        console.error(`❌ Failed to update exhibit in backend-exhibits folder:`, errorDetails);
        console.warn(`⚠️ Exhibit updated in MongoDB but NOT in folder`);
      }
    }

    // Update in database
    await db.collection('exhibits').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    console.log(`✅ Exhibit updated: ${id}`);

    res.json({
      success: true,
      message: 'Exhibit updated successfully'
    });

  } catch (error) {
    console.error('❌ Error updating exhibit:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update exhibit',
      details: error.message 
    });
  }
});

// Delete exhibit (DELETE)
app.delete('/api/exhibits/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'Database not available' 
      });
    }

    const { id } = req.params;
    const { ObjectId } = require('mongodb');

    // Get exhibit info before deleting (to remove file from folder)
    const exhibit = await db.collection('exhibits').findOne({
      _id: new ObjectId(id)
    });

    const result = await db.collection('exhibits').deleteOne({
      _id: new ObjectId(id)
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Exhibit not found' 
      });
    }

    // Also delete file from backend-exhibits folder
    if (exhibit && exhibit.fileName) {
      try {
        const exhibitsDir = path.join(__dirname, 'backend-exhibits');
        const filePath = path.join(exhibitsDir, exhibit.fileName);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Deleted exhibit file from folder: ${filePath}`);
        }
      } catch (folderError) {
        console.warn(`⚠️ Failed to delete exhibit from backend-exhibits folder: ${folderError.message}`);
      }
    }

    console.log(`✅ Exhibit deleted: ${id}`);

    res.json({
      success: true,
      message: 'Exhibit deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting exhibit:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete exhibit',
      details: error.message 
    });
  }
});

// ============================================
// PDF DOCUMENTS API ENDPOINTS
// ============================================

// Save PDF document to MongoDB (similar to template save)
app.post('/api/documents', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { fileName, fileData, fileSize, clientName, clientEmail, company, templateName, quoteId, metadata, docxFileData, docxFileName } = req.body;

    if (!fileName || !fileData) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    console.log('📄 Saving PDF document to MongoDB:', {
      fileName,
      company,
      fileSize,
      clientName,
      hasDocx: !!docxFileData
    });
    
    console.log('🔍 Document ID generation data:', {
      clientName: clientName,
      company: company,
      clientNameType: typeof clientName,
      companyType: typeof company
    });

    // Convert base64 to Buffer (same as templates)
    const fileBuffer = Buffer.from(fileData, 'base64');
    const docxBuffer = docxFileData ? Buffer.from(docxFileData, 'base64') : null;

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
    
    // Add DOCX data if available
    if (docxBuffer && docxFileName) {
      document.docxFileData = docxBuffer;
      document.docxFileName = docxFileName;
      console.log('💾 Also saving DOCX file:', docxFileName, 'Size:', docxBuffer.length);
    }

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

// OLD SLOW ENDPOINT REMOVED - This was converting ALL PDFs to base64 which was extremely slow
// The fast endpoint at line 3216 excludes fileData and is much faster

// Get single PDF document by ID (convert Buffer to base64)
app.get('/api/documents/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const documentsCollection = db.collection('documents');
    let document = await documentsCollection.findOne({ id: req.params.id });

    // Smart search fallback: if exact ID doesn't match, try to find by client/company
    if (!document) {
      console.log('⚠️ Exact ID not found in direct fetch, attempting smart search...');
      const id = req.params.id;
      
      // Extract client and company from ID pattern: Company_Client_Timestamp
      const parts = id.split('_');
      if (parts.length >= 2) {
        // Search for documents where ID starts with the same company_client pattern
        const idPattern = new RegExp(`^${parts[0]}_${parts[1]}_`, 'i');
        const matchingDocs = await documentsCollection
          .find({ id: { $regex: idPattern } })
          .sort({ createdAt: -1 })
          .limit(1)
          .toArray();
        
        if (matchingDocs.length > 0) {
          document = matchingDocs[0];
          console.log(`✅ Found matching document: ${document.id} (searched for: ${id})`);
        } else {
          // Fallback: search by company and clientName fields
          const companyPart = parts[0].replace(/[0-9]/g, '');
          const clientPart = parts[1].replace(/[0-9]/g, '');
          
          if (companyPart && clientPart) {
            const searchQuery = {
              $and: [
                { company: { $regex: companyPart, $options: 'i' } },
                { clientName: { $regex: clientPart, $options: 'i' } }
              ]
            };
            
            const matchingDocs2 = await documentsCollection
              .find(searchQuery)
              .sort({ createdAt: -1 })
              .limit(1)
              .toArray();
            
            if (matchingDocs2.length > 0) {
              document = matchingDocs2[0];
              console.log(`✅ Found matching document by client/company: ${document.id} (searched for: ${id})`);
              } else {
              // Fallback: search by clientName only (in case company name changed or is different)
              // Convert sanitized client name (e.g., "JasonWoods") to regex that matches with spaces (e.g., "Jason Woods")
              // Insert optional spaces before capital letters (camelCase handling)
              const clientNamePattern = clientPart.replace(/([a-z])([A-Z])/g, '$1\\s*$2');
              // For "JasonWoods" -> "Jason\\s*Woods" (allows "Jason Woods", "JasonWoods", etc.)
              const clientOnlyQuery = {
                clientName: { $regex: clientNamePattern, $options: 'i' }
              };
              
              const matchingDocs3 = await documentsCollection
                .find(clientOnlyQuery)
                .sort({ createdAt: -1 })
                .limit(1)
                .toArray();
              
              if (matchingDocs3.length > 0) {
                document = matchingDocs3[0];
                console.log(`✅ Found matching document by client name only: ${document.id} (searched for: ${id})`);
                console.log(`   Note: Company mismatch - workflow: ${companyPart}, document: ${document.company}`);
              }
            }
          }
        }
      }
      
      if (!document) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }
    }

    console.log('✅ Retrieved document from MongoDB:', document.id);

    // Convert Buffer to base64 for frontend
    let base64 = '';
    let docxBase64 = '';
    try {
      if (document.fileData) {
        if (Buffer.isBuffer(document.fileData)) {
          base64 = document.fileData.toString('base64');
        } else if (document.fileData.buffer) {
          base64 = Buffer.from(document.fileData.buffer).toString('base64');
        } else if (document.fileData.data) {
          base64 = Buffer.from(document.fileData.data).toString('base64');
        } else if (typeof document.fileData === 'string') {
          // Already base64 string
          base64 = document.fileData;
        }
      }
      
      // Also convert DOCX if available
      if (document.docxFileData) {
        if (Buffer.isBuffer(document.docxFileData)) {
          docxBase64 = document.docxFileData.toString('base64');
        } else if (document.docxFileData.buffer) {
          docxBase64 = Buffer.from(document.docxFileData.buffer).toString('base64');
        } else if (typeof document.docxFileData === 'string') {
          docxBase64 = document.docxFileData;
        }
      }
    } catch (e) {
      console.warn('⚠️ Could not convert document Buffer to base64 for id:', document.id, e?.message);
    }
    
    // Serialize dates to strings for frontend compatibility
    const documentWithBase64 = { 
      ...document, 
      fileData: base64,
      generatedDate: document.generatedDate ? (document.generatedDate instanceof Date ? document.generatedDate.toISOString() : document.generatedDate) : new Date().toISOString(),
      createdAt: document.createdAt ? (document.createdAt instanceof Date ? document.createdAt.toISOString() : document.createdAt) : new Date().toISOString(),
    };
    
    // Add DOCX data if available
    if (docxBase64) {
      documentWithBase64.docxFileData = docxBase64;
      documentWithBase64.docxFileName = document.docxFileName;
    }

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

// API endpoint to check SendGrid suppression status for email addresses
app.post('/api/email/check-suppression', async (req, res) => {
  try {
    if (!isEmailConfigured) {
      return res.status(500).json({
        success: false,
        message: 'Email not configured. Check SENDGRID_API_KEY in .env file.'
      });
    }

    const { emails } = req.body;
    if (!emails || !Array.isArray(emails)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of email addresses in the "emails" field'
      });
    }

    const results = [];
    const sendgridApiKey = process.env.SENDGRID_API_KEY;

    for (const email of emails) {
      try {
        // Check bounces
        const bounceResponse = await axios.get(
          `https://api.sendgrid.com/v3/suppression/bounces/${encodeURIComponent(email)}`,
          {
            headers: {
              'Authorization': `Bearer ${sendgridApiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        results.push({
          email: email,
          status: 'on_bounce_list',
          details: bounceResponse.data
        });
      } catch (bounceError) {
        if (bounceError.response?.status === 404) {
          // Not on bounce list, check invalid emails
          try {
            const invalidResponse = await axios.get(
              `https://api.sendgrid.com/v3/suppression/invalid_emails/${encodeURIComponent(email)}`,
              {
                headers: {
                  'Authorization': `Bearer ${sendgridApiKey}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            results.push({
              email: email,
              status: 'on_invalid_list',
              details: invalidResponse.data
            });
          } catch (invalidError) {
            if (invalidError.response?.status === 404) {
              results.push({
                email: email,
                status: 'not_suppressed',
                message: 'Email is not on any suppression list'
              });
            } else {
              results.push({
                email: email,
                status: 'error',
                error: invalidError.message
              });
            }
          }
        } else {
          results.push({
            email: email,
            status: 'error',
            error: bounceError.message
          });
        }
      }
    }

    return res.json({
      success: true,
      results: results,
      instructions: {
        remove_from_bounces: 'Go to https://app.sendgrid.com/suppressions/bounces and remove the email addresses',
        remove_from_invalid: 'Go to https://app.sendgrid.com/suppressions/invalid_emails and remove the email addresses'
      }
    });
  } catch (error) {
    console.error('❌ Error checking suppression status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check suppression status',
      error: error.message
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
    const resolvedManagerEmail = managerEmail || process.env.TECHNICAL_TEAM_EMAIL || 'cpq.zenop.ai.technical@cloudfuze.com';
    
    console.log('📧 Sending email to Manager only (sequential approval)...');
    console.log('Manager:', resolvedManagerEmail);
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

    // Send email to Manager only with attachment (fire-and-forget for faster UX)
    const sendStartedAt = Date.now();
    sendEmail(
      resolvedManagerEmail,
      `Approval Required: ${workflowData.documentId} - ${workflowData.clientName}`,
      generateManagerEmailHTML(workflowData),
      attachments
    )
      .then(result => {
        console.log(`✅ Manager email async result: ${result.success} (${Date.now() - sendStartedAt}ms)`);
      })
      .catch(err => {
        console.error('❌ Manager email async error:', err);
      });

    // Immediately respond so the frontend is not blocked by SendGrid latency
    res.json({
      success: true,
      message: 'Manager email queued for sending',
      result: { role: 'Manager', email: resolvedManagerEmail, success: true },
      workflowData,
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

// Sequential email sending - Team Approval (first step)
app.post('/api/send-team-email', async (req, res) => {
  try {
    if (!isEmailConfigured) {
      return res.status(500).json({
        success: false,
        message: 'Email not configured. Check SENDGRID_API_KEY in .env file.'
      });
    }

    const { teamEmail, workflowData } = req.body;
    const resolvedTeamEmail = teamEmail || process.env.TEAM_APPROVAL_EMAIL || 'abhilasha.kandakatla@cloudfuze.com';
    const teamLabel = (workflowData && workflowData.teamGroup) ? String(workflowData.teamGroup).toUpperCase() : null;
    
    console.log('📧 Sending email to Team (first approval step)...');
    console.log('Team:', resolvedTeamEmail);
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

    // Send email to Team with attachment (fire-and-forget for faster UX)
    const sendStartedAt = Date.now();
    sendEmail(
      resolvedTeamEmail,
      `${teamLabel ? `[${teamLabel}] ` : ''}Approval Required: ${workflowData.documentId} - ${workflowData.clientName}`,
      generateTeamEmailHTML(workflowData),
      attachments
    )
      .then(result => {
        console.log(`✅ Team email async result: ${result.success} (${Date.now() - sendStartedAt}ms)`);
      })
      .catch(err => {
        console.error('❌ Team email async error:', err);
      });

    // Immediately respond so the frontend is not blocked by SendGrid latency
    res.json({
      success: true,
      message: 'Team email queued for sending',
      result: { role: 'Team Approval', email: resolvedTeamEmail, success: true },
      workflowData,
      attachmentCount: attachments.length
    });
  } catch (error) {
    console.error('❌ Error sending Team email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send Team email',
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
    const resolvedCeoEmail = ceoEmail || process.env.LEGAL_TEAM_EMAIL || 'cpq.zenop.ai.legal@cloudfuze.com';
    
    console.log('📧 Sending email to CEO (after Technical Team approval)...');
    console.log('CEO:', resolvedCeoEmail);
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

    // Send email to CEO only with attachment (fire-and-forget for faster UX)
    const sendStartedAt = Date.now();
    sendEmail(
      resolvedCeoEmail,
      `Approval Required: ${workflowData.documentId} - ${workflowData.clientName}`,
      generateCEOEmailHTML(workflowData),
      attachments
    )
      .then(result => {
        console.log(`✅ CEO email async result: ${result.success} (${Date.now() - sendStartedAt}ms)`);
      })
      .catch(err => {
        console.error('❌ CEO email async error:', err);
      });

    // Immediately respond so the frontend is not blocked by SendGrid latency
    res.json({
      success: true,
      message: 'CEO email queued for sending',
      result: { role: 'CEO', email: resolvedCeoEmail, success: true },
      workflowData,
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
// IMPORTANT: This endpoint is designed to respond quickly and not block
// the approval UI on SendGrid latency. It mirrors the fire-and-forget
// pattern used for Manager/CEO emails above.
app.post('/api/send-client-email', async (req, res) => {
  try {
    if (!isEmailConfigured) {
      return res.status(500).json({
        success: false,
        message: 'Email not configured. Check SENDGRID_API_KEY in .env file.'
      });
    }

    const { clientEmail, workflowData } = req.body;
    
    console.log('📧 Queuing email to Client (after Legal Team approval)...');
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

    // Send email to Client only with attachment (fire-and-forget)
    const sendStartedAt = Date.now();
    sendEmail(
      clientEmail,
      `Document Submitted for Approval: ${workflowData.documentId}`,
      generateClientEmailHTML(workflowData),
      attachments
    )
      .then(result => {
        console.log(`✅ Client email async result: ${result.success} (${Date.now() - sendStartedAt}ms)`);
      })
      .catch(err => {
        console.error('❌ Client email async error:', err);
      });

    // Immediately respond so the frontend is not blocked by SendGrid latency
    res.json({
      success: true,
      message: 'Client email queued for sending',
      result: { role: 'Client', email: clientEmail, success: true },
      workflowData: workflowData,
      attachmentCount: attachments.length
    });

  } catch (error) {
    console.error('❌ Error queuing Client email:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Send Deal Desk notification email (after client approval)
// Also notifies the workflow creator (approval initiator) when available
app.post('/api/send-deal-desk-email', async (req, res) => {
  try {
    if (!isEmailConfigured) {
      return res.status(500).json({
        success: false,
        message: 'Email not configured. Check SENDGRID_API_KEY in .env file.'
      });
    }

    const { dealDeskEmail, workflowData } = req.body;
    const resolvedDealDeskEmail = dealDeskEmail || process.env.DEAL_DESK_EMAIL || 'salesops@cloudfuze.com';
    
    console.log('📧 Sending notification email to Deal Desk (after client approval)...');
    console.log('Deal Desk:', resolvedDealDeskEmail);
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

    // Look up workflow to find creator email (approval initiator)
    let creatorEmailForNotification = null;
    if (workflowData && workflowData.workflowId && db) {
      try {
        const workflowRecord = await db
          .collection('approval_workflows')
          .findOne({ id: workflowData.workflowId });
        if (workflowRecord && workflowRecord.creatorEmail) {
          creatorEmailForNotification = workflowRecord.creatorEmail;
          console.log('📧 Found workflow creator email for completion notification:', creatorEmailForNotification);
        } else {
          console.log('ℹ️ No creatorEmail found on workflow; skipping creator completion email.');
        }
      } catch (creatorLookupError) {
        console.error('❌ Error fetching workflow for creator completion email:', creatorLookupError);
      }
    }

    // Send notification email to Deal Desk
    const dealDeskResult = await sendEmail(
      resolvedDealDeskEmail,
      `Approval Workflow Completed: ${workflowData.documentId}`,
      generateDealDeskEmailHTML(workflowData),
      attachments
    );

    console.log('✅ Deal Desk notification email sent:', dealDeskResult.success);

    // Automatically create Migration Lifecycle workflow after Deal Desk notification
    try {
      if (db && workflowData.workflowId) {
        // Check if Migration Lifecycle workflow already exists for this approval workflow
        const existingMigrationWorkflow = await db.collection('migration_lifecycle_workflows').findOne({ 
          approvalWorkflowId: workflowData.workflowId 
        });
        
        if (existingMigrationWorkflow) {
          console.log(`ℹ️ Migration Lifecycle workflow already exists for approval workflow ${workflowData.workflowId} - skipping creation`);
        } else {
          const approvalWorkflow = await db.collection('approval_workflows').findOne({ id: workflowData.workflowId });
          
          if (approvalWorkflow) {
            // Extract client and company information from approval workflow
            const clientName = workflowData.clientName || approvalWorkflow.clientName || 'Unknown Client';
            const companyName = approvalWorkflow.companyName || clientName;
            const dealId = workflowData.documentId || approvalWorkflow.documentId || '';
            const dealName = `${clientName} - ${dealId}`;
            
            // Try to get customer email from document metadata
            let customerEmail = 'anushreddydasari@gmail.com';
            if (dealId) {
              try {
                const document = await db.collection('documents').findOne({ id: dealId });
                if (document && document.client_email) {
                  customerEmail = document.client_email;
                } else if (document && document.clientEmail) {
                  customerEmail = document.clientEmail;
                }
              } catch (docError) {
                console.log('⚠️ Could not fetch customer email from document, using default');
              }
            }
            
            // Fallback: try to get from workflow steps (Client Notification step)
            if (customerEmail === 'anushreddydasari@gmail.com') {
              const customerStep = approvalWorkflow.workflowSteps?.find(step => 
                step.role === 'Client' || step.role === 'Customer'
              );
              if (customerStep?.email) {
                customerEmail = customerStep.email;
              }
            }
            
            // All approval emails go to anushreddydasari@gmail.com as requested
            const notificationEmail = 'anushreddydasari@gmail.com';
            
            const migrationWorkflowId = `migration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            const migrationWorkflow = {
              id: migrationWorkflowId,
              dealId: dealId,
              dealName: dealName,
              clientName: clientName,
              companyName: companyName,
              accountManagerEmail: notificationEmail,
              customerEmail: customerEmail,
              migrationManagerEmail: notificationEmail,
              approvalWorkflowId: workflowData.workflowId, // Link back to approval workflow
              status: 'migration_manager_approval',
              currentStep: 1,
              numberOfServers: null,
              serversBuilt: null,
              qaStatus: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              steps: [
                { step: 1, name: 'Migration Manager Approval', role: 'Migration Manager', email: notificationEmail, status: 'pending' },
                { step: 2, name: 'Account Manager Approval', role: 'Account Manager', email: notificationEmail, status: 'pending' },
                { step: 3, name: 'Customer OK', role: 'Customer', email: customerEmail, status: 'pending' },
                { step: 4, name: 'Migration Manager - No. of Servers', role: 'Migration Manager', email: notificationEmail, status: 'pending' },
                { step: 5, name: 'Infrateam - Servers Built', role: 'Infrateam', email: notificationEmail, status: 'pending' },
                { step: 6, name: 'QA', role: 'QA', email: notificationEmail, status: 'pending' },
                { step: 7, name: 'Migration Manager - Final', role: 'Migration Manager', email: notificationEmail, status: 'pending' },
                { step: 8, name: 'End (Infra)', role: 'Completed', email: notificationEmail, status: 'pending' },
              ]
            };

            await db.collection('migration_lifecycle_workflows').insertOne(migrationWorkflow);
            console.log(`✅ Migration Lifecycle workflow automatically created: ${migrationWorkflowId}`);

            // Send email to Migration Manager for first approval
            if (isEmailConfigured) {
              try {
                const actionUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/migration-lifecycle`;
                const emailHtml = generateMigrationLifecycleEmailHTML(
                  migrationWorkflow, 
                  'Migration Lifecycle Started - Migration Manager Approval Required', 
                  actionUrl
                );
                await sendEmail(
                  notificationEmail,
                  `Migration Lifecycle Started: ${dealName}`,
                  emailHtml
                );
                console.log(`✅ Migration Manager approval email sent to ${notificationEmail}`);
              } catch (emailError) {
                console.error('❌ Failed to send Migration Manager email:', emailError);
              }
            }
          }
        }
      }
    } catch (migrationError) {
      // Don't fail the Deal Desk email if migration workflow creation fails
      console.error('❌ Error creating Migration Lifecycle workflow:', migrationError);
    }

    // Best-effort notification email to workflow creator (if available)
    if (creatorEmailForNotification) {
      try {
        const creatorResult = await sendEmail(
          creatorEmailForNotification,
          `Approval Workflow Completed: ${workflowData.documentId}`,
          generateDealDeskEmailHTML(workflowData),
          attachments
        );
        console.log('✅ Workflow creator completion email sent:', creatorResult.success);
      } catch (creatorEmailError) {
        // Do not fail the whole request if creator email fails; just log
        console.error('❌ Error sending workflow creator completion email:', creatorEmailError);
      }
    }

    res.json({
      success: dealDeskResult.success,
      message: creatorEmailForNotification
        ? 'Deal Desk and creator notification emails sent successfully'
        : 'Deal Desk notification email sent successfully',
      result: {
        dealDesk: { role: 'Deal Desk', email: resolvedDealDeskEmail, success: dealDeskResult.success },
        creator: creatorEmailForNotification ? { role: 'Creator', email: creatorEmailForNotification } : null
      },
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
      const managerResult = await sendEmail(
        managerEmail,
        `Approval Required: ${workflowData.documentId} - ${workflowData.clientName}`,
        generateManagerEmailHTML(workflowData)
      );
      results.push({ role: 'Manager', email: managerEmail, success: managerResult.success });
    } catch (error) {
      console.error('❌ Manager email failed:', error);
      results.push({ role: 'Manager', email: managerEmail, success: false, error: error.message });
    }

    // Send email to CEO
    try {
      const ceoResult = await sendEmail(
        ceoEmail,
        `Approval Required: ${workflowData.documentId} - ${workflowData.clientName}`,
        generateCEOEmailHTML(workflowData)
      );
      results.push({ role: 'CEO', email: ceoEmail, success: ceoResult.success });
    } catch (error) {
      console.error('❌ CEO email failed:', error);
      results.push({ role: 'CEO', email: ceoEmail, success: false, error: error.message });
    }

    // Send email to Client
    try {
      const clientResult = await sendEmail(
        clientEmail,
        `Document Submitted for Approval: ${workflowData.documentId}`,
        generateClientEmailHTML(workflowData)
      );
      results.push({ role: 'Client', email: clientEmail, success: clientResult.success });
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

// API endpoint to upload documents (PDF, Excel, CSV, etc.) to MongoDB
// NOTE: This uses multipart/form-data and is separate from the JSON /api/documents endpoint.
app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available',
        message: 'Cannot save documents without database connection'
      });
    }

    // Extract metadata for optional base64 uploads
    const { clientName, company, quoteId, totalCost, fileName, fileData, fileSize } = req.body;

    // Check if we have file data (either from upload or base64)
    if (!req.file && !fileData) {
      return res.status(400).json({
        success: false,
        error: 'No document file provided'
      });
    }

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
// NOTE: This endpoint is replaced by the one below at line 3725 to avoid duplicates
// Keeping this comment for reference but the endpoint below should be used

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
    
    let document = await db.collection('documents').findOne({ id: id });
    
    // Smart search fallback: if exact ID doesn't match, try to find by client/company
    if (!document) {
      console.log('⚠️ Exact ID not found, attempting smart search...');
      
      // Extract client and company from ID pattern: Company_Client_Timestamp
      const parts = id.split('_');
      if (parts.length >= 2) {
        // Try to match documents with similar company and client names
        // The ID format is: sanitizedCompany_sanitizedClient_timestamp
        // We'll search for documents where company or clientName contains parts of the ID
        const companyPart = parts[0].replace(/[0-9]/g, ''); // Remove numbers
        const clientPart = parts[1].replace(/[0-9]/g, ''); // Remove numbers
        
        if (companyPart && clientPart) {
          console.log('🔍 Searching by company/client pattern:', { companyPart, clientPart });
          
          // Search for documents where ID starts with the same company_client pattern
          const idPattern = new RegExp(`^${parts[0]}_${parts[1]}_`, 'i');
          const matchingDocs = await db.collection('documents')
            .find({ id: { $regex: idPattern } })
            .sort({ createdAt: -1 })
            .limit(1)
            .toArray();
          
          if (matchingDocs.length > 0) {
            document = matchingDocs[0];
            console.log(`✅ Found matching document: ${document.id} (searched for: ${id})`);
          } else {
            // Fallback 1: search by company and clientName fields
            const searchQuery = {
              $and: [
                { company: { $regex: companyPart, $options: 'i' } },
                { clientName: { $regex: clientPart, $options: 'i' } }
              ]
            };
            
            const matchingDocs2 = await db.collection('documents')
              .find(searchQuery)
              .sort({ createdAt: -1 })
              .limit(1)
              .toArray();
            
            if (matchingDocs2.length > 0) {
              document = matchingDocs2[0];
              console.log(`✅ Found matching document by client/company: ${document.id} (searched for: ${id})`);
            } else {
              // Fallback 2: search by clientName only (in case company name changed)
              // Convert sanitized client name (e.g., "JasonWoods") to regex that matches with spaces (e.g., "Jason Woods")
              // Insert optional spaces before capital letters (camelCase handling)
              const clientNamePattern = clientPart.replace(/([a-z])([A-Z])/g, '$1\\s*$2');
              // For "JasonWoods" -> "Jason\\s*Woods" (allows "Jason Woods", "JasonWoods", etc.)
              const clientOnlyQuery = {
                clientName: { $regex: clientNamePattern, $options: 'i' }
              };
              
              const matchingDocs3 = await db.collection('documents')
                .find(clientOnlyQuery)
                .sort({ createdAt: -1 })
                .limit(1)
                .toArray();
              
              if (matchingDocs3.length > 0) {
                document = matchingDocs3[0];
                console.log(`✅ Found matching document by client name only: ${document.id} (searched for: ${id})`);
                console.log(`   Note: Company mismatch - workflow: ${companyPart}, document: ${document.company}`);
              }
            }
          }
        }
      }
      
      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }
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
      
      // Automatically create Migration Lifecycle workflow when approval workflow is created
      try {
        // Check if Migration Lifecycle workflow already exists for this approval workflow
        const existingMigrationWorkflow = await db.collection('migration_lifecycle_workflows').findOne({ 
          approvalWorkflowId: workflowId 
        });
        
        if (existingMigrationWorkflow) {
          console.log(`ℹ️ Migration Lifecycle workflow already exists for approval workflow ${workflowId}`);
        } else {
          const clientName = workflowData.clientName || 'Unknown Client';
          const companyName = workflowData.companyName || clientName;
          const dealId = workflowData.documentId || '';
          const dealName = `${clientName} - ${dealId}`;
          
          // Try to get customer email from document metadata
          let customerEmail = 'anushreddydasari@gmail.com';
          if (dealId) {
            try {
              const document = await db.collection('documents').findOne({ id: dealId });
              if (document && document.client_email) {
                customerEmail = document.client_email;
              } else if (document && document.clientEmail) {
                customerEmail = document.clientEmail;
              }
            } catch (docError) {
              console.log('⚠️ Could not fetch customer email from document, using default');
            }
          }
          
          // All approval emails go to anushreddydasari@gmail.com as requested
          const notificationEmail = 'anushreddydasari@gmail.com';
          
          const migrationWorkflowId = `migration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          const migrationWorkflow = {
            id: migrationWorkflowId,
            dealId: dealId,
            dealName: dealName,
            clientName: clientName,
            companyName: companyName,
            accountManagerEmail: notificationEmail,
            customerEmail: customerEmail,
            migrationManagerEmail: notificationEmail,
            approvalWorkflowId: workflowId, // Link back to approval workflow
            status: 'migration_manager_approval',
            currentStep: 1,
            numberOfServers: null,
            serversBuilt: null,
            qaStatus: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            steps: [
              { step: 1, name: 'Migration Manager Approval', role: 'Migration Manager', email: notificationEmail, status: 'pending' },
              { step: 2, name: 'Account Manager Approval', role: 'Account Manager', email: notificationEmail, status: 'pending' },
              { step: 3, name: 'Customer OK', role: 'Customer', email: customerEmail, status: 'pending' },
              { step: 4, name: 'Migration Manager - No. of Servers', role: 'Migration Manager', email: notificationEmail, status: 'pending' },
              { step: 5, name: 'Infrateam - Servers Built', role: 'Infrateam', email: notificationEmail, status: 'pending' },
              { step: 6, name: 'QA', role: 'QA', email: notificationEmail, status: 'pending' },
              { step: 7, name: 'Migration Manager - Final', role: 'Migration Manager', email: notificationEmail, status: 'pending' },
              { step: 8, name: 'End (Infra)', role: 'Completed', email: notificationEmail, status: 'pending' },
            ]
          };

          await db.collection('migration_lifecycle_workflows').insertOne(migrationWorkflow);
          console.log(`✅ Migration Lifecycle workflow automatically created: ${migrationWorkflowId}`);

          // Send email to Migration Manager for first approval
          if (isEmailConfigured) {
            try {
              const actionUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/migration-lifecycle`;
              const emailHtml = generateMigrationLifecycleEmailHTML(
                migrationWorkflow, 
                'Migration Lifecycle Started - Migration Manager Approval Required', 
                actionUrl
              );
              await sendEmail(
                notificationEmail,
                `Migration Lifecycle Started: ${dealName}`,
                emailHtml
              );
              console.log(`✅ Migration Manager approval email sent to ${notificationEmail}`);
            } catch (emailError) {
              console.error('❌ Failed to send Migration Manager email:', emailError);
            }
          }
        }
      } catch (migrationError) {
        // Don't fail the approval workflow creation if migration workflow creation fails
        console.error('❌ Error creating Migration Lifecycle workflow:', migrationError);
      }
      
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

      // Notify the workflow creator about denial
      try {
        const deniedStep = workflow.workflowSteps.find(s => s.step === parseInt(stepNumber));
        const toEmail = workflow.creatorEmail || process.env.WORKFLOW_FALLBACK_EMAIL || 'abhilasha.kandakatla@cloudfuze.com';
        console.log('📧 Denial notification prepared:', {
          to: toEmail,
          deniedBy: deniedStep?.role,
          workflowId: workflow.id,
          documentId: workflow.documentId
        });
        if (toEmail && isEmailConfigured) {
          const subject = `Approval Denied by ${deniedStep?.role || 'Approver'} - ${workflow.documentId}`;
          const html = generateDenialEmailHTML({
            workflowData: { ...workflow, workflowId: workflow.id },
            deniedBy: deniedStep?.role || 'Approver',
            comments: stepUpdates.comments || deniedStep?.comments || ''
          });
          // Best-effort; do not block the API on email failure
          sendEmail(toEmail, subject, html)
            .then(() => console.log('✅ Denial notification email sent to creator:', toEmail))
            .catch(err => {
              console.error('❌ Failed to send denial email to creator:', err);
            });
        }
      } catch (e) {
        console.error('❌ Error preparing denial notification:', e);
      }
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

// ========================================
// Documents API
// ========================================

// Get all saved documents (without raw fileData)
app.get('/api/documents', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available',
      });
    }

    console.log('📄 Fetching PDF documents from database...');
    
    // Get query parameters for pagination (optional)
    const limit = parseInt(req.query.limit) || 100; // Default to 100 documents max
    const skip = parseInt(req.query.skip) || 0;

    const documents = await db
      .collection('documents')
      .find({})
      .project({ fileData: 0, docxFileData: 0 }) // exclude large PDF and DOCX payloads, but keep docxFileName
      .sort({ createdAt: -1, generatedDate: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    // Serialize dates to strings for frontend compatibility
    const serializedDocuments = documents.map(doc => ({
      ...doc,
      generatedDate: doc.generatedDate ? (doc.generatedDate instanceof Date ? doc.generatedDate.toISOString() : doc.generatedDate) : new Date().toISOString(),
      createdAt: doc.createdAt ? (doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt) : new Date().toISOString(),
    }));

    console.log(`✅ Found ${serializedDocuments.length} documents in database (limit: ${limit}, skip: ${skip})`);

    res.json({
      success: true,
      documents: serializedDocuments,
      count: serializedDocuments.length
    });
  } catch (error) {
    console.error('❌ Error fetching documents:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Save a new document
app.post('/api/documents', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available',
      });
    }

    const payload = req.body || {};

    if (!payload.fileName || !payload.fileData) {
      return res.status(400).json({
        success: false,
        error: 'fileName and fileData are required',
      });
    }

    const nowIso = new Date().toISOString();

    const documentId =
      payload.id ||
      generateDocumentId(payload.clientName || 'UnknownClient', payload.company || 'UnknownCompany');

    const documentToSave = {
      ...payload,
      id: documentId,
      status: payload.status || 'active',
      createdAt: payload.createdAt || nowIso,
      generatedDate: payload.generatedDate || nowIso,
    };

    await db.collection('documents').updateOne(
      { id: documentId },
      { $set: documentToSave },
      { upsert: true }
    );

    const { fileData, ...safeDoc } = documentToSave;

    res.json({
      success: true,
      documentId,
      document: safeDoc,
    });
  } catch (error) {
    console.error('❌ Error saving document:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get raw PDF file for a document
app.get('/api/documents/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available',
      });
    }

    const { id } = req.params;
    let doc = await db.collection('documents').findOne({ id });

    // Smart search fallback: if exact ID doesn't match, try to find by client/company
    if (!doc) {
      console.log('⚠️ Exact ID not found in raw fetch, attempting smart search...');
      
      // Extract client and company from ID pattern: Company_Client_Timestamp
      const parts = id.split('_');
      if (parts.length >= 2) {
        // Search for documents where ID starts with the same company_client pattern
        const idPattern = new RegExp(`^${parts[0]}_${parts[1]}_`, 'i');
        const matchingDocs = await db.collection('documents')
          .find({ id: { $regex: idPattern } })
          .sort({ createdAt: -1 })
          .limit(1)
          .toArray();
        
        if (matchingDocs.length > 0) {
          doc = matchingDocs[0];
          console.log(`✅ Found matching document: ${doc.id} (searched for: ${id})`);
        } else {
          // Fallback: search by company and clientName fields
          const companyPart = parts[0].replace(/[0-9]/g, '');
          const clientPart = parts[1].replace(/[0-9]/g, '');
          
          if (companyPart && clientPart) {
            const searchQuery = {
              $and: [
                { company: { $regex: companyPart, $options: 'i' } },
                { clientName: { $regex: clientPart, $options: 'i' } }
              ]
            };
            
            const matchingDocs2 = await db.collection('documents')
              .find(searchQuery)
              .sort({ createdAt: -1 })
              .limit(1)
              .toArray();
            
            if (matchingDocs2.length > 0) {
              doc = matchingDocs2[0];
              console.log(`✅ Found matching document by client/company: ${doc.id} (searched for: ${id})`);
            } else {
              // Fallback: search by clientName only (in case company name changed or is different)
              // Convert sanitized client name (e.g., "JasonWoods") to regex that matches with spaces (e.g., "Jason Woods")
              // Insert optional spaces before capital letters (camelCase handling)
              const clientNamePattern = clientPart.replace(/([a-z])([A-Z])/g, '$1\\s*$2');
              // For "JasonWoods" -> "Jason\\s*Woods" (allows "Jason Woods", "JasonWoods", etc.)
              const clientOnlyQuery = {
                clientName: { $regex: clientNamePattern, $options: 'i' }
              };
              
              const matchingDocs3 = await db.collection('documents')
                .find(clientOnlyQuery)
                .sort({ createdAt: -1 })
                .limit(1)
                .toArray();
              
              if (matchingDocs3.length > 0) {
                doc = matchingDocs3[0];
                console.log(`✅ Found matching document by client name only: ${doc.id} (searched for: ${id})`);
                console.log(`   Note: Company mismatch - workflow: ${companyPart}, document: ${doc.company}`);
              }
            }
          }
        }
      }
      
      if (!doc || !doc.fileData) {
        return res.status(404).json({
          success: false,
          error: 'Document not found',
        });
      }
    }

    const buffer = Buffer.from(doc.fileData, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${doc.fileName || 'document.pdf'}"`
    );
    res.send(buffer);
  } catch (error) {
    console.error('❌ Error fetching document file:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Smart document search by client name and company (fallback when exact ID doesn't match)
app.get('/api/documents/search', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available',
      });
    }

    const { clientName, company } = req.query;
    
    if (!clientName && !company) {
      return res.status(400).json({
        success: false,
        error: 'clientName or company query parameter required',
      });
    }

    console.log('🔍 Searching documents by:', { clientName, company });

    const query = {};
    if (clientName) {
      query.clientName = { $regex: clientName.trim(), $options: 'i' };
    }
    if (company) {
      query.company = { $regex: company.trim(), $options: 'i' };
    }

    const docs = await db.collection('documents')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    if (docs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No documents found matching criteria',
      });
    }

    console.log(`✅ Found ${docs.length} matching document(s)`);

    res.json({
      success: true,
      documents: docs.map(doc => ({
        id: doc.id,
        fileName: doc.fileName,
        clientName: doc.clientName,
        company: doc.company,
        createdAt: doc.createdAt
      })),
      count: docs.length
    });
  } catch (error) {
    console.error('❌ Error searching documents:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get a base64 preview for a document
app.get('/api/documents/:id/preview', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available',
      });
    }

    const { id } = req.params;
    const doc = await db.collection('documents').findOne({ id });

    if (!doc || !doc.fileData) {
      // Try smart search as fallback if exact ID doesn't match
      console.log('⚠️ Exact ID not found, attempting smart search...');
      
      // Extract client and company from ID pattern: Company_Client_Timestamp
      const parts = id.split('_');
      if (parts.length >= 2) {
        const sanitizeForSearch = (str) => {
          if (!str) return null;
          // Remove numbers and special chars, keep letters
          return str.replace(/[0-9]/g, '').replace(/[^a-zA-Z]/g, ' ').trim();
        };
        
        const possibleCompany = sanitizeForSearch(parts[0]);
        const possibleClient = sanitizeForSearch(parts[1]);
        
        if (possibleCompany && possibleClient) {
          console.log('🔍 Searching by:', { company: possibleCompany, client: possibleClient });
          const searchQuery = {
            $or: [
              { company: { $regex: possibleCompany, $options: 'i' } },
              { clientName: { $regex: possibleClient, $options: 'i' } }
            ]
          };
          
          const matchingDocs = await db.collection('documents')
            .find(searchQuery)
            .sort({ createdAt: -1 })
            .limit(1)
            .toArray();
          
          if (matchingDocs.length > 0) {
            const matchedDoc = matchingDocs[0];
            console.log(`✅ Found matching document: ${matchedDoc.id} (searched for: ${id})`);
            
            // Return the matched document
            const dataUrl = typeof matchedDoc.fileData === 'string' 
              ? `data:application/pdf;base64,${matchedDoc.fileData}`
              : `data:application/pdf;base64,${Buffer.from(matchedDoc.fileData).toString('base64')}`;
            
            return res.json({
              success: true,
              dataUrl,
              fileName: matchedDoc.fileName || 'document.pdf',
              documentId: matchedDoc.id,
              originalSearchedId: id,
              matched: true
            });
          }
        }
      }
      
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    const dataUrl = typeof doc.fileData === 'string'
      ? `data:application/pdf;base64,${doc.fileData}`
      : `data:application/pdf;base64,${Buffer.from(doc.fileData).toString('base64')}`;

    res.json({
      success: true,
      dataUrl,
      fileName: doc.fileName || 'document.pdf',
      documentId: id,
    });
  } catch (error) {
    console.error('❌ Error generating document preview:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Delete a document
app.delete('/api/documents/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available',
      });
    }

    const { id } = req.params;
    const result = await db.collection('documents').deleteOne({ id });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    console.error('❌ Error deleting document:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Serve the React app for the Microsoft callback (SPA handles the code)
app.get('/auth/microsoft/callback', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
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

// ============================================
// MIGRATION LIFECYCLE API ENDPOINTS
// ============================================

// Generate email HTML for migration lifecycle steps
function generateMigrationLifecycleEmailHTML(workflow, stepName, actionUrl) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .info-box { background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Migration Lifecycle Workflow</h1>
          <p>${stepName}</p>
        </div>
        <div class="content">
          <h2>Workflow Details</h2>
          <div class="info-box">
            <p><strong>Deal:</strong> ${workflow.dealName || workflow.dealId || 'N/A'}</p>
            <p><strong>Client:</strong> ${workflow.clientName}</p>
            <p><strong>Company:</strong> ${workflow.companyName}</p>
            <p><strong>Workflow ID:</strong> ${workflow.id}</p>
          </div>
          <p>Please review and approve this step in the migration lifecycle workflow.</p>
          <a href="${actionUrl}" class="button">View Workflow</a>
          <p style="margin-top: 30px; font-size: 12px; color: #666;">
            This is an automated email from the Migration Lifecycle Management System.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Get all migration lifecycle workflows
app.get('/api/migration-lifecycle/workflows', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const workflows = await db.collection('migration_lifecycle_workflows')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, workflows });
  } catch (error) {
    console.error('❌ Error fetching migration lifecycle workflows:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new migration lifecycle workflow
app.post('/api/migration-lifecycle/workflows', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const {
      dealId,
      dealName,
      clientName,
      companyName,
      accountManagerEmail,
      customerEmail,
      migrationManagerEmail
    } = req.body;

    if (!clientName || !companyName || !customerEmail) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: clientName, companyName, customerEmail'
      });
    }

    // All emails go to anushreddydasari@gmail.com as requested
    const notificationEmail = 'anushreddydasari@gmail.com';

    const workflowId = `migration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const workflow = {
      id: workflowId,
      dealId: dealId || '',
      dealName: dealName || '',
      clientName,
      companyName,
      accountManagerEmail: notificationEmail,
      customerEmail,
      migrationManagerEmail: notificationEmail,
      status: 'migration_manager_approval',
      currentStep: 1,
      numberOfServers: null,
      serversBuilt: null,
      qaStatus: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [
        { step: 1, name: 'Migration Manager Approval', role: 'Migration Manager', email: notificationEmail, status: 'pending' },
        { step: 2, name: 'Account Manager Approval', role: 'Account Manager', email: notificationEmail, status: 'pending' },
        { step: 3, name: 'Customer OK', role: 'Customer', email: customerEmail, status: 'pending' },
        { step: 4, name: 'Migration Manager - No. of Servers', role: 'Migration Manager', email: notificationEmail, status: 'pending' },
        { step: 5, name: 'Infrateam - Servers Built', role: 'Infrateam', email: notificationEmail, status: 'pending' },
        { step: 6, name: 'QA', role: 'QA', email: notificationEmail, status: 'pending' },
        { step: 7, name: 'Migration Manager - Final', role: 'Migration Manager', email: notificationEmail, status: 'pending' },
        { step: 8, name: 'End (Infra)', role: 'Completed', email: notificationEmail, status: 'pending' },
      ]
    };

    await db.collection('migration_lifecycle_workflows').insertOne(workflow);

    // Send email to Migration Manager for first approval
    if (isEmailConfigured) {
      try {
        const actionUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/migration-lifecycle`;
        const emailHtml = generateMigrationLifecycleEmailHTML(workflow, 'Migration Manager Approval Required', actionUrl);
        await sendEmail(
          notificationEmail,
          `Migration Lifecycle Workflow Started: ${workflow.dealName || workflow.clientName}`,
          emailHtml
        );
        console.log(`✅ Migration Manager approval email sent to ${notificationEmail}`);
      } catch (emailError) {
        console.error('❌ Failed to send Migration Manager email:', emailError);
      }
    }

    console.log(`✅ Migration lifecycle workflow created: ${workflowId}`);
    res.json({ success: true, workflow });
  } catch (error) {
    console.error('❌ Error creating migration lifecycle workflow:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Approve a workflow step
app.post('/api/migration-lifecycle/workflows/:id/steps/:stepNumber/approve', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { id } = req.params;
    const stepNumber = parseInt(req.params.stepNumber);
    const notificationEmail = 'anushreddydasari@gmail.com';

    const workflow = await db.collection('migration_lifecycle_workflows').findOne({ id });
    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    // Update the step status
    const updatedSteps = workflow.steps.map(step => {
      if (step.step === stepNumber) {
        return {
          ...step,
          status: 'approved',
          timestamp: new Date().toISOString()
        };
      }
      return step;
    });

    let newStatus = workflow.status;
    let newCurrentStep = workflow.currentStep;

    // Move to next step
    if (stepNumber === workflow.currentStep) {
      if (stepNumber === 1) {
        newStatus = 'account_manager_approval';
        newCurrentStep = 2;
      } else if (stepNumber === 2) {
        newStatus = 'customer_approval';
        newCurrentStep = 3;
      } else if (stepNumber === 3) {
        newStatus = 'infrastructure_phase';
        newCurrentStep = 4;
      } else if (stepNumber === 4) {
        newCurrentStep = 5;
      } else if (stepNumber === 5) {
        newStatus = 'qa_phase';
        newCurrentStep = 6;
      } else if (stepNumber === 6) {
        newCurrentStep = 7;
      } else if (stepNumber === 7) {
        newStatus = 'completed';
        newCurrentStep = 8;
      } else if (stepNumber === 8) {
        newStatus = 'completed';
      }
    }

    const updateData = {
      steps: updatedSteps,
      currentStep: newCurrentStep,
      status: newStatus,
      updatedAt: new Date().toISOString()
    };

    await db.collection('migration_lifecycle_workflows').updateOne(
      { id },
      { $set: updateData }
    );

    // Send email notification for next step
    if (isEmailConfigured && newCurrentStep <= 8) {
      try {
        const nextStep = updatedSteps.find(s => s.step === newCurrentStep);
        if (nextStep) {
          const actionUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/migration-lifecycle`;
          const emailHtml = generateMigrationLifecycleEmailHTML(
            { ...workflow, ...updateData },
            `${nextStep.name} Required`,
            actionUrl
          );
          const recipientEmail = nextStep.step === 3 ? workflow.customerEmail : notificationEmail;
          await sendEmail(
            recipientEmail,
            `Migration Lifecycle: ${nextStep.name} - ${workflow.dealName || workflow.clientName}`,
            emailHtml
          );
          console.log(`✅ Next step notification sent to ${recipientEmail}`);
        }
      } catch (emailError) {
        console.error('❌ Failed to send next step email:', emailError);
      }
    }

    console.log(`✅ Step ${stepNumber} approved for workflow ${id}`);
    res.json({ success: true, workflow: { ...workflow, ...updateData } });
  } catch (error) {
    console.error('❌ Error approving step:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update number of servers
app.put('/api/migration-lifecycle/workflows/:id/servers', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { id } = req.params;
    const { numberOfServers } = req.body;

    const workflow = await db.collection('migration_lifecycle_workflows').findOne({ id });
    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    await db.collection('migration_lifecycle_workflows').updateOne(
      { id },
      { 
        $set: { 
          numberOfServers: parseInt(numberOfServers),
          updatedAt: new Date().toISOString()
        }
      }
    );

    res.json({ success: true, workflow });
  } catch (error) {
    console.error('❌ Error updating servers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update servers built count
app.put('/api/migration-lifecycle/workflows/:id/servers-built', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { id } = req.params;
    const { serversBuilt } = req.body;

    const workflow = await db.collection('migration_lifecycle_workflows').findOne({ id });
    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    await db.collection('migration_lifecycle_workflows').updateOne(
      { id },
      { 
        $set: { 
          serversBuilt: parseInt(serversBuilt),
          updatedAt: new Date().toISOString()
        }
      }
    );

    res.json({ success: true, workflow });
  } catch (error) {
    console.error('❌ Error updating servers built:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update QA status
app.put('/api/migration-lifecycle/workflows/:id/qa', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { id } = req.params;
    const { qaStatus } = req.body;

    await db.collection('migration_lifecycle_workflows').updateOne(
      { id },
      { 
        $set: { 
          qaStatus,
          updatedAt: new Date().toISOString()
        }
      }
    );

    // If QA passed, move to next step
    if (qaStatus === 'passed') {
      const workflow = await db.collection('migration_lifecycle_workflows').findOne({ id });
      if (workflow && workflow.currentStep === 6) {
        await db.collection('migration_lifecycle_workflows').updateOne(
          { id },
          { 
            $set: { 
              currentStep: 7,
              updatedAt: new Date().toISOString()
            }
          }
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error updating QA status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the server
startServer();
