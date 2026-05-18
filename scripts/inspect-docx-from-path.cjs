/**
 * Read a DOCX from any path and print its table rows (label, description).
 * Usage: node scripts/inspect-docx-from-path.cjs <file>
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');

const FILE = process.argv[2];
if (!FILE) {
  console.error('Usage: node scripts/inspect-docx-from-path.cjs <file>');
  process.exit(1);
}

function textOf(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.nodeValue || '';
  let s = '';
  for (let i = 0; i < node.childNodes.length; i++) s += textOf(node.childNodes[i]);
  return s;
}

(async () => {
  const buf = fs.readFileSync(FILE);
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file('word/document.xml').async('string');
  const doc = new DOMParser({ errorHandler: { warning: null, error: null, fatalError: null } })
    .parseFromString(docXml, 'application/xml');
  const tables = Array.from(doc.getElementsByTagName('w:tbl'));
  console.log(`File: ${FILE} (${buf.length} bytes, ${tables.length} table(s))`);
  tables.forEach((tbl, ti) => {
    const rows = Array.from(tbl.getElementsByTagName('w:tr'));
    console.log(`\nTable #${ti + 1} (${rows.length} rows):`);
    rows.forEach((tr, ri) => {
      const cells = Array.from(tr.getElementsByTagName('w:tc'));
      const labels = cells.map((tc) => textOf(tc).replace(/\s+/g, ' ').trim());
      console.log(`  Row ${ri}: [${labels.map((s) => JSON.stringify(s)).join(', ')}]`);
    });
  });
})().catch((err) => { console.error('❌', err); process.exit(1); });
