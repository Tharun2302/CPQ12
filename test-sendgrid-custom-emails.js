/**
 * Test SendGrid Configuration and Custom Email Sending
 */

const dotenv = require('dotenv');
const sgMail = require('@sendgrid/mail');

dotenv.config();

console.log('==============================================');
console.log('🧪 SENDGRID CUSTOM EMAIL TEST');
console.log('==============================================\n');

// Check SendGrid API Key
if (!process.env.SENDGRID_API_KEY) {
  console.log('❌ SENDGRID_API_KEY not found in .env file');
  console.log('   Please add: SENDGRID_API_KEY=SG.your-key-here');
  process.exit(1);
}

console.log('✅ SendGrid API Key found');
console.log(`   Preview: ${process.env.SENDGRID_API_KEY.substring(0, 15)}...`);

// Check From Email
if (!process.env.SENDGRID_FROM_EMAIL) {
  console.log('⚠️ SENDGRID_FROM_EMAIL not found in .env file');
  console.log('   Using default: noreply@cloudfuze.com');
}

const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@cloudfuze.com';
console.log(`✅ From Email: ${fromEmail}\n`);

// Test sending email
console.log('🔄 Testing SendGrid email sending...\n');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function testSendEmail() {
  try {
    // Test email with deny button
    const msg = {
      to: 'abhilashak@gmail.com', // Replace with your email
      from: fromEmail,
      subject: 'TEST: Signature Request with Deny Button',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2563eb; padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">TEST: Signature Request</h1>
          </div>
          
          <div style="padding: 30px; background-color: #f9fafb;">
            <h2 style="color: #1f2937;">Hi There,</h2>
            
            <p style="color: #4b5563; font-size: 16px;">
              This is a TEST email to verify deny button functionality.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <table cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                <tr>
                  <td style="padding: 10px;">
                    <a href="http://localhost:3001" 
                       style="background-color: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                      📝 Review and Sign
                    </a>
                  </td>
                  <td style="padding: 10px;">
                    <a href="http://localhost:3001/deny-signature" 
                       style="background-color: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                      ❌ Decline with Reason
                    </a>
                  </td>
                </tr>
              </table>
            </div>
            
            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px;">
              <p style="margin: 0; color: #92400e;">
                <strong>⚠️ Test Email:</strong> If you can see both buttons above, the configuration is working!
              </p>
            </div>
          </div>
        </div>
      `
    };

    const result = await sgMail.send(msg);
    
    console.log('✅ SUCCESS! Test email sent');
    console.log('   Status Code:', result[0].statusCode);
    console.log('   Check your inbox for the test email');
    console.log('\n==============================================');
    console.log('🎉 SENDGRID IS WORKING!');
    console.log('==============================================\n');
    console.log('Next steps:');
    console.log('1. Check your email inbox');
    console.log('2. Verify you can see both buttons');
    console.log('3. If yes, custom emails will work in your app!');
    console.log('4. Make sure to verify sender email in SendGrid\n');

  } catch (error) {
    console.log('\n❌ ERROR SENDING EMAIL\n');
    
    if (error.code === 403) {
      console.log('Issue: Sender Email Not Verified');
      console.log('');
      console.log('Solution:');
      console.log('1. Go to: https://app.sendgrid.com/settings/sender_auth');
      console.log('2. Click "Verify a Single Sender"');
      console.log('3. Add email:', fromEmail);
      console.log('4. Check inbox and click verification link');
      console.log('5. Run this test again\n');
    } else if (error.code === 401) {
      console.log('Issue: Invalid API Key');
      console.log('');
      console.log('Solution:');
      console.log('1. Go to: https://app.sendgrid.com/settings/api_keys');
      console.log('2. Generate new API key with Full Access');
      console.log('3. Update .env file');
      console.log('4. Run this test again\n');
    } else {
      console.log('Error Details:', error.response?.body || error.message);
      console.log('');
      console.log('Common Issues:');
      console.log('1. Sender email not verified in SendGrid');
      console.log('2. API key invalid or expired');
      console.log('3. SendGrid account suspended');
      console.log('4. Network/firewall issues\n');
    }
    
    process.exit(1);
  }
}

testSendEmail();




























