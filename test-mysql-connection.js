// Quick test to verify MySQL connection
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function testConnection() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'lama',
    port: process.env.DB_PORT || 3306
  };

  console.log('🔍 Testing MySQL connection...');
  console.log('Config:', {
    host: config.host,
    user: config.user,
    database: config.database,
    port: config.port,
    password: config.password ? '***' : '(empty)'
  });

  try {
    const connection = await mysql.createConnection(config);
    console.log('✅ Connection successful!');
    
    const [rows] = await connection.execute('SHOW TABLES');
    console.log(`✅ Database "${config.database}" accessible`);
    console.log(`✅ Found ${rows.length} tables`);
    
    await connection.end();
    return true;
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('1. Check if password "anush" is correct');
    console.error('2. Try resetting MySQL password in MySQL Workbench:');
    console.error('   ALTER USER \'root\'@\'localhost\' IDENTIFIED BY \'anush\';');
    console.error('   FLUSH PRIVILEGES;');
    return false;
  }
}

testConnection();

