const { MongoClient } = require('mongodb');
const AdmZip = require('adm-zip');
require('dotenv').config();

// Read-only audit of fonts/sizes in the DB-served exhibits (exhibits.fileData base64 docx).
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

function scan(xml) {
  const fonts = new Set();
  const sizes = new Set();
  let m;
  const fontRe = /w:ascii="([^"]*)"/g;
  while ((m = fontRe.exec(xml)) !== null) fonts.add(m[1]);
  const szRe = /<w:sz\s+w:val="(\d+)"\s*\/>/g; // font size only (not border w:sz attr)
  while ((m = szRe.exec(xml)) !== null) sizes.add(m[1]);
  const szCsRe = /<w:szCs\s+w:val="(\d+)"\s*\/>/g;
  while ((m = szCsRe.exec(xml)) !== null) sizes.add(m[1]);
  return { fonts, sizes };
}

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const all = await db.collection('exhibits').find({}).toArray();
  console.log(`Auditing ${all.length} DB exhibits\n`);

  let clean = 0; const bad = [];
  for (const ex of all) {
    if (!ex.fileData) { bad.push({ name: ex.name, note: 'no fileData' }); continue; }
    try {
      const zip = new AdmZip(Buffer.from(ex.fileData, 'base64'));
      let xml = '';
      for (const part of ['word/document.xml', 'word/styles.xml']) {
        const e = zip.getEntry(part);
        if (e) xml += zip.readAsText(e);
      }
      const { fonts, sizes } = scan(xml);
      const badFonts = [...fonts].filter(f => f && f.toLowerCase() !== 'arial');
      const badSizes = [...sizes].filter(s => s !== '21');
      if (badFonts.length === 0 && badSizes.length === 0) clean++;
      else bad.push({ name: ex.name, badFonts, badSizes, uploadedBy: ex.uploadedBy });
    } catch (e) {
      bad.push({ name: ex.name, note: 'read error: ' + e.message });
    }
  }

  console.log(`✅ Compliant (Arial 10.5 only): ${clean}`);
  console.log(`⚠️  Non-compliant: ${bad.length}\n`);
  for (const b of bad) {
    if (b.note) { console.log(`• ${b.name} :: ${b.note}`); continue; }
    console.log(`• ${b.name}  [fonts: ${b.badFonts.join(',') || '-'} | sizes: ${b.badSizes.map(s => s/2 + 'pt').join(',') || '-'}]`);
  }
  await client.close();
})().catch(e => { console.error(e); process.exit(1); });
