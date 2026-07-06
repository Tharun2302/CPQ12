const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

/**
 * Simple script to view daily unique users and their email IDs from MongoDB
 * Usage: node view-daily-logins-simple.cjs
 */
async function viewDailyLoginsSimple() {
  let client;
  
  try {
    console.log('🔍 Connecting to MongoDB...\n');
    
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB successfully\n');
    
    const dailyLoginsCollection = db.collection('daily_logins');
    
    // Get all daily login records, sorted by date (newest first)
    const records = await dailyLoginsCollection
      .find({})
      .sort({ date: -1 })
      .toArray();
    
    if (records.length === 0) {
      console.log('📭 No daily login records found.');
      console.log('💡 Login tracking will start when users log in.\n');
      return;
    }
    
    console.log('='.repeat(90));
    console.log('📊 DAILY UNIQUE USERS & EMAIL IDs');
    console.log('='.repeat(90));
    console.log();
    
    // Display in a clean table format
    records.forEach((record, index) => {
      const userEmails = record.user_emails || [];
      const userIds = record.user_ids || [];
      
      console.log(`📅 Date: ${record.date}`);
      console.log(`   👥 Unique Users: ${record.count}`);
      console.log(`   📧 Email IDs:`);
      
      if (userEmails.length > 0) {
        userEmails.forEach((email, i) => {
          console.log(`      ${i + 1}. ${email} (ID: ${userIds[i] || 'N/A'})`);
        });
      } else {
        // Fallback: show user IDs if emails not available
        userIds.forEach((id, i) => {
          console.log(`      ${i + 1}. User ID: ${id} (Email: Not stored)`);
        });
      }
      
      if (index < records.length - 1) {
        console.log();
        console.log('─'.repeat(90));
        console.log();
      }
    });
    
    // Summary
    const totalLogins = records.reduce((sum, record) => sum + record.count, 0);
    const uniqueUsers = new Set();
    records.forEach(record => {
      record.user_ids.forEach(userId => uniqueUsers.add(userId));
    });
    
    console.log();
    console.log('='.repeat(90));
    console.log('📈 SUMMARY');
    console.log('='.repeat(90));
    console.log(`   Total Days: ${records.length}`);
    console.log(`   Total Unique Logins: ${totalLogins}`);
    console.log(`   Unique Users Across All Days: ${uniqueUsers.size}`);
    console.log(`   Date Range: ${records[records.length - 1].date} to ${records[0].date}`);
    console.log();
    
    // Today's status
    const today = new Date().toISOString().split('T')[0];
    const todayRecord = records.find(r => r.date === today);
    if (todayRecord) {
      const todayEmails = todayRecord.user_emails || [];
      console.log(`✅ Today (${today}): ${todayRecord.count} user(s)`);
      if (todayEmails.length > 0) {
        console.log(`   📧 Emails: ${todayEmails.join(', ')}`);
      }
    } else {
      console.log(`ℹ️  Today (${today}): No logins yet`);
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
viewDailyLoginsSimple().catch(console.error);

