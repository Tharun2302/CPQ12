/**
 * Remove (for now):
 * - The "Managed Migration Service" table row (the row whose first cell contains that label)
 * - The "Bundled Pricing(10%)" column (or any column whose header cell contains "Bundled")
 *
 * This edits backend DOCX templates in-place under ./backend-templates.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const TEMPLATES_DIR = path.join(process.cwd(), 'backend-templates');

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

function getDirectChildrenByTagName(parent, tagName) {
  const out = [];
  if (!parent || !parent.childNodes) return out;
  for (let i = 0; i < parent.childNodes.length; i++) {
    const n = parent.childNodes.item(i);
    if (n && n.nodeName === tagName) out.push(n);
  }
  return out;
}

function removeManagedMigrationServiceRows(doc) {
  let removed = 0;
  const tables = doc.getElementsByTagName('w:tbl');
  for (let t = 0; t < tables.length; t++) {
    const tbl = tables.item(t);
    const rows = getDirectChildrenByTagName(tbl, 'w:tr');
    // Iterate backwards so removals don't affect indices
    for (let r = rows.length - 1; r >= 0; r--) {
      const tr = rows[r];
      const cells = getDirectChildrenByTagName(tr, 'w:tc');
      if (!cells || cells.length < 1) continue;
      const firstCellText = normalizeText(getCellText(cells[0]));
      if (!firstCellText.includes('managed migration service')) continue;
      if (tr.parentNode) {
        tr.parentNode.removeChild(tr);
        removed++;
      }
    }
  }
  return removed;
}

function removeBundledPricingColumns(doc) {
  let tablesChanged = 0;
  let cellsRemoved = 0;
  let gridColsRemoved = 0;

  const tables = doc.getElementsByTagName('w:tbl');
  for (let t = 0; t < tables.length; t++) {
    const tbl = tables.item(t);
    const rows = getDirectChildrenByTagName(tbl, 'w:tr');
    if (!rows || rows.length === 0) continue;

    // Find the bundled column index from a header row (any row that contains a cell with "bundled")
    let bundledIndex = -1;
    for (const tr of rows) {
      const cells = getDirectChildrenByTagName(tr, 'w:tc');
      for (let i = 0; i < cells.length; i++) {
        const txt = normalizeText(getCellText(cells[i]));
        if (txt.includes('bundled')) {
          bundledIndex = i;
          break;
        }
      }
      if (bundledIndex !== -1) break;
    }

    if (bundledIndex === -1) continue;

    // Remove the gridCol at that index if present
    const tblGrid = getDirectChildrenByTagName(tbl, 'w:tblGrid')[0];
    if (tblGrid) {
      const gridCols = getDirectChildrenByTagName(tblGrid, 'w:gridCol');
      if (bundledIndex >= 0 && bundledIndex < gridCols.length) {
        tblGrid.removeChild(gridCols[bundledIndex]);
        gridColsRemoved++;
      }
    }

    // Remove the cell at bundledIndex for each row (if present)
    for (const tr of rows) {
      const cells = getDirectChildrenByTagName(tr, 'w:tc');
      if (bundledIndex >= 0 && bundledIndex < cells.length) {
        tr.removeChild(cells[bundledIndex]);
        cellsRemoved++;
      }
    }

    tablesChanged++;
  }

  return { tablesChanged, cellsRemoved, gridColsRemoved };
}

function updateWordXml(xml) {
  const parser = new DOMParser({ errorHandler: { warning: null, error: null, fatalError: null } });
  const doc = parser.parseFromString(xml, 'application/xml');

  const removedManagedRows = removeManagedMigrationServiceRows(doc);
  const bundled = removeBundledPricingColumns(doc);

  const changed =
    removedManagedRows > 0 ||
    bundled.tablesChanged > 0 ||
    bundled.cellsRemoved > 0 ||
    bundled.gridColsRemoved > 0;

  if (!changed) {
    return {
      xml,
      removedManagedRows: 0,
      bundled: { tablesChanged: 0, cellsRemoved: 0, gridColsRemoved: 0 },
    };
  }

  const serializer = new XMLSerializer();
  return {
    xml: serializer.serializeToString(doc),
    removedManagedRows,
    bundled,
  };
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

  let removedManagedRows = 0;
  let bundledTablesChanged = 0;
  let bundledCellsRemoved = 0;
  let bundledGridColsRemoved = 0;
  let anyChanged = false;

  for (const name of xmlCandidates) {
    const f = zip.file(name);
    if (!f) continue;
    const xml = await f.async('string');
    const updated = updateWordXml(xml);
    if (
      updated.removedManagedRows > 0 ||
      updated.bundled.tablesChanged > 0 ||
      updated.bundled.cellsRemoved > 0 ||
      updated.bundled.gridColsRemoved > 0
    ) {
      zip.file(name, updated.xml);
      anyChanged = true;
      removedManagedRows += updated.removedManagedRows;
      bundledTablesChanged += updated.bundled.tablesChanged;
      bundledCellsRemoved += updated.bundled.cellsRemoved;
      bundledGridColsRemoved += updated.bundled.gridColsRemoved;
    }
  }

  if (!anyChanged) {
    return {
      changed: false,
      removedManagedRows: 0,
      bundledTablesChanged: 0,
      bundledCellsRemoved: 0,
      bundledGridColsRemoved: 0,
    };
  }

  const out = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(docxPath, out);
  return {
    changed: true,
    removedManagedRows,
    bundledTablesChanged,
    bundledCellsRemoved,
    bundledGridColsRemoved,
  };
}

async function main() {
  const files = listDocxFiles(TEMPLATES_DIR);
  if (files.length === 0) {
    console.error(`❌ No .docx templates found in: ${TEMPLATES_DIR}`);
    process.exit(1);
  }

  console.log(`🔎 Removing Managed Migration Service row + Bundled Pricing column in ${files.length} templates...`);
  let changedFiles = 0;
  let totalManagedRows = 0;
  let totalBundledTables = 0;
  let totalBundledCells = 0;
  let totalBundledGridCols = 0;
  const failures = [];

  for (const p of files) {
    try {
      const res = await processDocx(p);
      if (res.changed) {
        changedFiles++;
        totalManagedRows += res.removedManagedRows;
        totalBundledTables += res.bundledTablesChanged;
        totalBundledCells += res.bundledCellsRemoved;
        totalBundledGridCols += res.bundledGridColsRemoved;
        console.log(
          `✅ Updated: ${path.basename(p)} (managedRowsRemoved: ${res.removedManagedRows}, bundledTables: ${res.bundledTablesChanged})`
        );
      }
    } catch (e) {
      failures.push({ fileName: path.basename(p), error: e?.message || String(e) });
      console.log(`⚠️  Skipped (unreadable/locked DOCX): ${path.basename(p)}`);
    }
  }

  console.log(
    `\nDone.\n- Templates scanned: ${files.length}\n- Templates updated: ${changedFiles}\n- Managed rows removed: ${totalManagedRows}\n- Bundled tables changed: ${totalBundledTables}\n- Bundled cells removed: ${totalBundledCells}\n- Bundled gridCols removed: ${totalBundledGridCols}`
  );

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


