/**
 * Restore the "Managed Migration Service" row ONLY into:
 *   backend-templates/MultiCombinations-fixed.docx
 *
 * We copy the exact row structure from the extracted original template XML:
 *   C:\cpq\_tmp_docx_extract\MultiCombinations\word\document.xml
 *
 * This avoids reintroducing bundled pricing, and keeps formatting identical.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const FIXED_DOCX = path.join(process.cwd(), 'backend-templates', 'MultiCombinations-fixed.docx');
const SOURCE_XML = path.join('C:\\cpq\\_tmp_docx_extract\\MultiCombinations\\word\\document.xml');

function normalizeText(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getTextNodesUnder(el, tagName) {
  const nodes = el.getElementsByTagName(tagName);
  const out = [];
  for (let i = 0; i < nodes.length; i++) out.push(nodes.item(i));
  return out;
}

function getCellText(tcEl) {
  const tNodes = getTextNodesUnder(tcEl, 'w:t');
  return tNodes.map((n) => n.textContent || '').join('');
}

function getDirectChildrenByTagName(parent, tagName) {
  const out = [];
  if (!parent || !parent.childNodes) return out;
  for (let i = 0; i < parent.childNodes.length; i++) {
    const n = parent.childNodes.item(i);
    if (n && n.nodeName === tagName) out.push(n);
  }
  return out;
}

function findManagedMigrationRow(sourceDoc) {
  const tables = sourceDoc.getElementsByTagName('w:tbl');
  for (let t = 0; t < tables.length; t++) {
    const tbl = tables.item(t);
    const rows = tbl.getElementsByTagName('w:tr');
    for (let r = 0; r < rows.length; r++) {
      const tr = rows.item(r);
      const cells = tr.getElementsByTagName('w:tc');
      if (!cells || cells.length < 1) continue;
      const first = normalizeText(getCellText(cells.item(0)));
      if (first.includes('managed migration service')) return tr;
    }
  }
  return null;
}

function tableContainsToken(tbl, tokenLower) {
  const allText = normalizeText(getTextNodesUnder(tbl, 'w:t').map((n) => n.textContent || '').join(' '));
  return allText.includes(tokenLower);
}

function rowContainsToken(tr, tokenLower) {
  const rowText = normalizeText(getTextNodesUnder(tr, 'w:t').map((n) => n.textContent || '').join(' '));
  return rowText.includes(tokenLower);
}

function restoreRowInDoc(destDoc, managedRowFromSource) {
  // Find the table that contains the exhibits loop
  const tables = destDoc.getElementsByTagName('w:tbl');
  let targetTable = null;
  for (let t = 0; t < tables.length; t++) {
    const tbl = tables.item(t);
    if (tableContainsToken(tbl, '{{#exhibits}}')) {
      targetTable = tbl;
      break;
    }
  }
  if (!targetTable) {
    return { changed: false, reason: 'No table containing {{#exhibits}} found' };
  }

  // If it already exists, do nothing
  if (tableContainsToken(targetTable, 'managed migration service')) {
    return { changed: false, reason: 'Row already present' };
  }

  const rows = getDirectChildrenByTagName(targetTable, 'w:tr');
  if (!rows || rows.length === 0) return { changed: false, reason: 'Target table has no direct w:tr children' };

  // Prefer inserting after the {{/exhibits}} marker row; fallback before {{#servers}}; else append.
  let insertAfter = null;
  let insertBefore = null;
  for (const tr of rows) {
    if (rowContainsToken(tr, '{{/exhibits}}')) insertAfter = tr;
    if (rowContainsToken(tr, '{{#servers}}') && !insertBefore) insertBefore = tr;
  }

  // Clone the source row (xmldom is permissive about cross-document nodes, but we clone to be safe)
  const toInsert = managedRowFromSource.cloneNode(true);

  if (insertAfter && insertAfter.nextSibling) {
    targetTable.insertBefore(toInsert, insertAfter.nextSibling);
    return { changed: true, where: 'after {{/exhibits}}' };
  }
  if (insertAfter && !insertAfter.nextSibling) {
    targetTable.appendChild(toInsert);
    return { changed: true, where: 'after {{/exhibits}} (append)' };
  }
  if (insertBefore) {
    targetTable.insertBefore(toInsert, insertBefore);
    return { changed: true, where: 'before {{#servers}}' };
  }

  targetTable.appendChild(toInsert);
  return { changed: true, where: 'appended to target table' };
}

async function main() {
  if (!fs.existsSync(FIXED_DOCX)) {
    console.error(`❌ Missing: ${FIXED_DOCX}`);
    process.exit(1);
  }
  if (!fs.existsSync(SOURCE_XML)) {
    console.error(`❌ Missing source XML (extract first): ${SOURCE_XML}`);
    process.exit(1);
  }

  const parser = new DOMParser({ errorHandler: { warning: null, error: null, fatalError: null } });
  const serializer = new XMLSerializer();

  const sourceXml = fs.readFileSync(SOURCE_XML, 'utf8');
  const sourceDoc = parser.parseFromString(sourceXml, 'application/xml');
  const managedRow = findManagedMigrationRow(sourceDoc);
  if (!managedRow) {
    console.error('❌ Could not find "Managed Migration Service" row in source XML.');
    process.exit(1);
  }

  const buf = fs.readFileSync(FIXED_DOCX);
  const zip = await JSZip.loadAsync(buf);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    console.error('❌ Fixed docx has no word/document.xml');
    process.exit(1);
  }

  const destXml = await docXmlFile.async('string');
  const destDoc = parser.parseFromString(destXml, 'application/xml');
  const res = restoreRowInDoc(destDoc, managedRow);
  if (!res.changed) {
    console.log(`ℹ️  No change: ${res.reason}`);
    return;
  }

  zip.file('word/document.xml', serializer.serializeToString(destDoc));
  const out = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(FIXED_DOCX, out);
  console.log(`✅ Restored Managed Migration Service row into MultiCombinations-fixed.docx (${res.where})`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });
}


