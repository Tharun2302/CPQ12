/**
 * Remove the per-GB overage segment from "Overage Charges" in DOCX templates.
 *
 * Specifically removes the text portion like:
 *   " | {{per_data_cost}} per GB"
 * so the line becomes:
 *   "Overage Charges: {{per_user_cost}} per User | {{instance_type_cost}} per server per month"
 *
 * Usage:
 *   node remove-pergb-overage-from-docx.cjs backend-templates/egnyte-to-microsoft-standard.docx backend-templates/egnyte-to-microsoft-advanced.docx
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

function stripPerGbSegment(text) {
  let out = text;

  // Most common patterns we’ve seen in these templates (inside a single <w:t> run)
  const patterns = [
    ' | {{per_data_cost}} per GB.',
    ' | {{per_data_cost}} per GB',
    '| {{per_data_cost}} per GB.',
    '| {{per_data_cost}} per GB',
  ];

  for (const p of patterns) {
    if (out.includes(p)) out = out.split(p).join('');
  }

  // If the template used other spacing/linebreaks, do a more tolerant cleanup
  // Remove any occurrence of the token plus trailing "per GB" words.
  out = out.replace(/\s*\|\s*\{\{\s*per_data_cost\s*\}\}\s*per\s*GB\.?/gi, '');

  return out;
}

function fixDocx(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    console.warn(`⚠️  Skipping missing file: ${filePath}`);
    return { filePath, changed: false, removed: 0 };
  }

  const originalBuf = fs.readFileSync(abs);
  const zip = new PizZip(originalBuf);

  const xmlKeys = Object.keys(zip.files).filter((k) => {
    const kk = k.toLowerCase();
    return (kk.startsWith('word/') || kk.startsWith('word\\')) && kk.endsWith('.xml');
  });

  let removed = 0;
  for (const key of xmlKeys) {
    const f = zip.files[key];
    if (!f) continue;
    const before = f.asText();
    const after = stripPerGbSegment(before);
    if (after !== before) {
      // Approximate removal count by occurrences of the placeholder
      const beforeCount = (before.match(/\{\{\s*per_data_cost\s*\}\}/gi) || []).length;
      const afterCount = (after.match(/\{\{\s*per_data_cost\s*\}\}/gi) || []).length;
      removed += Math.max(0, beforeCount - afterCount);
      zip.file(key, after);
    }
  }

  const changed = removed > 0;
  if (changed) {
    const outBuf = zip.generate({ type: 'nodebuffer' });
    fs.writeFileSync(abs, outBuf);
  }

  return { filePath, changed, removed };
}

async function main() {
  const files = process.argv.slice(2).filter(Boolean);
  if (files.length === 0) {
    console.error('❌ Provide at least one .docx file path.');
    process.exit(1);
  }

  console.log('🧾 Removing per-GB overage segment from DOCX...');
  const results = files.map(fixDocx);

  for (const r of results) {
    if (r.changed) {
      console.log(`✅ Updated: ${r.filePath} (removed occurrences: ${r.removed})`);
    } else {
      console.log(`ℹ️  No changes: ${r.filePath}`);
    }
  }
}

main().catch((e) => {
  console.error('❌ Failed:', e);
  process.exit(1);
});


