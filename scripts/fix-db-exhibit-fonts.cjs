const { MongoClient } = require('mongodb');
const AdmZip = require('adm-zip');
require('dotenv').config();

// Force every DB-served exhibit (exhibits.fileData) to Arial 10.5pt.
// Formatting-only change: rewrites font/size tags in document.xml + styles.xml,
// including docDefaults so inherited runs comply. Verifies the rewritten docx
// re-opens before saving. Only updates exhibits that actually change.

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

const ARIAL_RFONTS = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/>';

function normalize(xml) {
  let out = xml;
  out = out.replace(/<w:sz\s+w:val="\d+"\s*\/>/g, '<w:sz w:val="21"/>');
  out = out.replace(/<w:szCs\s+w:val="\d+"\s*\/>/g, '<w:szCs w:val="21"/>');
  out = out.replace(/<w:rFonts\b[^>]*\/>/g, ARIAL_RFONTS);
  out = out.replace(/<w:rFonts\b[^>]*>[\s\S]*?<\/w:rFonts>/g, ARIAL_RFONTS);
  return out;
}

function ensureDocDefaults(stylesXml) {
  let xml = normalize(stylesXml);
  if (!/<w:docDefaults>/.test(xml)) {
    const block = '<w:docDefaults><w:rPrDefault><w:rPr>' + ARIAL_RFONTS +
      '<w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault></w:docDefaults>';
    return xml.replace(/(<w:styles\b[^>]*>)/, `$1${block}`);
  }
  if (!/<w:rPrDefault>/.test(xml)) {
    return xml.replace(/<w:docDefaults>/, '<w:docDefaults><w:rPrDefault><w:rPr>' +
      ARIAL_RFONTS + '<w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault>');
  }
  xml = xml.replace(/<w:rPrDefault>\s*<w:rPr>([\s\S]*?)<\/w:rPr>\s*<\/w:rPrDefault>/, (full, inner) => {
    let body = inner;
    if (!/<w:rFonts/.test(body)) body = ARIAL_RFONTS + body;
    if (!/<w:sz\b/.test(body)) body += '<w:sz w:val="21"/>';
    if (!/<w:szCs\b/.test(body)) body += '<w:szCs w:val="21"/>';
    return `<w:rPrDefault><w:rPr>${body}</w:rPr></w:rPrDefault>`;
  });
  xml = xml.replace(/<w:rPrDefault\s*\/>/, '<w:rPrDefault><w:rPr>' + ARIAL_RFONTS +
    '<w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault>');
  return xml;
}

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const all = await db.collection('exhibits').find({}).toArray();
  console.log(`Processing ${all.length} DB exhibits\n`);

  let updated = 0, unchanged = 0, skipped = 0;
  for (const ex of all) {
    if (!ex.fileData) { console.log(`⏭️  ${ex.name} (no fileData)`); skipped++; continue; }
    try {
      const zip = new AdmZip(Buffer.from(ex.fileData, 'base64'));
      let dirty = false;
      const docE = zip.getEntry('word/document.xml');
      if (docE) {
        const o = zip.readAsText(docE); const n = normalize(o);
        if (n !== o) { zip.updateFile('word/document.xml', Buffer.from(n, 'utf8')); dirty = true; }
      }
      const stylesE = zip.getEntry('word/styles.xml');
      if (stylesE) {
        const o = zip.readAsText(stylesE); const n = ensureDocDefaults(o);
        if (n !== o) { zip.updateFile('word/styles.xml', Buffer.from(n, 'utf8')); dirty = true; }
      }
      if (!dirty) { unchanged++; continue; }

      const buf = zip.toBuffer();
      // Safety: confirm the rewritten docx re-opens and document.xml is readable.
      const verify = new AdmZip(buf);
      const vEntry = verify.getEntry('word/document.xml');
      if (!vEntry || !verify.readAsText(vEntry)) {
        console.log(`❌ ${ex.name}: verification failed, skipping`);
        skipped++; continue;
      }
      await db.collection('exhibits').updateOne(
        { _id: ex._id },
        { $set: {
            fileData: buf.toString('base64'),
            fileSize: buf.length,
            updatedAt: new Date(),
            version: (ex.version || 0) + 1,
            fontNormalized: 'Arial 10.5'
        } }
      );
      console.log(`✅ ${ex.name}`);
      updated++;
    } catch (e) {
      console.log(`❌ ${ex.name}: ${e.message}`);
      skipped++;
    }
  }

  console.log(`\nDone. Updated ${updated}, already-fine ${unchanged}, skipped/errors ${skipped}.`);
  await client.close();
})().catch(e => { console.error(e); process.exit(1); });
