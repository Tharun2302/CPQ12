/**
 * Add the "Managed Migration Service" row back to pricing tables in DOCX templates.
 *
 * For each template in backend-templates:
 * - Finds the pricing table (contains "Instance Type" or "Job Requirement" / "Price(USD)")
 * - Finds the row whose first cell contains "Instance Type"
 * - If "Managed Migration Service" row is already present, skips.
 * - Otherwise clones the "Instance Type" row, sets cell texts to Managed Migration content,
 *   and inserts the new row BEFORE the "Instance Type" row.
 *
 * Run: node scripts/add-managed-migration-row.cjs
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const TEMPLATES_DIR = path.join(process.cwd(), 'backend-templates');

const MANAGED_MIGRATION_DESCRIPTION =
  'Fully Managed Migration | Assigned Project Manager | Pre-Migration Analysis | During Migration Consulting | Post-Migration Support and Data Reconciliation Support | End-to End Migration Assistance with 24*7 Premium Support';

function listDocxFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'))
    .map((f) => path.join(dir, f));
}

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

function setCellText(tcEl, text) {
  const tNodes = getTextNodesUnder(tcEl, 'w:t');
  if (tNodes.length === 0) return;
  tNodes[0].textContent = text;
  for (let i = 1; i < tNodes.length; i++) tNodes[i].textContent = '';
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

function tableContainsToken(tbl, tokenLower) {
  const allText = normalizeText(
    getTextNodesUnder(tbl, 'w:t')
      .map((n) => n.textContent || '')
      .join(' ')
  );
  return allText.includes(tokenLower);
}

function rowContainsToken(tr, tokenLower) {
  const rowText = normalizeText(
    getTextNodesUnder(tr, 'w:t')
      .map((n) => n.textContent || '')
      .join(' ')
  );
  return rowText.includes(tokenLower);
}

/**
 * Find the pricing table: has "Instance Type" or ("Job Requirement" and "Price")
 */
function findPricingTable(doc) {
  const tables = doc.getElementsByTagName('w:tbl');
  for (let t = 0; t < tables.length; t++) {
    const tbl = tables.item(t);
    if (tableContainsToken(tbl, 'instance type')) return tbl;
    if (tableContainsToken(tbl, 'job requirement') && tableContainsToken(tbl, 'price')) return tbl;
  }
  return null;
}

/**
 * Find the row whose first cell is "Instance Type"
 */
function findInstanceTypeRow(tbl) {
  const rows = getDirectChildrenByTagName(tbl, 'w:tr');
  for (let r = 0; r < rows.length; r++) {
    const tr = rows[r];
    const cells = getDirectChildrenByTagName(tr, 'w:tc');
    if (!cells || cells.length < 1) continue;
    const firstText = normalizeText(getCellText(cells[0]));
    if (firstText.includes('instance type')) return tr;
  }
  return null;
}

/**
 * Add Managed Migration Service row before the Instance Type row.
 * Clones the Instance Type row and replaces cell texts.
 */
function addManagedMigrationRow(doc, tbl, instanceTypeRow) {
  if (tableContainsToken(tbl, 'managed migration service')) {
    return { changed: false, reason: 'Managed Migration Service row already present' };
  }

  const cells = getDirectChildrenByTagName(instanceTypeRow, 'w:tc');
  const numCols = cells ? cells.length : 0;
  if (numCols < 2) return { changed: false, reason: 'Instance Type row has fewer than 2 cells' };

  const newRow = instanceTypeRow.cloneNode(true);
  const newCells = getDirectChildrenByTagName(newRow, 'w:tc');

  // Cell 1: Job Requirement
  setCellText(newCells[0], 'Managed Migration Service');
  // Cell 2: Description
  setCellText(newCells[1], MANAGED_MIGRATION_DESCRIPTION);
  // Cell 3: Price (or Migration Type then Price in 4-col)
  if (newCells.length >= 3) setCellText(newCells[2], '{{price_migration}}');
  // Cell 4: Bundled price if present
  if (newCells.length >= 4) setCellText(newCells[3], '{{price_migration_bundled}}');

  tbl.insertBefore(newRow, instanceTypeRow);
  return { changed: true, reason: 'Inserted Managed Migration Service row before Instance Type' };
}

function processDocumentXml(xml) {
  const parser = new DOMParser({ errorHandler: { warning: null, error: null, fatalError: null } });
  const doc = parser.parseFromString(xml, 'application/xml');

  const tbl = findPricingTable(doc);
  if (!tbl) return { xml, changed: false, reason: 'No pricing table found' };

  const instanceTypeRow = findInstanceTypeRow(tbl);
  if (!instanceTypeRow) return { xml, changed: false, reason: 'Instance Type row not found in pricing table' };

  const result = addManagedMigrationRow(doc, tbl, instanceTypeRow);
  if (!result.changed) return { xml, changed: false, reason: result.reason };

  const serializer = new XMLSerializer();
  return { xml: serializer.serializeToString(doc), changed: true, reason: result.reason };
}

async function processDocx(docxPath) {
  const buf = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buf);

  const xmlCandidates = Object.keys(zip.files).filter(
    (name) =>
      name === 'word/document.xml' ||
      name.startsWith('word/header') ||
      name.startsWith('word/footer')
  );

  let anyChanged = false;
  for (const name of xmlCandidates) {
    const file = zip.files[name];
    if (!file || file.dir) continue;
    const xml = await file.async('string');
    const result = processDocumentXml(xml);
    if (result.changed) {
      zip.file(name, result.xml);
      anyChanged = true;
    }
  }

  if (anyChanged) {
    const out = await zip.generateAsync({ type: 'nodebuffer' });
    fs.writeFileSync(docxPath, out);
  }
  return anyChanged;
}

async function main() {
  const files = listDocxFiles(TEMPLATES_DIR);
  if (files.length === 0) {
    console.error(`❌ No .docx templates found in: ${TEMPLATES_DIR}`);
    process.exit(1);
  }

  console.log(`🔎 Adding Managed Migration Service row to templates in ${TEMPLATES_DIR}...\n`);
  let updated = 0;
  const failures = [];

  for (const p of files) {
    try {
      const changed = await processDocx(p);
      if (changed) {
        updated++;
        console.log(`✅ Updated: ${path.basename(p)}`);
      } else {
        console.log(`⏭️  Skipped: ${path.basename(p)} (row already present or no pricing table)`);
      }
    } catch (e) {
      failures.push({ fileName: path.basename(p), error: e?.message || String(e) });
      console.log(`⚠️  Failed: ${path.basename(p)} - ${e?.message || e}`);
    }
  }

  console.log(`\nDone. Updated ${updated} of ${files.length} template(s).`);
  if (failures.length > 0) {
    console.log(`\n⚠️  Failures (${failures.length}):`);
    failures.forEach((f) => console.log(`   - ${f.fileName}: ${f.error}`));
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });
}

module.exports = { processDocx, processDocumentXml, addManagedMigrationRow };
