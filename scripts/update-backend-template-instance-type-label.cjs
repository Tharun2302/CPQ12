/**
 * Update backend DOCX templates:
 * Replace the "Shared Server/Instance" label (3rd row, 1st cell in pricing table)
 * with "Instance Type".
 *
 * This script edits .docx files in-place under ./backend-templates.
 *
 * Safety:
 * - Only replaces when a paragraph's combined text normalizes to exactly:
 *   "Shared Server/Instance" (whitespace around "/" ignored)
 * - Leaves other paragraphs untouched.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const TEMPLATES_DIR = path.join(process.cwd(), 'backend-templates');
const TARGET_REGEX = /^Shared Server\s*\/\s*Instance$/i;
const REPLACEMENT = 'Instance Type';

function listDocxFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    // Exclude Microsoft Word temp/lock files like "~$something.docx"
    .filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'))
    .map((f) => path.join(dir, f));
}

function normalizeText(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function getParagraphTextRuns(paragraphEl) {
  // WordprocessingML: w:t nodes contain visible text.
  const tNodes = [];
  const walker = (node) => {
    if (!node) return;
    if (node.nodeType === 1 /* ELEMENT_NODE */) {
      if (node.nodeName === 'w:t') tNodes.push(node);
      for (let c = node.firstChild; c; c = c.nextSibling) walker(c);
    }
  };
  walker(paragraphEl);
  return tNodes;
}

function replaceLabelInWordXml(xml) {
  const parser = new DOMParser({
    errorHandler: { warning: null, error: null, fatalError: null }
  });
  const doc = parser.parseFromString(xml, 'application/xml');

  const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
  let replacedCount = 0;

  for (const p of paragraphs) {
    const tNodes = getParagraphTextRuns(p);
    if (tNodes.length === 0) continue;

    const combined = normalizeText(tNodes.map((n) => n.textContent || '').join(''));
    if (!TARGET_REGEX.test(combined)) continue;

    // Replace with "Instance Type" in the first run and clear the rest.
    tNodes[0].textContent = REPLACEMENT;
    for (let i = 1; i < tNodes.length; i++) tNodes[i].textContent = '';
    replacedCount++;
  }

  if (replacedCount === 0) return { xml, replacedCount: 0 };

  const serializer = new XMLSerializer();
  return { xml: serializer.serializeToString(doc), replacedCount };
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

  let totalReplacements = 0;
  for (const name of wordXmlFiles) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async('string');
    const { xml: updated, replacedCount } = replaceLabelInWordXml(xml);
    if (replacedCount > 0) {
      zip.file(name, updated);
      totalReplacements += replacedCount;
    }
  }

  if (totalReplacements === 0) return { changed: false, replacements: 0 };

  const outBuf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(docxPath, outBuf);
  return { changed: true, replacements: totalReplacements };
}

async function main() {
  const files = listDocxFiles(TEMPLATES_DIR);
  if (files.length === 0) {
    console.error(`❌ No .docx templates found in: ${TEMPLATES_DIR}`);
    process.exit(1);
  }

  console.log(`🔎 Scanning ${files.length} DOCX templates...`);
  let changedFiles = 0;
  let totalReplacements = 0;
  const failures = [];

  for (const p of files) {
    try {
      const res = await processDocx(p);
      if (res.changed) {
        changedFiles++;
        totalReplacements += res.replacements;
        console.log(`✅ Updated: ${path.basename(p)} (replacements: ${res.replacements})`);
      }
    } catch (e) {
      const fileName = path.basename(p);
      failures.push({ fileName, error: e?.message || String(e) });
      console.log(`⚠️  Skipped (unreadable DOCX): ${fileName}`);
    }
  }

  console.log(
    `\nDone.\n- Templates scanned: ${files.length}\n- Templates updated: ${changedFiles}\n- Total replacements: ${totalReplacements}`
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


