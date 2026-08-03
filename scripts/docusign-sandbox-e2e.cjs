/**
 * Self-contained DocuSign sandbox E2E test (no app/MongoDB needed).
 *
 * Proves the real DocuSign round-trip: OAuth code exchange -> create+send envelope
 * (with a generated 1-page PDF + a signHere tab) -> poll status -> download signed PDF.
 *
 * Usage:
 *   1) node scripts/docusign-sandbox-e2e.cjs
 *        -> prints the consent URL. Open it, log in to the DocuSign DEMO account,
 *           click Accept. Your browser lands on localhost:5173/auth/docusign/callback
 *           (the page may 404 if the app isn't running — that's fine). Copy the
 *           `code=...` value from the browser address bar.
 *   2) node scripts/docusign-sandbox-e2e.cjs "<code>" signer@example.com "Signer Name"
 *
 * Auth codes are single-use and expire in a few minutes — if step 2 says the code
 * is invalid/expired, re-run step 1 for a fresh one.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const _ax = require('axios');
const axios = _ax.default || _ax;
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const OAUTH = (process.env.DOCUSIGN_OAUTH_BASE_PATH || 'account-d.docusign.com').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const CID = process.env.DOCUSIGN_CLIENT_ID;
const SEC = process.env.DOCUSIGN_CLIENT_SECRET;
const REDIR = process.env.DOCUSIGN_REDIRECT_URI || 'http://localhost:5173/auth/docusign/callback';
let BASE = (process.env.DOCUSIGN_BASE_PATH || 'https://demo.docusign.net/restapi').replace(/\/+$/, '');
let ACCT = process.env.DOCUSIGN_ACCOUNT_ID;

const [code, signerEmail, signerNameArg] = process.argv.slice(2);
const signerName = signerNameArg || 'Sandbox Signer';

// PKCE (DocuSign integration key requires code_challenge/code_verifier).
const VERIFIER_FILE = path.join(__dirname, '.ds-pkce-verifier');
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function consentUrl() {
  const crypto = require('crypto');
  const codeVerifier = b64url(crypto.randomBytes(32));
  const codeChallenge = b64url(crypto.createHash('sha256').update(codeVerifier).digest());
  fs.writeFileSync(VERIFIER_FILE, codeVerifier); // read back in step 2
  const p = new URLSearchParams({
    response_type: 'code', scope: 'signature', client_id: CID, redirect_uri: REDIR,
    code_challenge: codeChallenge, code_challenge_method: 'S256',
  });
  return `https://${OAUTH}/oauth/auth?${p.toString()}`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!CID || !SEC || !ACCT) {
    console.error('❌ Missing DOCUSIGN_CLIENT_ID / DOCUSIGN_CLIENT_SECRET / DOCUSIGN_ACCOUNT_ID in .env');
    return;
  }
  if (!code) {
    console.log('STEP 1 — open this URL, sign in to the DocuSign DEMO account, click Accept:\n');
    console.log(consentUrl());
    console.log('\nThen copy the `code=...` value from the redirected URL and run:\n');
    console.log('  node scripts/docusign-sandbox-e2e.cjs "<code>" signer@example.com "Signer Name"');
    return;
  }
  if (!signerEmail) {
    console.error('❌ Provide a signer email: node scripts/docusign-sandbox-e2e.cjs "<code>" signer@example.com "Name"');
    return;
  }

  const basic = Buffer.from(`${CID}:${SEC}`).toString('base64');

  // PKCE verifier saved during step 1
  let codeVerifier = '';
  try { codeVerifier = fs.readFileSync(VERIFIER_FILE, 'utf8').trim(); } catch { /* none */ }

  // 1) Exchange the consent code for tokens
  let tok;
  try {
    const tokenParams = new URLSearchParams({ grant_type: 'authorization_code', code });
    if (codeVerifier) tokenParams.set('code_verifier', codeVerifier);
    const r = await axios.post(`https://${OAUTH}/oauth/token`,
      tokenParams.toString(),
      { headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' } });
    tok = r.data;
    console.log('✅ Token exchange OK (refresh_token received:', !!tok.refresh_token, ')');
  } catch (e) {
    console.error('❌ Token exchange failed:', e.response?.data || e.message);
    console.error('   Auth codes are single-use and expire fast — re-run step 1 for a fresh code.');
    return;
  }

  // 2) Resolve account + base_uri from userinfo
  try {
    const u = await axios.get(`https://${OAUTH}/oauth/userinfo`, { headers: { Authorization: `Bearer ${tok.access_token}` } });
    const acct = (u.data.accounts || []).find((a) => a.is_default) || (u.data.accounts || [])[0];
    if (acct) {
      ACCT = acct.account_id;
      if (acct.base_uri) BASE = `${acct.base_uri.replace(/\/+$/, '')}/restapi`;
      console.log('✅ Account:', ACCT, '| API base:', BASE);
    }
  } catch (e) {
    console.warn('⚠️ userinfo failed; using env account/base:', e.message);
  }

  // 3) Generate a 1-page sample agreement PDF
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('CloudFuze — DocuSign Sandbox Test Agreement', { x: 72, y: 720, size: 16, font, color: rgb(0, 0, 0) });
  page.drawText('Signing this confirms the DocuSign integration works end-to-end.', { x: 72, y: 690, size: 11, font });
  page.drawText('Signature:', { x: 72, y: 640, size: 11, font });
  const pdfB64 = Buffer.from(await pdf.save()).toString('base64');

  // 4) Create + send the envelope (signHere tab placed near "Signature:")
  const envelope = {
    emailSubject: 'CloudFuze DocuSign Sandbox Test — please sign',
    documents: [{ documentBase64: pdfB64, name: 'Sandbox-Test.pdf', fileExtension: 'pdf', documentId: '1' }],
    recipients: { signers: [{
      email: signerEmail, name: signerName, recipientId: '1', routingOrder: '1',
      tabs: { signHereTabs: [{ documentId: '1', pageNumber: '1', xPosition: '150', yPosition: '150' }] },
    }] },
    status: 'sent',
  };
  let envelopeId;
  try {
    const r = await axios.post(`${BASE}/v2.1/accounts/${ACCT}/envelopes`, envelope,
      { headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' } });
    envelopeId = r.data.envelopeId;
    console.log('✅ Envelope SENT:', envelopeId, '| status:', r.data.status);
    console.log(`   → ${signerEmail} should receive a DocuSign signing email now.`);
  } catch (e) {
    console.error('❌ Envelope create failed:', e.response?.status, JSON.stringify(e.response?.data || e.message));
    return;
  }

  // 5) Poll for completion, then download the signed PDF
  console.log('\nPolling status every 15s (Ctrl+C to stop). Sign the email to see it complete…');
  for (let i = 0; i < 40; i++) {
    await sleep(15000);
    let status;
    try {
      const r = await axios.get(`${BASE}/v2.1/accounts/${ACCT}/envelopes/${envelopeId}`, { headers: { Authorization: `Bearer ${tok.access_token}` } });
      status = r.data.status;
    } catch (e) {
      console.warn('   status poll error:', e.message);
      continue;
    }
    console.log(`   [${new Date().toISOString()}] status: ${status}`);
    const s = String(status).toLowerCase();
    if (s === 'completed') {
      const d = await axios.get(`${BASE}/v2.1/accounts/${ACCT}/envelopes/${envelopeId}/documents/combined`,
        { headers: { Authorization: `Bearer ${tok.access_token}` }, responseType: 'arraybuffer' });
      const out = path.join(__dirname, `signed-${envelopeId}.pdf`);
      fs.writeFileSync(out, Buffer.from(d.data));
      console.log('✅ COMPLETED. Signed PDF downloaded to:', out);
      return;
    }
    if (s === 'declined' || s === 'voided') { console.log('Ended with status:', status); return; }
  }
  console.log('Stopped polling (still pending). Envelope:', envelopeId);
})();
