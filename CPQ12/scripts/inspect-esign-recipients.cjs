/**
 * Read-only diagnostic: dumps recipient records (signing token, expiry, status)
 * for esign documents matching a name substring.
 *
 * Usage: node scripts/inspect-esign-recipients.cjs "Watermen Agreement"
 *        node scripts/inspect-esign-recipients.cjs <document_id>
 */
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const QUERY = process.argv[2] || '';
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'cpq_database';
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }
if (!QUERY) { console.error('Pass a document name substring or _id'); process.exit(1); }

function fmt(d) { return d ? new Date(d).toISOString() : '—'; }
function daysFromNow(d) {
  if (!d) return '—';
  const diffMs = new Date(d).getTime() - Date.now();
  const days = diffMs / (1000 * 60 * 60 * 24);
  return `${days >= 0 ? '+' : ''}${days.toFixed(1)}d`;
}

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  // Build doc lookup
  let docs = [];
  try {
    const oid = new ObjectId(QUERY);
    const one = await db.collection('esign_documents').findOne({ _id: oid });
    if (one) docs = [one];
  } catch {}
  if (!docs.length) {
    docs = await db.collection('esign_documents')
      .find({ file_name: { $regex: QUERY, $options: 'i' } })
      .toArray();
  }

  if (!docs.length) {
    console.log(`No esign_documents matched "${QUERY}"`);
    await client.close();
    return;
  }

  console.log(`Now (server clock): ${new Date().toISOString()}\n`);

  for (const doc of docs) {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`Doc: ${doc.file_name}`);
    console.log(`  _id      : ${doc._id.toString()}`);
    console.log(`  status   : ${doc.status}`);
    console.log(`  createdAt: ${fmt(doc.createdAt || doc.created_at)}`);
    console.log(`  voided_at: ${fmt(doc.voided_at)}`);

    const docId = doc._id;
    const recipients = await db.collection('esign_recipients')
      .find({ $or: [{ document_id: docId }, { document_id: docId.toString() }] })
      .sort({ order: 1, _id: 1 })
      .toArray();

    console.log(`  recipients (${recipients.length}):`);
    for (const r of recipients) {
      console.log(`    - ${r.name || r.email}`);
      console.log(`        email           : ${r.email}`);
      console.log(`        status          : ${r.status}`);
      console.log(`        signing_token   : ${r.signing_token || '(unset)'}`);
      console.log(`        token_created   : ${fmt(r.token_created_at)}`);
      console.log(`        token_expires   : ${fmt(r.token_expires_at)}  (${daysFromNow(r.token_expires_at)})`);
      console.log(`        ext_extended_at : ${fmt(r.expiry_extended_at)}`);
      console.log(`        ext_count       : ${r.expiry_extension_count ?? 0}`);
      if (r.signing_token) {
        console.log(`        signing url     : http://localhost:5173/sign/${r.signing_token}`);
      }
    }
  }

  await client.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
