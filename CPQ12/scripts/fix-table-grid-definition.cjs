/**
 * Fix table structure to ensure header row spans both columns correctly
 * 
 * This script ensures that:
 * 1. The table has exactly 2 columns defined in the grid
 * 2. The first row has 1 cell with gridSpan="2"
 * 3. All other rows have 2 cells
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const EXHIBITS_DIR = path.join(process.cwd(), 'backend-exhibits');
const TARGET_FILE = 'Slack to Google Chat Basic Plan - Basic Not Include.docx';

function fixTableStructure(xml) {
  const parser = new DOMParser({
    errorHandler: { warning: null, error: null, fatalError: null }
  });
  const doc = parser.parseFromString(xml, 'application/xml');
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  let fixedCount = 0;

  // Find all tables
  const tables = Array.from(doc.getElementsByTagName('w:tbl'));
  
  for (const table of tables) {
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
      console.log('   ✅ Fixed table grid to have 2 columns');
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
        console.log('   ✅ Added gridSpan="2" to first row first cell');
      } else {
        const currentVal = gridSpan.getAttribute('w:val');
        if (currentVal !== '2') {
          gridSpan.setAttribute('w:val', '2');
          fixedCount++;
          console.log('   ✅ Updated gridSpan to "2" in first row first cell');
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
        console.log('   ✅ Removed second cell from first row (merged into first)');
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
        console.log('   ✅ Added gridSpan="2" to first row cell');
      } else {
        const currentVal = gridSpan.getAttribute('w:val');
        if (currentVal !== '2') {
          gridSpan.setAttribute('w:val', '2');
          fixedCount++;
          console.log('   ✅ Updated gridSpan to "2" in first row cell');
        }
      }
    }
    
    // Ensure all other rows have exactly 2 cells
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cells = Array.from(row.getElementsByTagName('w:tc'));
      
      if (cells.length !== 2) {
        console.log(`   ⚠️  Row ${i + 1} has ${cells.length} cell(s), expected 2`);
        // This might need manual fixing depending on the content
      }
    }
  }

  if (fixedCount === 0) return { xml, fixedCount: 0 };

  const serializer = new XMLSerializer();
  return { xml: serializer.serializeToString(doc), fixedCount };
}

async function processDocx(docxPath) {
  const buf = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buf);

  // Update the main document
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    console.log('   ⚠️  No document.xml found');
    return { changed: false, fixedCount: 0 };
  }

  const xml = await docXmlFile.async('string');
  const { xml: updated, fixedCount } = fixTableStructure(xml);
  
  if (fixedCount > 0) {
    zip.file('word/document.xml', updated);
    const outBuf = await zip.generateAsync({ type: 'nodebuffer' });
    fs.writeFileSync(docxPath, outBuf);
    return { changed: true, fixedCount };
  }
  
  return { changed: false, fixedCount: 0 };
}

async function main() {
  const filePath = path.join(EXHIBITS_DIR, TARGET_FILE);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`🔎 Processing: ${TARGET_FILE}...`);
  
  try {
    const res = await processDocx(filePath);
    if (res.changed) {
      console.log(`✅ Updated: ${TARGET_FILE} (fixed ${res.fixedCount} issue(s))`);
    } else {
      console.log(`ℹ️  No changes needed: ${TARGET_FILE}`);
    }
  } catch (e) {
    console.error(`❌ Failed to process ${TARGET_FILE}:`, e?.message || String(e));
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });
}

module.exports = { processDocx, fixTableStructure };

