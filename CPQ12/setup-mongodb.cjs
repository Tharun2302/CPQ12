const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function setupMongoDB() {
  let client;
  
  try {
    console.log('🔍 Connecting to MongoDB...');
    console.log('📊 MongoDB URI:', MONGODB_URI.replace(/\/\/.*@/, '//***:***@'));
    
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB successfully');
    console.log('📊 Database name:', DB_NAME);
    
    // Test the connection
    await db.admin().ping();
    console.log('✅ MongoDB ping successful');
    
    // Create collections with proper structure
    const collections = [
      {
        name: 'quotes',
        indexes: [
          { key: { id: 1 }, unique: true },
          { key: { client_email: 1 } },
          { key: { company: 1 } },
          { key: { status: 1 } },
          { key: { created_at: -1 } }
        ]
      },
      {
        name: 'templates',
        indexes: [
          { key: { id: 1 }, unique: true },
          { key: { name: 1 } },
          { key: { created_at: -1 } }
        ]
      },
      {
        name: 'documents',
        indexes: [
          // Document identifier (can be Mongo _id or application-level id)
          { key: { id: 1 }, unique: true },
          // Common query patterns
          { key: { quoteId: 1 } },
          { key: { clientEmail: 1 } },
          { key: { company: 1 } },
          { key: { createdAt: -1 } },
          { key: { generatedDate: -1 } }
        ]
      },
      {
        name: 'pricing_tiers',
        indexes: [
          { key: { id: 1 }, unique: true },
          { key: { name: 1 } },
          { key: { created_at: -1 } }
        ]
      },
      // Users collection for authentication (login)
      // Indexing email ensures fast lookups for /api/auth/login and /api/auth/me
      {
        name: 'users',
        indexes: [
          { key: { id: 1 }, unique: true },
          { key: { email: 1 }, unique: true },
          { key: { created_at: -1 } }
        ]
      }
    ];
    
    console.log('\n📋 Creating collections and indexes...');
    
    for (const collection of collections) {
      try {
        // Create collection
        await db.createCollection(collection.name);
        console.log(`✅ Collection '${collection.name}' created`);
        
        // Create indexes
        for (const index of collection.indexes) {
          try {
            await db.collection(collection.name).createIndex(index.key, { unique: index.unique || false });
            console.log(`  ✅ Index created: ${JSON.stringify(index.key)}`);
          } catch (indexError) {
            if (indexError.code === 11000) {
              console.log(`  ℹ️ Index already exists: ${JSON.stringify(index.key)}`);
            } else {
              console.log(`  ⚠️ Index creation failed: ${indexError.message}`);
            }
          }
        }
      } catch (error) {
        if (error.code === 48) { // Collection already exists
          console.log(`ℹ️ Collection '${collection.name}' already exists`);
        } else {
          console.log(`❌ Error creating collection '${collection.name}':`, error.message);
        }
      }
    }
    
    // Insert sample data
    console.log('\n📊 Inserting sample data...');
    
    // Sample pricing tiers
    const samplePricingTiers = [
      {
        id: 'basic',
        name: 'Basic',
        per_user_cost: 10,
        per_gb_cost: 5,
        managed_migration_cost: 500,
        instance_cost: 200,
        user_limits: { min: 1, max: 10 },
        gb_limits: { min: 1, max: 100 },
        features: ['Basic support', 'Standard migration'],
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'professional',
        name: 'Professional',
        per_user_cost: 20,
        per_gb_cost: 8,
        managed_migration_cost: 800,
        instance_cost: 400,
        user_limits: { min: 5, max: 50 },
        gb_limits: { min: 10, max: 500 },
        features: ['Priority support', 'Advanced migration', 'Custom templates'],
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        per_user_cost: 35,
        per_gb_cost: 12,
        managed_migration_cost: 1200,
        instance_cost: 800,
        user_limits: { min: 20, max: 1000 },
        gb_limits: { min: 50, max: 2000 },
        features: ['24/7 support', 'White-glove migration', 'Custom development', 'SLA guarantee'],
        created_at: new Date(),
        updated_at: new Date()
      }
    ];
    
    try {
      await db.collection('pricing_tiers').insertMany(samplePricingTiers);
      console.log('✅ Sample pricing tiers inserted');
    } catch (error) {
      console.log('ℹ️ Sample pricing tiers already exist or error:', error.message);
    }
    
    // Verify collections
    console.log('\n🔍 Verifying collections...');
    const collectionNames = await db.listCollections().toArray();
    console.log('📋 Available collections:');
    collectionNames.forEach(col => {
      console.log(`  - ${col.name}`);
    });
    
    // Count documents in each collection
    for (const collection of collections) {
      const count = await db.collection(collection.name).countDocuments();
      console.log(`📊 ${collection.name}: ${count} documents`);
    }
    
    console.log('\n🎉 MongoDB setup completed successfully!');
    console.log('📝 Database:', DB_NAME);
    console.log('📝 Collections created:', collections.map(c => c.name).join(', '));
    
  } catch (error) {
    console.error('❌ MongoDB setup failed:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 MongoDB connection closed');
    }
  }
}

// Run the setup
setupMongoDB().catch(console.error);
