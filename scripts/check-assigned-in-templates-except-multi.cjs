/**
 * Verify that "Assigned" does not appear in any backend DOCX templates,
 * except MultiCombinations.docx which is intentionally skipped.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const TEMPLATES_DIR = path.join(process.cwd(), 'backend-templates');
const SKIP_FILE = 'MultiCombinations.docx';
const TARGET = 'Assigned';

function listDocxFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'))
    .filter((f) => f !== SKIP_FILE)
    .map((f) => path.join(dir, f));
}

async function docxContainsTarget(docxPath) {
  const buf = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buf);
  const xmlFiles = Object.keys(zip.files).filter(
    (name) =>
      name === 'word/document.xml' ||
      name.startsWith('word/header') ||
      name.startsWith('word/footer')
  );
  for (const name of xmlFiles) {
    const f = zip.file(name);
    if (!f) continue;
    const xml = await f.async('string');
    if (xml.includes(TARGET)) return true;
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
      const has = await docxContainsTarget(p);
      if (has) offenders.push(path.basename(p));
    } catch (e) {
      console.log(`⚠️  Could not read: ${path.basename(p)} (${e?.message || e})`);
    }
  }

  if (offenders.length === 0) {
    console.log(`✅ OK: No templates contain "${TARGET}" (checked ${files.length}, skipped ${SKIP_FILE}).`);
    return;
  }

  console.log(`❌ Found "${TARGET}" in ${offenders.length} template(s):`);
  offenders.forEach((f) => console.log(`- ${f}`));
  process.exit(2);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });
}


