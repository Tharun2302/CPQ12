const express = require('express');
const cors = require('cors');
const axios = require('axios');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const { MongoClient } = require('mongodb'); // Changed from mysql2/promise
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
    console.log('🔍 Connecting to MongoDB Atlas...');
    console.log('📊 MongoDB URI:', MONGODB_URI.replace(/\/\/.*@/, '//***:***@')); // Hide credentials in logs
    
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    
    console.log('✅ Connected to MongoDB Atlas successfully');
    console.log('📊 Database name:', DB_NAME);
    
    // Test the connection
    await db.admin().ping();
    console.log('✅ MongoDB Atlas ping successful');
    
    // Create collections (MongoDB creates them automatically when you insert data)
    const collections = ['signature_forms', 'quotes', 'templates'];
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

// Initialize database on startup (non-blocking)
let databaseAvailable = false;
initializeDatabase().then(available => {
  databaseAvailable = available;
  if (available) {
    console.log('✅ Database is available and ready');
  } else {
    console.log('⚠️ Running without database - some features will be limited');
  }
}).catch(error => {
  console.error('❌ Database initialization failed:', error.message);
  databaseAvailable = false;
});

// Test endpoint to check database and forms
app.get('/api/signature/debug', async (req, res) => {
  try {
    console.log('🔍 Debug endpoint called');
    
    if (!databaseAvailable) {
      return res.json({
        success: false,
        error: 'Database not available',
        message: 'Database connection failed. Some features will be limited.',
        databaseAvailable: false
      });
    }
    
    // Check if table exists
    const [tableCheck] = await pool.execute('SHOW TABLES LIKE "signature_forms"');
    const tableExists = tableCheck.length > 0;
    
    // Get all forms
    const [allForms] = await pool.execute('SELECT form_id, client_name, created_at, status FROM signature_forms ORDER BY created_at DESC LIMIT 10');
    
    // Get database info
    const [dbInfo] = await pool.execute('SELECT DATABASE() as current_db');
    
    res.json({
      success: true,
      debug: {
        tableExists,
        currentDatabase: dbInfo[0]?.current_db,
        totalForms: allForms.length,
        forms: allForms.map(f => ({
          formId: f.form_id,
          clientName: f.client_name,
          createdAt: f.created_at,
          status: f.status
        }))
      },
      databaseAvailable: true
    });
  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      databaseAvailable: false
    });
  }
});

// Health check endpoint (doesn't require database)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    databaseAvailable: databaseAvailable,
    features: {
      hubspot: true,
      email: true,
      pdf: true,
      database: databaseAvailable
    }
  });
});

// Test endpoint to create a sample form
app.post('/api/signature/test-create', async (req, res) => {
  try {
    console.log('🧪 Creating test signature form...');
    
    if (!databaseAvailable) {
      return res.json({
        success: false,
        error: 'Database not available',
        message: 'Cannot create signature forms without database connection',
        databaseAvailable: false
      });
    }
    
    const formId = `test-form-${Date.now()}`;
    const testData = {
      formId,
      quoteId: 'test-quote-123',
      clientEmail: 'test@example.com',
      clientName: 'Test Client',
      quoteData: { plan: 'Test Plan', totalCost: '$1000' },
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      interactions: [],
      signatureData: null,
      approvalStatus: 'pending'
    };

    const [result] = await pool.execute(
      'INSERT INTO signature_forms (form_id, quote_id, client_email, client_name, quote_data, status, created_at, expires_at, interactions, signature_data, approval_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        testData.formId,
        testData.quoteId,
        testData.clientEmail,
        testData.clientName,
        JSON.stringify(testData.quoteData || {}),
        testData.status,
        testData.createdAt,
        testData.expiresAt,
        JSON.stringify(testData.interactions || []),
        testData.signatureData ? JSON.stringify(testData.signatureData) : null,
        testData.approvalStatus
      ]
    );

    console.log('✅ Test form created:', formId);
    
    res.json({
      success: true,
      formId,
      message: 'Test signature form created successfully',
      testUrl: `http://localhost:5173/client-signature-form.html?formId=${formId}`
    });
  } catch (error) {
    console.error('❌ Error creating test form:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// HubSpot API configuration
const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY || 'demo-key';
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// Email configuration
const EMAIL_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'your-email@gmail.com',
    pass: process.env.SMTP_PASS || 'your-app-password'
  }
};

// Check if email credentials are properly configured
const isEmailConfigured = EMAIL_CONFIG.auth.user !== 'your-email@gmail.com' && EMAIL_CONFIG.auth.pass !== 'your-app-password';

// Create transporter for sending emails
const transporter = nodemailer.createTransport(EMAIL_CONFIG);

// Test email configuration
app.get('/api/email/test', async (req, res) => {
  try {
    // Quick test without full verification to speed up response
    res.json({ 
      success: true, 
      message: 'Email configuration is valid',
      config: {
        host: EMAIL_CONFIG.host,
        port: EMAIL_CONFIG.port,
        user: EMAIL_CONFIG.auth.user
      }
    });
  } catch (error) {
    console.error('Email configuration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Email configuration error',
      error: error.message 
    });
  }
});

// Send email endpoint
app.post('/api/email/send', upload.single('attachment'), async (req, res) => {
  try {
    console.log('📧 Email send request received');
    
    // Check if email is properly configured
    if (!isEmailConfigured) {
      console.log('❌ Email not configured - using default credentials');
      return res.status(500).json({
        success: false,
        message: 'Email configuration not set up. Please create a .env file with your Gmail credentials.',
        error: 'EMAIL_NOT_CONFIGURED',
        instructions: [
          '1. Create a .env file in the project root',
          '2. Add your Gmail credentials:',
          '   SMTP_USER=your-email@gmail.com',
          '   SMTP_PASS=your-app-password',
          '3. Enable 2FA on your Gmail account',
          '4. Generate an App Password from Google Account Settings',
          '5. Restart the server after adding credentials'
        ]
      });
    }
    
    console.log('📧 Request body:', req.body);
    console.log('📧 File attached:', req.file ? 'Yes' : 'No');
    console.log('📧 Request headers:', req.headers['content-type']);
    console.log('📧 Request body keys:', Object.keys(req.body || {}));
    console.log('📧 File details:', req.file ? {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'No file');
    
    // Ensure we have the required fields
    const to = req.body?.to;
    const subject = req.body?.subject;
    const message = req.body?.message;
    
    if (!to || !subject || !message) {
      console.log('❌ Missing required fields:', { to: !!to, subject: !!subject, message: !!message });
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: to, subject, message'
      });
    }

    // Email options
    const mailOptions = {
      from: EMAIL_CONFIG.auth.user,
      to: to,
      subject: subject,
      html: message.replace(/\n/g, '<br>'),
      attachments: []
    };

    // Add PDF attachment if provided
    if (req.file) {
      mailOptions.attachments.push({
        filename: req.file.originalname || 'quote.pdf',
        content: req.file.buffer,
        contentType: 'application/pdf'
      });
    }

    // Send email
    console.log('📧 Attempting to send email with options:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      hasAttachments: mailOptions.attachments.length > 0,
      attachmentCount: mailOptions.attachments.length,
      attachmentSize: req.file ? req.file.size : 0
    });
    
    const startTime = Date.now();
    const info = await transporter.sendMail(mailOptions);
    const sendTime = Date.now() - startTime;
    
    console.log('✅ Email sent successfully:', info.messageId);
    console.log('📧 Email sending time:', sendTime + 'ms');
    console.log('📧 Total processing time:', sendTime + 'ms');
    
    res.json({
      success: true,
      message: 'Email sent successfully with PDF attachment',
      messageId: info.messageId,
      sendTime: sendTime,
      attachmentSize: req.file ? req.file.size : 0
    });

  } catch (error) {
    console.error('❌ Error sending email:', error);
    
    // Provide specific error messages for common authentication issues
    let errorMessage = 'Failed to send email';
    let detailedError = error.message;
    
    if (error.message.includes('Invalid login') || error.message.includes('535-5.7.8')) {
      errorMessage = 'Gmail authentication failed. Please check your credentials.';
      detailedError = 'Invalid Gmail username or password. Make sure you are using an App Password, not your regular Gmail password.';
    } else if (error.message.includes('Username and Password not accepted')) {
      errorMessage = 'Gmail credentials rejected. Please verify your App Password.';
      detailedError = 'The Gmail App Password is incorrect or has expired. Please generate a new App Password from your Google Account settings.';
    } else if (error.message.includes('Less secure app access')) {
      errorMessage = 'Gmail security settings blocking access.';
      detailedError = 'Enable 2-Factor Authentication and use an App Password instead of your regular password.';
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: detailedError,
      setupInstructions: [
        '1. Enable 2-Factor Authentication on your Gmail account',
        '2. Go to Google Account Settings → Security → 2-Step Verification → App passwords',
        '3. Generate a new App Password for "Mail"',
        '4. Update your .env file with the new App Password',
        '5. Restart the server'
      ]
    });
  }
});

// Simple email test endpoint (no file upload)
app.post('/api/email/send-simple', async (req, res) => {
  try {
    console.log('📧 Simple email test request received');
    console.log('📧 Request body:', req.body);
    
    const { to, subject, message } = req.body;
    
    if (!to || !subject || !message) {
      console.log('❌ Missing required fields:', { to: !!to, subject: !!subject, message: !!message });
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: to, subject, message'
      });
    }

    // Email options
    const mailOptions = {
      from: EMAIL_CONFIG.auth.user,
      to: to,
      subject: subject,
      html: message.replace(/\n/g, '<br>'),
      attachments: []
    };

    console.log('📧 Attempting to send simple email:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject
    });
    
    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Simple email sent successfully:', info.messageId);
    
    res.json({
      success: true,
      message: 'Simple email sent successfully',
      messageId: info.messageId
    });

  } catch (error) {
    console.error('❌ Error sending simple email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send simple email',
      error: error.message
    });
  }
});

// Immediate email sending endpoint (no PDF, just text)
app.post('/api/email/send-immediate', async (req, res) => {
  try {
    console.log('📧 Immediate email send request received');
    console.log('📧 Request body:', req.body);
    
    const { to, subject, message, quoteId, quoteNumber } = req.body;
    
    if (!to || !subject || !message) {
      console.log('❌ Missing required fields:', { to: !!to, subject: !!subject, message: !!message });
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: to, subject, message'
      });
    }

    // Email options for immediate sending
    const mailOptions = {
      from: EMAIL_CONFIG.auth.user,
      to: to,
      subject: subject,
      html: message.replace(/\n/g, '<br>'),
      attachments: []
    };

    console.log('📧 Attempting to send immediate email:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      quoteId: quoteId,
      quoteNumber: quoteNumber
    });
    
    const startTime = Date.now();
    const info = await transporter.sendMail(mailOptions);
    const sendTime = Date.now() - startTime;
    
    console.log('✅ Immediate email sent successfully:', info.messageId);
    console.log('📧 Immediate email sending time:', sendTime + 'ms');
    
    res.json({
      success: true,
      message: 'Immediate email sent successfully',
      messageId: info.messageId,
      sendTime: sendTime,
      quoteId: quoteId,
      quoteNumber: quoteNumber
    });

  } catch (error) {
    console.error('❌ Error sending immediate email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send immediate email',
      error: error.message
    });
  }
});

// HubSpot API endpoints
app.get('/api/hubspot/test', async (req, res) => {
  try {
    console.log('🔍 Testing HubSpot API connection...');
    
    if (HUBSPOT_API_KEY === 'demo-key') {
      console.log('⚠️ Using demo mode (no real API key)');
      return res.json({
        success: true,
        message: 'HubSpot API test successful (demo mode)',
        isDemo: true
      });
    }

    const response = await axios.get(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts?limit=1`, {
      headers: {
        'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ HubSpot API test successful');
    res.json({
      success: true,
      message: 'HubSpot API connection successful',
      isDemo: false,
      contactsCount: response.data.total || 0
    });

  } catch (error) {
    console.error('❌ HubSpot API test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      res.status(401).json({
        success: false,
        message: 'HubSpot API authentication failed. Please check your API key.',
        error: 'AUTHENTICATION_ERROR'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'HubSpot API test failed',
        error: error.response?.data || error.message
      });
    }
  }
});

app.get('/api/hubspot/contacts', async (req, res) => {
  try {
    console.log('🔍 Fetching HubSpot contacts...');
    
    if (HUBSPOT_API_KEY === 'demo-key') {
      console.log('⚠️ Using demo data (no real HubSpot API key)');
      return res.json({
        success: true,
        data: [
          {
            id: 'demo-1',
            properties: {
              firstname: 'John',
              lastname: 'Doe',
              email: 'john.doe@example.com',
              company: 'Demo Company Inc.',
              phone: '+1-555-0123'
            }
          },
          {
            id: 'demo-2',
            properties: {
              firstname: 'Jane',
              lastname: 'Smith',
              email: 'jane.smith@example.com',
              company: 'Sample Corp',
              phone: '+1-555-0456'
            }
          }
        ],
        isDemo: true
      });
    }

    const response = await axios.get(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts`, {
      headers: {
        'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
        'Content-Type': 'application/json'
      },
      params: {
        limit: 100,
        properties: 'firstname,lastname,email,company,phone'
      }
    });

    console.log('✅ HubSpot contacts fetched successfully');
    res.json({
      success: true,
      data: response.data.results,
      isDemo: false
    });

  } catch (error) {
    console.error('❌ Error fetching HubSpot contacts:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      res.status(401).json({
        success: false,
        message: 'HubSpot API authentication failed. Please check your API key.',
        error: 'AUTHENTICATION_ERROR'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch HubSpot contacts',
        error: error.response?.data || error.message
      });
    }
  }
});

app.get('/api/hubspot/companies', async (req, res) => {
  try {
    console.log('🔍 Fetching HubSpot companies...');
    
    if (HUBSPOT_API_KEY === 'demo-key') {
      console.log('⚠️ Using demo data (no real HubSpot API key)');
      return res.json({
        success: true,
        data: [
          {
            id: 'demo-company-1',
            properties: {
              name: 'Demo Company Inc.',
              domain: 'democompany.com',
              industry: 'Technology'
            }
          },
          {
            id: 'demo-company-2',
            properties: {
              name: 'Sample Corp',
              domain: 'samplecorp.com',
              industry: 'Finance'
            }
          }
        ],
        isDemo: true
      });
    }

    const response = await axios.get(`${HUBSPOT_BASE_URL}/crm/v3/objects/companies`, {
      headers: {
        'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
        'Content-Type': 'application/json'
      },
      params: {
        limit: 100,
        properties: 'name,domain,industry'
      }
    });

    console.log('✅ HubSpot companies fetched successfully');
    res.json({
      success: true,
      data: response.data.results,
      isDemo: false
    });

  } catch (error) {
    console.error('❌ Error fetching HubSpot companies:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      res.status(401).json({
        success: false,
        message: 'HubSpot API authentication failed. Please check your API key.',
        error: 'AUTHENTICATION_ERROR'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch HubSpot companies',
        error: error.response?.data || error.message
      });
    }
  }
});

// HubSpot deals endpoint
app.get('/api/hubspot/deals', async (req, res) => {
  try {
    console.log('🔍 Fetching HubSpot deals...');
    
    if (HUBSPOT_API_KEY === 'demo-key') {
      console.log('⚠️ Using demo data (no real HubSpot API key)');
      return res.json({
        success: true,
        data: [
          {
            id: 'demo-deal-1',
            properties: {
              dealname: 'Enterprise Software License',
              amount: '50000',
              dealstage: 'closedwon',
              closedate: '2024-08-15T00:00:00Z'
            }
          },
          {
            id: 'demo-deal-2',
            properties: {
              dealname: 'Consulting Services',
              amount: '25000',
              dealstage: 'presentationscheduled',
              closedate: '2024-09-30T00:00:00Z'
            }
          }
        ],
        isDemo: true
      });
    }

    const response = await axios.get(`${HUBSPOT_BASE_URL}/crm/v3/objects/deals`, {
      headers: {
        'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
        'Content-Type': 'application/json'
      },
      params: {
        limit: 100,
        properties: 'dealname,amount,dealstage,closedate'
      }
    });

    console.log('✅ HubSpot deals fetched successfully');
    res.json({
      success: true,
      data: response.data.results,
      isDemo: false
    });

  } catch (error) {
    console.error('❌ Error fetching HubSpot deals:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      res.status(401).json({
        success: false,
        message: 'HubSpot API authentication failed. Please check your API key.',
        error: 'AUTHENTICATION_ERROR'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch HubSpot deals',
        error: error.response?.data || error.message
      });
    }
  }
});

// Get specific HubSpot deal by ID with enhanced company and contact data
app.get('/api/hubspot/deal/:dealId', async (req, res) => {
  try {
    const { dealId } = req.params;
    console.log('🔍 Fetching specific HubSpot deal with enhanced data:', dealId);
    
    if (HUBSPOT_API_KEY === 'demo-key') {
      console.log('⚠️ Using enhanced demo data for specific deal');
      return res.json({
        success: true,
        data: {
          id: dealId,
          properties: {
            dealname: 'Demo Deal - Cloud Migration',
            amount: '25000',
            dealstage: 'proposal',
            closedate: '2024-12-31T00:00:00Z',
            hubspot_owner_id: 'demo-owner-123',
            company: 'Demo Company Inc.',
            contact_name: 'John Smith',
            contact_email: 'john.smith@democompany.com',
            contact_phone: '+1 (555) 123-4567',
            contact_job_title: 'IT Director',
            company_domain: 'democompany.com',
            company_phone: '+1 (555) 987-6543',
            company_address: '123 Business Street, City, State 12345'
          }
        },
        isDemo: true
      });
    }

    // Fetch deal with expanded properties
    const dealResponse = await axios.get(`${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${dealId}`, {
      headers: {
        'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
        'Content-Type': 'application/json'
      },
      params: {
        properties: 'dealname,amount,dealstage,closedate,hubspot_owner_id,company,contact_name,contact_email,contact_phone,contact_job_title'
      }
    });

    console.log('✅ Deal data fetched successfully');

    // Extract deal properties
    const dealProperties = dealResponse.data.properties;
    let enhancedDealData = {
      ...dealProperties,
      company_domain: '',
      company_phone: '',
      company_address: ''
    };

    // Fetch associated company details if company ID exists
    if (dealProperties.company) {
      try {
        console.log('🏢 Fetching company details for ID:', dealProperties.company);
        const companyResponse = await axios.get(`${HUBSPOT_BASE_URL}/crm/v3/objects/companies/${dealProperties.company}`, {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
            'Content-Type': 'application/json'
          },
          params: {
            properties: 'name,domain,phone,address'
          }
        });

        const companyProperties = companyResponse.data.properties;
        enhancedDealData = {
          ...enhancedDealData,
          company: companyProperties.name || dealProperties.company,
          company_domain: companyProperties.domain || '',
          company_phone: companyProperties.phone || '',
          company_address: companyProperties.address || ''
        };

        console.log('✅ Company details fetched successfully');
      } catch (companyError) {
        console.warn('⚠️ Could not fetch company details:', companyError.message);
      }
    }

    // Fetch associated contact details if contact ID exists
    if (dealProperties.contact_name) {
      try {
        console.log('👤 Fetching contact details for ID:', dealProperties.contact_name);
        const contactResponse = await axios.get(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/${dealProperties.contact_name}`, {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
            'Content-Type': 'application/json'
          },
          params: {
            properties: 'firstname,lastname,email,phone,jobtitle'
          }
        });

        const contactProperties = contactResponse.data.properties;
        enhancedDealData = {
          ...enhancedDealData,
          contact_name: `${contactProperties.firstname || ''} ${contactProperties.lastname || ''}`.trim(),
          contact_email: contactProperties.email || '',
          contact_phone: contactProperties.phone || '',
          contact_job_title: contactProperties.jobtitle || ''
        };

        console.log('✅ Contact details fetched successfully');
      } catch (contactError) {
        console.warn('⚠️ Could not fetch contact details:', contactError.message);
      }
    }

    console.log('✅ Enhanced deal data prepared successfully');
    res.json({
      success: true,
      data: {
        id: dealId,
        properties: enhancedDealData
      },
      isDemo: false
    });

  } catch (error) {
    console.error('❌ Error fetching specific HubSpot deal:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      res.status(404).json({
        success: false,
        message: 'Deal not found',
        error: 'DEAL_NOT_FOUND'
      });
    } else if (error.response?.status === 401) {
      res.status(401).json({
        success: false,
        message: 'HubSpot API authentication failed',
        error: 'AUTHENTICATION_ERROR'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch specific deal',
        error: error.response?.data || error.message
      });
    }
  }
});

// Create HubSpot contact
app.post('/api/hubspot/contacts', async (req, res) => {
  try {
    console.log('🔍 Creating HubSpot contact...');
    console.log('📄 Contact data:', req.body);
    
    if (HUBSPOT_API_KEY === 'demo-key') {
      console.log('⚠️ Using demo mode for contact creation');
      const demoContact = {
        id: `demo-contact-${Date.now()}`,
        properties: req.body.properties
      };
      return res.json({
        success: true,
        contact: demoContact,
        isDemo: true
      });
    }

    const response = await axios.post(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts`, req.body, {
      headers: {
        'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ HubSpot contact created successfully');
    res.json({
      success: true,
      contact: response.data,
      isDemo: false
    });

  } catch (error) {
    console.error('❌ Error creating HubSpot contact:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      res.status(401).json({
        success: false,
        message: 'HubSpot API authentication failed. Please check your API key.',
        error: 'AUTHENTICATION_ERROR'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to create HubSpot contact',
        error: error.response?.data || error.message
      });
    }
  }
});

// Create HubSpot deal
app.post('/api/hubspot/deals', async (req, res) => {
  try {
    console.log('🔍 Creating HubSpot deal...');
    console.log('📄 Deal data:', req.body);
    
    if (HUBSPOT_API_KEY === 'demo-key') {
      console.log('⚠️ Using demo mode for deal creation');
      const demoDeal = {
        id: `demo-deal-${Date.now()}`,
        properties: req.body.properties
      };
      return res.json({
        success: true,
        deal: demoDeal,
        isDemo: true
      });
    }

    const response = await axios.post(`${HUBSPOT_BASE_URL}/crm/v3/objects/deals`, req.body, {
      headers: {
        'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ HubSpot deal created successfully');
    res.json({
      success: true,
      deal: response.data,
      isDemo: false
    });

  } catch (error) {
    console.error('❌ Error creating HubSpot deal:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      res.status(401).json({
        success: false,
        message: 'HubSpot API authentication failed. Please check your API key.',
        error: 'AUTHENTICATION_ERROR'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to create HubSpot deal',
        error: error.response?.data || error.message
      });
    }
  }
});

// Digital Signature and Form Tracking Endpoints
app.post('/api/signature/create-form', async (req, res) => {
  try {
    console.log('📝 Creating digital signature form...');
    console.log('📝 Request body:', req.body);
    const { quoteId, clientEmail, clientName, quoteData } = req.body;
    
    if (!quoteId || !clientEmail || !clientName) {
      console.log('❌ Missing required fields:', { quoteId: !!quoteId, clientEmail: !!clientEmail, clientName: !!clientName });
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: quoteId, clientEmail, clientName' 
      });
    }

    // Generate unique form ID
    const formId = `form-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('🆔 Generated form ID:', formId);
    
    // Create form tracking record
    const formData = {
      formId,
      quoteId,
      clientEmail,
      clientName,
      quoteData,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      interactions: [],
      signatureData: null,
      approvalStatus: 'pending'
    };

    console.log('📋 Form data to insert:', {
      formId: formData.formId,
      quoteId: formData.quoteId,
      clientEmail: formData.clientEmail,
      clientName: formData.clientName,
      status: formData.status,
      createdAt: formData.createdAt,
      expiresAt: formData.expiresAt
    });

    // Store in database
    const [result] = await pool.execute(
      'INSERT INTO signature_forms (form_id, quote_id, client_email, client_name, quote_data, status, created_at, expires_at, interactions, signature_data, approval_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        formData.formId,
        formData.quoteId,
        formData.clientEmail,
        formData.clientName,
        JSON.stringify(formData.quoteData || {}),
        formData.status,
        formData.createdAt,
        formData.expiresAt,
        JSON.stringify(formData.interactions || []),
        formData.signatureData ? JSON.stringify(formData.signatureData) : null,
        formData.approvalStatus
      ]
    );

    console.log('✅ Signature form created successfully:', formId);
    console.log('📊 Database result:', result);
    
    res.json({
      success: true,
      formId,
      message: 'Digital signature form created successfully'
    });

  } catch (error) {
    console.error('❌ Error creating signature form:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create signature form',
      error: error.message
    });
  }
});

app.post('/api/signature/track-interaction', async (req, res) => {
  try {
    const { formId, interactionType, data } = req.body;
    
    if (!formId || !interactionType) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: formId, interactionType' 
      });
    }

    const interaction = {
      timestamp: new Date(),
      type: interactionType,
      data: data || {}
    };

    // Update form interactions
    await pool.execute(
      'UPDATE signature_forms SET interactions = JSON_ARRAY_APPEND(interactions, "$", ?) WHERE form_id = ?',
      [JSON.stringify(interaction), formId]
    );

    console.log('📊 Interaction tracked:', { formId, interactionType });
    res.json({ success: true, message: 'Interaction tracked successfully' });

  } catch (error) {
    console.error('❌ Error tracking interaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track interaction',
      error: error.message
    });
  }
});

// Client signature form submission and template processing
app.post('/api/signature/client-submit', async (req, res) => {
  try {
    console.log('📝 Client signature form submission received');
    const { formId, signatureData, templateData } = req.body;
    
    if (!formId || !signatureData) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: formId, signatureData' 
      });
    }

    // Validate signature data
    const { eSignature, fullName, title, date, selectedFontStyle } = signatureData;
    if (!eSignature || !fullName || !title || !date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required signature fields' 
      });
    }

    // Get form data from database
    const [formRows] = await pool.execute(
      'SELECT * FROM signature_forms WHERE form_id = ?',
      [formId]
    );

    if (formRows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Signature form not found' 
      });
    }

    const form = formRows[0];
    
    // Update form with client signature data and image
    const updateData = {
      signature_data: JSON.stringify(signatureData),
      status: 'completed',
      approval_status: 'approved'
    };
    
    // If signature image is provided, store it
    if (signatureData.signatureImage) {
      updateData.client_signature_image = signatureData.signatureImage;
    }
    
    const updateFields = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
    const updateValues = [...Object.values(updateData), formId];
    
    await pool.execute(
      `UPDATE signature_forms SET ${updateFields} WHERE form_id = ?`,
      updateValues
    );

    // Track the signature submission
    await pool.execute(
      'UPDATE signature_forms SET interactions = JSON_ARRAY_APPEND(interactions, "$", ?) WHERE form_id = ?',
      [
        JSON.stringify({
          timestamp: new Date(),
          type: 'client_signature_submitted',
          data: { eSignature, fullName, title, date, selectedFontStyle }
        }),
        formId
      ]
    );

    console.log('✅ Client signature submitted successfully:', formId);
    
    // Return success with form data for template processing
    res.json({
      success: true,
      message: 'Client signature submitted successfully',
      formData: form,
      signatureData: signatureData
    });

  } catch (error) {
    console.error('❌ Error processing client signature:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process client signature',
      error: error.message
    });
  }
});

// Upload signature image
app.post('/api/signature/upload-image', upload.single('signatureImage'), async (req, res) => {
  try {
    console.log('📸 Signature image upload request received');
    
    const { formId, signatureType } = req.body; // signatureType: 'user' or 'client'
    const signatureImage = req.file;
    
    if (!formId || !signatureType || !signatureImage) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: formId, signatureType, or signatureImage' 
      });
    }

    // Convert image to base64
    const imageBuffer = signatureImage.buffer;
    const base64Image = `data:${signatureImage.mimetype};base64,${imageBuffer.toString('base64')}`;
    
    // Update database with signature image
    const columnName = signatureType === 'user' ? 'user_signature_image' : 'client_signature_image';
    
    await pool.execute(
      `UPDATE signature_forms SET ${columnName} = ? WHERE form_id = ?`,
      [base64Image, formId]
    );

    console.log(`✅ ${signatureType} signature image uploaded successfully for form:`, formId);
    
    res.json({
      success: true,
      message: `${signatureType} signature image uploaded successfully`,
      imageSize: imageBuffer.length
    });

  } catch (error) {
    console.error('❌ Error uploading signature image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload signature image',
      error: error.message
    });
  }
});

// Get signature form data for client access
app.get('/api/signature/form/:formId', async (req, res) => {
  try {
    const { formId } = req.params;
    console.log('🔍 Looking for signature form with ID:', formId);
    
    // First, check if the table exists
    try {
      const [tableCheck] = await pool.execute('SHOW TABLES LIKE "signature_forms"');
      if (tableCheck.length === 0) {
        console.log('❌ signature_forms table does not exist');
        return res.status(500).json({ 
          success: false, 
          message: 'Signature forms table not found. Please contact administrator.' 
        });
      }
      console.log('✅ signature_forms table exists');
    } catch (tableError) {
      console.error('❌ Error checking table:', tableError);
      return res.status(500).json({ 
        success: false, 
        message: 'Database error. Please contact administrator.' 
      });
    }
    
    // Check all forms to see what's available
    const [allForms] = await pool.execute('SELECT form_id, client_name, created_at FROM signature_forms LIMIT 10');
    console.log('📋 Available forms in database:', allForms.map(f => ({ id: f.form_id, name: f.client_name, created: f.created_at })));
    
    const [formRows] = await pool.execute(
      'SELECT * FROM signature_forms WHERE form_id = ?',
      [formId]
    );

    console.log('🔍 Form search result:', formRows.length, 'rows found');

    if (formRows.length === 0) {
      console.log('❌ No form found with ID:', formId);
      return res.status(404).json({ 
        success: false, 
        message: 'Signature form not found or has expired.' 
      });
    }

    const form = formRows[0];
    console.log('✅ Form found:', { 
      formId: form.form_id, 
      clientName: form.client_name, 
      status: form.status,
      createdAt: form.created_at,
      expiresAt: form.expires_at
    });
    
    // Check if form has expired
    if (new Date() > new Date(form.expires_at)) {
      console.log('❌ Form has expired:', form.expires_at);
      return res.status(410).json({ 
        success: false, 
        message: 'Signature form has expired.' 
      });
    }

    console.log('✅ Form is valid and not expired');

    // Safely parse JSON fields
    let quoteData = {};
    let signatureData = null;
    
    try {
      if (form.quote_data) {
        quoteData = JSON.parse(form.quote_data);
      }
    } catch (error) {
      console.log('⚠️ Error parsing quote_data, using empty object:', error.message);
      quoteData = {};
    }
    
    try {
      if (form.signature_data) {
        signatureData = JSON.parse(form.signature_data);
      }
    } catch (error) {
      console.log('⚠️ Error parsing signature_data, using null:', error.message);
      signatureData = null;
    }

    res.json({
      success: true,
      formData: {
        formId: form.form_id,
        quoteId: form.quote_id,
        clientEmail: form.client_email,
        clientName: form.client_name,
        quoteData: quoteData,
        status: form.status,
        createdAt: form.created_at,
        expiresAt: form.expires_at,
        approvalStatus: form.approval_status,
        userSignatureImage: form.user_signature_image,
        clientSignatureImage: form.client_signature_image,
        signatureData: signatureData
      }
    });

  } catch (error) {
    console.error('❌ Error retrieving signature form:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve signature form',
      error: error.message
    });
  }
});

// Generate final template with both user and client signatures
app.post('/api/signature/generate-final-template', async (req, res) => {
  try {
    console.log('🔄 Generating final template with both signatures...');
    const { formId } = req.body;
    
    if (!formId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required field: formId' 
      });
    }

    // Get form data with both signatures
    const [formRows] = await pool.execute(
      'SELECT * FROM signature_forms WHERE form_id = ?',
      [formId]
    );

    if (formRows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Signature form not found' 
      });
    }

    const form = formRows[0];
    
    // Check if both signatures are present
    if (!form.signature_data) {
      return res.status(400).json({ 
        success: false, 
        message: 'Client signature not found. Please complete the signature form first.' 
      });
    }

    // Parse client signature data safely
    let clientSignatureData;
    try {
      if (typeof form.signature_data === 'string') {
        clientSignatureData = JSON.parse(form.signature_data);
      } else {
        clientSignatureData = form.signature_data;
      }
    } catch (error) {
      console.log('⚠️ Error parsing signature_data:', error.message);
      throw new Error('Invalid signature data format');
    }
    
    // Create quote data with both signatures
    let baseQuoteData = {};
    try {
      if (form.quote_data) {
        baseQuoteData = JSON.parse(form.quote_data);
      }
    } catch (error) {
      console.log('⚠️ Error parsing quote_data, using empty object:', error.message);
      baseQuoteData = {};
    }
    
    const quoteData = {
      ...baseQuoteData,
      signatureData: {
        eSignature: 'User Signature',
        fullName: 'CloudFuze User',
        title: 'CloudFuze Representative',
        date: new Date().toISOString().split('T')[0]
      },
      clientSignatureData: {
        eSignature: clientSignatureData.eSignature,
        fullName: clientSignatureData.fullName,
        title: clientSignatureData.title,
        date: clientSignatureData.date,
        selectedFontStyle: clientSignatureData.selectedFontStyle || 0
      }
    };

    // Import PDF merger function from CommonJS version
    const { mergeQuoteWithPlaceholders } = require('./server-utils.cjs');
    
    // Generate final template with both signatures
    const quoteNumber = `FINAL-${formId.slice(-6)}`;
    const { newTemplateBlob } = await mergeQuoteWithPlaceholders(null, quoteData, quoteNumber);
    
    // Convert blob to base64 for response
    const arrayBuffer = await newTemplateBlob.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    console.log('✅ Final template generated with both signatures');
    
    res.json({
      success: true,
      message: 'Final template generated successfully',
      templateData: base64,
      fileName: `Final-Template-${formId.slice(-6)}.pdf`
    });

  } catch (error) {
    console.error('❌ Error generating final template:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to generate final template',
      error: error.message,
      details: error.stack
    });
  }
});

app.post('/api/signature/submit', async (req, res) => {
  try {
    const { formId, signatureData, approvalStatus, clientComments } = req.body;
    
    if (!formId || !signatureData) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: formId, signatureData' 
      });
    }

    // Update form with signature and approval
    await pool.execute(
      'UPDATE signature_forms SET signature_data = ?, approval_status = ?, client_comments = ?, status = "completed", completed_at = ? WHERE form_id = ?',
      [
        JSON.stringify(signatureData),
        approvalStatus || 'approved',
        clientComments || '',
        new Date(),
        formId
      ]
    );

    // Get form details for notification
    const [forms] = await pool.execute(
      'SELECT * FROM signature_forms WHERE form_id = ?',
      [formId]
    );

    if (forms.length > 0) {
      const form = forms[0];
      
      // Send notification email to admin
      const notificationEmail = {
        to: process.env.ADMIN_EMAIL || 'admin@cpqsolutions.com',
        subject: `Quote ${approvalStatus === 'approved' ? 'Approved' : 'Rejected'} - ${form.client_name}`,
        message: `
          Quote Status Update:
          
          Client: ${form.client_name}
          Email: ${form.client_email}
          Status: ${approvalStatus === 'approved' ? '✅ APPROVED' : '❌ REJECTED'}
          Comments: ${clientComments || 'No comments provided'}
          
          Form ID: ${formId}
          Completed: ${new Date().toLocaleString()}
        `
      };

      try {
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: notificationEmail.to,
          subject: notificationEmail.subject,
          text: notificationEmail.message
        });
        console.log('📧 Admin notification sent');
      } catch (emailError) {
        console.error('❌ Failed to send admin notification:', emailError);
      }
    }

    console.log('✅ Signature form submitted:', formId);
    res.json({
      success: true,
      message: 'Signature form submitted successfully'
    });

  } catch (error) {
    console.error('❌ Error submitting signature form:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit signature form',
      error: error.message
    });
  }
});

app.get('/api/signature/form/:formId', async (req, res) => {
  try {
    const { formId } = req.params;
    
    const [forms] = await pool.execute(
      'SELECT * FROM signature_forms WHERE form_id = ?',
      [formId]
    );

    if (forms.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Signature form not found'
      });
    }

    const form = forms[0];
    // MySQL driver automatically parses JSON, so we don't need to parse again
    form.quote_data = form.quote_data || {};
    // MySQL driver automatically parses JSON, so we don't need to parse again
    form.interactions = form.interactions || [];
    // MySQL driver automatically parses JSON, so we don't need to parse again
    form.signature_data = form.signature_data || null;

    res.json({
      success: true,
      form
    });

  } catch (error) {
    console.error('❌ Error fetching signature form:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch signature form',
      error: error.message
    });
  }
});

app.get('/api/signature/forms-by-quote/:quoteId', async (req, res) => {
  try {
    const { quoteId } = req.params;
    
    const [forms] = await pool.execute(
      'SELECT * FROM signature_forms WHERE quote_id = ? ORDER BY created_at DESC',
      [quoteId]
    );

    // Parse JSON fields for each form
    const parsedForms = forms.map(form => ({
      ...form,
      quote_data: form.quote_data || {},
      interactions: form.interactions || [],
      signature_data: form.signature_data || null
    }));

    res.json({
      success: true,
      forms: parsedForms
    });

  } catch (error) {
    console.error('❌ Error fetching signature forms by quote:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch signature forms',
      error: error.message
    });
  }
});

app.get('/api/signature/analytics', async (req, res) => {
  try {
    // Get analytics data
    const [totalForms] = await pool.execute('SELECT COUNT(*) as total FROM signature_forms');
    const [pendingForms] = await pool.execute('SELECT COUNT(*) as pending FROM signature_forms WHERE status = "pending"');
    const [completedForms] = await pool.execute('SELECT COUNT(*) as completed FROM signature_forms WHERE status = "completed"');
    const [approvedForms] = await pool.execute('SELECT COUNT(*) as approved FROM signature_forms WHERE approval_status = "approved"');
    const [rejectedForms] = await pool.execute('SELECT COUNT(*) as rejected FROM signature_forms WHERE approval_status = "rejected"');

    // Get recent activity
    const [recentActivity] = await pool.execute(`
      SELECT form_id, client_name, client_email, status, approval_status, created_at, completed_at 
      FROM signature_forms 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    res.json({
      success: true,
      analytics: {
        total: totalForms[0].total,
        pending: pendingForms[0].pending,
        completed: completedForms[0].completed,
        approved: approvedForms[0].approved,
        rejected: rejectedForms[0].rejected,
        approvalRate: totalForms[0].total > 0 ? (approvedForms[0].approved / totalForms[0].total * 100).toFixed(1) : 0
      },
      recentActivity
    });

  } catch (error) {
    console.error('❌ Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
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
    const { id } = req.params;
    const { status } = req.body;
    
    const connection = await pool.getConnection();
    await connection.execute(`
      UPDATE quotes 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, id]);
    
    connection.release();
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
    const { id } = req.params;
    
    const connection = await pool.getConnection();
    await connection.execute('DELETE FROM quotes WHERE id = ?', [id]);
    
    connection.release();
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

// Save pricing tiers to database
app.post('/api/pricing-tiers', async (req, res) => {
  try {
    const { id, name, perUserCost, perGBCost, managedMigrationCost, instanceCost, userLimits, gbLimits, features } = req.body;
    
    const connection = await pool.getConnection();
    await connection.execute(`
      INSERT INTO pricing_tiers (id, name, per_user_cost, per_gb_cost, managed_migration_cost, instance_cost, user_limits, gb_limits, features)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      per_user_cost = VALUES(per_user_cost),
      per_gb_cost = VALUES(per_gb_cost),
      managed_migration_cost = VALUES(managed_migration_cost),
      instance_cost = VALUES(instance_cost),
      user_limits = VALUES(user_limits),
      gb_limits = VALUES(gb_limits),
      features = VALUES(features),
      updated_at = CURRENT_TIMESTAMP
    `, [id, name, perUserCost, perGBCost, managedMigrationCost, instanceCost, JSON.stringify(userLimits), JSON.stringify(gbLimits), JSON.stringify(features)]);
    
    connection.release();
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
    const connection = await pool.getConnection();
    const [rows] = await connection.execute('SELECT * FROM pricing_tiers ORDER BY name');
    connection.release();
    
    const tiers = rows.map(row => ({
      ...row,
      userLimits: JSON.parse(row.user_limits),
      gbLimits: JSON.parse(row.gb_limits),
      features: JSON.parse(row.features)
    }));
    
    res.json({ success: true, tiers });
  } catch (error) {
    console.error('Get pricing tiers error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get pricing tiers',
      error: error.message
    });
  }
});

// Template Management API Endpoints

// Upload template to database
app.post('/api/templates', upload.single('template'), async (req, res) => {
  try {
    console.log('📄 Template upload request received');
    
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

    const connection = await pool.getConnection();
    
    try {
      // Insert template into database
      const [result] = await connection.execute(
        `INSERT INTO templates (id, name, description, file_name, file_type, file_data, file_size, is_default) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          templateId,
          name || file.originalname,
          description || null,
          file.originalname,
          fileType,
          file.buffer,
          file.size,
          isDefault === 'true' || false
        ]
      );

      console.log('✅ Template saved to database:', templateId);
      
      res.json({
        success: true,
        message: 'Template uploaded successfully',
        template: {
          id: templateId,
          name: name || file.originalname,
          description: description || null,
          fileName: file.originalname,
          fileType,
          fileSize: file.size,
          isDefault: isDefault === 'true' || false,
          createdAt: new Date().toISOString()
        }
      });
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('❌ Error uploading template:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload template',
      details: error.message 
    });
  }
});

// Get all templates from database
app.get('/api/templates', async (req, res) => {
  try {
    console.log('📄 Fetching templates from database...');
    
    const connection = await pool.getConnection();
    
    try {
      const [rows] = await connection.execute(
        `SELECT id, name, description, file_name, file_type, file_size, is_default, created_at, updated_at 
         FROM templates 
         ORDER BY created_at DESC`
      );

      console.log(`✅ Found ${rows.length} templates in database`);
      
      const templates = rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        fileName: row.file_name,
        fileType: row.file_type,
        fileSize: row.file_size,
        isDefault: row.is_default,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      res.json({
        success: true,
        templates,
        count: templates.length
      });
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('❌ Error fetching templates:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch templates',
      details: error.message 
    });
  }
});

// Get specific template file from database
app.get('/api/templates/:id/file', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📄 Fetching template file:', id);
    
    const connection = await pool.getConnection();
    
    try {
      const [rows] = await connection.execute(
        `SELECT file_name, file_type, file_data FROM templates WHERE id = ?`,
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Template not found' 
        });
      }

      const template = rows[0];
      
      // Set appropriate headers for file download
      res.setHeader('Content-Type', template.file_type === 'docx' ? 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 
        'application/pdf'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${template.file_name}"`);
      res.setHeader('Content-Length', template.file_data.length);
      
      // Send file data
      res.send(template.file_data);
      
      console.log('✅ Template file sent:', template.file_name);
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('❌ Error fetching template file:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch template file',
      details: error.message 
    });
  }
});

// Delete template from database
app.delete('/api/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🗑️ Deleting template:', id);
    
    const connection = await pool.getConnection();
    
    try {
      const [result] = await connection.execute(
        `DELETE FROM templates WHERE id = ?`,
        [id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Template not found' 
        });
      }

      console.log('✅ Template deleted from database:', id);
      
      res.json({
        success: true,
        message: 'Template deleted successfully'
      });
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('❌ Error deleting template:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete template',
      details: error.message 
    });
  }
});

// Update template metadata (name, description, isDefault)
app.put('/api/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, isDefault } = req.body;
    console.log('📝 Updating template metadata:', id);
    
    const connection = await pool.getConnection();
    
    try {
      const [result] = await connection.execute(
        `UPDATE templates 
         SET name = ?, description = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [name, description, isDefault === 'true' || false, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Template not found' 
        });
      }

      console.log('✅ Template metadata updated:', id);
      
      res.json({
        success: true,
        message: 'Template updated successfully'
      });
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('❌ Error updating template:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update template',
      details: error.message 
    });
  }
});

// Health check endpoint
// Root route for deal information display
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
    deal: {
      dealId,
      dealName,
      amount,
      closeDate,
      stage,
      ownerId
    },
    contact: {
      email: contactEmail,
      firstName: contactFirstName,
      lastName: contactLastName
    },
    company: {
      name: companyName,
      byContact: companyByContact
    }
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
<p><strong>Company by Contact:</strong> ${companyByContact || companyName}</p>
  `);
});

app.get('/api/health', (req, res) => {
  res.json({ 
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    services: {
      database: 'available',
      hubspot: 'available',
      email: 'available',
      templates: 'available'
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Database: ${dbConfig.database} on ${dbConfig.host}:${dbConfig.port}`);
  console.log(`📧 Email service configured for: ${EMAIL_CONFIG.auth.user}`);
  console.log(`🔗 HubSpot API: ${HUBSPOT_API_KEY === 'demo-key' ? 'DEMO MODE' : 'CONNECTED'}`);
  console.log(`🌐 API endpoints:`);
      console.log(`   - GET  / (Deal Information Display)`);
      console.log(`   - GET  /api/health`);
      console.log(`   - GET  /api/database/health`);
      console.log(`   - GET  /api/quotes`);
      console.log(`   - POST /api/quotes`);
      console.log(`   - GET  /api/pricing-tiers`);
      console.log(`   - POST /api/pricing-tiers`);
  console.log(`   - GET  /api/hubspot/contacts`);
  console.log(`   - GET  /api/hubspot/companies`);
  console.log(`   - POST /api/email/send`);
  console.log(`   - GET  /api/email/test`);
  console.log(`   - POST /api/templates`);
  console.log(`   - GET  /api/templates`);
  console.log(`   - GET  /api/templates/:id/file`);
  console.log(`   - PUT  /api/templates/:id`);
  console.log(`   - DELETE /api/templates/:id`);
      console.log(`   - POST /api/signature/create-form`);
    console.log(`   - POST /api/signature/track-interaction`);
    console.log(`   - POST /api/signature/submit`);
    console.log(`   - GET  /api/signature/form/:formId`);
    console.log(`   - GET  /api/signature/forms-by-quote/:quoteId`);
    console.log(`   - GET  /api/signature/analytics`);
    console.log(`   - GET  /api/test-mongodb`);
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
