/**
 * Restore the "Managed Migration Service" row to email migration templates:
 *   - gmail-to-gmail.docx
 *   - gmail-to-outlook.docx
 *   - outlook-to-gmail.docx
 *   - outlook-to-outlook.docx
 *
 * For single migration templates, the Managed Migration Service row should be:
 * - After the CloudFuze Migrate Migration row (which uses {{users_cost}})
 * - Before the Instance Type row
 * - Uses {{price_migration}} for the price column
 * - Uses {{price_migration_bundled}} for bundled pricing (if bundled column exists)
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const TEMPLATES_DIR = path.join(process.cwd(), 'backend-templates');
const EMAIL_TEMPLATES = [
  'gmail-to-gmail.docx',
  'gmail-to-outlook.docx',
  'outlook-to-gmail.docx',
  'outlook-to-outlook.docx'
];

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

function rowContainsToken(tr, tokenLower) {
  const rowText = normalizeText(getTextNodesUnder(tr, 'w:t').map((n) => n.textContent || '').join(' '));
  return rowText.includes(tokenLower);
}

function tableContainsToken(tbl, tokenLower) {
  const allText = normalizeText(getTextNodesUnder(tbl, 'w:t').map((n) => n.textContent || '').join(' '));
  return allText.includes(tokenLower);
}

function findTableWithPricing(doc) {
  const tables = doc.getElementsByTagName('w:tbl');
  for (let t = 0; t < tables.length; t++) {
    const tbl = tables.item(t);
    // Look for pricing table - should have users_cost or instance_cost tokens
    if (tableContainsToken(tbl, '{{users_cost}}') || 
        tableContainsToken(tbl, '{{instance_cost}}') ||
        tableContainsToken(tbl, '{{userscount}}') ||
        tableContainsToken(tbl, 'cloudfuze migrate')) {
      return tbl;
    }
  }
  return null;
}

function createManagedMigrationRow(doc, hasBundledColumn) {
  // Create a new table row for Managed Migration Service
  const tr = doc.createElement('w:tr');
  
  // Get number of columns from existing table structure
  // We'll create cells based on whether bundled column exists
  const numCols = hasBundledColumn ? 4 : 3;
  
  // Cell 1: "Managed Migration Service"
  const tc1 = doc.createElement('w:tc');
  const p1 = doc.createElement('w:p');
  const r1 = doc.createElement('w:r');
  const t1 = doc.createElement('w:t');
  t1.textContent = 'Managed Migration Service';
  r1.appendChild(t1);
  p1.appendChild(r1);
  tc1.appendChild(p1);
  tr.appendChild(tc1);
  
  // Cell 2: Description
  const tc2 = doc.createElement('w:tc');
  const p2 = doc.createElement('w:p');
  const r2 = doc.createElement('w:r');
  const t2 = doc.createElement('w:t');
  t2.textContent = 'Managed Migration | Assigned Project Manager | Pre-Migration Analysis | During Migration Consulting | Post-Migration Support and Data Reconciliation Support | End-to End Migration Assistance with 24*7 Premium Support';
  r2.appendChild(t2);
  p2.appendChild(r2);
  tc2.appendChild(p2);
  tr.appendChild(tc2);
  
  // Cell 3: Price ({{price_migration}})
  const tc3 = doc.createElement('w:tc');
  const p3 = doc.createElement('w:p');
  const r3 = doc.createElement('w:r');
  const t3 = doc.createElement('w:t');
  t3.textContent = '{{price_migration}}';
  r3.appendChild(t3);
  p3.appendChild(r3);
  tc3.appendChild(p3);
  tr.appendChild(tc3);
  
  // Cell 4: Bundled price (if bundled column exists)
  if (hasBundledColumn) {
    const tc4 = doc.createElement('w:tc');
    const p4 = doc.createElement('w:p');
    const r4 = doc.createElement('w:r');
    const t4 = doc.createElement('w:t');
    t4.textContent = '{{price_migration_bundled}}';
    r4.appendChild(t4);
    p4.appendChild(r4);
    tc4.appendChild(p4);
    tr.appendChild(tc4);
  }
  
  return tr;
}

function restoreManagedMigrationRow(doc) {
  const targetTable = findTableWithPricing(doc);
  if (!targetTable) {
    return { changed: false, reason: 'No pricing table found' };
  }
  
  // Check if row already exists
  if (tableContainsToken(targetTable, 'managed migration service')) {
    return { changed: false, reason: 'Managed Migration Service row already present' };
  }
  
  // Check if table has bundled column (4 columns)
  const rows = getDirectChildrenByTagName(targetTable, 'w:tr');
  let hasBundledColumn = false;
  if (rows.length > 0) {
    const firstRow = rows[0];
    const cells = getDirectChildrenByTagName(firstRow, 'w:tc');
    hasBundledColumn = cells.length >= 4;
  }
  
  // Find insertion point: after users_cost row, before instance_cost row
  let insertAfter = null;
  let insertBefore = null;
  
  for (const tr of rows) {
    const rowText = normalizeText(getTextNodesUnder(tr, 'w:t').map((n) => n.textContent || '').join(' '));
    
    // Look for row with users_cost or CloudFuze Migrate
    if ((rowText.includes('{{users_cost}}') || 
         rowText.includes('cloudfuze migrate') ||
         rowText.includes('{{userscount}}')) && !insertAfter) {
      insertAfter = tr;
    }
    
    // Look for Instance Type row
    if ((rowText.includes('{{instance_cost}}') || 
         rowText.includes('instance type') ||
         rowText.includes('{{instance_type}}')) && !insertBefore) {
      insertBefore = tr;
    }
  }
  
  // Create the Managed Migration Service row
  const managedRow = createManagedMigrationRow(doc, hasBundledColumn);
  
  // Insert the row
  if (insertAfter && insertAfter.nextSibling) {
    targetTable.insertBefore(managedRow, insertAfter.nextSibling);
    return { changed: true, where: 'after users_cost row' };
  }
  if (insertAfter && !insertAfter.nextSibling) {
    targetTable.appendChild(managedRow);
    return { changed: true, where: 'after users_cost row (append)' };
  }
  if (insertBefore) {
    targetTable.insertBefore(managedRow, insertBefore);
    return { changed: true, where: 'before instance_cost row' };
  }
  
  // Fallback: append to table
  targetTable.appendChild(managedRow);
  return { changed: true, where: 'appended to table' };
}

async function processDocx(docxPath) {
  const buf = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buf);
  const docXmlFile = zip.file('word/document.xml');
  
  if (!docXmlFile) {
    throw new Error('No word/document.xml found');
  }
  
  const xml = await docXmlFile.async('string');
  const parser = new DOMParser({ errorHandler: { warning: null, error: null, fatalError: null } });
  const doc = parser.parseFromString(xml, 'application/xml');
  
  const res = restoreManagedMigrationRow(doc);
  
  if (!res.changed) {
    return { changed: false, reason: res.reason };
  }
  
  const serializer = new XMLSerializer();
  const updatedXml = serializer.serializeToString(doc);
  zip.file('word/document.xml', updatedXml);
  
  const out = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(docxPath, out);
  
  return { changed: true, where: res.where };
}

async function main() {
  const files = EMAIL_TEMPLATES.map(name => path.join(TEMPLATES_DIR, name));
  
  console.log(`🔎 Restoring Managed Migration Service row in ${files.length} email templates...`);
  
  let changedFiles = 0;
  const failures = [];
  
  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Skipped (not found): ${path.basename(filePath)}`);
      continue;
    }
    
    try {
      const res = await processDocx(filePath);
      if (res.changed) {
        changedFiles++;
        console.log(`✅ Updated: ${path.basename(filePath)} (${res.where})`);
      } else {
        console.log(`ℹ️  No change: ${path.basename(filePath)} (${res.reason})`);
      }
    } catch (e) {
      failures.push({ fileName: path.basename(filePath), error: e?.message || String(e) });
      console.log(`❌ Failed: ${path.basename(filePath)} - ${e?.message || String(e)}`);
    }
  }
  
  console.log(`\nDone.\n- Templates processed: ${files.length}\n- Templates updated: ${changedFiles}`);
  
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

module.exports = { restoreManagedMigrationRow, createManagedMigrationRow };

