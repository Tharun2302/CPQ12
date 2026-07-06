const mysql = require('mysql2/promise');
require('dotenv').config();

async function createTemplatesTable() {
  console.log('🔧 Creating templates table...');
  
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cpq_database1',
    port: process.env.DB_PORT || 3306
  };

  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database');
    
    // Create templates table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS templates (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        file_name VARCHAR(255) NOT NULL,
        file_type ENUM('pdf', 'docx') NOT NULL,
        file_data LONGBLOB NOT NULL,
        file_size INT NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Templates table created successfully');
    
    // Verify table exists
    const [tables] = await connection.execute("SHOW TABLES LIKE 'templates'");
    if (tables.length > 0) {
      console.log('✅ Templates table verified');
    } else {
      console.log('❌ Templates table not found');
    }
    
  } catch (error) {
    console.error('❌ Error creating templates table:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

createTemplatesTable();
