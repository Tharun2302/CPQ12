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
// Load .env from same directory as this script so signing links use correct APP_BASE_URL
const envPath = path.join(__dirname, '.env');
require('dotenv').config({ path: envPath });
if (!process.env.APP_BASE_URL && require('fs').existsSync(envPath)) {
  const envContent = require('fs').readFileSync(envPath, 'utf8');
  const match = envContent.match(/^\s*APP_BASE_URL\s*=\s*(.+)/m);
  if (match) process.env.APP_BASE_URL = match[1].trim().replace(/^["']|["']$/g, '');
}

const app = express();
// IMPORTANT: dotenv values are strings. If PORT is provided as a string (e.g. "3001"),
// Node can treat it as a named pipe instead of a TCP port. Always coerce to number.
const PORT = Number.parseInt(process.env.PORT, 10) || 3001;

/** Match signature_fields by document_id whether stored as ObjectId or string (avoids empty fields on some DBs). */
function signatureFieldsDocumentFilter(docId) {
  const { ObjectId } = require('mongodb');
  const oid = docId instanceof ObjectId ? docId : new ObjectId(String(docId));
  return { $or: [{ document_id: oid }, { document_id: oid.toString() }] };
}

/** Same for esign_recipients — must match sequential-flow queries or validRecipientIds breaks. */
function esignRecipientsDocumentFilter(docId) {
  const { ObjectId } = require('mongodb');
  const oid = docId instanceof ObjectId ? docId : new ObjectId(String(docId));
  return { $or: [{ document_id: oid }, { document_id: oid.toString() }] };
}

function normalizeEsignEmail(e) {
  if (!e || typeof e !== 'string') return '';
  return e.trim().toLowerCase();
}

/** True when actor is the uploader (creator) of the e-sign document. */
function esignActorIsDocumentCreator(doc, actorEmail) {
  const uploader = normalizeEsignEmail(doc.uploaded_by);
  const actor = normalizeEsignEmail(actorEmail);
  return uploader !== '' && actor !== '' && uploader === actor;
}

// Middleware - Configure CORS to allow frontend requests
app.use(cors({
  origin: [
    'http://localhost:5173', 
    'http://localhost:3000', 
    'http://localhost:3001',
    'https://zenop.ai',
    'https://www.zenop.ai',
    'https://159.89.175.168'
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
    'https://159.89.175.168',
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
//
// IMPORTANT (prod caching):
// - Never aggressively cache HTML entrypoints (index.html), otherwise browsers can get a stale HTML
//   that references *new* hashed chunks, or vice-versa, causing runtime errors like:
//     "Cannot access '<symbol>' before initialization"
// - Aggressively cache Vite hashed assets under dist/assets for performance.
const distPath = path.join(__dirname, 'dist');
const assetsPath = path.join(distPath, 'assets');

// Serve JS/CSS chunks with correct MIME (prevents "application/octet-stream" / "Cannot access 'ze' before initialization")
// Use writeHead + stream.pipe so headers are locked before any data; prevents Express/middleware from overwriting Content-Type
app.get('/assets/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!/^[a-zA-Z0-9_.-]+\.(js|mjs|css)$/.test(filename)) {
    return res.status(404).end();
  }
  const filePath = path.join(assetsPath, filename);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).end();
  }
  const contentType = (filename.endsWith('.css')) ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable'
  });
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).end();
    else res.destroy();
  });
  stream.pipe(res);
});

// Serve index.html with Vite's inline modulepreload data URL fixed (Vite uses application/octet-stream, browser requires application/javascript)
function sendIndexHtml(res) {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html.replace(/data:application\/octet-stream/g, 'data:application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

// GET / must be handled before express.static so we serve fixed index.html (express.static would serve raw with bad data URL)
app.get('/', (req, res) => {
  sendIndexHtml(res);
});

// Redirect e-sign dashboard/sign from backend port to frontend only in local dev (Vite on 5173). In production the same server serves the app on 3001, so do not redirect.
app.get('/esign-inbox', (req, res) => {
  const host = (req.get('host') || '').toLowerCase();
  if (host.includes('localhost') && host.includes('3001')) {
    const front = host.replace('3001', '5173');
    return res.redirect(302, `http://${front}${req.originalUrl}`);
  }
  sendIndexHtml(res);
});
app.get('/sign/:documentId', (req, res) => {
  const host = (req.get('host') || '').toLowerCase();
  if (host.includes('localhost') && host.includes('3001')) {
    const front = host.replace('3001', '5173');
    return res.redirect(302, `http://${front}${req.originalUrl}`);
  }
  sendIndexHtml(res);
});

app.use(
  express.static(distPath, {
    index: false, // Don't auto-serve index.html; we handle / explicitly above with fixed HTML
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      const p = (filePath || '').replace(/\\/g, '/');
      if (p.endsWith('.js') || p.endsWith('.mjs')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      }
      if (p.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      }
      if (p.includes('dist/assets') || p.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Multer disk storage for e-signature documents (uploads/documents, uploads/signatures)
const uploadsBase = path.join(__dirname, 'uploads');
const documentsDir = path.join(uploadsBase, 'documents');
const signaturesDir = path.join(uploadsBase, 'signatures');
const signedDir = path.join(uploadsBase, 'signed');
[documentsDir, signaturesDir, signedDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
const esignDocumentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, documentsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.pdf';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const esignDocumentUpload = multer({ storage: esignDocumentStorage });

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

    // E-Signature collections
    const esignDocumentsCollection = db.collection('esign_documents');
    await esignDocumentsCollection.createIndex({ created_at: -1 });
    await esignDocumentsCollection.createIndex({ status: 1 });
    await esignDocumentsCollection.createIndex({ uploaded_by: 1 });
    const signatureFieldsCollection = db.collection('signature_fields');
    await signatureFieldsCollection.createIndex({ document_id: 1 });
    const esignRecipientsCollection = db.collection('esign_recipients');
    await esignRecipientsCollection.createIndex({ document_id: 1 });
    // Ensure signing_token index is SPARSE so multiple recipients without a token don't cause E11000
    try {
      await esignRecipientsCollection.dropIndex('signing_token_1');
    } catch (_) {
      // Ignore if index doesn't exist
    }
    await esignRecipientsCollection.updateMany(
      { signing_token: null },
      { $unset: { signing_token: '' } }
    );
    await esignRecipientsCollection.createIndex({ signing_token: 1 }, { unique: true, sparse: true });
    const esignSignatureSecretsCollection = db.collection('esign_signature_secrets');
    await esignSignatureSecretsCollection.createIndex(
      { document_id: 1, recipient_id: 1, field_index: 1 },
      { unique: true }
    );
    const auditLogsCollection = db.collection('audit_logs');
    await auditLogsCollection.createIndex({ document_id: 1 });
    await auditLogsCollection.createIndex({ timestamp: -1 });
    console.log('✅ E-Signature collections ready');
    
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
    const collections = ['quotes', 'templates', 'pricing_tiers', 'exhibits'];
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
function formatUsdAmount(value) {
  const n = Number(value || 0);
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Approval portal access tokens (secure links for role-based portals)
const APPROVAL_TOKEN_EXPIRY_DAYS = 7;
async function createApprovalAccessToken(db, workflowId, role) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + APPROVAL_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  await db.collection('approval_access_tokens').updateOne(
    { workflowId, role },
    { $set: { workflowId, role, token, expiresAt, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
  return token;
}

function generateTeamEmailHTML(workflowData, token) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
  const approvalLink = token
    ? `${baseUrl}/approval/${workflowData.workflowId}?role=teamlead&token=${encodeURIComponent(token)}`
    : `${baseUrl}/team-approval?workflow=${workflowData.workflowId}`;
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
            <p><strong>Requested by:</strong> ${workflowData.requestedByName || workflowData.creatorEmail || '—'}</p>
            <p><strong>Document ID:</strong> ${workflowData.documentId}</p>
            <p><strong>Client:</strong> ${workflowData.clientName}</p>
            <p><strong>Amount:</strong> $${formatUsdAmount(workflowData.amount)}</p>
            <p><strong>Workflow ID:</strong> ${workflowData.workflowId}</p>
            <p><strong>📎 Document:</strong> The PDF document is attached to this email for your review.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${approvalLink}" 
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
function generateManagerEmailHTML(workflowData, token) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
  const approvalLink = token
    ? `${baseUrl}/approval/${workflowData.workflowId}?role=technical&token=${encodeURIComponent(token)}`
    : `${baseUrl}/technical-approval?workflow=${workflowData.workflowId}`;
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
            <p><strong>Requested by:</strong> ${workflowData.requestedByName || workflowData.creatorEmail || '—'}</p>
            <p><strong>Document ID:</strong> ${workflowData.documentId}</p>
            <p><strong>Client:</strong> ${workflowData.clientName}</p>
            <p><strong>Amount:</strong> $${formatUsdAmount(workflowData.amount)}</p>
            <p><strong>Workflow ID:</strong> ${workflowData.workflowId}</p>
            <p><strong>📎 Document:</strong> The PDF document is attached to this email for your review.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${approvalLink}" 
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

function generateCEOEmailHTML(workflowData, token) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
  const approvalLink = token
    ? `${baseUrl}/approval/${workflowData.workflowId}?role=legal&token=${encodeURIComponent(token)}`
    : `${baseUrl}/legal-approval?workflow=${workflowData.workflowId}`;
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
            <p><strong>Requested by:</strong> ${workflowData.requestedByName || workflowData.creatorEmail || '—'}</p>
            <p><strong>Document ID:</strong> ${workflowData.documentId}</p>
            <p><strong>Client:</strong> ${workflowData.clientName}</p>
            <p><strong>Amount:</strong> $${formatUsdAmount(workflowData.amount)}</p>
            <p><strong>Workflow ID:</strong> ${workflowData.workflowId}</p>
            <p><strong>📎 Document:</strong> The PDF document is attached to this email for your review.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${approvalLink}" 
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
            <p><strong>Amount:</strong> $${formatUsdAmount(workflowData.amount)}</p>
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
  const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
  const downloadLink = workflowData.workflowId && workflowData.documentId
    ? `${baseUrl}/api/approval-workflows/${workflowData.workflowId}/document`
    : null;
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
          
          <p>The approval workflow has been completed successfully. The <strong>final signed document</strong> is attached to this email.</p>
          
          <div style="background: #EFF6FF; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #93C5FD;">
            <h3>📄 Document Details</h3>
            <p><strong>Document ID:</strong> ${workflowData.documentId}</p>
            <p><strong>Client:</strong> ${workflowData.clientName}</p>
            <p><strong>Amount:</strong> $${formatUsdAmount(workflowData.amount)}</p>
            <p><strong>Status:</strong> All Approvals Complete</p>
            <p><strong>📎 Final signed PDF:</strong> The approved document is attached to this email.</p>
            ${downloadLink ? `
            <p style="margin-top: 12px;"><a href="${downloadLink}" style="color: #2563EB; font-weight: bold;">Download the final signed document</a></p>
            ` : ''}
          </div>
          
          <div style="background: #F0FDF4; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #BBF7D0;">
            <h3>✅ Approval Summary</h3>
            <ul style="margin: 0; padding-left: 20px;">
              <li>✅ Team Lead - Approved</li>
              <li>✅ Technical Team - Approved</li>
              <li>✅ Legal Team - Approved</li>
            </ul>
          </div>
          
          <p>The document is now ready for your review and any necessary follow-up actions. Deal Desk does not have an approval dashboard; this email and attachment are your delivery.</p>
          
          <div style="background: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #F59E0B;">
            <p style="margin: 0; color: #92400E; font-weight: bold;">📋 Next Steps</p>
            <p style="margin: 5px 0 0 0; color: #92400E; font-size: 14px;">
              Please review the final signed document and proceed with any necessary deal desk processes.
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
            <p><strong>Amount:</strong> $${formatUsdAmount(workflowData.amount)}</p>
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

    if (error.code === 401) {
      console.error('📧 SendGrid 401 Unauthorized — check SENDGRID_API_KEY in .env:');
      console.error('   1. Create an API key at https://app.sendgrid.com/settings/api_keys (Mail Send permission)');
      console.error('   2. Set in .env: SENDGRID_API_KEY=SG.xxxx... (no quotes, no spaces)');
      console.error('   3. Restart the server after changing .env');
    }
    if (error.code === 403) {
      console.error('📧 SendGrid 403 Forbidden — verify your sender (EMAIL_FROM) in SendGrid:');
      console.error('   Go to https://app.sendgrid.com/settings/sender_auth and verify', emailPayload.from, 'or your domain.');
    }

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

// Notify document creator by email when a recipient denies (review or sign)
async function sendEsignDeniedNotificationToCreator(doc, recipient, comment, deniedBy) {
  const creatorEmail = (doc && doc.uploaded_by) ? String(doc.uploaded_by).trim() : '';
  if (!creatorEmail || !creatorEmail.includes('@')) return;
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('📧 E-sign denied notification: SENDGRID_API_KEY not set — creator not emailed.');
    return;
  }
  const fileName = doc.file_name || 'Document';
  const recipientLabel = recipient.name || recipient.email || 'A recipient';
  const subject = `E-sign document denied: ${fileName}`;
  const commentBlock = comment ? `<p><strong>Comment from ${recipientLabel}:</strong></p><p>${comment.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` : '';
  const html = `
    <p>Your e-sign document has been denied.</p>
    <p><strong>Document:</strong> ${fileName.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    <p><strong>Denied by:</strong> ${recipientLabel} (${deniedBy === 'review' ? 'reviewer' : 'signer'})</p>
    ${commentBlock}
    <p>You can view the status and any comments in e sign status in the app.</p>
  `;
  try {
    const result = await sendEmail(creatorEmail, subject, html);
    if (result.success) console.log('✅ E-sign denied notification sent to creator', creatorEmail);
    else console.warn('❌ E-sign denied notification not sent to creator', creatorEmail, result.error);
  } catch (err) {
    console.warn('E-sign denied notification to creator failed', creatorEmail, err?.message || err);
  }
}

// NOTE: Static files are already served above with cache-safe headers (do not duplicate express.static).

// HubSpot redirect handler - only when deal/contact params present; otherwise SPA handles /
app.get('/hubspot-landing', (req, res) => {
  const dealId = req.query.dealId;
  const dealName = req.query.dealName;
  const amount = req.query.amount;
  const closeDate = req.query.closeDate;
  const stage = req.query.stage;
  const ownerId = req.query.ownerId;
  const contactEmail = req.query.ContactEmail;
  const contactFirstName = req.query.ContactFirstName;
  const contactLastName = req.query.ContactLastName;
  const companyName = req.query.CompanyName;
  const companyByContact = req.query.CompanyByContact || req.query.CompanyFromContact;
  console.log({
    deal: { dealId, dealName, amount, closeDate, stage, ownerId },
    contact: { email: contactEmail, firstName: contactFirstName, lastName: contactLastName },
    company: { name: companyName, byContact: companyByContact }
  });
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

    // Create user (default role: viewer; set role to 'exhibit_admin' in DB for users who can manage exhibits)
    const user = {
      id: `user_${Date.now()}`,
      name: name,
      email: email,
      password: hashedPassword,
      provider: 'email',
      role: 'viewer',
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

    // Return user without password (ensure role for frontend: from DB, .env, or settings list)
    const { password: _, ...userWithoutPassword } = user;
    const isAdmin = user.role === 'exhibit_admin' || isExhibitAdminByEnv(user.email) || (await getExhibitAdminEmailsFromDb()).some((e) => String(e).trim().toLowerCase() === (user.email || '').trim().toLowerCase());
    const effectiveRole = user.role || (isAdmin ? 'exhibit_admin' : 'viewer');
    const userResponse = { ...userWithoutPassword, role: effectiveRole };

    res.json({
      success: true,
      user: userResponse
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
      // Create new user (default role: viewer; set role to 'exhibit_admin' in DB for users who can manage exhibits)
      user = {
        id: id || `microsoft_${Date.now()}`,
        name: name,
        email: email,
        provider: 'microsoft',
        role: 'viewer',
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

    // Return user without password (ensure role for frontend: from DB, .env, or settings list)
    const { password: __, ...userWithoutPassword } = user;
    const dbEmails = await getExhibitAdminEmailsFromDb();
    const isAdmin = user.role === 'exhibit_admin' || isExhibitAdminByEnv(user.email) || dbEmails.some((e) => String(e).trim().toLowerCase() === (user.email || '').trim().toLowerCase());
    const effectiveRole = user.role || (isAdmin ? 'exhibit_admin' : 'viewer');
    const userResponse = { ...userWithoutPassword, role: effectiveRole };

    res.json({
      success: true,
      message: 'Microsoft authentication successful',
      user: userResponse,
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

    const { name, description, isDefault, combination, planType, category } = req.body;
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
      fileSize: file.size,
      combination: combination || '(none)',
      planType: planType || '(none)',
      category: category || '(none)'
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
    // Optional: link template to a combination/plan/category (e.g. multi-combination)
    if (combination && String(combination).trim()) template.combination = String(combination).trim().toLowerCase();
    if (planType && String(planType).trim()) template.planType = String(planType).trim().toLowerCase();
    if (category && String(category).trim()) template.category = String(category).trim().toLowerCase();
    
    await db.collection('templates').insertOne(template);

      console.log('✅ Template saved to database:', templateId);
      
      const responseTemplate = {
        id: templateId,
        name: name || file.originalname,
        description: description || '',
        fileName: file.originalname,
        fileType,
        fileSize: file.size,
        isDefault: isDefault === 'true' || false,
        createdAt: new Date().toISOString()
      };
      if (template.combination) responseTemplate.combination = template.combination;
      if (template.planType) responseTemplate.planType = template.planType;
      if (template.category) responseTemplate.category = template.category;
      
      res.json({
        success: true,
        message: 'Template uploaded successfully',
        template: responseTemplate
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
    
    // Check if template has fileData
    if (!template.fileData) {
      console.error('❌ Template has no fileData:', template.id);
      return res.status(500).json({ 
        success: false, 
        error: 'Template file data is missing',
        message: `Template ${template.id} exists but has no file data. Please re-upload the template.`
      });
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
      console.error('❌ Unsupported fileData format for template:', template.id, typeof template.fileData);
      throw new Error('Unsupported template fileData format');
    }
    
    // Validate that the buffer is not empty
    if (fileBuffer.length === 0) {
      console.error('❌ Template file buffer is empty:', template.id);
      return res.status(500).json({ 
        success: false, 
        error: 'Template file is empty',
        message: `Template ${template.id} file data is empty. Please re-upload the template.`
      });
    }
    
    // Validate DOCX signature for DOCX files (ZIP signature: PK)
    if (contentType.includes('wordprocessingml')) {
      if (fileBuffer.length < 4 || fileBuffer[0] !== 0x50 || fileBuffer[1] !== 0x4B) {
        console.error('❌ Template file is not a valid DOCX (missing ZIP signature):', template.id);
        // Log first bytes for debugging
        const firstBytes = fileBuffer.slice(0, Math.min(20, fileBuffer.length)).toString('hex');
        console.error('   First bytes:', firstBytes);
        
        return res.status(500).json({ 
          success: false, 
          error: 'Template file is corrupted',
          message: `Template ${template.id} file is not a valid DOCX file (missing ZIP signature). Please re-upload the template.`
        });
      }
    }
    
    console.log('✅ Sending template file:', {
      id: template.id,
      fileName: template.fileName,
      size: fileBuffer.length,
      contentType
    });
    
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
// COMBINATIONS API ENDPOINTS (user-managed list for Configure dropdown)
// ============================================

// Get all combinations (optional filter by migrationType; exclude fileData from list)
app.get('/api/combinations', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }
    const { migrationType } = req.query;
    const query = migrationType ? { migrationType: String(migrationType) } : {};
    const raw = await db.collection('combinations')
      .find(query, { projection: { fileData: 0 } })
      .sort({ displayOrder: 1, label: 1 })
      .toArray();
    const combinations = raw.map(c => ({ ...c, hasFile: !!(c.fileName) }));
    res.json({ success: true, combinations, count: combinations.length });
  } catch (error) {
    console.error('Error fetching combinations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get combination file (download uploaded document)
app.get('/api/combinations/:id/file', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }
    const { id } = req.params;
    const combo = await db.collection('combinations').findOne({ id }, { projection: { fileData: 1, fileName: 1, fileType: 1 } });
    if (!combo || !combo.fileData) {
      return res.status(404).json({ success: false, error: 'Combination or file not found' });
    }
    const buf = Buffer.from(combo.fileData, 'base64');
    const fileName = combo.fileName || `combination-${id}.docx`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', combo.fileType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buf);
  } catch (error) {
    console.error('Error fetching combination file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const ALLOWED_MIGRATION_TYPES = ['Messaging', 'Content', 'Email', 'Multi combination', 'Overage Agreement'];

// Create combination (optional file upload - e.g. DOCX template for this combination)
app.post('/api/combinations', upload.single('file'), async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }
    const { value, label, migrationType, displayOrder } = req.body || {};
    if (!value || !String(value).trim()) {
      return res.status(400).json({ success: false, error: 'value is required' });
    }
    if (!label || !String(label).trim()) {
      return res.status(400).json({ success: false, error: 'label is required' });
    }
    const mt = migrationType != null ? String(migrationType).trim() : '';
    if (!mt) {
      return res.status(400).json({ success: false, error: 'migrationType is required' });
    }
    if (!ALLOWED_MIGRATION_TYPES.includes(mt)) {
      return res.status(400).json({ success: false, error: `migrationType must be one of: ${ALLOWED_MIGRATION_TYPES.join(', ')}` });
    }
    const val = String(value).trim().toLowerCase().replace(/\s+/g, '-');
    const existing = await db.collection('combinations').findOne({ value: val, migrationType: mt });
    if (existing) {
      return res.status(409).json({ success: false, error: 'A combination with this value and migration type already exists' });
    }
    const doc = {
      id: `combo-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      value: val,
      label: String(label).trim(),
      migrationType: mt,
      displayOrder: typeof displayOrder === 'number' ? displayOrder : (parseInt(displayOrder, 10) || 999),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    if (req.file && req.file.buffer) {
      doc.fileName = req.file.originalname;
      doc.fileSize = req.file.size;
      doc.fileData = req.file.buffer.toString('base64');
      doc.fileType = req.file.mimetype || (req.file.originalname.toLowerCase().endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/octet-stream');
    }
    await db.collection('combinations').insertOne(doc);
    const responseCombo = { id: doc.id, value: doc.value, label: doc.label, migrationType: doc.migrationType, displayOrder: doc.displayOrder, createdAt: doc.createdAt, updatedAt: doc.updatedAt };
    if (doc.fileName) responseCombo.hasFile = true;
    res.status(201).json({ success: true, combination: responseCombo });
  } catch (error) {
    console.error('Error creating combination:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update combination
app.put('/api/combinations/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }
    const { id } = req.params;
    const { value, label, migrationType, displayOrder } = req.body || {};
    const update = { updatedAt: new Date() };
    if (value !== undefined) update.value = String(value).trim().toLowerCase().replace(/\s+/g, '-');
    if (label !== undefined) update.label = String(label).trim();
    if (migrationType !== undefined) update.migrationType = String(migrationType).trim();
    if (displayOrder !== undefined) update.displayOrder = typeof displayOrder === 'number' ? displayOrder : parseInt(displayOrder, 10) || 999;
    const result = await db.collection('combinations').updateOne(
      { id },
      { $set: update }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: 'Combination not found' });
    }
    const updated = await db.collection('combinations').findOne({ id }, { projection: { fileData: 0 } });
    const out = { ...updated, hasFile: !!(updated && updated.fileName) };
    res.json({ success: true, combination: out });
  } catch (error) {
    console.error('Error updating combination:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload or replace combination template file (backend combination template)
app.post('/api/combinations/:id/file', upload.single('file'), async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }
    const { id } = req.params;
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'File is required' });
    }
    const combo = await db.collection('combinations').findOne({ id });
    if (!combo) {
      return res.status(404).json({ success: false, error: 'Combination not found' });
    }
    const update = {
      updatedAt: new Date(),
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileData: req.file.buffer.toString('base64'),
      fileType: req.file.mimetype || (req.file.originalname.toLowerCase().endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/octet-stream')
    };
    await db.collection('combinations').updateOne(
      { id },
      { $set: update }
    );
    const updated = await db.collection('combinations').findOne({ id }, { projection: { fileData: 0 } });
    const out = { ...updated, hasFile: true };
    res.json({ success: true, combination: out });
  } catch (error) {
    console.error('Error uploading combination file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete combination (admin only: require exhibit_admin or admin role)
app.delete('/api/combinations/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }
    const authUser = await getExhibitAdminUser(req, res);
    if (!authUser) return;
    const { id } = req.params;
    const result = await db.collection('combinations').deleteOne({ id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Combination not found' });
    }
    res.json({ success: true, message: 'Combination deleted' });
  } catch (error) {
    console.error('Error deleting combination:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Seed default combinations (from current hardcoded list) so Configure dropdown is populated
app.post('/api/combinations/seed', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }
    const defaults = [
      { value: 'slack-to-teams', label: 'SLACK TO TEAMS', migrationType: 'Messaging', displayOrder: 1 },
      { value: 'slack-to-google-chat', label: 'SLACK TO GOOGLE CHAT', migrationType: 'Messaging', displayOrder: 2 },
      { value: 'gmail-to-outlook', label: 'GMAIL TO OUTLOOK', migrationType: 'Email', displayOrder: 1 },
      { value: 'gmail-to-gmail', label: 'GMAIL TO GMAIL', migrationType: 'Email', displayOrder: 2 },
      { value: 'outlook-to-outlook', label: 'OUTLOOK TO OUTLOOK', migrationType: 'Email', displayOrder: 3 },
      { value: 'outlook-to-gmail', label: 'OUTLOOK TO GMAIL', migrationType: 'Email', displayOrder: 4 },
      { value: 'overage-agreement', label: 'OVERAGE AGREEMENT', migrationType: 'Overage Agreement', displayOrder: 1 },
      { value: 'multi-combination', label: 'ORIGINAL MULTI COMBINATION', migrationType: 'Multi combination', displayOrder: 1 },
      { value: 'dropbox-to-google', label: 'DROPBOX TO GOOGLE (SHARED DRIVE/MYDRIVE)', migrationType: 'Content', displayOrder: 1 },
      { value: 'dropbox-to-microsoft', label: 'DROPBOX TO MICROSOFT (ONEDRIVE/SHAREPOINT)', migrationType: 'Content', displayOrder: 2 },
      { value: 'dropbox-to-box', label: 'DROPBOX TO BOX', migrationType: 'Content', displayOrder: 3 },
      { value: 'dropbox-to-onedrive', label: 'DROPBOX TO ONEDRIVE', migrationType: 'Content', displayOrder: 4 },
      { value: 'dropbox-to-egnyte', label: 'DROPBOX TO EGNYTE', migrationType: 'Content', displayOrder: 5 },
      { value: 'box-to-box', label: 'BOX TO BOX', migrationType: 'Content', displayOrder: 6 },
      { value: 'box-to-dropbox', label: 'BOX TO DROPBOX', migrationType: 'Content', displayOrder: 7 },
      { value: 'onedrive-to-onedrive', label: 'ONEDRIVE TO ONEDRIVE', migrationType: 'Content', displayOrder: 8 },
      { value: 'egnyte-to-microsoft', label: 'EGNYTE TO MICROSOFT (ONEDRIVE/SHAREPOINT)', migrationType: 'Content', displayOrder: 9 }
    ];
    let inserted = 0;
    for (const d of defaults) {
      const existing = await db.collection('combinations').findOne({ value: d.value, migrationType: d.migrationType });
      if (!existing) {
        await db.collection('combinations').insertOne({
          id: `combo-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          ...d,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        inserted++;
      }
    }
    const total = await db.collection('combinations').countDocuments();
    res.json({ success: true, message: `Seed complete. Inserted ${inserted} new combinations. Total: ${total}.` });
  } catch (error) {
    console.error('Error seeding combinations:', error);
    res.status(500).json({ success: false, error: error.message });
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

// Helper: true if email is in EXHIBIT_ADMIN_EMAILS (.env comma-separated list). No DB update needed.
// In .env add: EXHIBIT_ADMIN_EMAILS=user1@cloudfuze.com,user2@cloudfuze.com
function isExhibitAdminByEnv(email) {
  const list = process.env.EXHIBIT_ADMIN_EMAILS;
  if (!list || typeof list !== 'string') return false;
  const emails = list.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return emails.includes((email || '').trim().toLowerCase());
}

// Get exhibit admin emails stored in DB (settings collection). Used by admin UI.
async function getExhibitAdminEmailsFromDb() {
  if (!db) return [];
  try {
    const doc = await db.collection('settings').findOne({ _id: 'exhibit_admins' });
    return Array.isArray(doc?.emails) ? doc.emails : [];
  } catch (e) {
    return [];
  }
}

// Resolve effective exhibit_admin: from DB role, .env EXHIBIT_ADMIN_EMAILS, or DB settings.exhibit_admins list
async function hasExhibitAdminAccess(user) {
  if (!user) return false;
  if (user.role === 'exhibit_admin') return true;
  if (isExhibitAdminByEnv(user.email)) return true;
  const dbEmails = await getExhibitAdminEmailsFromDb();
  const normalized = (user.email || '').trim().toLowerCase();
  return dbEmails.some((e) => String(e).trim().toLowerCase() === normalized);
}

// Helper: require JWT and exhibit_admin (from DB role, .env, or settings list). Returns user or sends 401/403 and null.
async function getExhibitAdminUser(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return null;
  }
  if (token.split('.').length !== 3) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return null;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.collection('users').findOne({ id: decoded.userId });
    if (!user) {
      res.status(401).json({ success: false, error: 'User not found' });
      return null;
    }
    if (!(await hasExhibitAdminAccess(user))) {
      res.status(403).json({ success: false, error: 'Only exhibit admins can add, edit, or delete exhibits' });
      return null;
    }
    return user;
  } catch (e) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return null;
  }
}

// ============================================
// EXHIBIT ADMINS SETTINGS (admin UI to add/remove emails)
// ============================================

// GET list of exhibit admin emails (from DB settings). Requires exhibit_admin.
app.get('/api/settings/exhibit-admins', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
    const authUser = await getExhibitAdminUser(req, res);
    if (!authUser) return;
    const emails = await getExhibitAdminEmailsFromDb();
    res.json({ success: true, emails });
  } catch (e) {
    console.error('GET exhibit-admins error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST add an email to exhibit admins list. Requires exhibit_admin.
app.post('/api/settings/exhibit-admins', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
    const authUser = await getExhibitAdminUser(req, res);
    if (!authUser) return;
    const { email } = req.body || {};
    const trimmed = (email && String(email).trim()) || '';
    if (!trimmed || !trimmed.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid email is required' });
    }
    const normalized = trimmed.toLowerCase();
    const doc = await db.collection('settings').findOne({ _id: 'exhibit_admins' });
    const emails = Array.isArray(doc?.emails) ? doc.emails : [];
    if (emails.map((e) => String(e).trim().toLowerCase()).includes(normalized)) {
      return res.json({ success: true, emails, message: 'Email already in list' });
    }
    const updated = [...emails, trimmed];
    await db.collection('settings').updateOne(
      { _id: 'exhibit_admins' },
      { $set: { emails: updated, updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ success: true, emails: updated });
  } catch (e) {
    console.error('POST exhibit-admins error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE remove an email from exhibit admins list. Requires exhibit_admin.
app.delete('/api/settings/exhibit-admins/:email', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
    const authUser = await getExhibitAdminUser(req, res);
    if (!authUser) return;
    const emailParam = decodeURIComponent((req.params.email || '').trim());
    if (!emailParam) return res.status(400).json({ success: false, error: 'Email required' });
    const doc = await db.collection('settings').findOne({ _id: 'exhibit_admins' });
    const emails = Array.isArray(doc?.emails) ? doc.emails : [];
    const normalized = emailParam.toLowerCase();
    const updated = emails.filter((e) => String(e).trim().toLowerCase() !== normalized);
    await db.collection('settings').updateOne(
      { _id: 'exhibit_admins' },
      { $set: { emails: updated, updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ success: true, emails: updated });
  } catch (e) {
    console.error('DELETE exhibit-admins error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Upload new exhibit (POST)
app.post('/api/exhibits', upload.single('file'), async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'Database not available' 
      });
    }

    const authUser = await getExhibitAdminUser(req, res);
    if (!authUser) return;

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

    // Get metadata from request body
    const {
      name,
      description = '',
      category,
      combinations,
      planType = '',
      includeType = '',
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

    // Include type: included | notincluded (from upload selection)
    let finalIncludeType = (includeType && String(includeType).trim().toLowerCase()) || '';
    if (finalIncludeType && finalIncludeType !== 'included' && finalIncludeType !== 'notincluded') {
      return res.status(400).json({ success: false, error: 'includeType must be "included" or "notincluded".' });
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

    // Derive includeType from combination if not provided (for backward compatibility)
    if (!finalIncludeType && combinationsArray.length > 0 && combinationsArray[0] !== 'all') {
      const combo = String(combinationsArray[0]).toLowerCase();
      if (combo.includes('notincluded') || combo.includes('not-include') || combo.includes('not include')) {
        finalIncludeType = 'notincluded';
      } else {
        finalIncludeType = 'included';
      }
    }
    if (!finalIncludeType) finalIncludeType = 'included';

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
      includeType: finalIncludeType, // included | notincluded (from upload selection)
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

    const authUser = await getExhibitAdminUser(req, res);
    if (!authUser) return;

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
    if (req.body.includeType !== undefined) {
      const includeTypeValue = (req.body.includeType && String(req.body.includeType).trim().toLowerCase()) || '';
      if (includeTypeValue && includeTypeValue !== 'included' && includeTypeValue !== 'notincluded') {
        return res.status(400).json({ success: false, error: 'includeType must be "included" or "notincluded".' });
      }
      updateData.includeType = includeTypeValue || (existing.includeType || 'included');
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

    const authUser = await getExhibitAdminUser(req, res);
    if (!authUser) return;

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

    const hasFatalLibreOfficeStderr = (stderrText) => {
      const s = String(stderrText || '').toLowerCase();
      // LibreOffice sometimes returns exit code 0 but prints fatal errors to stderr and produces no PDF.
      return (
        s.includes('document is empty') ||
        s.includes('source file could not be loaded') ||
        s.includes('could not find platform independent libraries') ||
        s.includes('error: source file could not be loaded') ||
        s.includes('parser error') ||
        s.includes('fatal')
      );
    };

    // Method 1: Direct LibreOffice system call (most reliable for exact formatting)
    console.log('📄 Trying direct LibreOffice conversion...');
    try {
      const os = require('os');
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpq-'));
      const inputPath = path.join(tmpDir, `${uuidv4()}.docx`);
      
      // Write DOCX to temp file
      fs.writeFileSync(inputPath, req.file.buffer);
      console.log('📄 Temp DOCX written:', inputPath);
      
      // Use LibreOffice to convert
      const isWindows = os.platform() === 'win32';
      let sofficeCmd = process.env.SOFFICE_PATH || (isWindows ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe' : 'libreoffice');
      // On Windows, prefer soffice.com for headless conversions (more reliable/no GUI subsystem).
      if (isWindows && !process.env.SOFFICE_PATH) {
        try {
          const candidateCom = sofficeCmd.replace(/soffice\.exe$/i, 'soffice.com');
          if (fs.existsSync(candidateCom)) {
            sofficeCmd = candidateCom;
          }
        } catch {}
      }
      console.log('📄 Using LibreOffice:', sofficeCmd);
      const sofficeCwd = isWindows ? path.dirname(sofficeCmd) : process.cwd();

      // Use an isolated LibreOffice profile to avoid "profile locked"/corruption issues
      const loProfileDir = path.join(tmpDir, 'lo-profile');
      try { fs.mkdirSync(loProfileDir, { recursive: true }); } catch {}
      const toFileUri = (p) => {
        const norm = p.replace(/\\/g, '/');
        return norm.match(/^[A-Za-z]:\//) ? `file:///${norm}` : `file://${norm}`;
      };
      const userInstallationArg = `-env:UserInstallation=${toFileUri(loProfileDir)}`;
      
      const { spawn } = require('child_process');
      const conversionArgs = [
        '--headless',
        '--nologo',
        '--nolockcheck',
        '--nofirststartwizard',
        '--norestore',
        userInstallationArg,
        // Use explicit writer export to reduce variability across installs
        '--convert-to', 'pdf:writer_pdf_Export',
        '--outdir', tmpDir,
        inputPath
      ];
      console.log('📄 LibreOffice args:', conversionArgs);

      const conversion = spawn(sofficeCmd, conversionArgs, {
        stdio: 'pipe',
        cwd: sofficeCwd,
        env: {
          ...process.env,
          // Help LibreOffice find its bundled DLLs on Windows when launched from Node
          PATH: isWindows ? `${sofficeCwd};${process.env.PATH || ''}` : (process.env.PATH || '')
        }
      });
      
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
          
          let finalPdfPath = expectedPdfPath;
          if (!fs.existsSync(finalPdfPath)) {
            // Some LibreOffice builds output a different filename; scan tmpDir for any .pdf
            try {
              const pdfs = fs.readdirSync(tmpDir).filter((f) => f.toLowerCase().endsWith('.pdf'));
              if (pdfs.length > 0) {
                finalPdfPath = path.join(tmpDir, pdfs[0]);
                console.log('📄 PDF not found at expected path; using discovered PDF:', finalPdfPath);
              }
            } catch {}
          }

          if (!fs.existsSync(finalPdfPath)) {
            // Only now, if no PDF exists, treat fatal stderr patterns as a real failure signal.
            if (hasFatalLibreOfficeStderr(stderr)) {
              reject(new Error(`LibreOffice conversion failed (fatal stderr detected, no PDF produced): ${stderr}`));
              return;
            }
            reject(new Error(`PDF not found after LibreOffice conversion. stderr: ${stderr}`));
            return;
          }

          try {
            const st = fs.statSync(finalPdfPath);
            if (!st || st.size === 0) {
              if (hasFatalLibreOfficeStderr(stderr)) {
                reject(new Error(`LibreOffice conversion failed (fatal stderr detected, empty PDF): ${stderr}`));
                return;
              }
              reject(new Error(`LibreOffice produced an empty PDF. stderr: ${stderr}`));
              return;
            }
          } catch (statErr) {
            reject(new Error(`Unable to stat generated PDF. stderr: ${stderr}`));
            return;
          }

          // At this point we have a non-empty PDF. Even if stderr contains scary messages,
          // accept the PDF and just log the stderr as a warning.
          if (stderr && String(stderr).trim().length > 0) {
            console.warn('⚠️ LibreOffice produced a PDF but stderr was not empty (continuing):', stderr);
          }
          
          const pdfBuffer = fs.readFileSync(finalPdfPath);
          console.log('✅ PDF generated successfully with LibreOffice');
          console.log('📄 PDF size:', pdfBuffer.length, 'bytes');
          
          // Cleanup
          try { fs.unlinkSync(inputPath); } catch {}
          try { fs.unlinkSync(finalPdfPath); } catch {}
          try { fs.rmSync(loProfileDir, { recursive: true, force: true }); } catch {}
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

    // Method 2: Use libreoffice-convert package (if available)
    if (libre && typeof libre.convertAsync === 'function') {
      try {
        console.log('📄 Trying libreoffice-convert package...');
        const pdfBuffer = await libre.convertAsync(req.file.buffer, '.pdf', undefined);
        if (pdfBuffer && pdfBuffer.length > 0) {
          console.log('✅ PDF generated successfully with libreoffice-convert');
          res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="agreement.pdf"',
            'Content-Length': pdfBuffer.length
          });
          return res.send(pdfBuffer);
        }
        console.warn('⚠️ libreoffice-convert returned empty output; continuing...');
      } catch (e) {
        console.error('❌ libreoffice-convert failed:', e?.message || e);
      }
    }

    // Method 3: Try local LibreOffice converter service (if running)
    // This is useful when system LibreOffice has path/profile issues.
    if (LIBREOFFICE_SERVICE_URL) {
      try {
        console.log('📄 Trying LibreOffice converter service...', LIBREOFFICE_SERVICE_URL);
        const baseUrl = String(LIBREOFFICE_SERVICE_URL).replace(/\/$/, '');
        const endpoint = `${baseUrl}/convert`;
        const form = new FormData();
        const blob = new Blob([req.file.buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        form.append('file', blob, 'document.docx');
        const resp = await fetch(endpoint, { method: 'POST', body: form });
        if (resp.ok) {
          const ab = await resp.arrayBuffer();
          const pdfBuffer = Buffer.from(ab);
          if (pdfBuffer.length > 0) {
            console.log('✅ PDF converted successfully with converter service');
            res.set({
              'Content-Type': 'application/pdf',
              'Content-Disposition': 'attachment; filename="agreement.pdf"',
              'Content-Length': pdfBuffer.length
            });
            return res.send(pdfBuffer);
          }
        } else {
          const txt = await resp.text();
          console.error('Converter service failed:', resp.status, txt);
        }
      } catch (e) {
        console.error('❌ Converter service request error:', e);
      }
    }

    // Method 4: Try remote Gotenberg service
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

    // Method 5: Simple text-based PDF generation
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
    const { name, description, isDefault, combination, planType, category } = req.body;
    
    console.log('📝 Updating template metadata:', id, { name, description, isDefault, combination, planType, category });
    
    const updateData = {
      updatedAt: new Date().toISOString()
    };
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (combination !== undefined) updateData.combination = combination ? String(combination).trim().toLowerCase() : null;
    if (planType !== undefined) updateData.planType = planType ? String(planType).trim().toLowerCase() : null;
    if (category !== undefined) updateData.category = category ? String(category).trim().toLowerCase() : null;
    
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

    // Create secure token for role-based portal link
    let token = null;
    if (db && workflowData.workflowId) {
      try {
        token = await createApprovalAccessToken(db, workflowData.workflowId, 'technical');
      } catch (err) {
        console.error('❌ Failed to create approval token for technical:', err);
      }
    }

    // Send email to Manager only with attachment (fire-and-forget for faster UX)
    const sendStartedAt = Date.now();
    sendEmail(
      resolvedManagerEmail,
      `Approval Required: ${workflowData.documentId} - ${workflowData.clientName}`,
      generateManagerEmailHTML(workflowData, token),
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

    // Create secure token for role-based portal link
    let token = null;
    if (db && workflowData.workflowId) {
      try {
        token = await createApprovalAccessToken(db, workflowData.workflowId, 'teamlead');
      } catch (err) {
        console.error('❌ Failed to create approval token for team lead:', err);
      }
    }

    // Send email to Team with attachment (fire-and-forget for faster UX)
    const sendStartedAt = Date.now();
    sendEmail(
      resolvedTeamEmail,
      `${teamLabel ? `[${teamLabel}] ` : ''}Approval Required: ${workflowData.documentId} - ${workflowData.clientName}`,
      generateTeamEmailHTML(workflowData, token),
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

    // Create secure token for role-based portal link
    let token = null;
    if (db && workflowData.workflowId) {
      try {
        token = await createApprovalAccessToken(db, workflowData.workflowId, 'legal');
      } catch (err) {
        console.error('❌ Failed to create approval token for legal:', err);
      }
    }

    // Send email to CEO only with attachment (fire-and-forget for faster UX)
    const sendStartedAt = Date.now();
    sendEmail(
      resolvedCeoEmail,
      `Approval Required: ${workflowData.documentId} - ${workflowData.clientName}`,
      generateCEOEmailHTML(workflowData, token),
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

    // Auto-send e-sign document to signers when workflow has esignDocumentId (no creator action needed)
    if (workflowData && workflowData.workflowId && db) {
      try {
        const workflowRecord = await db.collection('approval_workflows').findOne({ id: workflowData.workflowId });
        const esignId = workflowRecord && workflowRecord.esignDocumentId;
        if (esignId) {
          const autoSendResult = await sendDocumentForSignatureInternal(esignId, { uploadedBy: 'approval-auto-send' });
          if (autoSendResult.success && autoSendResult.emails_sent > 0) {
            console.log('✅ Auto-sent e-sign document to', autoSendResult.emails_sent, 'recipient(s) after approval');
          } else if (autoSendResult.success && !autoSendResult.already_sent) {
            console.log('📧 E-sign document marked as sent (no SENDGRID or no recipients)');
          }
        }
      } catch (autoSendErr) {
        console.error('❌ Auto-send to signers after approval failed:', autoSendErr);
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

// ============ E-SIGNATURE BUILT-IN SYSTEM ============
// Document upload (disk storage), signature fields, signing, signed PDF generation

const { ObjectId } = require('mongodb');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

/**
 * Exact field list + order for a signer. MUST match between GET sign-by-token and POST generate-signed
 * (frontend sends field_values keyed by index in this array).
 */
async function getEsignFieldsForRecipient(db, docId, recipientIdStr) {
  const oid = docId instanceof ObjectId ? docId : new ObjectId(String(docId));
  const docRecipients = await db.collection('esign_recipients').find(esignRecipientsDocumentFilter(oid)).toArray();
  const validRecipientIds = new Set(docRecipients.map((r) => r._id.toString()));
  const allFields = await db.collection('signature_fields').find(signatureFieldsDocumentFilter(oid)).sort({ _id: 1 }).toArray();
  const allFieldsNorm = allFields.map((f) => {
    if (!f.recipient_id) return f;
    try {
      if (validRecipientIds.has(f.recipient_id.toString())) return f;
    } catch { /* ignore */ }
    const copy = { ...f };
    delete copy.recipient_id;
    return copy;
  });
  const hasAnyRecipientAssignment = allFieldsNorm.some((f) => f.recipient_id);
  if (hasAnyRecipientAssignment) {
    return allFieldsNorm.filter((f) => {
      if (f.recipient_id == null || f.recipient_id === '') return true;
      try {
        return f.recipient_id.toString() === recipientIdStr;
      } catch {
        return false;
      }
    });
  }
  return allFieldsNorm;
}

/** Same rules as EsignSignPage (signer vs reviewer). */
function recipientIsEsignReviewer(rec) {
  const action = rec.action;
  const role = (rec.role || 'signer').toString();
  return (
    action === 'reviewer' ||
    (action !== 'signer' &&
      (role.toLowerCase() === 'reviewer' || role === 'Technical Team' || role === 'Legal Team'))
  );
}

/** 32-byte AES-256 key from ESIGN_SIGNATURE_ENCRYPTION_KEY (64 hex chars or 32-byte base64). */
function getEsignSignatureEncryptionKey() {
  const raw = process.env.ESIGN_SIGNATURE_ENCRYPTION_KEY;
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex');
  try {
    const b64 = Buffer.from(trimmed, 'base64');
    if (b64.length === 32) return b64;
  } catch (_) { /* ignore */ }
  return crypto.createHash('sha256').update(trimmed, 'utf8').digest();
}

function encryptEsignSignaturePlaintext(plaintextUtf8) {
  const key = getEsignSignatureEncryptionKey();
  if (!key || key.length !== 32) {
    throw new Error('ESIGN_SIGNATURE_ENCRYPTION_KEY must be set (64 hex chars = 32 bytes)');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintextUtf8, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: encrypted, iv, authTag };
}

/** Decrypt only for PDF generation. Never log returned plaintext. */
function decryptEsignSignatureStoredDoc(doc) {
  const key = getEsignSignatureEncryptionKey();
  if (!key || key.length !== 32) {
    throw new Error('ESIGN_SIGNATURE_ENCRYPTION_KEY must be set');
  }
  const toBuf = (b) => {
    if (Buffer.isBuffer(b)) return b;
    if (b?.buffer) return Buffer.from(b.buffer, b.byteOffset, b.byteLength);
    if (typeof b === 'string') return Buffer.from(b, 'base64');
    return Buffer.alloc(0);
  };
  const iv = toBuf(doc.iv);
  const authTag = toBuf(doc.auth_tag);
  const ciphertext = toBuf(doc.ciphertext);
  if (!iv.length || !authTag.length || !ciphertext.length) throw new Error('invalid blob');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// Helper: log audit action
async function logAudit(documentId, action, userEmail, ipAddress) {
  if (!db) return;
  try {
    await db.collection('audit_logs').insertOne({
      document_id: typeof documentId === 'string' ? new ObjectId(documentId) : documentId,
      action,
      user_email: userEmail || 'anonymous',
      timestamp: new Date(),
      ip_address: ipAddress || null
    });
  } catch (e) {
    console.warn('Audit log error:', e?.message);
  }
}

// POST /api/esign/documents/upload - Upload PDF to disk, save metadata
app.post('/api/esign/documents/upload', esignDocumentUpload.single('file'), async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    if (!req.file) return res.status(400).json({ success: false, error: 'No file provided' });

    const uploadedBy = req.body.uploaded_by || 'anonymous';
    const fileName = req.file.originalname;
    const filePath = path.join(documentsDir, req.file.filename);

    const doc = {
      file_name: fileName,
      file_path: filePath,
      uploaded_by: uploadedBy,
      upload_source: 'manual',
      created_at: new Date(),
      status: 'draft'
    };
    const result = await db.collection('esign_documents').insertOne(doc);
    const documentId = result.insertedId.toString();

    await logAudit(documentId, 'uploaded', uploadedBy, req.ip || req.connection?.remoteAddress);

    res.json({
      success: true,
      document: {
        id: documentId,
        file_name: fileName,
        file_path: filePath,
        uploaded_by: uploadedBy,
        upload_source: 'manual',
        created_at: doc.created_at,
        status: 'draft'
      }
    });
  } catch (error) {
    console.error('❌ E-sign document upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/esign/documents/from-approval - Create esign document from approval workflow document (same flow as /esign)
app.post('/api/esign/documents/from-approval', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    const {
      documentId,
      uploaded_by: uploadedBy,
      workflowId,
      requested_by_name: requestedByNameBody,
      requested_by_email: requestedByEmailBody,
    } = req.body || {};
    if (!documentId) return res.status(400).json({ success: false, error: 'documentId is required' });

    const document = await db.collection('documents').findOne({ id: documentId });
    if (!document) return res.status(404).json({ success: false, error: 'Approval document not found' });

    let fileBuffer;
    if (Buffer.isBuffer(document.fileData)) {
      fileBuffer = document.fileData;
    } else if (document.fileData && document.fileData.buffer) {
      fileBuffer = Buffer.from(document.fileData.buffer);
    } else if (typeof document.fileData === 'string') {
      fileBuffer = Buffer.from(document.fileData, 'base64');
    } else {
      return res.status(400).json({ success: false, error: 'Document has no file data' });
    }

    const ext = path.extname(document.fileName || '') || '.pdf';
    const fileName = (document.fileName || `${documentId}.pdf`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const diskFileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const filePath = path.join(documentsDir, diskFileName);
    fs.writeFileSync(filePath, fileBuffer);

    const requestedByName =
      typeof requestedByNameBody === 'string' && requestedByNameBody.trim()
        ? requestedByNameBody.trim()
        : null;
    const requestedByEmail =
      typeof requestedByEmailBody === 'string' && requestedByEmailBody.trim()
        ? requestedByEmailBody.trim()
        : uploadedBy && uploadedBy !== 'approval-workflow'
          ? String(uploadedBy).trim()
          : null;

    const doc = {
      file_name: fileName,
      file_path: filePath,
      uploaded_by: uploadedBy || 'approval-workflow',
      upload_source: 'approval',
      requested_by_name: requestedByName,
      requested_by_email: requestedByEmail,
      created_at: new Date(),
      status: 'draft'
    };
    const result = await db.collection('esign_documents').insertOne(doc);
    const esignId = result.insertedId.toString();

    await logAudit(esignId, 'uploaded', doc.uploaded_by, req.ip || req.connection?.remoteAddress);

    if (workflowId && typeof workflowId === 'string' && workflowId.trim()) {
      try {
        await db.collection('approval_workflows').updateOne(
          { id: workflowId.trim() },
          { $set: { esignDocumentId: esignId, updatedAt: new Date().toISOString() } }
        );
      } catch (linkErr) {
        console.warn('E-sign from-approval: could not link esign doc to workflow', workflowId, linkErr);
      }
    }

    res.json({
      success: true,
      document: {
        id: esignId,
        file_name: doc.file_name,
        file_path: doc.file_path,
        uploaded_by: doc.uploaded_by,
        created_at: doc.created_at,
        status: doc.status
      }
    });
  } catch (error) {
    console.error('❌ E-sign from-approval error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/esign/documents/:id - Get document metadata
app.get('/api/esign/documents/:id', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    let doc;
    try {
      doc = await db.collection('esign_documents').findOne({ _id: new ObjectId(req.params.id) });
    } catch {
      doc = null;
    }
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    if (doc.status === 'voided') return res.status(410).json({ success: false, error: 'This signing request has been voided.' });
    if (req.query.audit === 'open') {
      await logAudit(doc._id.toString(), 'opened', req.query.signer_email || null, req.ip || req.connection?.remoteAddress);
    }
    res.json({
      success: true,
      document: {
        id: doc._id.toString(),
        file_name: doc.file_name,
        file_path: doc.file_path,
        uploaded_by: doc.uploaded_by,
        created_at: doc.created_at,
        status: doc.status,
        signed_file_path: doc.signed_file_path
      }
    });
  } catch (error) {
    console.error('❌ E-sign get document error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/esign/documents/:id/file - Serve PDF file from disk
app.get('/api/esign/documents/:id/file', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    let doc;
    try {
      doc = await db.collection('esign_documents').findOne({ _id: new ObjectId(req.params.id) });
    } catch {
      doc = null;
    }
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    if (doc.status === 'voided') return res.status(410).json({ success: false, error: 'This signing request has been voided.' });
    const filePath = doc.signed_file_path || doc.file_path;
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'File not found' });
    const attachment = req.query.attachment === '1' || req.query.download === '1';
    const safeFileName = (doc.file_name || 'document.pdf').replace(/["\r\n\\]/g, '').trim() || 'document.pdf';
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', attachment ? `attachment; filename="${safeFileName}"` : `inline; filename="${safeFileName}"`);
    if (attachment) res.set('Cache-Control', 'no-store'); // avoid browser using cached inline response
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error('❌ E-sign get file error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/esign/documents/:id/send - Mark as sent (no email sending from this page)
app.post('/api/esign/documents/:id/send', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    const docId = new ObjectId(req.params.id);
    const { signer_email } = req.body || {};

    const doc = await db.collection('esign_documents').findOne({ _id: docId });
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });

    const signingUrl = `${process.env.APP_BASE_URL || 'http://localhost:5173'}/sign/${docId}`;

    await db.collection('esign_documents').updateOne(
      { _id: docId },
      { $set: { status: 'sent', sent_at: new Date(), signer_email: signer_email || null } }
    );

    await logAudit(docId, 'sent', req.body.uploaded_by || 'system', req.ip || req.connection?.remoteAddress);

    res.json({
      success: true,
      signing_url: signingUrl,
      message: 'Document marked as sent'
    });
  } catch (error) {
    console.error('❌ E-sign send document error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/esign/documents/:id - Delete document, its fields, audit logs, and files
app.delete('/api/esign/documents/:id', async (req, res) => {
  const idParam = req.params.id;
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    let docId;
    try { docId = new ObjectId(idParam); } catch {
      console.warn('E-sign DELETE: invalid document id', idParam);
      return res.status(400).json({ success: false, error: 'Invalid document ID' });
    }
    const doc = await db.collection('esign_documents').findOne({ _id: docId });
    if (!doc) {
      console.warn('E-sign DELETE: document not found', idParam);
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    const actorEmail = req.body?.actor_email || req.body?.user_email || '';
    if (!esignActorIsDocumentCreator(doc, actorEmail)) {
      return res.status(403).json({ success: false, error: 'Only the document creator can delete this document' });
    }

    await db.collection('signature_fields').deleteMany(signatureFieldsDocumentFilter(docId));
    await db.collection('esign_recipients').deleteMany({ document_id: docId });
    await db.collection('esign_signature_secrets').deleteMany({
      $or: [{ document_id: docId }, { document_id: docId.toString() }],
    });
    await db.collection('audit_logs').deleteMany({ document_id: docId });
    await db.collection('esign_documents').deleteOne({ _id: docId });

    [doc.file_path, doc.signed_file_path].filter(Boolean).forEach((filePath) => {
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) { console.warn('Could not delete file:', filePath, e.message); }
    });

    console.log('E-sign DELETE: document deleted', idParam, doc.file_name);
    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    console.error('❌ E-sign delete document error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/esign/documents/:id/void - Void a sent document (invalidates links, keeps record)
app.post('/api/esign/documents/:id/void', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    let docId;
    try { docId = new ObjectId(req.params.id); } catch {
      return res.status(400).json({ success: false, error: 'Invalid document ID' });
    }
    const doc = await db.collection('esign_documents').findOne({ _id: docId });
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    const actorEmail = req.body?.actor_email || req.body?.user_email || '';
    if (!esignActorIsDocumentCreator(doc, actorEmail)) {
      return res.status(403).json({ success: false, error: 'Only the document creator can void this document' });
    }
    if (doc.status !== 'sent') {
      return res.status(400).json({ success: false, error: 'Only documents with status "sent" can be voided' });
    }
    await db.collection('esign_recipients').updateMany(
      { document_id: docId },
      { $unset: { signing_token: '' } }
    );
    await db.collection('esign_documents').updateOne(
      { _id: docId },
      { $set: { status: 'voided', voided_at: new Date() } }
    );
    await db.collection('esign_signature_secrets').deleteMany({
      $or: [{ document_id: docId }, { document_id: docId.toString() }],
    });
    try {
      await logAudit(docId.toString(), 'voided', req.body?.voided_by || req.ip || null, req.ip || req.connection?.remoteAddress);
    } catch (auditErr) { /* non-fatal */ }
    console.log('E-sign VOID: document voided', req.params.id, doc.file_name);
    res.json({ success: true, message: 'Document voided. Signing links no longer work.' });
  } catch (error) {
    console.error('❌ E-sign void document error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/esign/documents/:id/recipients - List recipients for a document
app.get('/api/esign/documents/:id/recipients', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    let docId;
    try { docId = new ObjectId(req.params.id); } catch { return res.status(400).json({ success: false, error: 'Invalid document ID' }); }
    const doc = await db.collection('esign_documents').findOne({ _id: docId });
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    const docIdStr = docId.toString();
    const recipients = await db.collection('esign_recipients')
      .find({ $or: [{ document_id: docId }, { document_id: docIdStr }] })
      .sort({ order: 1, _id: 1 })
      .toArray();
    res.json({
      success: true,
      recipients: recipients.map((r) => ({
        id: r._id.toString(),
        name: r.name || r.email || 'Recipient',
        email: r.email,
        role: r.role || 'signer',
        action: r.action || null,
        status: r.status || 'pending',
        order: r.order,
        comment: r.comment || null,
        email_message: r.email_message || null,
        signing_token: r.signing_token || null,
      })),
    });
  } catch (error) {
    console.error('❌ E-sign get recipients error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/esign/documents/:id/recipients - Sync recipients (upsert by email so _id stays stable for signature_fields.recipient_id)
app.post('/api/esign/documents/:id/recipients', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    let docId;
    try { docId = new ObjectId(req.params.id); } catch { return res.status(400).json({ success: false, error: 'Invalid document ID' }); }
    const doc = await db.collection('esign_documents').findOne({ _id: docId });
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    const { recipients: list } = req.body || {};
    if (!Array.isArray(list)) return res.status(400).json({ success: false, error: 'recipients array required' });
    const MAX_EMAIL_MESSAGE_LENGTH = 1000;
    const listFiltered = list.filter((r) => r && (r.email || r.name));
    const existingAll = await db.collection('esign_recipients').find(esignRecipientsDocumentFilter(docId)).toArray();
    const incomingEmails = new Set();

    if (!listFiltered.length) {
      if (existingAll.length) {
        await db.collection('signature_fields').updateMany(
          { $and: [signatureFieldsDocumentFilter(docId), { recipient_id: { $in: existingAll.map((x) => x._id) } }] },
          { $unset: { recipient_id: '' } }
        );
        await db.collection('esign_recipients').deleteMany(esignRecipientsDocumentFilter(docId));
      }
      return res.json({ success: true, recipients: [] });
    }

    for (let idx = 0; idx < listFiltered.length; idx++) {
      const r = listFiltered[idx];
      const email = (r.email || '').trim().toLowerCase();
      if (!email) continue;
      incomingEmails.add(email);
      const name = (r.name || r.email || `Recipient ${idx + 1}`).trim();
      const prev = await db.collection('esign_recipients').findOne({
        $and: [esignRecipientsDocumentFilter(docId), { email }],
      });

      const $set = {
        document_id: docId,
        name,
        email,
        role: r.role || 'signer',
        order: idx,
      };
      if (r.action === 'signer' || r.action === 'reviewer') {
        $set.action = r.action;
      }
      if (r.email_message != null && typeof r.email_message === 'string') {
        const trimmed = r.email_message.trim().slice(0, MAX_EMAIL_MESSAGE_LENGTH);
        if (trimmed) $set.email_message = trimmed;
        else $set.email_message = '';
      }
      const updatePayload = { $set };
      if (r.action !== 'signer' && r.action !== 'reviewer') {
        updatePayload.$unset = { action: '' };
      }

      if (prev) {
        await db.collection('esign_recipients').updateOne({ _id: prev._id }, updatePayload);
      } else {
        const newDoc = {
          document_id: docId,
          name,
          email,
          role: r.role || 'signer',
          status: 'pending',
          order: idx,
        };
        if (r.action === 'signer' || r.action === 'reviewer') newDoc.action = r.action;
        if (r.email_message != null && typeof r.email_message === 'string') {
          const trimmed = r.email_message.trim().slice(0, MAX_EMAIL_MESSAGE_LENGTH);
          if (trimmed) newDoc.email_message = trimmed;
        }
        if (r.signing_token != null && r.signing_token !== '') newDoc.signing_token = r.signing_token;
        await db.collection('esign_recipients').insertOne(newDoc);
      }
    }

    const removed = existingAll.filter((ex) => !incomingEmails.has((ex.email || '').toLowerCase()));
    if (removed.length) {
      const removedIds = removed.map((x) => x._id);
      await db.collection('signature_fields').updateMany(
        { $and: [signatureFieldsDocumentFilter(docId), { recipient_id: { $in: removedIds } }] },
        { $unset: { recipient_id: '' } }
      );
      await db.collection('esign_recipients').deleteMany({ _id: { $in: removedIds } });
    }

    const recipients = await db.collection('esign_recipients').find(esignRecipientsDocumentFilter(docId)).sort({ order: 1, _id: 1 }).toArray();
    res.json({
      success: true,
      recipients: recipients.map((r) => ({
        id: r._id.toString(),
        name: r.name || r.email || 'Recipient',
        email: r.email,
        role: r.role || 'signer',
        action: r.action || null,
        status: r.status || 'pending',
        email_message: r.email_message || null,
      })),
    });
  } catch (error) {
    console.error('❌ E-sign set recipients error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Shared helper: send e-sign document to signers (used by POST route and by approval-completion auto-send)
async function sendDocumentForSignatureInternal(esignDocumentIdStr, options = {}) {
  const { sequential = false, uploadedBy = 'system' } = options;
  if (!db) return { success: false, error: 'Database not available' };
  let docId;
  try {
    docId = new ObjectId(esignDocumentIdStr);
  } catch {
    return { success: false, error: 'Invalid esign document id' };
  }
  const doc = await db.collection('esign_documents').findOne({ _id: docId });
  if (!doc) return { success: false, error: 'Document not found' };
  if (doc.status === 'sent') {
    console.log('📧 E-sign document already sent, skipping auto-send');
    return { success: true, emails_sent: 0, already_sent: true };
  }
  const FRONTEND_DEV = 'http://localhost:5173';
  let baseUrl = (process.env.APP_BASE_URL || '').trim() || FRONTEND_DEV;
  let baseUrlForDashboard = (process.env.APP_BASE_URL || '').trim() || FRONTEND_DEV;
  if (baseUrl.includes('localhost:3001')) {
    baseUrl = FRONTEND_DEV;
    baseUrlForDashboard = FRONTEND_DEV;
  }
  if (baseUrlForDashboard.includes('localhost:3001')) baseUrlForDashboard = FRONTEND_DEV;
  let recipients = await db.collection('esign_recipients').find(esignRecipientsDocumentFilter(docId)).sort({ order: 1, _id: 1 }).toArray();
  if (!recipients.length) return { success: false, error: 'Add at least one recipient before sending' };

  const envelopeHasSigner = recipients.some((r) => !recipientIsEsignReviewer(r));
  if (envelopeHasSigner) {
    const placementFields = await db.collection('signature_fields').find(signatureFieldsDocumentFilter(docId)).toArray();
    if (!placementFields.length) {
      return {
        success: false,
        error:
          'Add at least one field on the document before sending. Signers need at least one signature field (place fields on the PDF first).',
      };
    }
    for (const rec of recipients) {
      if (recipientIsEsignReviewer(rec)) continue;
      const recFields = await getEsignFieldsForRecipient(db, docId, rec._id.toString());
      const hasSignatureField = recFields.some((f) => (f.type || 'signature') === 'signature');
      if (!hasSignatureField) {
        const label = rec.name || rec.email || 'Signer';
        return {
          success: false,
          error: `Each signer needs at least one signature field. "${label}" has none visible for them. Assign a signature field to this signer, or use unassigned fields so all signers share the same placements.`,
        };
      }
    }
  }

  if (sequential) {
    recipients = recipients.slice(0, 1);
  }
  const escapeEmailMessage = (s) => {
    if (!s || typeof s !== 'string') return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\n/g, '<br />');
  };
  const getEsignEmailByRole = (rec, signingUrl, inboxUrl) => {
    const roleLower = (rec.role || 'signer').toString().toLowerCase();
    const nameLower = (rec.name || '').toString().toLowerCase().trim();
    const hasExplicitAction = rec.action === 'signer' || rec.action === 'reviewer';
    const isReviewer = hasExplicitAction ? (rec.action === 'reviewer') : (roleLower === 'reviewer' || rec.role === 'Technical Team' || rec.role === 'Legal Team');
    const ctaText = isReviewer ? 'Review Document' : 'Sign Document';
    const customMessageBlock = (rec.email_message && rec.email_message.trim())
      ? `<p style="margin:1em 0;">${escapeEmailMessage(rec.email_message.trim())}</p>`
      : '';
    // Only show dashboard when Role is explicitly set to a dashboard role (not by name). Role "None" = no dashboard.
    const roleStr = (rec.role || '').toString().trim();
    const isTechnical = roleStr === 'Technical Team';
    const isLegal = roleStr === 'Legal Team';
    const isTeamLead = roleStr === 'Team Lead' || roleStr === 'Team Approval';
    const showDashboardLink = isTechnical || isLegal || isTeamLead;
    const dashboardLabel = isTechnical ? 'E-Sign Technical Dashboard' : isLegal ? 'E-Sign Legal Dashboard' : isTeamLead ? 'E-Sign Team Lead Dashboard' : 'your E-Sign dashboard';
    const openInDashboard = `Open the agreement in your <a href="${inboxUrl}">${dashboardLabel}</a>`;
    if (isReviewer) {
      const dashboardBlock = showDashboardLink
        ? `<p><strong>Option 1 – Open in your dashboard:</strong> ${openInDashboard}. The agreement will appear in your queue; open it from there to review.</p>
        <p><strong>Option 2 – Direct link:</strong> `
        : '<p><strong>Signing link:</strong> ';
      return {
        subject: 'Please review the document',
        html: `<p>Hello${rec.name ? ` ${rec.name}` : ''},</p>
        ${customMessageBlock}<p>You have been requested to <strong>review</strong> a document.</p>
        ${dashboardBlock}<a href="${signingUrl}" style="display:inline-block; padding:10px 20px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:6px;">${ctaText}</a></p>
        <p>Thank you.</p>`
      };
    }
    const signDashboardBlock = showDashboardLink
      ? `<p><strong>Option 1 – Open in your dashboard:</strong> ${openInDashboard}. The agreement will open in your dashboard; you can then review and sign.</p>
        <p><strong>Option 2 – Sign directly:</strong> `
      : '<p><strong>Signing link:</strong> ';
    return {
      subject: 'Please sign the document',
      html: `<p>Hello${rec.name ? ` ${rec.name}` : ''},</p>
        ${customMessageBlock}<p>You have been requested to sign a document.</p>
        ${signDashboardBlock}<a href="${signingUrl}" style="display:inline-block; padding:10px 20px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:6px;">${ctaText}</a></p>
        <p>Thank you.</p>`
    };
  };
  let emailsSent = 0;
  for (const rec of recipients) {
    const token = crypto.randomUUID();
    await db.collection('esign_recipients').updateOne(
      { _id: rec._id },
      { $set: { signing_token: token, status: 'pending' } }
    );
    const signingUrl = `${baseUrl}/sign/${token}`;
    const inboxUrl = `${baseUrlForDashboard}/esign-inbox?token=${encodeURIComponent(token)}`;
    if (process.env.SENDGRID_API_KEY && rec.email) {
      if (emailsSent === 0) {
        console.log('📧 E-sign email URLs:', { signing: signingUrl.substring(0, 60) + '...', dashboard: inboxUrl.substring(0, 60) + '...' });
        console.log('📧 Sender (EMAIL_FROM):', process.env.EMAIL_FROM || 'noreply@yourdomain.com', '— must be verified in SendGrid');
      }
      const { subject, html } = getEsignEmailByRole(rec, signingUrl, inboxUrl);
      try {
        const result = await sendEmail(rec.email, subject, html);
        if (result.success) {
          emailsSent++;
          console.log('✅ E-sign email sent to', rec.email);
        } else {
          console.warn('❌ E-sign email not sent to', rec.email, '—', result.error?.message || result.error?.code || result.error);
        }
      } catch (err) {
        console.warn('E-sign send email failed for', rec.email, err?.message || err);
      }
    } else if (rec.email) {
      console.warn('📧 E-sign skip (no SENDGRID_API_KEY):', rec.email);
    }
  }
  if (emailsSent === 0 && recipients.some(r => r.email)) {
    console.warn('📧 No e-sign emails were sent. Check: 1) SENDGRID_API_KEY valid, 2) EMAIL_FROM verified in SendGrid (Settings → Sender Authentication), 3) Recipient not on suppression list. Activity: https://app.sendgrid.com/email_activity');
  }
  await db.collection('esign_documents').updateOne(
    { _id: docId },
    { $set: { status: 'sent', sent_at: new Date(), ...(sequential ? { sequential } : {}) } }
  );
  await logAudit(docId, 'sent', uploadedBy, null);
  return { success: true, emails_sent: emailsSent };
}

// POST /api/esign/documents/:id/send-for-signature - Generate tokens, send emails, mark sent
app.post('/api/esign/documents/:id/send-for-signature', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    const result = await sendDocumentForSignatureInternal(req.params.id, {
      sequential: !!(req.body && req.body.sequential),
      uploadedBy: req.body.uploaded_by || 'system',
    });
    if (!result.success) {
      return res.status(result.error === 'Document not found' ? 404 : 400).json({ success: false, error: result.error });
    }
    res.json({
      success: true,
      message: result.emails_sent > 0 ? `Signing links sent to ${result.emails_sent} recipient(s).` : 'Document marked as sent.',
      emails_sent: result.emails_sent,
      sequential: req.body?.sequential || undefined,
    });
  } catch (error) {
    console.error('❌ E-sign send-for-signature error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/esign/fixed-role-recipients - Get Team → Tech → Legal → Deal Desk recipients (for approval-style e-sign)
app.get('/api/esign/fixed-role-recipients', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
    const teamParam = (req.query.team || '').toString().trim().toUpperCase();
    const settingsCollection = db.collection('team_approval_settings');
    const settings = await settingsCollection.findOne({ _id: 'main' });
    const teamLeads = (settings && settings.teamLeads) ? settings.teamLeads : {};
    const teamIds = Object.keys(teamLeads || {});
    const team = teamParam && teamLeads[teamParam] ? teamParam : (teamIds[0] || 'DEV');
    const teamLeadEmail = teamLeads[team] || process.env.TEAM_APPROVAL_EMAIL || '';
    const techEmail = process.env.TECHNICAL_TEAM_EMAIL || process.env.TECH_EMAIL || 'cpq.zenop.ai.technical@cloudfuze.com';
    const legalEmail = process.env.LEGAL_TEAM_EMAIL || process.env.LEGAL_EMAIL || 'cpq.zenop.ai.legal@cloudfuze.com';
    const dealDeskEmail = process.env.DEAL_DESK_EMAIL || 'salesops@cloudfuze.com';
    const recipients = [
      { role: 'Team Approval', name: `Team Lead (${team})`, email: teamLeadEmail, order: 0 },
      { role: 'Technical Team', name: 'Technical Team', email: techEmail, order: 1 },
      { role: 'Legal Team', name: 'Legal Team', email: legalEmail, order: 2 },
      { role: 'Deal Desk', name: 'Deal Desk', email: dealDeskEmail, order: 3 },
    ].filter((r) => r.email);
    res.json({ success: true, recipients, selectedTeam: team });
  } catch (error) {
    console.error('❌ E-sign fixed-role-recipients error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/esign/pending-for-email - List documents pending signature for an email (for E-Sign Portal / Team Lead Dashboard)
app.get('/api/esign/pending-for-email', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
    const email = (req.query.email || '').toString().trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, error: 'email query required' });
    // Case-insensitive email match so dashboard finds items regardless of how email was stored
    const emailRegex = new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const recipients = await db.collection('esign_recipients')
      .find({ email: emailRegex, status: 'pending', signing_token: { $exists: true, $ne: '' } })
      .toArray();
    const docIds = [...new Set(recipients.map((r) => r.document_id).filter(Boolean))];
    const docs = await db.collection('esign_documents')
      .find({ _id: { $in: docIds }, status: 'sent' })
      .toArray();
    const docMap = new Map(docs.map((d) => [d._id.toString(), d]));
    const items = recipients
      .map((r) => {
        const docId = r.document_id && (r.document_id.toString ? r.document_id.toString() : String(r.document_id));
        const doc = docMap.get(docId);
        if (!doc || !r.signing_token) return null;
        return {
          documentId: docId,
          file_name: doc.file_name || 'Document',
          signing_token: r.signing_token,
          role: r.role || 'signer',
        };
      })
      .filter(Boolean);
    res.json({ success: true, items });
  } catch (error) {
    console.error('❌ E-sign pending-for-email error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/esign/inbox-by-token - Open dashboard by link from email (no login). Token = signing_token.
// Returns queue (pending docs for this recipient's email) and history (signed/reviewed).
app.get('/api/esign/inbox-by-token', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
    const token = (req.query.token || '').toString().trim();
    if (!token) return res.status(400).json({ success: false, error: 'Token required' });
    const recipient = await db.collection('esign_recipients').findOne({ signing_token: token });
    if (!recipient) return res.status(403).json({ success: false, error: 'Invalid or expired link' });
    const email = (recipient.email || '').toString().trim().toLowerCase();
    if (!email) return res.status(403).json({ success: false, error: 'Invalid link' });
    const emailRegex = new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    const role = (recipient.role || 'Signer').toString();
    const nameLower = (recipient.name || '').toString().toLowerCase().trim();
    let roleLabel = role === 'Technical Team' ? 'Technical' : role === 'Legal Team' ? 'Legal' : role === 'Team Approval' ? 'Team Lead' : role;
    if (roleLabel === role && (nameLower === 'technical' || nameLower === 'legal')) roleLabel = nameLower.charAt(0).toUpperCase() + nameLower.slice(1);

    // Queue: all pending for this email (doc status 'sent')
    const pendingRecipients = await db.collection('esign_recipients')
      .find({ email: emailRegex, status: 'pending', signing_token: { $exists: true, $ne: '' } })
      .sort({ _id: 1 })
      .toArray();
    const pendingDocIds = [...new Set(pendingRecipients.map((r) => r.document_id).filter(Boolean))];
    const pendingDocs = await db.collection('esign_documents')
      .find({ _id: { $in: pendingDocIds.map((id) => (id instanceof ObjectId ? id : new ObjectId(id.toString()))) }, status: 'sent' })
      .toArray();
    const pendingDocMap = new Map(pendingDocs.map((d) => [d._id.toString(), d]));
    const queue = pendingRecipients
      .map((r) => {
        const docId = r.document_id && (r.document_id.toString ? r.document_id.toString() : String(r.document_id));
        const doc = pendingDocMap.get(docId);
        if (!doc || !r.signing_token) return null;
        return {
          documentId: docId,
          file_name: doc.file_name || 'Document',
          signing_token: r.signing_token,
          role: (r.role || 'signer').toString(),
        };
      })
      .filter(Boolean);

    // History: signed or reviewed for this email
    const historyRecipients = await db.collection('esign_recipients')
      .find({ email: emailRegex, status: { $in: ['signed', 'reviewed'] } })
      .sort({ _id: -1 })
      .limit(50)
      .toArray();
    const historyDocIds = [...new Set(historyRecipients.map((r) => r.document_id).filter(Boolean))];
    const historyDocs = historyDocIds.length
      ? await db.collection('esign_documents').find({ _id: { $in: historyDocIds.map((id) => (id instanceof ObjectId ? id : new ObjectId(id.toString()))) } }).toArray()
      : [];
    const historyDocMap = new Map(historyDocs.map((d) => [d._id.toString(), d]));
    const history = historyRecipients
      .map((r) => {
        const docId = r.document_id && (r.document_id.toString ? r.document_id.toString() : String(r.document_id));
        const doc = historyDocMap.get(docId);
        if (!doc) return null;
        return {
          documentId: docId,
          file_name: doc.file_name || 'Document',
          status: r.status,
          documentStatus: doc.status || 'sent',
        };
      })
      .filter(Boolean);

    res.json({
      success: true,
      role: roleLabel,
      workflow: 'Team Lead → Technical → Legal → Deal Desk',
      queue,
      history,
    });
  } catch (error) {
    console.error('❌ E-sign inbox-by-token error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/esign/sign-by-token/:token - Resolve token to recipient + document + fields (only that recipient's fields)
app.get('/api/esign/sign-by-token/:token', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    const token = (req.params.token || '').trim();
    if (!token) return res.status(400).json({ success: false, error: 'Token required' });
    const recipient = await db.collection('esign_recipients').findOne({ signing_token: token });
    if (!recipient) return res.status(404).json({ success: false, error: 'Invalid or expired signing link' });
    let docId = recipient.document_id;
    if (!docId) return res.status(404).json({ success: false, error: 'Document not found' });
    try {
      docId = docId instanceof ObjectId ? docId : new ObjectId(docId.toString());
    } catch (e) {
      console.warn('E-sign sign-by-token: invalid document_id on recipient', recipient._id, recipient.document_id);
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    const doc = await db.collection('esign_documents').findOne({ _id: docId });
    if (!doc) {
      console.warn('E-sign sign-by-token: document not found for docId=', docId.toString(), 'recipient=', recipient._id);
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    if (doc.status === 'voided') {
      return res.status(410).json({ success: false, error: 'This signing request has been voided.' });
    }
    const recipientIdStr = recipient._id.toString();
    const fields = await getEsignFieldsForRecipient(db, docId, recipientIdStr);
    res.json({
      success: true,
      recipient: {
        id: recipient._id.toString(),
        name: recipient.name,
        email: recipient.email,
        role: recipient.role,
        action: recipient.action || null,
        status: recipient.status,
        show_dashboard: recipient.role === 'Team Lead' || recipient.role === 'Team Approval' || recipient.role === 'Technical Team' || recipient.role === 'Legal Team',
      },
      document: {
        id: doc._id.toString(),
        file_name: doc.file_name,
        status: doc.status,
      },
      fields: fields.map((f) => ({
        _id: f._id?.toString(),
        page: f.page,
        type: f.type,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        xNorm: f.xNorm,
        yNorm: f.yNorm,
        widthNorm: f.widthNorm,
        heightNorm: f.heightNorm,
        xPct: f.xPct,
        yPct: f.yPct,
        widthPct: f.widthPct,
        heightPct: f.heightPct,
        recipient_id: f.recipient_id?.toString(),
      })),
    });
  } catch (error) {
    console.error('❌ E-sign sign-by-token error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/esign/mark-reviewed - Reviewer approves or denies (option: comment; deny requires comment)
app.post('/api/esign/mark-reviewed', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    const { signing_token, action, comment } = req.body || {};
    const token = (signing_token || '').trim();
    if (!token) return res.status(400).json({ success: false, error: 'signing_token required' });
    const recipient = await db.collection('esign_recipients').findOne({ signing_token: token });
    if (!recipient) return res.status(404).json({ success: false, error: 'Invalid or expired link' });
    let docId = recipient.document_id;
    if (!docId) return res.status(404).json({ success: false, error: 'Document not found' });
    try {
      docId = docId instanceof ObjectId ? docId : new ObjectId(docId.toString());
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid document' });
    }
    const doc = await db.collection('esign_documents').findOne({ _id: docId });
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    if (doc.status === 'voided') return res.status(410).json({ success: false, error: 'This signing request has been voided.' });
    if (recipient.status === 'reviewed') {
      return res.json({ success: true, message: 'Already reviewed', already_reviewed: true });
    }
    if (recipient.status === 'denied') {
      return res.json({ success: true, message: 'Already denied', already_denied: true });
    }
    const act = (action || 'approve').toString().toLowerCase();
    if (act === 'deny' && (!comment || typeof comment !== 'string' || !comment.trim())) {
      return res.status(400).json({ success: false, error: 'Comment is required when denying' });
    }
    if (act === 'deny') {
      const commentTrimmed = (comment || '').trim();
      await db.collection('esign_recipients').updateOne(
        { signing_token: token },
        { $set: { status: 'denied', review_decision: 'denied', comment: commentTrimmed } }
      );
      await db.collection('esign_documents').updateOne(
        { _id: docId },
        { $set: { status: 'denied' } }
      );
      try {
        await logAudit(docId.toString(), 'review_denied', recipient.email || null, req.ip || req.connection?.remoteAddress);
      } catch (auditErr) { /* non-fatal */ }
      try {
        await sendEsignDeniedNotificationToCreator(doc, recipient, commentTrimmed, 'review');
      } catch (mailErr) { /* non-fatal */ }
      return res.json({
        success: true,
        message: 'Review denied',
        action: 'deny',
        document_id: docId.toString(),
      });
    }
    // approve (default)
    await db.collection('esign_recipients').updateOne(
      { signing_token: token },
      { $set: { status: 'reviewed', review_decision: 'approved', ...(comment != null && String(comment).trim() ? { comment: String(comment).trim() } : {}) } }
    );
    const totalCount = await db.collection('esign_recipients').countDocuments({ document_id: docId });
    const completedCount = await db.collection('esign_recipients').countDocuments({
      document_id: docId,
      status: { $in: ['signed', 'reviewed'] },
    });
    if (totalCount > 0 && completedCount >= totalCount) {
      await db.collection('esign_documents').updateOne(
        { _id: docId },
        { $set: { status: 'completed', signed_at: doc.signed_at || new Date() } }
      );
    }
    // Sequential mode: send signing link to the next recipient after this one marks as reviewed
    const isSequential = !!doc.sequential;
    if (isSequential) {
      const docIdStr = docId.toString();
      const allRecipients = await db.collection('esign_recipients').find({ $or: [{ document_id: docId }, { document_id: docIdStr }] }).sort({ order: 1, _id: 1 }).toArray();
      const recipientIdStr = (recipient._id && recipient._id.toString ? recipient._id.toString() : String(recipient._id));
      const currentIdx = allRecipients.findIndex((r) => (r._id && r._id.toString ? r._id.toString() : String(r._id)) === recipientIdStr);
      const nextRec = currentIdx >= 0 && currentIdx < allRecipients.length - 1 ? allRecipients[currentIdx + 1] : null;
      console.log('📧 E-sign sequential (mark-reviewed): doc.sequential=', isSequential, 'currentIdx=', currentIdx, 'total=', allRecipients.length, 'nextRec=', nextRec ? { role: nextRec.role, email: nextRec.email ? '(set)' : '(empty)' } : 'none');
      if (!nextRec) {
        console.log('📧 E-sign sequential (mark-reviewed): no next recipient (currentIdx=', currentIdx, 'total=', allRecipients.length, ')');
      } else if (!nextRec.email || !nextRec.email.trim()) {
        console.warn('📧 E-sign sequential (mark-reviewed): next recipient has no email — add email for', nextRec.name || nextRec.role || 'recipient', 'in Place Fields so they can receive the link.');
      } else {
        const nextToken = crypto.randomUUID();
        await db.collection('esign_recipients').updateOne(
          { _id: nextRec._id },
          { $set: { signing_token: nextToken, status: 'pending' } }
        );
        let baseUrl = (process.env.APP_BASE_URL || '').trim() || 'http://localhost:5173';
        let baseUrlForDashboard = (process.env.APP_BASE_URL || '').trim() || 'http://localhost:5173';
        if (baseUrl.includes('localhost:3001')) { baseUrl = 'http://localhost:5173'; baseUrlForDashboard = 'http://localhost:5173'; }
        const signingUrl = `${baseUrl}/sign/${nextToken}`;
        const inboxUrl = `${baseUrlForDashboard}/esign-inbox?token=${encodeURIComponent(nextToken)}`;
        const nextNameLower = (nextRec.name || '').toString().toLowerCase().trim();
        const isTechnical = nextRec.role === 'Technical Team' || nextNameLower === 'technical';
        const isLegal = nextRec.role === 'Legal Team' || nextNameLower === 'legal';
        const isTeamLead = nextRec.role === 'Team Lead' || nextRec.role === 'Team Approval';
        const showNextDashboard = isTechnical || isLegal || isTeamLead;
        const dashboardLabel = isTechnical ? 'E-Sign Technical Dashboard' : isLegal ? 'E-Sign Legal Dashboard' : isTeamLead ? 'E-Sign Team Lead Dashboard' : 'your E-Sign dashboard';
        const openInDashboard = `Open the agreement in your <a href="${inboxUrl}">${dashboardLabel}</a>`;
        const roleLower = (nextRec.role || 'signer').toString().toLowerCase();
        const nextHasAction = nextRec.action === 'signer' || nextRec.action === 'reviewer';
        const isNextReviewer = nextHasAction ? (nextRec.action === 'reviewer') : (roleLower === 'reviewer' || nextRec.role === 'Technical Team' || nextRec.role === 'Legal Team');
        const ctaText = isNextReviewer ? 'Review Document' : 'Sign Document';
        const subject = isNextReviewer ? 'Please review the document' : 'Please sign the document';
        const nextReviewBlock = showNextDashboard
          ? `<p><strong>Option 1 – Open in your dashboard:</strong> ${openInDashboard}. The agreement will appear in your queue; open it from there to review.</p>
          <p><strong>Option 2 – Direct link:</strong> `
          : '<p><strong>Signing link:</strong> ';
        const nextSignBlock = showNextDashboard
          ? `<p><strong>Option 1 – Open in your dashboard:</strong> ${openInDashboard}. The agreement will open in your dashboard; you can then review and sign.</p>
          <p><strong>Option 2 – Sign directly:</strong> `
          : '<p><strong>Signing link:</strong> ';
        const html = isNextReviewer
          ? `<p>Hello${nextRec.name ? ` ${nextRec.name}` : ''},</p>
          <p>You have been requested to <strong>review</strong> a document.</p>
          ${nextReviewBlock}<a href="${signingUrl}" style="display:inline-block; padding:10px 20px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:6px;">${ctaText}</a></p>
          <p>Thank you.</p>`
          : `<p>Hello${nextRec.name ? ` ${nextRec.name}` : ''},</p>
          <p>You have been requested to sign a document.</p>
          ${nextSignBlock}<a href="${signingUrl}" style="display:inline-block; padding:10px 20px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:6px;">${ctaText}</a></p>
          <p>Thank you.</p>`;
        if (process.env.SENDGRID_API_KEY) {
          try {
            console.log('📧 E-sign sequential (mark-reviewed): sending email to next recipient', nextRec.role, nextRec.email);
            const result = await sendEmail(nextRec.email, subject, html);
            if (result.success) console.log('📧 E-sign sequential (mark-reviewed): sent signing link to next recipient', nextRec.email);
            else console.warn('📧 E-sign sequential (mark-reviewed): sendEmail returned success=false for', nextRec.email, result);
          } catch (err) {
            console.warn('E-sign sequential send to next (mark-reviewed) failed for', nextRec.email, err?.message || err);
          }
        } else {
          console.warn('📧 E-sign sequential (mark-reviewed): SENDGRID_API_KEY not set — next recipient', nextRec.role, nextRec.email, 'did not receive email. Set SENDGRID_API_KEY in .env and restart server.');
        }
      }
    } else {
      const recipientCount = await db.collection('esign_recipients').countDocuments({ document_id: docId });
      if (recipientCount > 1) {
        console.log('📧 E-sign (mark-reviewed): document has', recipientCount, 'recipients but sequential is false — enable "Sequential" when sending to get Team Lead → Technical → Legal emails.');
      }
    }
    try {
      await logAudit(docId.toString(), 'reviewed', recipient.email || null, req.ip || req.connection?.remoteAddress);
    } catch (auditErr) {
      // non-fatal
    }
    res.json({
      success: true,
      message: 'Document marked as reviewed',
      action: 'approve',
      document_id: docId.toString(),
    });
  } catch (error) {
    console.error('❌ E-sign mark-reviewed error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/esign/deny-signing - Signer declines to sign (comment required)
app.post('/api/esign/deny-signing', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    const { signing_token, comment } = req.body || {};
    const token = (signing_token || '').trim();
    if (!token) return res.status(400).json({ success: false, error: 'signing_token required' });
    if (!comment || typeof comment !== 'string' || !comment.trim()) {
      return res.status(400).json({ success: false, error: 'Comment is required when declining to sign' });
    }
    const recipient = await db.collection('esign_recipients').findOne({ signing_token: token });
    if (!recipient) return res.status(404).json({ success: false, error: 'Invalid or expired link' });
    let docId = recipient.document_id;
    if (!docId) return res.status(404).json({ success: false, error: 'Document not found' });
    try {
      docId = docId instanceof ObjectId ? docId : new ObjectId(docId.toString());
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid document' });
    }
    const doc = await db.collection('esign_documents').findOne({ _id: docId });
    if (doc && doc.status === 'voided') return res.status(410).json({ success: false, error: 'This signing request has been voided.' });
    if (recipient.status === 'signed') {
      return res.status(400).json({ success: false, error: 'You have already signed this document' });
    }
    if (recipient.status === 'denied') {
      return res.json({ success: true, message: 'Already declined', already_denied: true });
    }
    const commentTrimmed = comment.trim();
    await db.collection('esign_recipients').updateOne(
      { signing_token: token },
      { $set: { status: 'denied', sign_decision: 'denied', comment: commentTrimmed } }
    );
    await db.collection('esign_documents').updateOne(
      { _id: docId },
      { $set: { status: 'denied' } }
    );
    try {
      await logAudit(docId.toString(), 'sign_denied', recipient.email || null, req.ip || req.connection?.remoteAddress);
    } catch (auditErr) { /* non-fatal */ }
    try {
      await sendEsignDeniedNotificationToCreator(doc, recipient, commentTrimmed, 'sign');
    } catch (mailErr) { /* non-fatal */ }
    res.json({
      success: true,
      message: 'You have declined to sign',
      action: 'deny',
      document_id: docId.toString(),
    });
  } catch (error) {
    console.error('❌ E-sign deny-signing error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/esign/signature-fields - Save signature field placements (optional recipient_id per field)
app.post('/api/esign/signature-fields', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    const { document_id, fields } = req.body;
    if (!document_id || !Array.isArray(fields)) {
      return res.status(400).json({ success: false, error: 'document_id and fields array required' });
    }
    const docId = new ObjectId(document_id);
    const existing = await db.collection('esign_documents').findOne({ _id: docId });
    if (!existing) return res.status(404).json({ success: false, error: 'Document not found' });

    await db.collection('signature_fields').deleteMany(signatureFieldsDocumentFilter(docId));
    const toInsert = fields.map((f) => {
      let recipientId = null;
      if (f.recipient_id) {
        try { recipientId = new ObjectId(f.recipient_id); } catch { recipientId = f.recipient_id; }
      }
      const base = { document_id: docId, page: Number(f.page) || 1, type: f.type || 'signature', recipient_id: recipientId };
      const typeLower = (f.type || 'signature').toString().toLowerCase();
      let textFieldExtras = {};
      if (typeLower === 'text') {
        const tc = typeof f.text_color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(f.text_color.trim()) ? f.text_color.trim() : '#dc2626';
        const tfRaw = (f.text_font || 'helvetica').toString().toLowerCase();
        const tf = tfRaw === 'times' || tfRaw === 'courier' ? tfRaw : 'helvetica';
        textFieldExtras = {
          ...(typeof f.prefill === 'string' ? { prefill: f.prefill.slice(0, 8000) } : {}),
          text_color: tc,
          text_font: tf,
        };
      }
      if (f.xPct != null) {
        return { ...base, ...textFieldExtras, xPct: Number(f.xPct), yPct: Number(f.yPct), widthPct: Number(f.widthPct) || 20, heightPct: Number(f.heightPct) || 4 };
      }
      const row = {
        ...base,
        ...textFieldExtras,
        x: Number(f.x) || 0,
        y: Number(f.y) || 0,
        width: Number(f.width) || 100,
        height: Number(f.height) || 40,
      };
      if (f.xNorm != null && f.yNorm != null && f.widthNorm != null && f.heightNorm != null) {
        row.xNorm = Number(f.xNorm);
        row.yNorm = Number(f.yNorm);
        row.widthNorm = Number(f.widthNorm);
        row.heightNorm = Number(f.heightNorm);
      }
      return row;
    });
    if (toInsert.length) await db.collection('signature_fields').insertMany(toInsert);
    res.json({ success: true, message: 'Signature fields saved' });
  } catch (error) {
    console.error('❌ E-sign save signature fields error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/esign/signature-fields/:documentId
app.get('/api/esign/signature-fields/:documentId', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    let docId;
    try { docId = new ObjectId(req.params.documentId); } catch { return res.status(400).json({ success: false, error: 'Invalid document ID' }); }
    const fields = await db.collection('signature_fields').find(signatureFieldsDocumentFilter(docId)).toArray();
    res.json({ success: true, fields });
  } catch (error) {
    console.error('❌ E-sign get signature fields error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/esign/signatures/store-encrypted — AES-256-GCM blob in MongoDB only; response never includes plaintext.
app.post('/api/esign/signatures/store-encrypted', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    const { document_id, signing_token, field_index: fieldIndexRaw, mode, payload } = req.body || {};
    if (document_id === undefined || document_id === null || !signing_token || fieldIndexRaw === undefined || fieldIndexRaw === null) {
      return res.status(400).json({ success: false, error: 'document_id, signing_token, and field_index required' });
    }
    const field_index = Number(fieldIndexRaw);
    if (!Number.isInteger(field_index) || field_index < 0) {
      return res.status(400).json({ success: false, error: 'Invalid field_index' });
    }
    let docId;
    try { docId = new ObjectId(String(document_id)); } catch {
      return res.status(400).json({ success: false, error: 'Invalid document_id' });
    }
    const recipient = await db.collection('esign_recipients').findOne({ signing_token: String(signing_token).trim() });
    if (!recipient) return res.status(404).json({ success: false, error: 'Invalid or expired signing link' });
    let rDocId;
    try {
      rDocId = recipient.document_id instanceof ObjectId ? recipient.document_id : new ObjectId(String(recipient.document_id));
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid document' });
    }
    if (rDocId.toString() !== docId.toString()) {
      return res.status(400).json({ success: false, error: 'Document does not match signing link' });
    }
    const img = payload && typeof payload.imagePngBase64 === 'string' ? payload.imagePngBase64.trim() : '';
    if (!img || (!img.startsWith('data:image') && img.length < 80)) {
      return res.status(400).json({ success: false, error: 'payload.imagePngBase64 required' });
    }
    const envelope = {
      v: 1,
      mode: ['draw', 'type', 'upload'].includes(mode) ? mode : 'draw',
      imagePngBase64: img,
    };
    let enc;
    try {
      enc = encryptEsignSignaturePlaintext(JSON.stringify(envelope));
    } catch (e) {
      return res.status(503).json({ success: false, error: e.message || 'Encryption not configured' });
    }

    await db.collection('esign_signature_secrets').replaceOne(
      { document_id: docId, recipient_id: recipient._id, field_index },
      {
        document_id: docId,
        recipient_id: recipient._id,
        field_index,
        alg: 'aes-256-gcm',
        iv: enc.iv,
        auth_tag: enc.authTag,
        ciphertext: enc.ciphertext,
        created_at: new Date(),
      },
      { upsert: true }
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('❌ E-sign store-encrypted error:', error?.message || error);
    return res.status(500).json({ success: false, error: 'Failed to store signature' });
  }
});

// POST /api/esign/signatures/clear-stored — remove encrypted blobs for this signing link (e.g. user clicked Edit).
app.post('/api/esign/signatures/clear-stored', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    const { signing_token } = req.body || {};
    if (!signing_token) return res.status(400).json({ success: false, error: 'signing_token required' });
    const recipient = await db.collection('esign_recipients').findOne({ signing_token: String(signing_token).trim() });
    if (!recipient) return res.status(404).json({ success: false, error: 'Invalid or expired signing link' });
    await db.collection('esign_signature_secrets').deleteMany({ recipient_id: recipient._id });
    return res.json({ success: true });
  } catch (error) {
    console.error('❌ E-sign clear-stored error:', error?.message || error);
    return res.status(500).json({ success: false, error: 'Failed to clear stored signatures' });
  }
});

// POST /api/esign/signatures/save - Save signature image and link to document
app.post('/api/esign/signatures/save', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    const { document_id, field_id, signature_data, signer_email } = req.body;
    if (!document_id || !signature_data) return res.status(400).json({ success: false, error: 'document_id and signature_data required' });

    const docId = new ObjectId(document_id);
    const doc = await db.collection('esign_documents').findOne({ _id: docId });
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });

    const buf = Buffer.from(signature_data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const sigFilename = `sig-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    const sigPath = path.join(signaturesDir, sigFilename);
    fs.writeFileSync(sigPath, buf);

    await db.collection('esign_documents').updateOne(
      { _id: docId },
      { $set: { signature_path: sigPath, signer_email: signer_email || null, signed_at: new Date() } }
    );

    await logAudit(docId, 'signed', signer_email, req.ip || req.connection?.remoteAddress);

    res.json({ success: true, signature_path: sigPath });
  } catch (error) {
    console.error('❌ E-sign save signature error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/** Parse #RRGGBB for pdf-lib rgb(); invalid → default red. */
function esignHexToPdfRgb(hex) {
  const s = String(hex || '').trim();
  const m = /^#([0-9a-f]{6})$/i.exec(s);
  if (!m) return rgb(220 / 255, 38 / 255, 38 / 255);
  const n = parseInt(m[1], 16);
  return rgb((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function esignPdfFontForTextField(fontId, helvetica, timesRoman, courier) {
  const id = (fontId || 'helvetica').toString().toLowerCase();
  if (id === 'times') return timesRoman;
  if (id === 'courier') return courier;
  return helvetica;
}

/** Word-wrap plain text for pdf-lib StandardFonts (used for multiline "text" fields). */
function wrapTextForPdf(font, text, fontSize, maxWidth) {
  const s = String(text || '').replace(/\r/g, '').slice(0, 8000);
  const lines = [];
  for (const para of s.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) line = test;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

// POST /api/esign/documents/generate-signed - Merge field values (signature/name/title/date/text) into PDF
app.post('/api/esign/documents/generate-signed', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    const { document_id, signature_data, field_coords, field_values, signer_email, signing_token } = req.body;
    if (!document_id) return res.status(400).json({ success: false, error: 'document_id required' });

    const docId = new ObjectId(document_id);
    const doc = await db.collection('esign_documents').findOne({ _id: docId });
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    if (doc.status === 'voided') return res.status(410).json({ success: false, error: 'This signing request has been voided.' });
    const sourcePath = (doc.signed_file_path && fs.existsSync(doc.signed_file_path)) ? doc.signed_file_path : doc.file_path;
    if (!fs.existsSync(sourcePath)) return res.status(404).json({ success: false, error: 'Source file not found' });

    const pdfBytes = fs.readFileSync(sourcePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const courier = await pdfDoc.embedFont(StandardFonts.Courier);

    let recipient = null;
    let fields;
    if (field_coords && field_coords.length) {
      fields = field_coords;
    } else if (signing_token) {
      recipient = await db.collection('esign_recipients').findOne({ signing_token });
      if (!recipient) {
        return res.status(404).json({ success: false, error: 'Invalid or expired signing link' });
      }
      let rDocId;
      try {
        rDocId = recipient.document_id instanceof ObjectId ? recipient.document_id : new ObjectId(String(recipient.document_id));
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid document' });
      }
      if (rDocId.toString() !== docId.toString()) {
        return res.status(400).json({ success: false, error: 'Document does not match signing link' });
      }
      fields = await getEsignFieldsForRecipient(db, docId, recipient._id.toString());
    } else {
      fields = await db.collection('signature_fields').find(signatureFieldsDocumentFilter(docId)).sort({ _id: 1 }).toArray();
    }

    const values = { ...(field_values && typeof field_values === 'object' && !Array.isArray(field_values) ? field_values : {}) };
    if (signature_data && !Object.keys(values).length && fields.length) {
      values['0'] = signature_data;
    }

    if (signing_token && recipient) {
      const secrets = await db.collection('esign_signature_secrets').find({
        document_id: docId,
        recipient_id: recipient._id,
      }).toArray();
      const byIdx = new Map(secrets.map((s) => [s.field_index, s]));
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        if ((f.type || 'signature').toLowerCase() !== 'signature') continue;
        const sec = byIdx.get(i);
        if (!sec) continue;
        try {
          const plain = decryptEsignSignatureStoredDoc(sec);
          const p = JSON.parse(plain);
          let img = typeof p.imagePngBase64 === 'string' ? p.imagePngBase64.trim() : '';
          if (img && !img.startsWith('data:')) img = `data:image/png;base64,${img}`;
          if (img) values[String(i)] = img;
        } catch (_) {
          return res.status(400).json({
            success: false,
            error: 'Could not load stored signature. Please apply your signature again.',
          });
        }
      }
    }

    const sigIndices = fields
      .map((f, i) => (((f.type || 'signature').toLowerCase() === 'signature') ? i : -1))
      .filter((i) => i >= 0);
    for (const i of sigIndices) {
      const val = values[String(i)] ?? values[fields[i]._id?.toString()];
      if (!val) {
        return res.status(400).json({
          success: false,
          error:
            signing_token && recipient
              ? 'Missing stored signature for one or more fields. Open each signature box and click Apply.'
              : 'Missing signature for one or more fields.',
        });
      }
    }

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const fType = (f.type || 'signature').toLowerCase();
      let val = values[String(i)] ?? values[f._id?.toString()];
      if (fType === 'text' && (val == null || val === '')) {
        const p = f.prefill;
        if (typeof p === 'string' && p.length) val = p;
      }
      if (!val) continue;

      const pageNum = (f.page || 1) - 1;
      if (pageNum < 0 || pageNum >= pages.length) continue;
      const page = pages[pageNum];
      const w = page.getWidth();
      const h = page.getHeight();
      let x, y, width, height;
      if (
        f.xNorm != null &&
        f.yNorm != null &&
        f.widthNorm != null &&
        f.heightNorm != null &&
        !Number.isNaN(Number(f.xNorm)) &&
        !Number.isNaN(Number(f.yNorm))
      ) {
        width = Number(f.widthNorm) * w;
        height = Number(f.heightNorm) * h;
        x = Number(f.xNorm) * w;
        const yFromTop = Number(f.yNorm) * h;
        y = h - yFromTop - height;
      } else if (f.xPct != null || f.yPct != null) {
        const xPct = (Number(f.xPct) ?? 10) / 100;
        const yPct = (Number(f.yPct) ?? 80) / 100;
        const wPct = (Number(f.widthPct) ?? 20) / 100;
        const hPct = (Number(f.heightPct) ?? 4) / 100;
        x = w * xPct;
        y = h - (h * yPct) - (h * hPct);
        width = w * wPct;
        height = h * hPct;
      } else {
        x = Number(f.x) ?? (w * 0.1);
        y = h - Number(f.y) - (Number(f.height) || 40);
        width = Number(f.width) || 100;
        height = Number(f.height) || 40;
      }

      const isBase64Image = typeof val === 'string' && /^data:image\/\w+;base64,/.test(val);
      if ((fType === 'signature' && isBase64Image)) {
        const imgBytes = Buffer.from(val.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        const pngImage = await pdfDoc.embedPng(imgBytes);
        page.drawImage(pngImage, { x, y, width, height });
      } else if (fType === 'text') {
        const raw = typeof val === 'string' ? val : String(val);
        const fontSize = Math.min(11, Math.max(7, height * 0.11));
        const lineHeight = fontSize * 1.2;
        const innerW = Math.max(8, width - 4);
        const pdfFont = esignPdfFontForTextField(f.text_font, helvetica, timesRoman, courier);
        const textRgb = esignHexToPdfRgb(f.text_color);
        const lines = wrapTextForPdf(pdfFont, raw, fontSize, innerW);
        let cursorY = y + height - fontSize;
        for (const line of lines) {
          if (cursorY < y) break;
          if (line) {
            page.drawText(line, {
              x: x + 2,
              y: cursorY,
              size: fontSize,
              font: pdfFont,
              color: textRgb,
              maxWidth: innerW,
            });
          }
          cursorY -= lineHeight;
        }
      } else {
        const text = typeof val === 'string' ? val : String(val);
        const fontSize = Math.min(12, height * 0.8);
        page.drawText(text.substring(0, 50), {
          x,
          y: y + (height - fontSize) / 2,
          size: fontSize,
          font: helvetica,
          color: rgb(0, 0, 0),
          maxWidth: width,
        });
      }
    }

    const outFilename = `signed-${doc._id}-${Date.now()}.pdf`;
    const outPath = path.join(signedDir, outFilename);
    fs.writeFileSync(outPath, await pdfDoc.save());

    if (signing_token) {
      await db.collection('esign_recipients').updateOne(
        { signing_token },
        { $set: { status: 'signed' } }
      );
      const totalCount = await db.collection('esign_recipients').countDocuments({ document_id: docId });
      const completedCount = await db.collection('esign_recipients').countDocuments({
        document_id: docId,
        status: { $in: ['signed', 'reviewed'] },
      });
      if (totalCount > 0 && completedCount >= totalCount) {
        await db.collection('esign_documents').updateOne(
          { _id: docId },
          { $set: { status: 'completed', signed_file_path: outPath, signed_at: new Date() } }
        );
      } else {
        await db.collection('esign_documents').updateOne(
          { _id: docId },
          { $set: { signed_file_path: outPath, signed_at: new Date(), signer_email: signer_email || null } }
        );
      }
      // Sequential mode: send signing email to the next recipient in order
      const isSequential = !!doc.sequential;
      if (!isSequential) {
        console.log('📧 E-sign: document not in sequential mode (sequential=false), so not sending to next recipient. Use "Sequential" on Send page to enable.');
      }
      if (isSequential) {
        const docIdStr = docId.toString();
        const allRecipients = await db.collection('esign_recipients').find({ $or: [{ document_id: docId }, { document_id: docIdStr }] }).sort({ order: 1, _id: 1 }).toArray();
        const currentIdx = allRecipients.findIndex((r) => r.signing_token === signing_token);
        const nextRec = currentIdx >= 0 && currentIdx < allRecipients.length - 1 ? allRecipients[currentIdx + 1] : null;
        if (!nextRec) {
          console.log('📧 E-sign sequential (after sign): no next recipient (currentIdx=', currentIdx, 'total=', allRecipients.length, ')');
        } else if (!nextRec.email || !nextRec.email.trim()) {
          console.log('📧 E-sign sequential (after sign): next recipient has no email, skip');
        } else {
          const nextToken = crypto.randomUUID();
          await db.collection('esign_recipients').updateOne(
            { _id: nextRec._id },
            { $set: { signing_token: nextToken, status: 'pending' } }
          );
          let baseUrl = (process.env.APP_BASE_URL || '').trim() || 'http://localhost:5173';
          let baseUrlForDashboard = (process.env.APP_BASE_URL || '').trim() || 'http://localhost:5173';
          if (baseUrl.includes('localhost:3001')) { baseUrl = 'http://localhost:5173'; baseUrlForDashboard = 'http://localhost:5173'; }
          const signingUrl = `${baseUrl}/sign/${nextToken}`;
          const inboxUrl = `${baseUrlForDashboard}/esign-inbox?token=${encodeURIComponent(nextToken)}`;
          const nextNameLower = (nextRec.name || '').toString().toLowerCase().trim();
          const isTechnical = nextRec.role === 'Technical Team' || nextNameLower === 'technical';
          const isLegal = nextRec.role === 'Legal Team' || nextNameLower === 'legal';
          const isTeamLead = nextRec.role === 'Team Lead' || nextRec.role === 'Team Approval';
          const showNextDashboard = isTechnical || isLegal || isTeamLead;
          const dashboardLabel = isTechnical ? 'E-Sign Technical Dashboard' : isLegal ? 'E-Sign Legal Dashboard' : isTeamLead ? 'E-Sign Team Lead Dashboard' : 'your E-Sign dashboard';
          const openInDashboard = `Open the agreement in your <a href="${inboxUrl}">${dashboardLabel}</a>`;
          const roleLower = (nextRec.role || 'signer').toString().toLowerCase();
          const nextHasAction = nextRec.action === 'signer' || nextRec.action === 'reviewer';
          const isNextReviewer = nextHasAction ? (nextRec.action === 'reviewer') : (roleLower === 'reviewer' || nextRec.role === 'Technical Team' || nextRec.role === 'Legal Team');
          const ctaText = isNextReviewer ? 'Review Document' : 'Sign Document';
          const subject = isNextReviewer ? 'Please review the document' : 'Please sign the document';
          const nextReviewBlock2 = showNextDashboard
            ? `<p><strong>Option 1 – Open in your dashboard:</strong> ${openInDashboard}. The agreement will appear in your queue; open it from there to review.</p>
          <p><strong>Option 2 – Direct link:</strong> `
            : '<p><strong>Signing link:</strong> ';
          const nextSignBlock2 = showNextDashboard
            ? `<p><strong>Option 1 – Open in your dashboard:</strong> ${openInDashboard}. The agreement will open in your dashboard; you can then review and sign.</p>
          <p><strong>Option 2 – Sign directly:</strong> `
            : '<p><strong>Signing link:</strong> ';
          const html = isNextReviewer
            ? `<p>Hello${nextRec.name ? ` ${nextRec.name}` : ''},</p>
          <p>You have been requested to <strong>review</strong> a document.</p>
          ${nextReviewBlock2}<a href="${signingUrl}" style="display:inline-block; padding:10px 20px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:6px;">${ctaText}</a></p>
          <p>Thank you.</p>`
            : `<p>Hello${nextRec.name ? ` ${nextRec.name}` : ''},</p>
          <p>You have been requested to sign a document.</p>
          ${nextSignBlock2}<a href="${signingUrl}" style="display:inline-block; padding:10px 20px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:6px;">${ctaText}</a></p>
          <p>Thank you.</p>`;
          if (process.env.SENDGRID_API_KEY) {
            try {
              console.log('📧 E-sign sequential (after sign): sending email to next recipient', nextRec.role, nextRec.email);
              const result = await sendEmail(nextRec.email, subject, html);
              if (result.success) console.log('📧 E-sign sequential: sent signing link to next recipient', nextRec.email);
            } catch (err) {
              console.warn('E-sign sequential send to next failed for', nextRec.email, err?.message || err);
            }
          } else {
            console.warn('📧 E-sign sequential (after sign): SENDGRID_API_KEY not set — next recipient', nextRec.role, nextRec.email, 'did not receive email.');
          }
        }
      }
    } else {
      await db.collection('esign_documents').updateOne(
        { _id: docId },
        { $set: { status: 'signed', signed_file_path: outPath, signed_at: new Date(), signer_email: signer_email || null } }
      );
    }

    await logAudit(docId, 'signed', signer_email, req.ip || req.connection?.remoteAddress);

    res.json({
      success: true,
      signed_file_path: outPath,
      download_url: `/api/esign/documents/${docId}/file`
    });
  } catch (error) {
    console.error('❌ E-sign generate signed PDF error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// List esign documents
app.get('/api/esign/documents', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    const docs = await db.collection('esign_documents')
      .find({})
      .sort({ created_at: -1 })
      .toArray();
    res.json({
      success: true,
      documents: docs.map((d) => ({
        id: d._id.toString(),
        file_name: d.file_name,
        uploaded_by: d.uploaded_by,
        created_at: d.created_at,
        status: d.status
      }))
    });
  } catch (error) {
    console.error('❌ E-sign list documents error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/esign/agreement-status - All documents with recipient status for tracking dashboard
app.get('/api/esign/agreement-status', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
    const docs = await db.collection('esign_documents')
      .find({})
      .sort({ created_at: -1 })
      .toArray();
    const docIds = docs.map((d) => d._id);
    const docIdStrings = docIds.map((id) => id.toString());
    const workflowsLinked = await db.collection('approval_workflows')
      .find({ esignDocumentId: { $in: docIdStrings } })
      .toArray();
    const requestedByFromWorkflow = {};
    workflowsLinked.forEach((w) => {
      const eid = w.esignDocumentId != null ? String(w.esignDocumentId) : '';
      if (!eid) return;
      const label = (w.creatorName && String(w.creatorName).trim()) || (w.creatorEmail && String(w.creatorEmail).trim()) || '';
      if (label && !requestedByFromWorkflow[eid]) requestedByFromWorkflow[eid] = label;
    });
    // document_id can be stored as ObjectId or string depending on where it was set
    const recipientsByDoc = await db.collection('esign_recipients')
      .find({ $or: [{ document_id: { $in: docIdStrings } }, { document_id: { $in: docIds } }] })
      .toArray();
    const byDocId = {};
    recipientsByDoc.forEach((r) => {
      const docIdStr = r.document_id && typeof r.document_id.toString === 'function' ? r.document_id.toString() : String(r.document_id || '');
      if (!docIdStr) return;
      if (!byDocId[docIdStr]) byDocId[docIdStr] = [];
      byDocId[docIdStr].push({
        id: r._id.toString(),
        name: r.name || r.email || 'Recipient',
        email: r.email || '',
        role: r.role || 'signer',
        status: r.status || 'pending',
        order: r.order ?? 999,
        comment: r.comment || null
      });
    });
    const agreements = docs.map((d) => {
      const recs = (byDocId[d._id.toString()] || []).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      const idStr = d._id.toString();
      const requestedByStored =
        (d.requested_by_name && String(d.requested_by_name).trim()) ||
        (d.requested_by_email && String(d.requested_by_email).trim()) ||
        null;
      const requestedBy = requestedByStored || requestedByFromWorkflow[idStr] || null;
      return {
        id: idStr,
        file_name: d.file_name,
        uploaded_by: d.uploaded_by,
        upload_source: d.upload_source || 'manual',
        requested_by: requestedBy,
        created_at: d.created_at,
        sent_at: d.sent_at,
        signed_at: d.signed_at,
        voided_at: d.voided_at,
        status: d.status,
        recipients: recs
      };
    });
    res.json({ success: true, agreements });
  } catch (error) {
    console.error('❌ E-sign agreement-status error:', error);
    res.status(500).json({ success: false, error: error.message });
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
    
    const inline = req.query.inline === '1' || req.query.inline === 'true';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': inline ? `inline; filename="${document.fileName}"` : `attachment; filename="${document.fileName}"`,
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

// Helper function to check if all approval steps (Team, Tech, Legal) are approved
function areAllApprovalStepsComplete(workflowSteps) {
  if (!Array.isArray(workflowSteps)) return false;
  
  const approvalRoles = ['Team Approval', 'Technical Team', 'Legal Team'];
  const approvalSteps = workflowSteps.filter(s => approvalRoles.includes(s.role));
  
  const teamStep = approvalSteps.find(s => s.role === 'Team Approval');
  const techStep = approvalSteps.find(s => s.role === 'Technical Team');
  const legalStep = approvalSteps.find(s => s.role === 'Legal Team');
  
  const hasTeamApproval = !!teamStep;
  
  // If Team Approval exists, all three must be approved. Otherwise, just Tech and Legal.
  return hasTeamApproval
    ? (teamStep?.status === 'approved' &&
       techStep?.status === 'approved' &&
       legalStep?.status === 'approved')
    : (techStep?.status === 'approved' &&
       legalStep?.status === 'approved');
}

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
    
    // Sort by createdAt (most recent first) - descending order
    const workflows = await db.collection('approval_workflows')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    
    console.log(`✅ Found ${workflows.length} workflows in database`);
    
    // Re-evaluate workflows that might be incorrectly marked as 'in_progress'
    // when all approval steps (Team, Tech, Legal) are actually complete
    const workflowsToUpdate = [];
    for (const workflow of workflows) {
      if (workflow.status === 'in_progress' || workflow.status === 'pending') {
        if (areAllApprovalStepsComplete(workflow.workflowSteps)) {
          workflowsToUpdate.push(workflow.id);
        }
      }
    }
    
    // Update workflows that should be marked as approved
    if (workflowsToUpdate.length > 0) {
      console.log(`🔄 Updating ${workflowsToUpdate.length} workflows to 'approved' status (all approval steps complete)`);
      await db.collection('approval_workflows').updateMany(
        { id: { $in: workflowsToUpdate } },
        { 
          $set: { 
            status: 'approved',
            updatedAt: new Date().toISOString()
          }
        }
      );
      
      // Refresh the workflows after update
      const updatedWorkflows = await db.collection('approval_workflows')
        .find({})
        .sort({ createdAt: -1 })
        .toArray();
      
      res.json({
        success: true,
        workflows: updatedWorkflows,
        count: updatedWorkflows.length
      });
    } else {
      res.json({
        success: true,
        workflows: workflows,
        count: workflows.length
      });
    }
    
  } catch (error) {
    console.error('❌ Error fetching approval workflows:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Verify approval portal access (token required for role-based portals)
app.get('/api/approval-workflows/verify-access', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    const { workflowId, role, token } = req.query;
    if (!workflowId || !role || !token) {
      return res.status(403).json({
        success: false,
        error: 'Access Denied',
        message: 'Missing workflowId, role, or token'
      });
    }

    const normalizedRole = String(role).toLowerCase();
    const validRoles = ['teamlead', 'technical', 'legal'];
    if (!validRoles.includes(normalizedRole)) {
      return res.status(403).json({
        success: false,
        error: 'Access Denied',
        message: 'Invalid role'
      });
    }

    const record = await db.collection('approval_access_tokens').findOne({
      workflowId: String(workflowId),
      role: normalizedRole,
      token: String(token)
    });

    if (!record) {
      return res.status(403).json({
        success: false,
        error: 'Access Denied',
        message: 'Invalid or unknown token'
      });
    }

    const now = new Date();
    const expiresAt = record.expiresAt instanceof Date ? record.expiresAt : new Date(record.expiresAt);
    if (expiresAt < now) {
      return res.status(403).json({
        success: false,
        error: 'Access Denied',
        message: 'Token has expired'
      });
    }

    res.json({
      success: true,
      workflowId: record.workflowId,
      role: normalizedRole
    });
  } catch (error) {
    console.error('❌ Error verifying approval access:', error);
    res.status(500).json({
      success: false,
      error: 'Access Denied'
    });
  }
});

// Download workflow document (for Deal Desk email link - final signed PDF)
app.get('/api/approval-workflows/:workflowId/document', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).send('Database not available');
    }
    const { workflowId } = req.params;
    const workflow = await db.collection('approval_workflows').findOne({ id: workflowId });
    if (!workflow || !workflow.documentId) {
      return res.status(404).send('Workflow or document not found');
    }
    const document = await db.collection('documents').findOne({ id: workflow.documentId });
    if (!document || !document.fileData) {
      return res.status(404).send('Document file not found');
    }
    let fileBuffer;
    if (Buffer.isBuffer(document.fileData)) {
      fileBuffer = document.fileData;
    } else if (document.fileData.buffer) {
      fileBuffer = Buffer.from(document.fileData.buffer);
    } else if (document.fileData.data) {
      fileBuffer = Buffer.from(document.fileData.data);
    } else {
      return res.status(500).send('Invalid document data');
    }
    const filename = document.fileName || `${workflow.documentId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(fileBuffer);
  } catch (error) {
    console.error('❌ Error serving workflow document:', error);
    res.status(500).send('Failed to download document');
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
      
      // Check if all approval steps (Team, Tech, Legal) are approved
      // Deal Desk is just a notification, so it doesn't block approval status
      const approvalRoles = ['Team Approval', 'Technical Team', 'Legal Team'];
      
      // Get all approval steps (excluding Deal Desk)
      const approvalSteps = updatedSteps.filter(s => 
        approvalRoles.includes(s.role)
      );
      
      // Check if all required approval steps (Team, Tech, Legal) are approved
      // Note: Some workflows might not have Team Approval (manual workflows), so we check what exists
      const teamStep = approvalSteps.find(s => s.role === 'Team Approval');
      const techStep = approvalSteps.find(s => s.role === 'Technical Team');
      const legalStep = approvalSteps.find(s => s.role === 'Legal Team');
      
      const hasTeamApproval = !!teamStep;
      const hasTechApproval = !!techStep;
      const hasLegalApproval = !!legalStep;
      
      // If Team Approval exists, all three must be approved. Otherwise, just Tech and Legal.
      const allRequiredApprovalsComplete = hasTeamApproval
        ? (teamStep?.status === 'approved' &&
           techStep?.status === 'approved' &&
           legalStep?.status === 'approved')
        : (techStep?.status === 'approved' &&
           legalStep?.status === 'approved');
      
      if (allRequiredApprovalsComplete) {
        // Mark as approved when all required approval steps are approved
        // Deal Desk notification can still be sent, but doesn't block approval
        newStatus = 'approved';
        console.log('✅ All required approval steps (Team, Tech, Legal) are approved. Workflow marked as approved.');
        console.log('📋 Approval status check:', {
          hasTeamApproval,
          teamStatus: teamStep?.status,
          techStatus: techStep?.status,
          legalStatus: legalStep?.status,
          allComplete: allRequiredApprovalsComplete
        });
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

// Legacy route: previously emailed client-signature-form links backed by signature_forms (removed).
app.post('/api/approval-workflows/send-esign', (req, res) => {
  res.status(410).json({
    success: false,
    message:
      'Legacy quote signature emails are disabled. Use CPQ e-sign (/esign): upload or create the PDF, place fields, add recipients, and send from there.',
  });
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
    
    // Pagination: by default return ALL matches (metadata only; binary fields excluded). Pass limit=<positive int> to cap (e.g. limit=100).
    const skip = Math.max(0, parseInt(String(req.query.skip || 0), 10) || 0);
    const limitRaw = req.query.limit;
    const limitSingle = Array.isArray(limitRaw) ? limitRaw[0] : limitRaw;
    const allFlag = String(req.query.all ?? req.query.full ?? '').toLowerCase();
    const forceAll = allFlag === '1' || allFlag === 'true';

    let listLimit = 100;
    let listUnlimited = true;
    if (!forceAll && limitSingle !== undefined && String(limitSingle).trim() !== '') {
      const parsed = parseInt(String(limitSingle), 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        listUnlimited = false;
        listLimit = parsed;
      }
    }


    // Filter by whether a saved agreement is linked to any approval workflow (approval_workflows.documentId)
    const approvalFilterRaw = (req.query.approvalFilter || 'all').toString().toLowerCase();
    const approvalFilter =
      approvalFilterRaw === 'in_workflow' || approvalFilterRaw === 'no_workflow'
        ? approvalFilterRaw
        : 'all';

    let workflowDocumentIds = [];
    if (approvalFilter !== 'all') {
      const distinctIds = await db
        .collection('approval_workflows')
        .distinct('documentId');
      workflowDocumentIds = distinctIds.filter((id) => id != null && String(id).trim() !== '');
    }

    const approvalMatch =
      approvalFilter === 'in_workflow'
        ? { id: { $in: workflowDocumentIds } }
        : approvalFilter === 'no_workflow'
          ? workflowDocumentIds.length > 0
            ? { id: { $nin: workflowDocumentIds } }
            : {}
          : {};

    const totalCount = await db.collection('documents').countDocuments(approvalMatch);

    const pipeline = [
      { $project: { fileData: 0, docxFileData: 0 } },
      ...(Object.keys(approvalMatch).length ? [{ $match: approvalMatch }] : []),
      { $sort: { createdAt: -1, generatedDate: -1 } },
      { $skip: skip },
      ...(listUnlimited ? [] : [{ $limit: listLimit }]),
    ];

    // Use aggregation with allowDiskUse so large sorts don't hit MongoDB's 32MB memory limit
    const documents = await db
      .collection('documents')
      .aggregate(pipeline, { allowDiskUse: true })
      .toArray();

    // Serialize dates to strings for frontend compatibility
    const serializedDocuments = documents.map(doc => ({
      ...doc,
      generatedDate: doc.generatedDate ? (doc.generatedDate instanceof Date ? doc.generatedDate.toISOString() : doc.generatedDate) : new Date().toISOString(),
      createdAt: doc.createdAt ? (doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt) : new Date().toISOString(),
    }));

    console.log(
      `✅ Found ${serializedDocuments.length} documents (total for filter "${approvalFilter}": ${totalCount}, limit: ${
        listUnlimited ? 'none' : listLimit
      }, skip: ${skip})`
    );

    res.json({
      success: true,
      documents: serializedDocuments,
      count: serializedDocuments.length,
      totalCount,
      approvalFilter,
      limited: !listUnlimited && serializedDocuments.length >= listLimit && totalCount > serializedDocuments.length,
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
  sendIndexHtml(res);
});

// SPA catch-all: do NOT match /assets/* or *.js/*.css (so they get correct MIME and avoid "Cannot access 'ze' before initialization")
app.get(/^(?!\/api)(?!\/assets)(?!\/[^/]*\.(js|mjs|css|ico|svg|woff2?)(\?.*)?$).*/, (req, res) => {
  sendIndexHtml(res);
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
      const appBase = process.env.APP_BASE_URL || 'http://localhost:5173';
      console.log(`🔗 Signing links in emails use: ${appBase} (set APP_BASE_URL in .env to change)`);
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
// Team Approval Settings API (MongoDB)
// ============================================

// GET /api/team-approval-settings - Get all team approval settings
app.get('/api/team-approval-settings', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const settingsCollection = db.collection('team_approval_settings');
    
    // Get settings (there should be only one document)
    const settings = await settingsCollection.findOne({ _id: 'main' });
    
    if (settings) {
      // Remove MongoDB _id and return the settings
      const { _id, ...settingsData } = settings;
      return res.json({ success: true, data: settingsData });
    } else {
      // Return default settings if none exist
      const defaultSettings = {
        teamLeads: {
          SMB: 'chitradip.saha@cloudfuze.com',
          AM: 'joy.prakash@cloudfuze.com',
          ENT: 'anthony@cloudfuze.com',
          DEV: 'anushreddydasari@gmail.com',
          DEV2: 'raya.durai@cloudfuze.com',
        },
        additionalRecipients: {
          SMB: [],
          AM: [],
          ENT: [],
          DEV: [],
          DEV2: [],
        },
        authorizedSenders: {
          SMB: [],
          AM: [],
          ENT: [],
          DEV: [],
          DEV2: [],
        }
      };
      return res.json({ success: true, data: defaultSettings });
    }
  } catch (error) {
    console.error('❌ Error fetching team approval settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/team-approval-settings - Update team approval settings
app.put('/api/team-approval-settings', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const settingsCollection = db.collection('team_approval_settings');
    const newSettings = req.body;

    // Validate structure
    if (!newSettings.teamLeads || !newSettings.authorizedSenders) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid settings structure. Must include teamLeads and authorizedSenders.' 
      });
    }

    // Upsert (update or insert) the settings document
    await settingsCollection.updateOne(
      { _id: 'main' },
      { 
        $set: {
          ...newSettings,
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );

    console.log('✅ Team approval settings updated in MongoDB');
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    console.error('❌ Error updating team approval settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/team-approval-settings/team/:teamName - Get settings for a specific team
app.get('/api/team-approval-settings/team/:teamName', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const teamName = req.params.teamName.toUpperCase();
    const settingsCollection = db.collection('team_approval_settings');
    const settings = await settingsCollection.findOne({ _id: 'main' });

    if (settings) {
      const teamSettings = {
        teamLead: settings.teamLeads?.[teamName] || '',
        authorizedSenders: settings.authorizedSenders?.[teamName] || [],
        additionalRecipients: settings.additionalRecipients?.[teamName] || []
      };
      return res.json({ success: true, data: teamSettings });
    } else {
      return res.json({ success: true, data: { teamLead: '', authorizedSenders: [], additionalRecipients: [] } });
    }
  } catch (error) {
    console.error('❌ Error fetching team settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Authorization Request API
// ============================================

// POST /api/send-authorization-request - Send authorization request email to team lead and save to MongoDB
app.post('/api/send-authorization-request', async (req, res) => {
  try {
    if (!isEmailConfigured) {
      return res.status(500).json({
        success: false,
        error: 'Email not configured. Check SENDGRID_API_KEY in .env file.'
      });
    }

    const { requesterEmail, requesterName, teamLeadEmail, teamName, message } = req.body;

    if (!requesterEmail || !teamLeadEmail || !teamName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: requesterEmail, teamLeadEmail, teamName'
      });
    }

    // Save authorization request to MongoDB
    if (db) {
      try {
        const requestsCollection = db.collection('authorization_requests');
        const requestDoc = {
          requesterEmail,
          requesterName: requesterName || requesterEmail.split('@')[0],
          teamLeadEmail,
          teamName: teamName.toUpperCase(),
          message: message || '',
          status: 'pending', // pending, approved, rejected
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        await requestsCollection.insertOne(requestDoc);
        console.log(`✅ Authorization request saved to MongoDB for ${requesterEmail}`);
      } catch (dbError) {
        console.error('❌ Error saving authorization request to MongoDB:', dbError);
        // Continue even if DB save fails - still send email
      }
    }

    // Send email to team lead
    const emailSubject = `Authorization Request for ${teamName} Team Approval Workflows`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Authorization Request</h2>
        <p><strong>${requesterName}</strong> (${requesterEmail}) is requesting authorization to send approval workflows to the <strong>${teamName}</strong> team.</p>
        
        <div style="background-color: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Message:</strong></p>
          <p style="margin: 10px 0 0 0;">${message || 'No message provided.'}</p>
        </div>
        
        <p>To authorize this user:</p>
        <ol>
          <li>Go to the Approval Workflow page</li>
          <li>Click "Edit Settings"</li>
          <li>Select the ${teamName} team tab</li>
          <li>Add <strong>${requesterEmail}</strong> to the "Authorized Senders" list</li>
        </ol>
        
        <p style="color: #6B7280; font-size: 12px; margin-top: 30px;">
          This is an automated email from the CPQ Approval System.
        </p>
      </div>
    `;

    const msg = {
      to: teamLeadEmail,
      from: EMAIL_FROM,
      subject: emailSubject,
      html: emailHtml,
    };

    await sgMail.send(msg);
    console.log(`✅ Authorization request email sent to ${teamLeadEmail} for ${requesterEmail}`);

    res.json({
      success: true,
      message: 'Authorization request sent successfully and saved to database'
    });
  } catch (error) {
    console.error('❌ Error sending authorization request email:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send authorization request email'
    });
  }
});

// GET /api/authorization-requests - Get authorization request history
app.get('/api/authorization-requests', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { teamLeadEmail, requesterEmail, status, teamName } = req.query;
    const requestsCollection = db.collection('authorization_requests');
    
    // Build query filter
    const filter = {};
    if (teamLeadEmail) filter.teamLeadEmail = teamLeadEmail;
    if (requesterEmail) filter.requesterEmail = requesterEmail;
    if (status) filter.status = status;
    if (teamName) filter.teamName = teamName.toUpperCase();

    const requests = await requestsCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('❌ Error fetching authorization requests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/authorization-requests/:id/status - Update authorization request status
app.put('/api/authorization-requests/:id/status', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { id } = req.params;
    const { status } = req.body; // 'pending', 'approved', 'rejected'

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid status. Must be: pending, approved, or rejected' 
      });
    }

    const requestsCollection = db.collection('authorization_requests');
    const result = await requestsCollection.updateOne(
      { _id: id },
      { 
        $set: { 
          status,
          updatedAt: new Date().toISOString()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    res.json({ success: true, message: 'Request status updated' });
  } catch (error) {
    console.error('❌ Error updating authorization request status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the server
startServer();
