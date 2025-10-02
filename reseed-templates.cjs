#!/usr/bin/env node

/**
 * Script to trigger template reseeding via API
 * Usage: node reseed-templates.js
 */

const axios = require('axios');

async function reseedTemplates() {
  try {
    console.log('🌱 Triggering template reseed...');
    
    const response = await axios.post('http://localhost:3001/api/templates/reseed');
    
    if (response.data.success) {
      console.log('✅ Templates reseeded successfully!');
      console.log('📝 Message:', response.data.message);
    } else {
      console.error('❌ Template reseeding failed:', response.data.message);
    }
  } catch (error) {
    if (error.response) {
      console.error('❌ Server error:', error.response.data);
    } else if (error.request) {
      console.error('❌ Network error: Server not reachable at http://localhost:3001');
      console.log('💡 Make sure the server is running with: node server.cjs');
    } else {
      console.error('❌ Error:', error.message);
    }
  }
}

reseedTemplates();
