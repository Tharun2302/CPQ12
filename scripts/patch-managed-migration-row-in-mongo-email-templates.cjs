/**
 * Patch MongoDB-stored email templates to ensure the "Managed Migration Service" row exists.
 *
 * Why this exists:
 * - Some email templates in Mongo were uploaded/seeded without the Managed Migration Service row
 *   (often due to earlier bulk-edit scripts or locked DOCX files on disk).
 * - The UI fetches templates by id from Mongo (`/api/templates/:id/file`), so missing row in Mongo
 *   means the generated agreements won't show it.
 *
 * What this script does:
 * - Connects to MongoDB (same defaults as server.cjs)
 * - Picks a SOURCE email template that already has the row (prefer `gmail-to-outlook`, else `outlook-to-gmail`)
 * - Copies the exact <w:tr> for "Managed Migration Service" from the source DOCX
 * - Inserts it into all TARGET templates in Mongo for:
 *     - gmail-to-gmail (basic/standard/advanced)
 *     - outlook-to-outlook (standard)
 *
 * This avoids touching on-disk files (which may be locked by Word).
 */
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq_templates';

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

function rowContainsText(tr, needleLower) {
  const rowText = normalizeText(getTextNodesUnder(tr, 'w:t').map((n) => n.textContent || '').join(' '));
  return rowText.includes(needleLower);
}

function tableContainsText(tbl, needleLower) {
  const allText = normalizeText(getTextNodesUnder(tbl, 'w:t').map((n) => n.textContent || '').join(' '));
  return allText.includes(needleLower);
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

async function loadDocXmlFromDocxBuffer(buf) {
  const zip = await JSZip.loadAsync(buf);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) throw new Error('DOCX missing word/document.xml');
  const xml = await docXmlFile.async('string');
  return { zip, xml };
}

function findManagedMigrationRow(doc) {
  const tables = doc.getElementsByTagName('w:tbl');
  for (let t = 0; t < tables.length; t++) {
    const tbl = tables.item(t);
    const rows = tbl.getElementsByTagName('w:tr');
    for (let r = 0; r < rows.length; r++) {
      const tr = rows.item(r);
      const cells = tr.getElementsByTagName('w:tc');
      if (!cells || cells.length < 1) continue;
      const first = normalizeText(getCellText(cells.item(0)));
      if (first.includes('managed migration service')) return tr;
    }
  }
  return null;
}

function findPricingTableForSingleMigration(doc) {
  const tables = doc.getElementsByTagName('w:tbl');
  for (let t = 0; t < tables.length; t++) {
    const tbl = tables.item(t);
    // Heuristic: the pricing table includes the Instance Type row or price_migration placeholder
    if (
      tableContainsText(tbl, 'instance type') ||
      tableContainsText(tbl, 'price_migration') ||
      tableContainsText(tbl, 'cloudfuze migrate') ||
      tableContainsText(tbl, 'users_cost')
    ) {
      return tbl;
    }
  }
  return null;
}

function insertManagedRowIntoDoc(doc, managedRowFromSource) {
  const targetTable = findPricingTableForSingleMigration(doc);
  if (!targetTable) return { changed: false, reason: 'No pricing table found' };

  // Already present?
  if (tableContainsText(targetTable, 'managed migration service')) {
    return { changed: false, reason: 'Row already present' };
  }

  const rows = getDirectChildrenByTagName(targetTable, 'w:tr');
  if (!rows || rows.length === 0) return { changed: false, reason: 'Pricing table has no direct w:tr children' };

  // Prefer inserting after the main migration row (CloudFuze Migrate Migration / CloudFuze Migrate),
  // otherwise before the Instance Type row.
  let insertAfter = null;
  let insertBefore = null;

  for (const tr of rows) {
    const rowText = normalizeText(getTextNodesUnder(tr, 'w:t').map((n) => n.textContent || '').join(' '));
    if (!insertAfter && (rowText.includes('cloudfuze migrate migration') || rowText.includes('cloudfuze migrate'))) {
      insertAfter = tr;
    }
    if (!insertBefore && (rowText.includes('instance type') || rowText.includes('instance_cost') || rowText.includes('instance cost'))) {
      insertBefore = tr;
    }
  }

  const toInsert = managedRowFromSource.cloneNode(true);

  if (insertAfter && insertAfter.nextSibling) {
    targetTable.insertBefore(toInsert, insertAfter.nextSibling);
    return { changed: true, where: 'after migration row' };
  }
  if (insertAfter && !insertAfter.nextSibling) {
    targetTable.appendChild(toInsert);
    return { changed: true, where: 'after migration row (append)' };
  }
  if (insertBefore) {
    targetTable.insertBefore(toInsert, insertBefore);
    return { changed: true, where: 'before instance row' };
  }

  targetTable.appendChild(toInsert);
  return { changed: true, where: 'appended to pricing table' };
}

async function patchTemplateDocxBuffer(buf, managedRowFromSource) {
  const { zip, xml } = await loadDocXmlFromDocxBuffer(buf);
  const parser = new DOMParser({ errorHandler: { warning: null, error: null, fatalError: null } });
  const serializer = new XMLSerializer();
  const doc = parser.parseFromString(xml, 'application/xml');

  const res = insertManagedRowIntoDoc(doc, managedRowFromSource);
  if (!res.changed) return { changed: false, reason: res.reason };

  zip.file('word/document.xml', serializer.serializeToString(doc));
  const out = await zip.generateAsync({ type: 'nodebuffer' });
  return { changed: true, where: res.where, out };
}

async function main() {
  console.log('🔍 MongoDB Configuration:');
  // Avoid regex-literal edge cases; mask credentials (if any) using string ops.
  const safeUri = (() => {
    const s = String(MONGODB_URI || '');
    const protoIdx = s.indexOf('//');
    const atIdx = s.indexOf('@');
    if (protoIdx === -1 || atIdx === -1 || atIdx < protoIdx + 2) return s;
    return s.slice(0, protoIdx + 2) + '***:***@' + s.slice(atIdx + 1);
  })();
  console.log(`   URI: ${safeUri}`);
  console.log(`   Database: ${DB_NAME}\n`);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.log('✅ Connected to MongoDB');

  const db = client.db(DB_NAME);
  const templates = db.collection('templates');

  // Pick a source template with the row present.
  const source = await templates.findOne({
    combination: { $in: ['gmail-to-outlook', 'outlook-to-gmail'] },
    fileType: { $regex: /wordprocessingml|docx/i }
  }, { sort: { updatedAt: -1, lastModified: -1 } });

  if (!source || !source.fileData) {
    throw new Error('Could not find a source email template in Mongo (gmail-to-outlook/outlook-to-gmail) with fileData');
  }

  // Decode fileData → Buffer
  const sourceBuf = Buffer.isBuffer(source.fileData)
    ? source.fileData
    : typeof source.fileData === 'string'
      ? Buffer.from(source.fileData, 'base64')
      : source.fileData?.buffer
        ? Buffer.from(source.fileData.buffer)
        : null;

  if (!sourceBuf || sourceBuf.length === 0) throw new Error('Source template buffer is empty/unreadable');

  const { xml: sourceXml } = await loadDocXmlFromDocxBuffer(sourceBuf);
  const parser = new DOMParser({ errorHandler: { warning: null, error: null, fatalError: null } });
  const sourceDoc = parser.parseFromString(sourceXml, 'application/xml');
  const managedRow = findManagedMigrationRow(sourceDoc);
  if (!managedRow) {
    throw new Error(`Source template (${source.name}) does not contain "Managed Migration Service" row`);
  }

  console.log(`🧩 Using source template: ${source.name} (${source.combination})`);

  // Targets: all gmail-to-gmail variants + outlook-to-outlook standard
  const targets = await templates.find({
    combination: { $in: ['gmail-to-gmail', 'outlook-to-outlook'] },
    fileType: { $regex: /wordprocessingml|docx/i }
  }).toArray();

  if (!targets.length) {
    console.log('ℹ️ No target templates found for gmail-to-gmail/outlook-to-outlook');
    await client.close();
    return;
  }

  let updated = 0;
  for (const tpl of targets) {
    const tplBuf = Buffer.isBuffer(tpl.fileData)
      ? tpl.fileData
      : typeof tpl.fileData === 'string'
        ? Buffer.from(tpl.fileData, 'base64')
        : tpl.fileData?.buffer
          ? Buffer.from(tpl.fileData.buffer)
          : null;

    if (!tplBuf || tplBuf.length === 0) {
      console.log(`⚠️  Skipping ${tpl.name} (${tpl.id}) - empty fileData`);
      continue;
    }

    // Quick check: if already contains, skip
    try {
      const { xml } = await loadDocXmlFromDocxBuffer(tplBuf);
      if (normalizeText(xml).includes('managed migration service')) {
        console.log(`✓ Already has row: ${tpl.name}`);
        continue;
      }
    } catch (e) {
      console.log(`⚠️  Skipping ${tpl.name} (${tpl.id}) - could not read DOCX: ${e.message}`);
      continue;
    }

    const patched = await patchTemplateDocxBuffer(tplBuf, managedRow);
    if (!patched.changed) {
      console.log(`ℹ️  No change: ${tpl.name} (${patched.reason})`);
      continue;
    }

    // Store as base64 string to match seeding style and avoid BSON Binary differences
    const base64Data = patched.out.toString('base64');
    await templates.updateOne(
      { id: tpl.id },
      {
        $set: {
          fileData: base64Data,
          fileSize: patched.out.length,
          lastModified: new Date(),
          updatedAt: new Date(),
          version: (tpl.version || 1) + 0.1
        }
      }
    );

    updated++;
    console.log(`✅ Patched: ${tpl.name} (${tpl.combination}) → inserted ${patched.where}`);
  }

  console.log(`\nDone.\n- Target templates scanned: ${targets.length}\n- Target templates patched: ${updated}`);
  await client.close();
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });
}


