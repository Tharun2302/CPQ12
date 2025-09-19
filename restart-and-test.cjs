const { spawn } = require('child_process');
const fetch = require('node-fetch');

console.log('🔄 Restarting server and testing signature functionality...');

// Function to wait for server to be ready
function waitForServer() {
  return new Promise((resolve) => {
    const checkServer = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/signature/debug');
        if (response.ok) {
          console.log('✅ Server is ready');
          resolve();
        } else {
          setTimeout(checkServer, 1000);
        }
      } catch (error) {
        setTimeout(checkServer, 1000);
      }
    };
    checkServer();
  });
}

// Function to test signature flow
async function testSignatureFlow() {
  try {
    console.log('🧪 Testing signature flow...');
    
    // Step 1: Create test form
    const createResponse = await fetch('http://localhost:3001/api/signature/test-create', {
      method: 'POST'
    });
    const createResult = await createResponse.json();
    const formId = createResult.formId;
    console.log('✅ Test form created:', formId);
    
    // Step 2: Submit client signature
    const clientData = {
      eSignature: 'John Doe',
      fullName: 'John Doe',
      title: 'CEO',
      date: '2025-08-27',
      selectedFontStyle: 0
    };
    
    const submitResponse = await fetch('http://localhost:3001/api/signature/client-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formId, signatureData: clientData })
    });
    const submitResult = await submitResponse.json();
    console.log('✅ Client signature submitted');
    
    // Step 3: Generate final template
    const generateResponse = await fetch('http://localhost:3001/api/signature/generate-final-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formId })
    });
    
    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      console.error('❌ Generate template failed:', errorText);
      throw new Error('Generate template failed');
    }
    
    const generateResult = await generateResponse.json();
    console.log('✅ Final template generated successfully');
    console.log('📄 File name:', generateResult.fileName);
    
    console.log('\n🎉 All tests passed!');
    console.log('🔗 Client form URL: http://localhost:5173/client-signature-form.html?formId=' + formId);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Main execution
async function main() {
  try {
    // Wait for server to be ready
    await waitForServer();
    
    // Test the functionality
    await testSignatureFlow();
    
  } catch (error) {
    console.error('❌ Main error:', error);
  }
}

main();
