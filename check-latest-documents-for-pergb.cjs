/**
 * Inspect latest generated documents in MongoDB and report whether "per GB" appears.
 * Useful for verifying email agreements do not include per-GB overage text.
 */
const { MongoClient } = require('mongodb');
const PizZip = require('pizzip');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

function toBuffer(maybe) {
  if (!maybe) return null;
  if (Buffer.isBuffer(maybe)) return maybe;
  if (maybe && maybe.buffer) return Buffer.from(maybe.buffer);
  if (typeof maybe === 'string') return Buffer.from(maybe, 'base64');
  return null;
}

async function main() {
  const match = process.argv.slice(2).join(' ').trim() || 'OUTLOOK TO OUTLOOK Standard';
  const rx = new RegExp(match, 'i');

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const docs = await db
    .collection('documents')
    .find({ templateName: rx })
    .sort({ _id: -1 })
    .limit(5)
    .toArray();

  console.log(`Matched templateName /${match}/i → ${docs.length} document(s)`);

  for (const d of docs) {
    const docx = d.docxFileData || d.docx_file_data;
    console.log('\n---');
    console.log('id:', String(d._id));
    console.log('templateName:', d.templateName || d.template_name || '');
    console.log('fileName:', d.fileName || d.file_name || '');
    console.log('createdAt:', d.createdAt || d.created_at || '');

    const buf = toBuffer(docx);
    if (!buf) {
      console.log('docx: <missing>');
      continue;
    }

    let zip;
    try {
      zip = new PizZip(buf);
    } catch (e) {
      console.log('docx: <unzip failed>', e?.message || String(e));
      continue;
    }

    const docKey = Object.keys(zip.files).find((k) => k.toLowerCase().endsWith('document.xml'));
    if (!docKey) {
      console.log('docx: <document.xml missing>');
      continue;
    }

    const xml = zip.files[docKey].asText();
    const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
    console.log('contains "per gb":', text.includes('per gb'));

    const overIdx = text.indexOf('overage charges');
    if (overIdx !== -1) {
      console.log('overage snippet:', text.slice(overIdx, overIdx + 220));
    }
  }

  await client.close();
}

main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});








