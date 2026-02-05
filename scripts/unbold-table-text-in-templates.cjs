/**
 * Update backend DOCX templates:
 * Remove bold formatting from all text in tables.
 * 
 * This script edits .docx files in-place under ./backend-templates.
 * 
 * It finds all table cells and removes bold formatting (w:b elements)
 * from text runs within those cells.
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
    // Exclude Microsoft Word temp/lock files like "~$something.docx"
    .filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'))
    .map((f) => path.join(dir, f));
}

function unboldTextInTables(xml) {
  const parser = new DOMParser({
    errorHandler: { warning: null, error: null, fatalError: null }
  });
  const doc = parser.parseFromString(xml, 'application/xml');

  let unboldCount = 0;

  // Find all table cells (w:tc elements)
  const tableCells = Array.from(doc.getElementsByTagName('w:tc'));
  
  for (const cell of tableCells) {
    // Find all text runs (w:r) within this cell
    const textRuns = Array.from(cell.getElementsByTagName('w:r'));
    
    for (const run of textRuns) {
      // Find run properties (w:rPr) - this is where formatting like bold is stored
      const runPropsList = run.getElementsByTagName('w:rPr');
      
      if (runPropsList.length > 0) {
        const runProps = runPropsList[0];
        
        // Find all bold elements (w:b) - getElementsByTagName finds all descendants
        // We need to collect them first before removing to avoid modifying during iteration
        const boldElements = Array.from(runProps.getElementsByTagName('w:b'));
        
        // Remove each bold element
        for (const boldEl of boldElements) {
          if (boldEl.parentNode) {
            boldEl.parentNode.removeChild(boldEl);
            unboldCount++;
          }
        }
      }
    }
  }

  if (unboldCount === 0) return { xml, unboldCount: 0 };

  const serializer = new XMLSerializer();
  return { xml: serializer.serializeToString(doc), unboldCount };
}

async function processDocx(docxPath) {
  const buf = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buf);

  // Update the main document and any headers/footers (some templates place tables in headers).
  const wordXmlFiles = Object.keys(zip.files).filter(
    (name) =>
      name.startsWith('word/') &&
      name.toLowerCase().endsWith('.xml') &&
      (name === 'word/document.xml' ||
        name.startsWith('word/header') ||
        name.startsWith('word/footer'))
  );

  let totalUnboldCount = 0;
  for (const name of wordXmlFiles) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async('string');
    const { xml: updated, unboldCount } = unboldTextInTables(xml);
    if (unboldCount > 0) {
      zip.file(name, updated);
      totalUnboldCount += unboldCount;
    }
  }

  if (totalUnboldCount === 0) return { changed: false, unboldCount: 0 };

  const outBuf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(docxPath, outBuf);
  return { changed: true, unboldCount: totalUnboldCount };
}

async function main() {
  const files = listDocxFiles(TEMPLATES_DIR);
  if (files.length === 0) {
    console.error(`❌ No .docx templates found in: ${TEMPLATES_DIR}`);
    process.exit(1);
  }

  console.log(`🔎 Scanning ${files.length} DOCX templates to unbold table text...`);
  let changedFiles = 0;
  let totalUnboldCount = 0;
  const failures = [];

  for (const p of files) {
    try {
      const res = await processDocx(p);
      if (res.changed) {
        changedFiles++;
        totalUnboldCount += res.unboldCount;
        console.log(`✅ Updated: ${path.basename(p)} (removed ${res.unboldCount} bold formatting)`);
      } else {
        console.log(`ℹ️  No changes: ${path.basename(p)}`);
      }
    } catch (e) {
      const fileName = path.basename(p);
      failures.push({ fileName, error: e?.message || String(e) });
      console.log(`⚠️  Skipped (unreadable DOCX): ${fileName}`);
    }
  }

  console.log(
    `\n✅ Done.\n- Templates scanned: ${files.length}\n- Templates updated: ${changedFiles}\n- Total bold formatting removed: ${totalUnboldCount}`
  );

  if (failures.length > 0) {
    console.log(`\n⚠️  Unreadable templates (${failures.length}):`);
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

module.exports = { processDocx, unboldTextInTables };

