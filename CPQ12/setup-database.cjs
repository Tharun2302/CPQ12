const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'root',
  port: 3306
};

async function setupDatabase() {
  try {
    console.log('🚀 Setting up CPQ Pro MySQL database...');
    
    // Connect without specifying database
    const connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to MySQL server');
    
    // Create database
    console.log('📊 Creating database...');
    await connection.execute('CREATE DATABASE IF NOT EXISTS cpq_database1');
    console.log('✅ Database created successfully');
    
    // Use the database
    await connection.execute('USE cpq_database1');
    
    // Create quotes table
    console.log('📋 Creating quotes table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS quotes (
        id VARCHAR(36) PRIMARY KEY,
        client_name VARCHAR(255) NOT NULL,
        client_email VARCHAR(255) NOT NULL,
        company VARCHAR(255),
        configuration JSON,
        selected_tier JSON,
        calculation JSON,
        status ENUM('draft', 'sent', 'viewed', 'accepted', 'rejected') DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Quotes table created');
    
    // Create pricing_tiers table
    console.log('💰 Creating pricing_tiers table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS pricing_tiers (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        per_user_cost DECIMAL(10,2) NOT NULL,
        per_gb_cost DECIMAL(10,2) NOT NULL,
        managed_migration_cost DECIMAL(10,2) NOT NULL,
        instance_cost DECIMAL(10,2) NOT NULL,
        user_limits JSON,
        gb_limits JSON,
        features JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Pricing tiers table created');
    
    // Create hubspot_integrations table
    console.log('🔗 Creating hubspot_integrations table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS hubspot_integrations (
        id VARCHAR(36) PRIMARY KEY,
        quote_id VARCHAR(36),
        contact_id VARCHAR(255),
        deal_id VARCHAR(255),
        status ENUM('pending', 'success', 'failed') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ HubSpot integrations table created');
    
    // Insert default pricing tiers
    console.log('📝 Inserting default pricing tiers...');
    
    // Insert Basic tier
    await connection.execute(`
      INSERT IGNORE INTO pricing_tiers (id, name, per_user_cost, per_gb_cost, managed_migration_cost, instance_cost, user_limits, gb_limits, features) 
      VALUES ('basic', 'Basic', 25.00, 2.50, 500.00, 100.00, '{"from": 1, "to": 50}', '{"from": 10, "to": 500}', '["Basic support", "Standard migration", "Email support", "Basic reporting"]')
    `);
    
    // Insert Standard tier
    await connection.execute(`
      INSERT IGNORE INTO pricing_tiers (id, name, per_user_cost, per_gb_cost, managed_migration_cost, instance_cost, user_limits, gb_limits, features) 
      VALUES ('standard', 'Standard', 45.00, 4.00, 750.00, 200.00, '{"from": 51, "to": 200}', '{"from": 501, "to": 2000}', '["Priority support", "Advanced migration", "Phone & email support", "Advanced reporting", "Custom integrations"]')
    `);
    
    // Insert Advanced tier
    await connection.execute(`
      INSERT IGNORE INTO pricing_tiers (id, name, per_user_cost, per_gb_cost, managed_migration_cost, instance_cost, user_limits, gb_limits, features) 
      VALUES ('advanced', 'Advanced', 75.00, 6.50, 1000.00, 350.00, '{"from": 201, "to": 1000}', '{"from": 2001, "to": 10000}', '["Dedicated support", "Premium migration", "24/7 phone support", "Enterprise reporting", "Full customization", "SLA guarantee"]')
    `);
    
    console.log('✅ Default pricing tiers inserted');
    
    // Show created tables
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('\n📋 Database tables:');
    tables.forEach(table => {
      console.log(`   - ${Object.values(table)[0]}`);
    });
    
    // Show pricing tiers count
    const [tiers] = await connection.execute('SELECT COUNT(*) as count FROM pricing_tiers');
    console.log(`💰 Pricing tiers: ${tiers[0].count} found`);
    
    connection.end();
    console.log('\n🎉 Database setup completed successfully!');
    console.log('🚀 You can now start the server with: node server.js');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    console.log('\n💡 Troubleshooting tips:');
    console.log('1. Make sure MySQL is running');
    console.log('2. Check if MySQL root password is correct');
    console.log('3. Verify MySQL is accessible on localhost:3306');
  }
}

setupDatabase();
