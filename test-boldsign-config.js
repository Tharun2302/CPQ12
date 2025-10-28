/**
 * Test BoldSign Configuration
 * Run this to check if BoldSign is properly configured
 */

import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

console.log('==============================================');
console.log('🔍 BOLDSIGN CONFIGURATION TEST');
console.log('==============================================\n');

// Check if .env file is loaded
if (!process.env.BOLDSIGN_API_KEY) {
  console.log('❌ PROBLEM FOUND:');
  console.log('   BOLDSIGN_API_KEY is NOT set in .env file\n');
  console.log('📝 TO FIX:');
  console.log('   1. Get API key from: https://app.boldsign.com/settings/api');
  console.log('   2. Add this line to your .env file:');
  console.log('      BOLDSIGN_API_KEY=your-api-key-here');
  console.log('   3. Restart your server: node server.cjs\n');
  process.exit(1);
}

// Check API key format
const apiKey = process.env.BOLDSIGN_API_KEY;
console.log('✅ BoldSign API Key found in .env');
console.log(`   Preview: ${apiKey.substring(0, 15)}...${apiKey.substring(apiKey.length - 5)}`);
console.log(`   Length: ${apiKey.length} characters\n`);

// Check if it's still the placeholder
if (apiKey === 'your-boldsign-api-key-here') {
  console.log('❌ PROBLEM FOUND:');
  console.log('   You are using the placeholder API key\n');
  console.log('📝 TO FIX:');
  console.log('   1. Get your REAL API key from: https://app.boldsign.com/settings/api');
  console.log('   2. Replace the placeholder in .env with your real key');
  console.log('   3. Restart your server\n');
  process.exit(1);
}

// Test BoldSign API connectivity
console.log('🔄 Testing BoldSign API connection...\n');

async function testBoldSignAPI() {
  try {
    const response = await axios.get(
      'https://api.boldsign.com/v1/template/list?Page=1&PageSize=10',
      {
        headers: {
          'X-API-KEY': apiKey
        }
      }
    );
    
    console.log('✅ SUCCESS! BoldSign API is responding');
    console.log('   Your API key is VALID and working\n');
    console.log('==============================================');
    console.log('🎉 BOLDSIGN IS PROPERLY CONFIGURED!');
    console.log('==============================================\n');
    console.log('You can now use BoldSign in your application.');
    console.log('Just make sure your server is running.\n');
    
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('❌ PROBLEM FOUND:');
      console.log('   API Key is INVALID (401 Unauthorized)\n');
      console.log('📝 TO FIX:');
      console.log('   1. Your API key might be expired or incorrect');
      console.log('   2. Generate a NEW API key at: https://app.boldsign.com/settings/api');
      console.log('   3. Update .env file with the new key');
      console.log('   4. Restart your server\n');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log('❌ PROBLEM FOUND:');
      console.log('   Cannot connect to BoldSign API\n');
      console.log('📝 TO FIX:');
      console.log('   1. Check your internet connection');
      console.log('   2. Make sure you can access https://api.boldsign.com');
      console.log('   3. Check if there is a firewall blocking the connection\n');
    } else {
      console.log('❌ UNEXPECTED ERROR:');
      console.log('   ', error.message);
      console.log('\n📝 Error details:', error.response?.data || error);
    }
    process.exit(1);
  }
}

testBoldSignAPI();

