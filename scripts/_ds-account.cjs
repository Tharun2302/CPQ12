/** Read-only: what does DocuSign think this account and sender are called? */
const { MongoClient } = require('mongodb');
const axios = require('axios');
require('dotenv').config();

const ds = require('../services/docusignService.cjs');

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.DB_NAME || 'cpq_database');

  let tok;
  try {
    tok = await ds.getAccessToken(db);
  } catch (e) {
    console.log('Could not get a DocuSign access token:', e.message);
    console.log('(Connect DocuSign in the app first — this is only a diagnostic.)');
    await client.close();
    return;
  }

  const { accessToken, accountId, basePath } = tok;
  const H = { Authorization: `Bearer ${accessToken}` };

  try {
    const acct = await axios.get(`${basePath}/v2.1/accounts/${accountId}`, { headers: H });
    console.log('=== Account ===');
    console.log('accountName      :', acct.data.accountName);
    console.log('accountIdGuid    :', acct.data.accountIdGuid || accountId);
    console.log('planName         :', acct.data.planName || '—');
  } catch (e) {
    console.log('account lookup failed:', e.response?.status, e.response?.data?.message || e.message);
  }

  try {
    const ui = await axios.get('https://account-d.docusign.com/oauth/userinfo', { headers: H });
    console.log('\n=== Authenticated sender ===');
    console.log('name  :', ui.data.name);
    console.log('email :', ui.data.email);
    (ui.data.accounts || []).forEach(a => console.log(`  account: ${a.account_name}  (${a.account_id})${a.is_default ? ' [default]' : ''}`));
  } catch (e) {
    console.log('userinfo failed:', e.response?.status, e.response?.data?.error || e.message);
  }

  await client.close();
})().catch(e => { console.error('failed:', e.message); process.exit(1); });
