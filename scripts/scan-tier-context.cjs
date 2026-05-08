/**
 * Read-only: for the templates that DO contain tier-label words, dump the
 * ±60-char context around each Basic/Standard/Advanced occurrence so we can
 * tell whether the word is being used as a tier-column header or as part of
 * an unrelated phrase ("Standard email", "Advanced search", etc.).
 */

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const TEMPLATES_DIR = path.join(__dirname, '..', 'backend-templates');

function stripXml(xml) {
  const out = [];
  const re = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi;
  let m;
  while ((m = re.exec(xml))) {
    out.push(
      m[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
    );
  }
  return out.join(' ');
}

function dumpContext(text, word) {
  const re = new RegExp(`\\b${word}\\b`, 'g');
  const hits = [];
  let m;
  while ((m = re.exec(text))) {
    const a = Math.max(0, m.index - 60);
    const b = Math.min(text.length, m.index + word.length + 60);
    hits.push(text.slice(a, b).replace(/\s+/g, ' ').trim());
  }
  return hits;
}

function processDocx(filePath) {
  const zip = new PizZip(fs.readFileSync(filePath));
  const parts = Object.keys(zip.files).filter((p) =>
    /^word\/(document|header\d*|footer\d*)\.xml$/i.test(p)
  );
  let combined = '';
  for (const p of parts) {
    const f = zip.file(p);
    if (!f) continue;
    combined += '\n' + stripXml(f.asText());
  }
  return combined;
}

function main() {
  const files = fs
    .readdirSync(TEMPLATES_DIR)
    .filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'))
    .map((f) => path.join(TEMPLATES_DIR, f));

  for (const f of files) {
    const name = path.basename(f);
    const text = processDocx(f);
    const basicHits = dumpContext(text, 'Basic');
    const stdHits = dumpContext(text, 'Standard');
    const advHits = dumpContext(text, 'Advanced');
    if (basicHits.length === 0 && stdHits.length === 0 && advHits.length === 0) continue;

    console.log(`\n=== ${name} ===`);
    if (basicHits.length) {
      console.log(`  [Basic ×${basicHits.length}]`);
      basicHits.slice(0, 4).forEach((h) => console.log(`    ${h}`));
    }
    if (stdHits.length) {
      console.log(`  [Standard ×${stdHits.length}]`);
      stdHits.slice(0, 4).forEach((h) => console.log(`    ${h}`));
    }
    if (advHits.length) {
      console.log(`  [Advanced ×${advHits.length}]`);
      advHits.slice(0, 4).forEach((h) => console.log(`    ${h}`));
    }
  }
}

main();
