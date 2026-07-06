/**
 * Fix common mojibake (encoding-corrupted) characters inside a DOCX file by
 * rewriting Word XML parts (document/header/footer) and saving the DOCX back.
 *
 * This specifically targets sequences like "â€™" that often appear when curly quotes
 * were UTF-8 but later interpreted as Windows-1252.
 *
 * Usage:
 *   node fix-mojibake-docx.cjs backend-templates/egnyte-to-microsoft-standard.docx backend-templates/egnyte-to-microsoft-advanced.docx
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const REPLACEMENTS = new Map([
  // Curly apostrophes/quotes
  [String.fromCodePoint(0x00E2, 0x20AC, 0x2122), "'"], // â€™  (right single quote)
  [String.fromCodePoint(0x00E2, 0x20AC, 0x02DC), "'"], // â€˜  (left single quote)
  [String.fromCodePoint(0x00E2, 0x20AC, 0x0153), '"'], // â€œ  (left double quote)
  [String.fromCodePoint(0x00E2, 0x20AC, 0x009D), '"'], // â€�  (right double quote)

  // Zero-width space mojibake (often from copy/paste)
  [String.fromCodePoint(0x00E2, 0x20AC, 0x2039), ''], // â€‹  (zero-width space)

  // Non-breaking space mojibake prefix
  ['Â', ''], // U+00C2 (often appears before spaces or punctuation)

  // NBSP (non-breaking space) – can render as "Â" in some DOCX→PDF conversions
  [String.fromCharCode(160), ' '], // U+00A0
]);

function applyReplacements(text) {
  let out = text;
  for (const [from, to] of REPLACEMENTS.entries()) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

function fixDocx(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    console.warn(`⚠️  Skipping missing file: ${filePath}`);
    return { filePath, changed: false, hits: 0 };
  }

  const originalBuf = fs.readFileSync(abs);
  const zip = new PizZip(originalBuf);

  const xmlKeys = Object.keys(zip.files).filter((k) => {
    const kk = k.toLowerCase();
    // Cover both Windows and Unix separators: word\document.xml or word/document.xml
    return (kk.startsWith('word/') || kk.startsWith('word\\')) && kk.endsWith('.xml');
  });

  let hits = 0;
  for (const key of xmlKeys) {
    const file = zip.files[key];
    if (!file) continue;
    const before = file.asText();
    const after = applyReplacements(before);
    if (after !== before) {
      // Count approximate hit occurrences for reporting
      for (const [from] of REPLACEMENTS.entries()) {
        if (before.includes(from)) {
          hits += (before.split(from).length - 1);
        }
      }
      zip.file(key, after);
    }
  }

  const changed = hits > 0;
  if (changed) {
    const outBuf = zip.generate({ type: 'nodebuffer' });
    fs.writeFileSync(abs, outBuf);
  }

  return { filePath, changed, hits };
}

async function main() {
  const files = process.argv.slice(2).filter(Boolean);
  if (files.length === 0) {
    console.error('❌ Provide at least one .docx file path.');
    process.exit(1);
  }

  console.log('🧹 Fixing mojibake in DOCX...');
  const results = files.map(fixDocx);

  for (const r of results) {
    if (r.changed) {
      console.log(`✅ Fixed: ${r.filePath} (replacements: ${r.hits})`);
    } else {
      console.log(`ℹ️  No changes: ${r.filePath}`);
    }
  }
}

main().catch((e) => {
  console.error('❌ Failed:', e);
  process.exit(1);
});


