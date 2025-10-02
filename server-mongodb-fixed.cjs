const express = require('express');
const cors = require('cors');
const axios = require('axios');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const { MongoClient } = require('mongodb');
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
initializeDatabase().then(available => {
  databaseAvailable = available;
});

// Environment variables
const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY || 'demo-key';
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = process.env.EMAIL_PORT || 587;

// Email configuration
let transporter;
const isEmailConfigured = EMAIL_USER && EMAIL_PASS;

if (isEmailConfigured) {
  transporter = nodemailer.createTransporter({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: false,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });
}

// Serve static files
app.use(express.static('dist'));

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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Database available: ${databaseAvailable}`);
  console.log(`📧 Email configured: ${isEmailConfigured}`);
  console.log(`🔗 HubSpot API key: ${HUBSPOT_API_KEY !== 'demo-key' ? 'Configured' : 'Demo mode'}`);
  console.log(`🌐 Available endpoints:`);
  console.log(`   - GET  /`);
  console.log(`   - GET  /api/database/health`);
  console.log(`   - GET  /api/quotes`);
  console.log(`   - POST /api/quotes`);
  console.log(`   - PUT  /api/quotes/:id`);
  console.log(`   - DELETE /api/quotes/:id`);
  console.log(`   - GET  /api/pricing-tiers`);
  console.log(`   - POST /api/pricing-tiers`);
  console.log(`   - GET  /api/test-mongodb`);
});
