#!/usr/bin/env node

/**
 * Script to trigger combination reseeding via API
 * Usage: node reseed-combinations.cjs
 */

const axios = require('axios');

async function reseedCombinations() {
  // The route is exhibit-admin only; the token must come from the environment, never the source
  if (!process.env.CPQ_ADMIN_TOKEN) {
    console.error('CPQ_ADMIN_TOKEN is not set. Set it to an exhibit admin login token, then run this script again.');
    process.exit(1);
  }

  try {
    console.log('🌱 Triggering combination reseed...');

    const response = await axios.post('http://localhost:3001/api/combinations/seed', null, {
      headers: { Authorization: `Bearer ${process.env.CPQ_ADMIN_TOKEN}` }
    });
    
    if (response.data.success) {
      console.log('✅ Combinations reseeded successfully!');
      console.log('📝 Message:', response.data.message);
    } else {
      console.error('❌ Combination reseeding failed:', response.data.message || response.data.error);
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
    process.exit(1);
  }
}

reseedCombinations();

