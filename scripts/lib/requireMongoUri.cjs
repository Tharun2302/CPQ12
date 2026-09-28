const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

function requireMongoUri(env = process.env) {
  const uri = (env.MONGODB_URI || '').trim();
  // Fail loudly instead of guessing: a hardcoded fallback once pointed these scripts at a live cluster
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to .env before running this script.');
  }
  return uri;
}

module.exports = requireMongoUri;
