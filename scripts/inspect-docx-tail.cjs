/**
 * Pulls the docx blob for one or more exhibits by name match and prints the
 * tail of word/document.xml so we can see whether the file ends with trailing
 * empty paragraphs or a page-break that would cause a blank page on merge.
 *
 * Usage: node scripts/inspect-docx-tail.cjs "Google MyDrive to Google MyDrive Standard Plan - Standard Include"
 *        node scripts/inspect-docx-tail.cjs "Google MyDrive to Google MyDrive"   (matches multiple)
 */
const { MongoClient } = require('mongodb');
const PizZip = require('pizzip');
require('dotenv').config();

const QUERY = process.argv[2] || 'Google MyDrive to Google MyDrive';
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'cpq_database';
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

function summarizeLastParagraphs(xml, n = 8) {
  // Find all <w:p ...>...</w:p> blocks (also handle self-closing <w:p/>)
  const paraRe = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const paras = xml.match(paraRe) || [];
  const lastN = paras.slice(-n);
  return { totalParas: paras.length, lastN };
}

function tailAfterLastTable(xml) {
  const idx = xml.lastIndexOf('</w:tbl>');
  if (idx < 0) return null;
  // Take everything after the last table up to </w:body>
  const bodyEnd = xml.indexOf('</w:body>', idx);
  return xml.substring(idx + '</w:tbl>'.length, bodyEnd >= 0 ? bodyEnd : xml.length);
}

function classifyPara(p) {
  const hasPageBr = /<w:br\b[^>]*w:type\s*=\s*"page"/.test(p);
  const hasTextRe = /<w:t[\s>][\s\S]*?>([\s\S]*?)<\/w:t>/g;
  let textContent = '';
  let m;
  while ((m = hasTextRe.exec(p)) !== null) textContent += m[1];
  const trimmed = textContent.trim();
  if (hasPageBr) return `PAGE-BREAK${trimmed ? ` + text "${trimmed.slice(0, 30)}"` : ''}`;
  if (!trimmed) return 'EMPTY';
  return `TEXT "${trimmed.slice(0, 50)}${trimmed.length > 50 ? '…' : ''}"`;
}

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const docs = await client.db(DB_NAME).collection('exhibits')
    .find({ name: { $regex: QUERY, $options: 'i' } })
    .project({ _id: 1, name: 1, fileData: 1 })
    .toArray();

  console.log(`Found ${docs.length} exhibit(s) matching /${QUERY}/i\n`);

  for (const d of docs) {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(d.name);
    console.log('  _id:', d._id.toString());
    if (!d.fileData) { console.log('  (no fileData)'); continue; }
    const buf = Buffer.from(d.fileData, 'base64');
    let xml;
    try {
      const zip = new PizZip(buf);
      xml = zip.file('word/document.xml')?.asText();
    } catch (e) {
      console.log('  (failed to read docx zip:', e.message, ')');
      continue;
    }
    if (!xml) { console.log('  (no document.xml)'); continue; }

    const { totalParas, lastN } = summarizeLastParagraphs(xml, 8);
    console.log(`  total <w:p> blocks: ${totalParas}`);
    console.log(`  last ${lastN.length} paragraphs (top -> bottom):`);
    lastN.forEach((p, i) => console.log(`    [${totalParas - lastN.length + i + 1}] ${classifyPara(p)}`));

    const tail = tailAfterLastTable(xml);
    if (tail !== null) {
      const tailLen = tail.length;
      const preview = tail.replace(/\s+/g, ' ').trim().slice(0, 400);
      console.log(`  chars after last </w:tbl>: ${tailLen}`);
      console.log(`  preview: ${preview || '(empty)'}`);
    }
  }

  await client.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
