/**
 * Update backend DOCX templates (single combinations):
 * Replace word "Assigned" with "Assisted" everywhere in templates,
 * EXCEPT the MultiCombinations template.
 *
 * Updates in-place under ./backend-templates.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const TEMPLATES_DIR = path.join(process.cwd(), 'backend-templates');
const SKIP_FILE = 'MultiCombinations.docx';
const FROM_WORD = 'Assigned';
const TO_WORD = 'Assisted';

function listDocxFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'))
    .filter((f) => f !== SKIP_FILE)
    .map((f) => path.join(dir, f));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function processDocx(docxPath) {
  const buf = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buf);

  const xmlFiles = Object.keys(zip.files).filter(
    (name) =>
      name.startsWith('word/') &&
      name.toLowerCase().endsWith('.xml') &&
      (name === 'word/document.xml' ||
        name.startsWith('word/header') ||
        name.startsWith('word/footer'))
  );

  let replacements = 0;
  const re = new RegExp(`\\b${escapeRegExp(FROM_WORD)}\\b`, 'g');

  for (const name of xmlFiles) {
    const f = zip.file(name);
    if (!f) continue;
    const xml = await f.async('string');
    const count = (xml.match(re) || []).length;
    if (count > 0) {
      const updated = xml.replace(re, TO_WORD);
      zip.file(name, updated);
      replacements += count;
    }
  }

  if (replacements === 0) return { changed: false, replacements: 0 };

  const out = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(docxPath, out);
  return { changed: true, replacements };
}

async function main() {
  const files = listDocxFiles(TEMPLATES_DIR);
  if (files.length === 0) {
    console.error(`❌ No .docx templates found in: ${TEMPLATES_DIR}`);
    process.exit(1);
  }

  console.log(`🔎 Scanning ${files.length} DOCX templates (skipping ${SKIP_FILE})...`);
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
      failures.push({ fileName: path.basename(p), error: e?.message || String(e) });
      console.log(`⚠️  Skipped (unreadable DOCX): ${path.basename(p)}`);
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


