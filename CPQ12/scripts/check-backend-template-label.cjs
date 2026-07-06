/**
 * Verify backend DOCX templates no longer contain the "Shared Server/Instance" label
 * as a standalone paragraph (the pricing table label cell).
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');

const TEMPLATES_DIR = path.join(process.cwd(), 'backend-templates');
const TARGET_REGEX = /^Shared Server\s*\/\s*Instance$/i;

function normalizeText(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function listDocxFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'))
    .map((f) => path.join(dir, f));
}

function paragraphHasTarget(xml) {
  const parser = new DOMParser({ errorHandler: { warning: null, error: null, fatalError: null } });
  const doc = parser.parseFromString(xml, 'application/xml');
  const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
  for (const p of paragraphs) {
    const tNodes = Array.from(p.getElementsByTagName('w:t'));
    if (tNodes.length === 0) continue;
    const combined = normalizeText(tNodes.map((n) => n.textContent || '').join(''));
    if (TARGET_REGEX.test(combined)) return true;
  }
  return false;
}

async function docxHasTarget(docxPath) {
  const buf = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buf);

  const candidates = Object.keys(zip.files).filter(
    (name) =>
      name === 'word/document.xml' ||
      name.startsWith('word/header') ||
      name.startsWith('word/footer')
  );

  for (const name of candidates) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async('string');
    if (paragraphHasTarget(xml)) return true;
  }
  return false;
}

async function main() {
  const files = listDocxFiles(TEMPLATES_DIR);
  if (files.length === 0) {
    console.error(`❌ No .docx templates found in: ${TEMPLATES_DIR}`);
    process.exit(1);
  }

  const offenders = [];
  for (const p of files) {
    try {
      const has = await docxHasTarget(p);
      if (has) offenders.push(path.basename(p));
    } catch (e) {
      console.log(`⚠️  Could not read: ${path.basename(p)} (${e?.message || e})`);
    }
  }

  if (offenders.length === 0) {
    console.log(`✅ OK: No templates contain the old label (checked ${files.length}).`);
    return;
  }

  console.log(`❌ Found old label in ${offenders.length} template(s):`);
  offenders.forEach((f) => console.log(`- ${f}`));
  process.exit(2);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });
}


