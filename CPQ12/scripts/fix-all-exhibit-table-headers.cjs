/**
 * Fix table header rows in all exhibit files to ensure they span both columns
 * 
 * This script processes all exhibit DOCX files and ensures that:
 * 1. Tables have exactly 2 columns in the grid
 * 2. The first row has 1 cell with gridSpan="2" (spanning both columns)
 * 3. All other rows have 2 cells
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const EXHIBITS_DIR = path.join(process.cwd(), 'backend-exhibits');

function listDocxFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'))
    .map((f) => path.join(dir, f));
}

function fixTableStructure(xml) {
  const parser = new DOMParser({
    errorHandler: { warning: null, error: null, fatalError: null }
  });
  const doc = parser.parseFromString(xml, 'application/xml');
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  let fixedCount = 0;
  let tablesFixed = 0;

  // Find all tables
  const tables = Array.from(doc.getElementsByTagName('w:tbl'));
  
  for (const table of tables) {
    let tableFixed = false;
    
    // Check table grid definition
    const tblGrid = table.getElementsByTagName('w:tblGrid')[0];
    if (!tblGrid) {
      // Create tblGrid if it doesn't exist
      const newTblGrid = doc.createElementNS(ns, 'w:tblGrid');
      table.insertBefore(newTblGrid, table.firstChild);
    }
    
    const grid = table.getElementsByTagName('w:tblGrid')[0];
    const gridCols = Array.from(grid.getElementsByTagName('w:gridCol'));
    
    // Ensure table has exactly 2 columns in the grid
    if (gridCols.length !== 2) {
      // Remove all existing grid columns
      while (grid.firstChild) {
        grid.removeChild(grid.firstChild);
      }
      
      // Add 2 grid columns
      const col1 = doc.createElementNS(ns, 'w:gridCol');
      grid.appendChild(col1);
      const col2 = doc.createElementNS(ns, 'w:gridCol');
      grid.appendChild(col2);
      fixedCount++;
      tableFixed = true;
    }
    
    // Check rows
    const rows = Array.from(table.getElementsByTagName('w:tr'));
    if (rows.length === 0) continue;
    
    // Fix first row (header row)
    const firstRow = rows[0];
    const firstRowCells = Array.from(firstRow.getElementsByTagName('w:tc'));
    
    if (firstRowCells.length === 2) {
      // If first row has 2 cells, merge them into 1 cell with gridSpan="2"
      const firstCell = firstRowCells[0];
      const secondCell = firstRowCells[1];
      
      // Get or create tcPr for first cell
      let tcPr = firstCell.getElementsByTagName('w:tcPr')[0];
      if (!tcPr) {
        tcPr = doc.createElementNS(ns, 'w:tcPr');
        firstCell.insertBefore(tcPr, firstCell.firstChild);
      }
      
      // Add or update gridSpan
      let gridSpan = tcPr.getElementsByTagName('w:gridSpan')[0];
      if (!gridSpan) {
        gridSpan = doc.createElementNS(ns, 'w:gridSpan');
        gridSpan.setAttribute('w:val', '2');
        tcPr.appendChild(gridSpan);
        fixedCount++;
        tableFixed = true;
      } else {
        const currentVal = gridSpan.getAttribute('w:val');
        if (currentVal !== '2') {
          gridSpan.setAttribute('w:val', '2');
          fixedCount++;
          tableFixed = true;
        }
      }
      
      // Move content from second cell to first cell if needed
      const secondCellContent = Array.from(secondCell.childNodes);
      for (const node of secondCellContent) {
        if (node.nodeName !== 'w:tcPr') {
          const clonedNode = node.cloneNode(true);
          firstCell.appendChild(clonedNode);
        }
      }
      
      // Remove the second cell
      if (secondCell.parentNode) {
        secondCell.parentNode.removeChild(secondCell);
        fixedCount++;
        tableFixed = true;
      }
    } else if (firstRowCells.length === 1) {
      // If first row has 1 cell, ensure it has gridSpan="2"
      const firstCell = firstRowCells[0];
      let tcPr = firstCell.getElementsByTagName('w:tcPr')[0];
      
      if (!tcPr) {
        tcPr = doc.createElementNS(ns, 'w:tcPr');
        firstCell.insertBefore(tcPr, firstCell.firstChild);
      }
      
      let gridSpan = tcPr.getElementsByTagName('w:gridSpan')[0];
      if (!gridSpan) {
        gridSpan = doc.createElementNS(ns, 'w:gridSpan');
        gridSpan.setAttribute('w:val', '2');
        tcPr.appendChild(gridSpan);
        fixedCount++;
        tableFixed = true;
      } else {
        const currentVal = gridSpan.getAttribute('w:val');
        if (currentVal !== '2') {
          gridSpan.setAttribute('w:val', '2');
          fixedCount++;
          tableFixed = true;
        }
      }
    }
    
    if (tableFixed) {
      tablesFixed++;
    }
  }

  if (fixedCount === 0) return { xml, fixedCount: 0, tablesFixed: 0 };

  const serializer = new XMLSerializer();
  return { xml: serializer.serializeToString(doc), fixedCount, tablesFixed };
}

async function processDocx(docxPath) {
  const buf = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buf);

  // Update the main document
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    return { changed: false, fixedCount: 0, tablesFixed: 0 };
  }

  const xml = await docXmlFile.async('string');
  const { xml: updated, fixedCount, tablesFixed } = fixTableStructure(xml);
  
  if (fixedCount > 0) {
    zip.file('word/document.xml', updated);
    const outBuf = await zip.generateAsync({ type: 'nodebuffer' });
    fs.writeFileSync(docxPath, outBuf);
    return { changed: true, fixedCount, tablesFixed };
  }
  
  return { changed: false, fixedCount: 0, tablesFixed: 0 };
}

async function main() {
  const files = listDocxFiles(EXHIBITS_DIR);
  if (files.length === 0) {
    console.error(`❌ No .docx files found in: ${EXHIBITS_DIR}`);
    process.exit(1);
  }

  console.log(`🔎 Scanning ${files.length} exhibit files to fix table headers...\n`);
  let changedFiles = 0;
  let totalFixedCount = 0;
  let totalTablesFixed = 0;
  const failures = [];

  for (const filePath of files) {
    try {
      const res = await processDocx(filePath);
      if (res.changed) {
        changedFiles++;
        totalFixedCount += res.fixedCount;
        totalTablesFixed += res.tablesFixed;
        console.log(`✅ Updated: ${path.basename(filePath)} (${res.tablesFixed} table(s), ${res.fixedCount} fix(es))`);
      }
    } catch (e) {
      const fileName = path.basename(filePath);
      failures.push({ fileName, error: e?.message || String(e) });
      console.log(`⚠️  Skipped: ${fileName} (${e?.message || String(e)})`);
    }
  }

  console.log(
    `\n✅ Done.\n- Files scanned: ${files.length}\n- Files updated: ${changedFiles}\n- Tables fixed: ${totalTablesFixed}\n- Total fixes: ${totalFixedCount}`
  );

  if (failures.length > 0) {
    console.log(`\n⚠️  Failed files (${failures.length}):`);
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

module.exports = { processDocx, fixTableStructure };

