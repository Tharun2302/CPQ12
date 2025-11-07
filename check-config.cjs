/**
 * Configuration Checker
 * Run: node check-config.cjs
 */

require('dotenv').config();

console.log('\n╔════════════════════════════════════════╗');
console.log('║   CONFIGURATION CHECKER                ║');
console.log('╚════════════════════════════════════════╝\n');

console.log('📧 EMAIL CONFIGURATION:');
console.log('─────────────────────────────────────────');

const verifiedFrom = process.env.SENDGRID_VERIFIED_FROM;
const verifiedDomains = process.env.SENDGRID_VERIFIED_DOMAINS;
const emailFrom = process.env.EMAIL_FROM;
const apiKey = process.env.SENDGRID_API_KEY;

console.log(`SENDGRID_VERIFIED_FROM: ${verifiedFrom || 'NOT SET ❌'}`);
console.log(`SENDGRID_VERIFIED_DOMAINS: ${verifiedDomains || 'NOT SET ❌'}`);
console.log(`EMAIL_FROM: ${emailFrom || 'NOT SET ❌'}`);
console.log(`SENDGRID_API_KEY: ${apiKey ? 'SET ✓' : 'NOT SET ❌'}`);

console.log('\n🔍 ANALYSIS:');
console.log('─────────────────────────────────────────');

if (verifiedFrom === 'saitharunreddy2302@gmail.com') {
  console.log('✅ CORRECT: Using Gmail sender');
  console.log('   Emails should NOT be quarantined');
} else if (verifiedFrom && verifiedFrom.includes('@cloudfuze.com')) {
  console.log('❌ PROBLEM: Still using CloudFuze sender');
  console.log('   Emails WILL be quarantined');
  console.log('   → Update .env file!');
} else {
  console.log('❌ PROBLEM: SENDGRID_VERIFIED_FROM not set correctly');
  console.log('   → Check your .env file');
}

if (verifiedDomains === 'gmail.com') {
  console.log('✅ CORRECT: Domain set to gmail.com');
} else {
  console.log(`❌ PROBLEM: Domain is "${verifiedDomains}" (should be "gmail.com")`);
  console.log('   → Update .env file!');
}

console.log('\n📝 ACTION REQUIRED:');
console.log('─────────────────────────────────────────');

if (verifiedFrom !== 'saitharunreddy2302@gmail.com' || verifiedDomains !== 'gmail.com') {
  console.log('❌ Configuration is WRONG!');
  console.log('\n🔧 TO FIX:');
  console.log('1. Open file: .env');
  console.log('2. Set these lines:');
  console.log('   SENDGRID_VERIFIED_FROM=saitharunreddy2302@gmail.com');
  console.log('   SENDGRID_VERIFIED_DOMAINS=gmail.com');
  console.log('3. Save the file');
  console.log('4. RESTART server: Ctrl+C then node server.cjs');
  console.log('5. Run this script again: node check-config.cjs');
} else {
  console.log('✅ Configuration looks CORRECT!');
  console.log('\n🎯 Next steps:');
  console.log('1. Make sure Gmail is verified in SendGrid');
  console.log('2. Restart server if you just changed .env');
  console.log('3. Try approval workflow again');
}

console.log('\n═══════════════════════════════════════════\n');


