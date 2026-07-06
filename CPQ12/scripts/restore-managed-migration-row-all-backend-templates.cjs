/**
 * Restore a "Managed Migration Service" pricing table row into backend-templates/*.docx.
 *
 * Background:
 * - A previous bulk-edit script (`scripts/remove-managed-row-and-bundled-column.cjs`) can remove the
 *   row whose first cell contains "Managed Migration Service".
 * - Many templates still include "Managed Migration" in the blue banner, but the *pricing table row*
 *   is missing, so agreements show only the main migration row + instance row.
 *
 * Approach:
 * - For each DOCX in ./backend-templates (excluding temp files and MultiCombinations/overage),
 *   locate the pricing table row that contains the users cost token (`users_cost`).
 * - Clone that row to preserve formatting.
 * - Edit the clone:
 *   - First cell: "Managed Migration Service"
 *   - Second cell: standard managed migration description
 *   - The cell that originally contained users_cost: set to "{{price_migration}}"
 * - Insert the cloned row immediately after the users_cost row.
 *
 * Notes:
 * - Bundled pricing columns were removed elsewhere; this script does not add bundled cells.
 * - If a template is locked by Word (EBUSY), it will be skipped and reported.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const TEMPLATES_DIR = path.join(process.cwd(), 'backend-templates');

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

function tableContainsText(tbl, needleLower) {
  const allText = normalizeText(getTextNodesUnder(tbl, 'w:t').map((n) => n.textContent || '').join(' '));
  return allText.includes(needleLower);
}

function rowContainsText(tr, needleLower) {
  const rowText = normalizeText(getTextNodesUnder(tr, 'w:t').map((n) => n.textContent || '').join(' '));
  return rowText.includes(needleLower);
}

function findPricingTable(doc) {
  const tables = doc.getElementsByTagName('w:tbl');
  for (let t = 0; t < tables.length; t++) {
    const tbl = tables.item(t);
    // Heuristic: pricing tables include users_cost and instance info/tokens.
    if (tableContainsText(tbl, 'users_cost') && (tableContainsText(tbl, 'instance') || tableContainsText(tbl, 'instance_cost'))) {
      return tbl;
    }
  }
  return null;
}

function setCellTextPreserveSingleRun(doc, tcEl, text) {
  // Prefer to set the first existing w:t; clear any other w:t nodes to avoid mixed tokens.
  const tNodes = getTextNodesUnder(tcEl, 'w:t');
  if (tNodes.length === 0) {
    // Create minimal structure if cell has no text runs.
    const p = doc.createElement('w:p');
    const r = doc.createElement('w:r');
    const t = doc.createElement('w:t');
    t.textContent = text;
    r.appendChild(t);
    p.appendChild(r);
    tcEl.appendChild(p);
    return;
  }
  tNodes[0].textContent = text;
  for (let i = 1; i < tNodes.length; i++) tNodes[i].textContent = '';
}

function restoreManagedMigrationRow(doc) {
  const pricingTable = findPricingTable(doc);
  if (!pricingTable) return { changed: false, reason: 'No pricing table (users_cost+instance) found' };

  if (tableContainsText(pricingTable, 'managed migration service')) {
    return { changed: false, reason: 'Row already present' };
  }

  const rows = getDirectChildrenByTagName(pricingTable, 'w:tr');
  if (!rows || rows.length === 0) return { changed: false, reason: 'Pricing table has no direct rows' };

  let usersCostRow = null;
  for (const tr of rows) {
    if (rowContainsText(tr, 'users_cost')) {
      usersCostRow = tr;
      break;
    }
  }
  if (!usersCostRow) return { changed: false, reason: 'No row containing users_cost found' };

  // Clone to preserve formatting and column count.
  const newRow = usersCostRow.cloneNode(true);
  const cells = getDirectChildrenByTagName(newRow, 'w:tc');
  if (!cells || cells.length < 2) {
    return { changed: false, reason: 'Cloned row has insufficient cells' };
  }

  // 1) First cell label
  setCellTextPreserveSingleRun(doc, cells[0], 'Managed Migration Service');

  // 2) Description cell
  const desc =
    'Managed Migration | Assigned Project Manager | Pre-Migration Analysis | During Migration Consulting | ' +
    'Post-Migration Support and Data Reconciliation Support | End-to End Migration Assistance with 24*7 Premium Support';
  setCellTextPreserveSingleRun(doc, cells[1], desc);

  // 3) Replace the users_cost cell with price_migration.
  // Find which cell contains users_cost in the cloned row, and set it to the migration price token.
  let replaced = false;
  for (const tc of cells) {
    const txt = normalizeText(getCellText(tc));
    if (txt.includes('users_cost')) {
      setCellTextPreserveSingleRun(doc, tc, '{{price_migration}}');
      replaced = true;
      break;
    }
  }
  // Fallback: last cell
  if (!replaced && cells.length >= 1) {
    setCellTextPreserveSingleRun(doc, cells[cells.length - 1], '{{price_migration}}');
  }

  // Insert immediately after the users_cost row.
  if (usersCostRow.nextSibling) {
    pricingTable.insertBefore(newRow, usersCostRow.nextSibling);
    return { changed: true, where: 'after users_cost row' };
  }
  pricingTable.appendChild(newRow);
  return { changed: true, where: 'after users_cost row (append)' };
}

async function processDocx(docxPath) {
  const buf = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buf);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) throw new Error('No word/document.xml');

  const xml = await docXmlFile.async('string');
  const parser = new DOMParser({ errorHandler: { warning: null, error: null, fatalError: null } });
  const serializer = new XMLSerializer();
  const doc = parser.parseFromString(xml, 'application/xml');

  const res = restoreManagedMigrationRow(doc);
  if (!res.changed) return { changed: false, reason: res.reason };

  zip.file('word/document.xml', serializer.serializeToString(doc));
  const out = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(docxPath, out);
  return { changed: true, where: res.where };
}

function listDocxFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'))
    .map((f) => path.join(dir, f));
}

function shouldSkip(fileNameLower) {
  // MultiCombinations are handled by dedicated scripts; overage agreement is different structure.
  if (fileNameLower.includes('multicombinations')) return true;
  if (fileNameLower.includes('overage-agreement')) return true;
  return false;
}

async function main() {
  const files = listDocxFiles(TEMPLATES_DIR);
  if (files.length === 0) {
    console.error(`❌ No .docx templates found in: ${TEMPLATES_DIR}`);
    process.exit(1);
  }

  console.log(`🔎 Restoring Managed Migration Service row in backend-templates (${files.length} files scanned)...`);

  let changedFiles = 0;
  let skippedFiles = 0;
  const skipped = [];
  const failures = [];

  for (const p of files) {
    const base = path.basename(p);
    const lower = base.toLowerCase();
    if (shouldSkip(lower)) {
      skippedFiles++;
      skipped.push({ fileName: base, reason: 'skipped (special template)' });
      continue;
    }
    try {
      const res = await processDocx(p);
      if (res.changed) {
        changedFiles++;
        console.log(`✅ Updated: ${base} (${res.where})`);
      }
    } catch (e) {
      failures.push({ fileName: base, error: e?.message || String(e) });
      console.log(`⚠️  Skipped (unreadable/locked DOCX): ${base}`);
    }
  }

  console.log(
    `\nDone.\n- Templates scanned: ${files.length}\n- Templates updated: ${changedFiles}\n- Templates skipped: ${skippedFiles}\n- Failures: ${failures.length}`
  );

  if (skipped.length) {
    console.log('\nℹ️  Skipped:');
    skipped.forEach((s) => console.log(`- ${s.fileName}: ${s.reason}`));
  }

  if (failures.length > 0) {
    console.log(`\n⚠️  Failed templates (${failures.length}):`);
    for (const f of failures) console.log(`- ${f.fileName}: ${f.error}`);
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });
}


