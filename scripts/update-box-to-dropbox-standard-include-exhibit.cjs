/**
 * Update "Box to Dropbox Standard Plan - Standard Include" exhibit.
 *
 * Note on file mapping: after the project-wide rename (Standard→Basic,
 * Advanced→Standard) the DOCX that backs the *display* name
 * "Box to Dropbox Standard Plan - Standard Include" is
 *   backend-exhibits/Box to Dropbox Advanced Plan - Advanced Include.docx
 * (See seed-exhibits.cjs lines 577–579.) We only touch that file; the
 * Basic plan exhibit (backed by "Box to Dropbox Standard Plan -
 * Standard Include.docx") is left untouched.
 *
 * Changes (to match the PandaDoc reference content):
 *   - Insert after "Root File Permissions":
 *       • Sub-folder permissions
 *       • In line file comments
 *   - Rename:
 *       • "Box Notes" → "Box Notes (Box as Source)"
 *       • "Auto Retry" → "Auto-Retry"
 *   - Insert after "Long-File/folder path":
 *       • Supressing email notifications
 *
 * Default: DRY RUN (prints planned changes). Use `--apply` to write the
 * DOCX in place. A timestamped .bak copy is written next to the file
 * before any modification.
 *
 *   node scripts/update-box-to-dropbox-standard-include-exhibit.cjs
 *   node scripts/update-box-to-dropbox-standard-include-exhibit.cjs --apply
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const APPLY = process.argv.includes('--apply');
const FILE = path.join(
  process.cwd(),
  'backend-exhibits',
  'Box to Dropbox Advanced Plan - Advanced Include.docx'
);
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// What we want the data rows to look like, in order, after the update.
const TARGET_ROWS = [
  ['Data Migration (Files & Folders with structure)', null], // keep existing description
  ['Root Folder Permissions', null],
  ['Root File Permissions', null],
  ['Sub-folder permissions', 'CloudFuze preserves all subfolder permissions along with access levels.'],
  ['In line file comments', 'Inline file comments of the box will be migrated to the destination cloud. All the file comments will preserve in the CSV formatted file in the destination.'],
  ['External Shares', null],
  ['Delta', null],
  ['Metadata', null],
  ['Selective Versions', null],
  ['Box Notes (Box as Source)', null],
  ['Special Characters Replacement', null],
  ['Long-File/folder path', null],
  ['Supressing email notifications', 'The system will automatically prevent the generation of email notifications for collaborations on folders/files originating from the destination cloud.'],
  ['Auto-Retry', null],
];

// Labels we expect to find in the current file (used to locate rows for rename / preservation).
const CURRENT_LABEL_FOR_TARGET = {
  'Data Migration (Files & Folders with structure)': 'Data Migration (Files & Folders with structure)',
  'Root Folder Permissions': 'Root Folder Permissions',
  'Root File Permissions': 'Root File Permissions',
  'External Shares': 'External Shares',
  'Delta': 'Delta',
  'Metadata': 'Metadata',
  'Selective Versions': 'Selective Versions',
  'Box Notes (Box as Source)': 'Box Notes',
  'Special Characters Replacement': 'Special Characters Replacement',
  'Long-File/folder path': 'Long-File/folder path',
  'Auto-Retry': 'Auto Retry',
};

function textOf(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.nodeValue || '';
  let s = '';
  for (let i = 0; i < node.childNodes.length; i++) s += textOf(node.childNodes[i]);
  return s;
}

function getCellLabel(tc) {
  return textOf(tc).replace(/\s+/g, ' ').trim();
}

/**
 * Replace the visible text inside a <w:tc> cell while preserving its run/paragraph
 * formatting. Strategy: find the first <w:t> in the cell, set its content to the
 * new text, and clear every other <w:t> in the cell.
 */
function setCellText(tc, doc, newText) {
  const ts = Array.from(tc.getElementsByTagName('w:t'));
  if (ts.length === 0) {
    // No text node yet — create the run/text structure.
    const ps = tc.getElementsByTagName('w:p');
    const p = ps.length > 0 ? ps[0] : tc.appendChild(doc.createElementNS(W_NS, 'w:p'));
    const r = doc.createElementNS(W_NS, 'w:r');
    const t = doc.createElementNS(W_NS, 'w:t');
    t.setAttribute('xml:space', 'preserve');
    t.appendChild(doc.createTextNode(newText));
    r.appendChild(t);
    p.appendChild(r);
    return;
  }
  // Clear all child text nodes in the first <w:t>, then set the new text and preserve whitespace.
  const first = ts[0];
  while (first.firstChild) first.removeChild(first.firstChild);
  first.setAttribute('xml:space', 'preserve');
  first.appendChild(doc.createTextNode(newText));
  // Empty every other <w:t> so the cell shows exactly newText.
  for (let i = 1; i < ts.length; i++) {
    const t = ts[i];
    while (t.firstChild) t.removeChild(t.firstChild);
  }
}

/**
 * Clone an existing <w:tr> (deep), then overwrite the text in its two data cells
 * with [label, description]. This preserves the table's row height, cell
 * borders, fonts, and shading exactly.
 */
function makeClonedRow(templateTr, doc, label, description) {
  const newTr = templateTr.cloneNode(true);
  const cells = Array.from(newTr.getElementsByTagName('w:tc'));
  if (cells.length >= 1) setCellText(cells[0], doc, label);
  if (cells.length >= 2) setCellText(cells[1], doc, description);
  return newTr;
}

(async () => {
  console.log(`File:   ${FILE}`);
  console.log(`Mode:   ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  if (!fs.existsSync(FILE)) {
    console.error('❌ File not found.');
    process.exit(1);
  }

  const buf = fs.readFileSync(FILE);
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file('word/document.xml').async('string');
  const doc = new DOMParser({ errorHandler: { warning: null, error: null, fatalError: null } })
    .parseFromString(docXml, 'application/xml');

  const tables = Array.from(doc.getElementsByTagName('w:tbl'));
  if (tables.length !== 1) {
    console.error(`❌ Expected exactly 1 table, found ${tables.length}.`);
    process.exit(1);
  }
  const tbl = tables[0];
  const allRows = Array.from(tbl.getElementsByTagName('w:tr'));
  if (allRows.length < 2) {
    console.error('❌ Table has no data rows.');
    process.exit(1);
  }

  const headerRow = allRows[0];
  const dataRows = allRows.slice(1);

  // Map current label → existing <w:tr> so we can reuse rows for known labels and
  // clone the template row for new entries.
  const dataRowByLabel = new Map();
  for (const tr of dataRows) {
    const cells = Array.from(tr.getElementsByTagName('w:tc'));
    if (cells.length === 0) continue;
    dataRowByLabel.set(getCellLabel(cells[0]), tr);
  }

  // Pick a clone source for new rows — first existing data row works well because
  // it has matching cell widths and styling.
  const templateTr = dataRows[0];

  // Build the new data-row sequence.
  const planned = [];
  const newDataRows = [];
  for (const [targetLabel, targetDesc] of TARGET_ROWS) {
    const existingLabel = CURRENT_LABEL_FOR_TARGET[targetLabel];
    const existingTr = existingLabel ? dataRowByLabel.get(existingLabel) : null;
    if (existingTr) {
      // Reuse existing row. If a rename is required, set the new label; otherwise leave description untouched.
      if (existingLabel !== targetLabel) {
        const cells = Array.from(existingTr.getElementsByTagName('w:tc'));
        if (cells[0]) setCellText(cells[0], doc, targetLabel);
        planned.push(`  RENAME : "${existingLabel}"  →  "${targetLabel}"`);
      } else {
        planned.push(`  KEEP   : "${targetLabel}"`);
      }
      newDataRows.push(existingTr);
    } else {
      // New row — clone template and set both cells.
      const cloned = makeClonedRow(templateTr, doc, targetLabel, targetDesc || '');
      newDataRows.push(cloned);
      planned.push(`  INSERT : "${targetLabel}"`);
    }
  }

  // Report rows in the current file that we are NOT carrying over (should be none — guard against accidental drops).
  const keptCurrentLabels = new Set(
    Object.values(CURRENT_LABEL_FOR_TARGET)
  );
  const droppedLabels = [];
  for (const lbl of dataRowByLabel.keys()) {
    if (!keptCurrentLabels.has(lbl)) droppedLabels.push(lbl);
  }
  if (droppedLabels.length > 0) {
    console.warn('⚠️ Existing rows that would be dropped (review carefully):');
    droppedLabels.forEach((l) => console.warn(`     • "${l}"`));
    console.warn('');
  }

  console.log('Planned row sequence after update:');
  planned.forEach((line) => console.log(line));
  console.log('');

  if (!APPLY) {
    console.log(`DRY RUN: ${newDataRows.length} data rows + 1 header would be written. Re-run with --apply to save.`);
    return;
  }

  // Detach all rows from the table, then re-append in target order.
  // We must remove ALL <w:tr> first so reordering is clean (and any old-but-renamed
  // rows we reused are placed in their new position).
  while (tbl.getElementsByTagName('w:tr').length > 0) {
    const tr = tbl.getElementsByTagName('w:tr')[0];
    tr.parentNode.removeChild(tr);
  }
  // Re-append header first, then data rows in target order.
  tbl.appendChild(headerRow);
  for (const tr of newDataRows) tbl.appendChild(tr);

  const newXml = new XMLSerializer().serializeToString(doc);
  zip.file('word/document.xml', newXml);
  const outBuf = await zip.generateAsync({ type: 'nodebuffer' });

  // Backup before overwrite.
  const backupPath = `${FILE}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
  fs.writeFileSync(backupPath, buf);
  console.log(`📦 Backup written: ${backupPath}`);

  fs.writeFileSync(FILE, outBuf);
  console.log(`✅ Updated: ${FILE}`);
})().catch((err) => {
  console.error('❌ Update failed:', err);
  process.exit(1);
});
