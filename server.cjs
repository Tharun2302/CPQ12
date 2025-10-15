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
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
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

// Email template functions
function generateManagerEmailHTML(workflowData) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Manager Approval Required</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #3B82F6, #1E40AF); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1>🔔 Manager Approval Required</h1>
        </div>
        
        <div style="background: white; padding: 30px; border: 1px solid #E5E7EB;">
          <h2>Hello Manager,</h2>
          
          <p>A new document requires your <strong>Manager</strong> approval:</p>
          
          <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>📄 Document Details</h3>
            <p><strong>Document ID:</strong> ${workflowData.documentId}</p>
            <p><strong>Client:</strong> ${workflowData.clientName}</p>
            <p><strong>Amount:</strong> $${workflowData.amount.toLocaleString()}</p>
            <p><strong>Workflow ID:</strong> ${workflowData.workflowId}</p>
            <p><strong>📎 Document:</strong> The PDF document is attached to this email for your review.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.BASE_URL || 'http://localhost:5173'}/manager-approval?workflow=${workflowData.workflowId}" 
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
      <title>CEO Approval Required</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #8B5CF6, #7C3AED); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1>👑 CEO Approval Required</h1>
        </div>
        
        <div style="background: white; padding: 30px; border: 1px solid #E5E7EB;">
          <h2>Hello CEO,</h2>
          
          <p>A new document requires your <strong>CEO</strong> approval:</p>
          
          <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>📄 Document Details</h3>
            <p><strong>Document ID:</strong> ${workflowData.documentId}</p>
            <p><strong>Client:</strong> ${workflowData.clientName}</p>
            <p><strong>Amount:</strong> $${workflowData.amount.toLocaleString()}</p>
            <p><strong>Workflow ID:</strong> ${workflowData.workflowId}</p>
            <p><strong>📎 Document:</strong> The PDF document is attached to this email for your review.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.BASE_URL || 'http://localhost:5173'}/ceo-approval?workflow=${workflowData.workflowId}" 
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

    // Convert base64 to Buffer (same as templates)
    const fileBuffer = Buffer.from(fileData, 'base64');

    const document = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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

    // Send email to Manager only with attachment
    const managerResult = await sendEmail(
      managerEmail,
      `Approval Required: ${workflowData.documentId} - ${workflowData.clientName}`,
      generateManagerEmailHTML(workflowData),
      attachments
    );

    console.log('✅ Manager email sent:', managerResult.success);

    res.json({
      success: managerResult.success,
      message: 'Manager email sent successfully',
      result: { role: 'Manager', email: managerEmail, success: managerResult.success },
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
    
    console.log('📧 Sending email to CEO (after Manager approval)...');
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

    // Send email to CEO only with attachment
    const ceoResult = await sendEmail(
      ceoEmail,
      `Approval Required: ${workflowData.documentId} - ${workflowData.clientName}`,
      generateCEOEmailHTML(workflowData),
      attachments
    );

    console.log('✅ CEO email sent:', ceoResult.success);

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
    
    console.log('📧 Sending email to Client (after CEO approval)...');
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
    
    // Generate unique ID for document
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
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

// Start the server
startServer();
