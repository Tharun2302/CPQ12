/**
 * Inspect: print every table row's first-column label from
 * "Box to Dropbox Advanced Plan - Advanced Include.docx" (the file that
 * currently backs the "Standard Plan - Standard Include" display name
 * after the Standard→Basic / Advanced→Standard rename).
 *
 * Read-only — does not modify the file.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');

const FILE = path.join(
  process.cwd(),
  'backend-exhibits',
  'Box to Dropbox Advanced Plan - Advanced Include.docx'
);

function textOf(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.nodeValue || '';
  let s = '';
  for (let i = 0; i < node.childNodes.length; i++) {
    s += textOf(node.childNodes[i]);
  }
  return s;
}

(async () => {
  if (!fs.existsSync(FILE)) {
    console.error(`❌ File not found: ${FILE}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(FILE);
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file('word/document.xml').async('string');
  const doc = new DOMParser({ errorHandler: { warning: null, error: null, fatalError: null } })
    .parseFromString(docXml, 'application/xml');

  const tables = Array.from(doc.getElementsByTagName('w:tbl'));
  console.log(`File: ${FILE}`);
  console.log(`Tables found: ${tables.length}\n`);

  tables.forEach((tbl, ti) => {
    const rows = Array.from(tbl.getElementsByTagName('w:tr'));
    console.log(`Table #${ti + 1} (${rows.length} rows):`);
    rows.forEach((tr, ri) => {
      const cells = Array.from(tr.getElementsByTagName('w:tc'));
      const labels = cells.map((tc) => textOf(tc).replace(/\s+/g, ' ').trim());
      console.log(`  Row ${ri}: [${labels.map((s) => JSON.stringify(s)).join(', ')}]`);
    });
    console.log();
  });
})().catch((err) => {
  console.error('❌ Inspect failed:', err);
  process.exit(1);
});
