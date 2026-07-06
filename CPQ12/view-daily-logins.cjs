const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

async function viewDailyLogins() {
  let client;
  
  try {
    console.log('🔍 Connecting to MongoDB...');
    console.log('📊 MongoDB URI:', MONGODB_URI.replace(/\/\/.*@/, '//***:***@'));
    
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB successfully');
    console.log('📊 Database name:', DB_NAME);
    
    const dailyLoginsCollection = db.collection('daily_logins');
    const usersCollection = db.collection('users');
    
    // Get all daily login records, sorted by date (newest first)
    const records = await dailyLoginsCollection
      .find({})
      .sort({ date: -1 })
      .toArray();
    
    if (records.length === 0) {
      console.log('\n📭 No daily login records found in the database.');
      console.log('💡 Login tracking will start automatically when users log in.');
      return;
    }
    
    console.log('\n📊 Daily Login Statistics');
    console.log('='.repeat(80));
    
    // Calculate totals
    const totalLogins = records.reduce((sum, record) => sum + record.count, 0);
    const uniqueUsers = new Set();
    records.forEach(record => {
      record.user_ids.forEach(userId => uniqueUsers.add(userId));
    });
    
    console.log(`\n📈 Summary:`);
    console.log(`   Total Days Tracked: ${records.length}`);
    console.log(`   Total Logins: ${totalLogins}`);
    console.log(`   Unique Users: ${uniqueUsers.size}`);
    console.log(`   Date Range: ${records[records.length - 1].date} to ${records[0].date}`);
    
    console.log(`\n📅 Daily Login Details - Unique Users & Email IDs:\n`);
    console.log('='.repeat(80));
    
    // Display each day's login data in a clear format
    for (const record of records) {
      console.log(`\n📆 Date: ${record.date}`);
      console.log(`   👥 Unique Users Count: ${record.count}`);
      console.log(`   ${'─'.repeat(76)}`);
      
      // Use stored emails if available
      const userEmails = record.user_emails || [];
      
      // Get user details
      const userDetails = [];
      for (let i = 0; i < record.user_ids.length; i++) {
        const userId = record.user_ids[i];
        const storedEmail = userEmails[i] || null;
        const user = await usersCollection.findOne({ id: userId });
        if (user) {
          userDetails.push({
            id: user.id,
            email: storedEmail || user.email,
            name: user.name || 'N/A',
            provider: user.provider || 'email'
          });
        } else {
          userDetails.push({
            id: userId,
            email: storedEmail || 'Unknown',
            name: 'Unknown User',
            provider: 'N/A'
          });
        }
      }
      
      // Display users in a clear table-like format
      console.log(`   📧 Email IDs:`);
      userDetails.forEach((user, index) => {
        console.log(`      ${index + 1}. ${user.email}`);
      });
      
      console.log(`\n   👤 User Details:`);
      userDetails.forEach((user, index) => {
        console.log(`      ${index + 1}. Name: ${user.name}`);
        console.log(`         Email: ${user.email}`);
        console.log(`         User ID: ${user.id}`);
        console.log(`         Provider: ${user.provider}`);
        if (index < userDetails.length - 1) console.log('');
      });
      
      console.log(`\n   📊 Quick Summary:`);
      console.log(`      • Total Users: ${record.count}`);
      console.log(`      • User IDs: ${record.user_ids.join(', ')}`);
      if (userEmails.length > 0) {
        console.log(`      • Email IDs: ${userEmails.join(', ')}`);
      }
      
      if (record.created_at) {
        console.log(`      • Record Created: ${new Date(record.created_at).toLocaleString()}`);
      }
      if (record.updated_at) {
        console.log(`      • Last Updated: ${new Date(record.updated_at).toLocaleString()}`);
      }
      console.log(`   ${'─'.repeat(76)}`);
    }
    
    // Show today's login count if available
    const today = new Date().toISOString().split('T')[0];
    const todayRecord = records.find(r => r.date === today);
    console.log(`\n${'='.repeat(80)}`);
    if (todayRecord) {
      const todayEmails = todayRecord.user_emails || [];
      console.log(`\n✅ Today (${today}): ${todayRecord.count} unique user(s) logged in`);
      if (todayEmails.length > 0) {
        console.log(`   📧 Today's Email IDs: ${todayEmails.join(', ')}`);
      }
    } else {
      console.log(`\nℹ️  Today (${today}): No logins yet`);
    }
    
    // Create a summary table of all dates with counts and emails
    console.log(`\n${'='.repeat(80)}`);
    console.log(`\n📋 Quick Reference - All Dates with User Counts:\n`);
    console.log(`   Date       | Count | Email IDs`);
    console.log(`   ${'─'.repeat(12)}${'─'.repeat(8)}${'─'.repeat(58)}`);
    records.forEach(record => {
      const emails = record.user_emails || [];
      const emailList = emails.length > 0 ? emails.join(', ') : 'N/A';
      const dateStr = record.date.padEnd(10);
      const countStr = String(record.count).padEnd(6);
      console.log(`   ${dateStr} | ${countStr} | ${emailList}`);
    });
    
  } catch (error) {
    console.error('❌ Error viewing daily logins:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('\n✅ Database connection closed');
    }
  }
}

// Run the script
viewDailyLogins().catch(console.error);

