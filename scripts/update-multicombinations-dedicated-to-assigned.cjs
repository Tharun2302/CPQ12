/**
 * Update backend MultiCombinations template:
 * Replace "Dedicated" with "Assigned" inside the DOCX XML.
 *
 * Updates in-place:
 *   backend-templates/MultiCombinations.docx
 */
const fs = require('fs');
const JSZip = require('jszip');

const DOCX_PATH = 'backend-templates/MultiCombinations.docx';
const FROM = 'Dedicated';
const TO = 'Assigned';

async function main() {
  if (!fs.existsSync(DOCX_PATH)) {
    console.error(`❌ File not found: ${DOCX_PATH}`);
    process.exit(1);
  }

  const buf = fs.readFileSync(DOCX_PATH);
  const zip = await JSZip.loadAsync(buf);

  const targets = Object.keys(zip.files).filter(
    (name) =>
      name === 'word/document.xml' ||
      name.startsWith('word/header') ||
      name.startsWith('word/footer')
  );

  let replacements = 0;

  for (const name of targets) {
    const f = zip.file(name);
    if (!f) continue;
    const xml = await f.async('string');
    const count = (xml.match(new RegExp(FROM, 'g')) || []).length;
    if (count > 0) {
      const updated = xml.replaceAll(FROM, TO);
      zip.file(name, updated);
      replacements += count;
    }
  }

  if (replacements === 0) {
    console.log(`ℹ️ No occurrences of "${FROM}" found in template. No changes made.`);
    return;
  }

  const out = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(DOCX_PATH, out);

  console.log(`✅ Updated MultiCombinations template: replaced ${replacements} occurrence(s) of "${FROM}" → "${TO}"`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });
}


