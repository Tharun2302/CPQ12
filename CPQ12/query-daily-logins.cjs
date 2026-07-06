const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

/**
 * Query daily logins by date or email
 * Usage: 
 *   node query-daily-logins.cjs
 *   node query-daily-logins.cjs 2025-12-11
 *   node query-daily-logins.cjs --email Anush.Dasari@cloudfuze.com
 */
async function queryDailyLogins() {
  let client;
  
  try {
    // Get command line arguments
    const args = process.argv.slice(2);
    const dateFilter = args.find(arg => !arg.startsWith('--'));
    const emailFilter = args.find(arg => arg.startsWith('--email'))?.replace('--email=', '').replace('--email ', '');
    
    console.log('🔍 Connecting to MongoDB...\n');
    
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB successfully\n');
    
    const dailyLoginsCollection = db.collection('daily_logins');
    
    // Build query
    let query = {};
    if (dateFilter) {
      query.date = dateFilter;
      console.log(`📅 Filtering by date: ${dateFilter}\n`);
    }
    
    // Get records
    let records = await dailyLoginsCollection
      .find(query)
      .sort({ date: -1 })
      .toArray();
    
    // Filter by email if specified
    if (emailFilter) {
      records = records.filter(record => {
        const emails = record.user_emails || [];
        return emails.some(email => 
          email.toLowerCase().includes(emailFilter.toLowerCase())
        );
      });
      console.log(`📧 Filtering by email: ${emailFilter}\n`);
    }
    
    if (records.length === 0) {
      console.log('📭 No records found matching your criteria.\n');
      return;
    }
    
    console.log('='.repeat(90));
    console.log('📊 DAILY LOGIN RECORDS');
    console.log('='.repeat(90));
    console.log();
    
    // Display records
    records.forEach((record, index) => {
      const userEmails = record.user_emails || [];
      const userIds = record.user_ids || [];
      const loginMethods = record.login_methods || [];
      
      console.log(`📅 Date: ${record.date}`);
      console.log(`   👥 Unique Users: ${record.count}`);
      console.log(`   🔐 Login Methods: ${loginMethods.join(', ') || 'N/A'}`);
      console.log();
      console.log(`   📧 Email IDs & User IDs:`);
      
      if (userEmails.length > 0) {
        userEmails.forEach((email, i) => {
          const userId = userIds[i] || 'N/A';
          console.log(`      ${i + 1}. ${email}`);
          console.log(`         User ID: ${userId}`);
        });
      } else {
        userIds.forEach((id, i) => {
          console.log(`      ${i + 1}. User ID: ${id} (Email: Not stored)`);
        });
      }
      
      console.log();
      console.log(`   📋 Record Info:`);
      console.log(`      MongoDB _id: ${record._id}`);
      if (record.created_at) {
        console.log(`      Created: ${new Date(record.created_at).toLocaleString()}`);
      }
      if (record.updated_at) {
        console.log(`      Updated: ${new Date(record.updated_at).toLocaleString()}`);
      }
      
      if (index < records.length - 1) {
        console.log();
        console.log('─'.repeat(90));
        console.log();
      }
    });
    
    // Summary
    console.log();
    console.log('='.repeat(90));
    console.log('📈 SUMMARY');
    console.log('='.repeat(90));
    console.log(`   Total Records: ${records.length}`);
    
    const totalUsers = records.reduce((sum, r) => sum + r.count, 0);
    const allEmails = new Set();
    const allUserIds = new Set();
    records.forEach(record => {
      (record.user_emails || []).forEach(email => allEmails.add(email));
      (record.user_ids || []).forEach(id => allUserIds.add(id));
    });
    
    console.log(`   Total Unique Logins: ${totalUsers}`);
    console.log(`   Unique Email Addresses: ${allEmails.size}`);
    console.log(`   Unique User IDs: ${allUserIds.size}`);
    
    if (allEmails.size > 0) {
      console.log();
      console.log(`   📧 All Email Addresses Found:`);
      Array.from(allEmails).sort().forEach((email, i) => {
        console.log(`      ${i + 1}. ${email}`);
      });
    }
    
    console.log();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('✅ Connection closed\n');
    }
  }
}

// Run the script
queryDailyLogins().catch(console.error);

