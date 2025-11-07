/**
 * Check CloudFuze Email Delivery Status
 * 
 * This script checks why emails to @cloudfuze.com are not being delivered
 * Run: node check-cloudfuze-email-status.cjs
 */

require('dotenv').config();
const axios = require('axios');

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const TEST_EMAIL = 'abhilasha.kandakatla@cloudfuze.com';

console.log('\n🔍 CLOUDFUZE EMAIL DELIVERY DIAGNOSTIC\n');
console.log('='.repeat(70));

if (!SENDGRID_API_KEY || SENDGRID_API_KEY === 'your-sendgrid-api-key-here') {
  console.log('\n❌ ERROR: SENDGRID_API_KEY not configured in .env file');
  process.exit(1);
}

async function checkSuppressionLists() {
  console.log('\n📋 Step 1: Checking SendGrid Suppression Lists');
  console.log('-'.repeat(70));
  console.log(`   Testing email: ${TEST_EMAIL}\n`);

  const headers = {
    'Authorization': `Bearer ${SENDGRID_API_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    // Check bounces
    console.log('   Checking bounces...');
    const bounceRes = await axios.get(
      `https://api.sendgrid.com/v3/suppression/bounces/${TEST_EMAIL}`,
      { headers, validateStatus: () => true }
    );

    if (bounceRes.status === 200 && bounceRes.data.length > 0) {
      console.log('   ❌ EMAIL IS IN BOUNCE LIST!');
      console.log('   Bounce Details:', JSON.stringify(bounceRes.data, null, 2));
      console.log('\n   🔧 To remove from bounce list, run:');
      console.log(`   curl -X DELETE "https://api.sendgrid.com/v3/suppression/bounces/${TEST_EMAIL}" \\`);
      console.log(`        -H "Authorization: Bearer ${SENDGRID_API_KEY}"`);
      return true;
    } else {
      console.log('   ✅ Not in bounce list');
    }

    // Check blocks
    console.log('   Checking blocks...');
    const blockRes = await axios.get(
      `https://api.sendgrid.com/v3/suppression/blocks/${TEST_EMAIL}`,
      { headers, validateStatus: () => true }
    );

    if (blockRes.status === 200 && blockRes.data.length > 0) {
      console.log('   ❌ EMAIL IS BLOCKED!');
      console.log('   Block Details:', JSON.stringify(blockRes.data, null, 2));
      console.log('\n   🔧 To remove from block list, run:');
      console.log(`   curl -X DELETE "https://api.sendgrid.com/v3/suppression/blocks/${TEST_EMAIL}" \\`);
      console.log(`        -H "Authorization: Bearer ${SENDGRID_API_KEY}"`);
      return true;
    } else {
      console.log('   ✅ Not in block list');
    }

    // Check spam reports
    console.log('   Checking spam reports...');
    const spamRes = await axios.get(
      `https://api.sendgrid.com/v3/suppression/spam_reports/${TEST_EMAIL}`,
      { headers, validateStatus: () => true }
    );

    if (spamRes.status === 200 && spamRes.data.length > 0) {
      console.log('   ⚠️  EMAIL MARKED AS SPAM!');
      console.log('   Spam Report:', JSON.stringify(spamRes.data, null, 2));
      return true;
    } else {
      console.log('   ✅ Not in spam reports');
    }

    // Check invalid emails
    console.log('   Checking invalid emails...');
    const invalidRes = await axios.get(
      `https://api.sendgrid.com/v3/suppression/invalid_emails/${TEST_EMAIL}`,
      { headers, validateStatus: () => true }
    );

    if (invalidRes.status === 200 && invalidRes.data.length > 0) {
      console.log('   ❌ EMAIL MARKED AS INVALID!');
      console.log('   Invalid Details:', JSON.stringify(invalidRes.data, null, 2));
      return true;
    } else {
      console.log('   ✅ Not in invalid list');
    }

    console.log('\n   ✅ Email is NOT in any suppression lists');
    return false;

  } catch (error) {
    console.log('   ⚠️  Error checking suppression lists:', error.message);
    if (error.response) {
      console.log('   Response:', error.response.status, error.response.data);
    }
    return false;
  }
}

async function checkRecentActivity() {
  console.log('\n📧 Step 2: Recent Email Activity');
  console.log('-'.repeat(70));
  
  console.log('   To check email delivery status:');
  console.log('   1. Go to: https://app.sendgrid.com/email_activity');
  console.log(`   2. Search for: ${TEST_EMAIL}`);
  console.log('   3. Check the status of recent emails\n');
  
  console.log('   Common statuses:');
  console.log('   - ✅ Delivered: Email reached recipient\'s server');
  console.log('   - ❌ Bounced: Recipient server rejected it');
  console.log('   - ❌ Blocked: Spam filter blocked it');
  console.log('   - ❌ Dropped: SendGrid didn\'t send it');
  console.log('   - ⏳ Deferred: Temporarily delayed, will retry');
  console.log('   - 📤 Processed: Sent but not yet delivered\n');
}

async function provideSolutions() {
  console.log('\n💡 Step 3: Recommended Solutions');
  console.log('-'.repeat(70));
  console.log(`
   Since Gmail emails work but CloudFuze emails don't:

   ✅ IMMEDIATE CHECKS:
   1. Ask recipient to check Spam/Junk folder
   2. Ask recipient to check Quarantine (Microsoft 365)
   3. Check SendGrid Activity for bounce reason

   ✅ SHORT-TERM FIXES:
   1. Contact CloudFuze IT to whitelist SendGrid IPs:
      - 167.89.0.0/17
      - 167.89.64.0/19
      - 167.89.96.0/20
      - 167.89.112.0/20

   2. Add to Safe Senders in CloudFuze email:
      - tharun.pothi@cloudfuze.com
      - @sendgrid.net

   ✅ LONG-TERM FIXES:
   1. Authenticate cloudfuze.com domain in SendGrid
      → Go to: https://app.sendgrid.com/settings/sender_auth
      → Click "Authenticate Your Domain"
      → Add DNS records to cloudfuze.com

   2. Or use CloudFuze's internal SMTP for @cloudfuze.com emails

   📚 More details in:
   - IMMEDIATE_CLOUDFUZE_EMAIL_FIX.md
   - CLOUDFUZE_DOMAIN_AUTHENTICATION.md
   - check-sendgrid-bounce.md
  `);
}

async function checkDomainAuthentication() {
  console.log('\n🔐 Step 4: Domain Authentication Status');
  console.log('-'.repeat(70));

  const headers = {
    'Authorization': `Bearer ${SENDGRID_API_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    const authRes = await axios.get(
      'https://api.sendgrid.com/v3/whitelabel/domains',
      { headers, validateStatus: () => true }
    );

    if (authRes.status === 200 && authRes.data.length > 0) {
      console.log('   Authenticated domains:');
      authRes.data.forEach(domain => {
        const verified = domain.valid ? '✅' : '❌';
        console.log(`   ${verified} ${domain.domain} - Valid: ${domain.valid}`);
      });

      const hasCloudfuze = authRes.data.some(d => 
        d.domain.includes('cloudfuze.com') && d.valid
      );

      if (hasCloudfuze) {
        console.log('\n   ✅ cloudfuze.com is authenticated!');
      } else {
        console.log('\n   ❌ cloudfuze.com is NOT authenticated');
        console.log('   → Authenticate it at: https://app.sendgrid.com/settings/sender_auth');
      }
    } else {
      console.log('   ❌ No domains authenticated');
      console.log('   → Authenticate cloudfuze.com: https://app.sendgrid.com/settings/sender_auth');
    }
  } catch (error) {
    console.log('   ⚠️  Could not check domain authentication:', error.message);
  }
}

// Run all checks
(async () => {
  const inSuppressionList = await checkSuppressionLists();
  await checkRecentActivity();
  await checkDomainAuthentication();
  await provideSolutions();

  console.log('\n' + '='.repeat(70));
  
  if (inSuppressionList) {
    console.log('\n🚨 ACTION REQUIRED: Remove email from suppression list (see above)');
  } else {
    console.log('\n🔍 Next Steps:');
    console.log('   1. Check SendGrid Activity Feed for bounce details');
    console.log('   2. Ask recipient to check Spam folder');
    console.log('   3. Contact CloudFuze IT to whitelist SendGrid');
  }
  
  console.log('\n' + '='.repeat(70) + '\n');
})();

