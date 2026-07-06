/**
 * Examine table structure in Word document
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');

const EXHIBITS_DIR = path.join(process.cwd(), 'backend-exhibits');
const TARGET_FILE = 'Slack to Google Chat Basic Plan - Basic Not Include.docx';

async function examineTable(docxPath) {
  const buf = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buf);

  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    console.log('   ⚠️  No document.xml found');
    return;
  }

  const xml = await docXmlFile.async('string');
  const parser = new DOMParser({
    errorHandler: { warning: null, error: null, fatalError: null }
  });
  const doc = parser.parseFromString(xml, 'application/xml');

  // Find all tables
  const tables = Array.from(doc.getElementsByTagName('w:tbl'));
  console.log(`Found ${tables.length} table(s)\n`);
  
  tables.forEach((table, tableIndex) => {
    console.log(`=== Table ${tableIndex + 1} ===`);
    
    // Check table grid definition
    const tblGrid = table.getElementsByTagName('w:tblGrid')[0];
    if (tblGrid) {
      const gridCols = Array.from(tblGrid.getElementsByTagName('w:gridCol'));
      console.log(`Grid columns defined: ${gridCols.length}`);
    } else {
      console.log(`Grid columns defined: NONE (no tblGrid found)`);
    }
    
    const rows = Array.from(table.getElementsByTagName('w:tr'));
    console.log(`Rows: ${rows.length}\n`);
    
    rows.forEach((row, rowIndex) => {
      const cells = Array.from(row.getElementsByTagName('w:tc'));
      console.log(`Row ${rowIndex + 1}: ${cells.length} cell(s)`);
      
      cells.forEach((cell, cellIndex) => {
        // Check for gridSpan
        const tcPr = cell.getElementsByTagName('w:tcPr')[0];
        let gridSpan = null;
        if (tcPr) {
          const gridSpanEl = tcPr.getElementsByTagName('w:gridSpan')[0];
          if (gridSpanEl) {
            gridSpan = gridSpanEl.getAttribute('w:val');
          }
        }
        
        // Extract text content
        const textNodes = cell.getElementsByTagName('w:t');
        let text = '';
        for (let i = 0; i < textNodes.length; i++) {
          text += (textNodes[i].textContent || '');
        }
        text = text.trim().substring(0, 100);
        
        console.log(`  Cell ${cellIndex + 1}: gridSpan="${gridSpan || 'none'}", text="${text}"`);
      });
      console.log('');
    });
  });
}

async function main() {
  const filePath = path.join(EXHIBITS_DIR, TARGET_FILE);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`🔎 Examining: ${TARGET_FILE}\n`);
  
  try {
    await examineTable(filePath);
  } catch (e) {
    console.error(`❌ Failed:`, e?.message || String(e));
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });
}

