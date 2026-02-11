/**
 * Fix table header row to span both columns in Word documents
 * 
 * This script fixes tables where the header row should span 2 columns
 * but currently only has 1 column. It adds w:gridSpan to make the header
 * span both columns.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const EXHIBITS_DIR = path.join(process.cwd(), 'backend-exhibits');
const TARGET_FILE = 'Slack to Google Chat Basic Plan - Basic Not Include.docx';

function fixTableHeaderColspan(xml) {
  const parser = new DOMParser({
    errorHandler: { warning: null, error: null, fatalError: null }
  });
  const doc = parser.parseFromString(xml, 'application/xml');

  let fixedCount = 0;

  // Find all tables
  const tables = Array.from(doc.getElementsByTagName('w:tbl'));
  
  for (const table of tables) {
    // Find all rows in this table
    const rows = Array.from(table.getElementsByTagName('w:tr'));
    
    if (rows.length === 0) continue;
    
    // Check the first row (header row)
    const firstRow = rows[0];
    const cells = Array.from(firstRow.getElementsByTagName('w:tc'));
    
    // If first row has only 1 cell, we need to make it span 2 columns
    // But we need to check if the table actually has 2 columns defined
    if (cells.length === 1) {
      // Check if there are other rows with 2 cells (to confirm table has 2 columns)
      let hasTwoColumnRows = false;
      for (let i = 1; i < rows.length; i++) {
        const rowCells = Array.from(rows[i].getElementsByTagName('w:tc'));
        if (rowCells.length === 2) {
          hasTwoColumnRows = true;
          break;
        }
      }
      
      // If table has 2 columns in other rows, make the first cell span 2 columns
      if (hasTwoColumnRows) {
        const firstCell = cells[0];
        
        // Check if gridSpan already exists
        const tcPr = firstCell.getElementsByTagName('w:tcPr')[0];
        if (!tcPr) {
          // Create tcPr if it doesn't exist
          const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
          const newTcPr = doc.createElementNS(ns, 'w:tcPr');
          firstCell.insertBefore(newTcPr, firstCell.firstChild);
        }
        
        const existingTcPr = firstCell.getElementsByTagName('w:tcPr')[0];
        const existingGridSpan = existingTcPr.getElementsByTagName('w:gridSpan')[0];
        
        if (!existingGridSpan) {
          // Add gridSpan element
          const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
          const gridSpan = doc.createElementNS(ns, 'w:gridSpan');
          gridSpan.setAttribute('w:val', '2');
          existingTcPr.appendChild(gridSpan);
          fixedCount++;
          console.log('   ✅ Added gridSpan="2" to first row first cell');
        } else {
          // Update existing gridSpan
          const currentVal = existingGridSpan.getAttribute('w:val');
          if (currentVal !== '2') {
            existingGridSpan.setAttribute('w:val', '2');
            fixedCount++;
            console.log('   ✅ Updated gridSpan to "2" in first row first cell');
          }
        }
      }
    } else if (cells.length === 2) {
      // If first row has 2 cells, we need to merge them into 1 cell that spans 2 columns
      // This is more complex - we'll keep the first cell and add gridSpan, then remove the second cell
      const firstCell = cells[0];
      const secondCell = cells[1];
      
      // Get or create tcPr for first cell
      let tcPr = firstCell.getElementsByTagName('w:tcPr')[0];
      if (!tcPr) {
        const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
        tcPr = doc.createElementNS(ns, 'w:tcPr');
        firstCell.insertBefore(tcPr, firstCell.firstChild);
      }
      
      // Check if gridSpan exists
      let gridSpan = tcPr.getElementsByTagName('w:gridSpan')[0];
      if (!gridSpan) {
        const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
        gridSpan = doc.createElementNS(ns, 'w:gridSpan');
        gridSpan.setAttribute('w:val', '2');
        tcPr.appendChild(gridSpan);
        fixedCount++;
        console.log('   ✅ Added gridSpan="2" to merge first row cells');
      }
      
      // Move content from second cell to first cell if needed
      const secondCellContent = Array.from(secondCell.childNodes);
      for (const node of secondCellContent) {
        if (node.nodeName !== 'w:tcPr') {
          firstCell.appendChild(node.cloneNode(true));
        }
      }
      
      // Remove the second cell
      if (secondCell.parentNode) {
        secondCell.parentNode.removeChild(secondCell);
        fixedCount++;
        console.log('   ✅ Removed second cell from first row (merged into first)');
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
  const { xml: updated, fixedCount } = fixTableHeaderColspan(xml);
  
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

module.exports = { processDocx, fixTableHeaderColspan };

