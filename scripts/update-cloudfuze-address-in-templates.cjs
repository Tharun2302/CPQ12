/**
 * One-off: rewrite the legacy CloudFuze address inside every .docx in
 * backend-templates/ (body + headers + footers + foot/endnotes).
 *
 *   2500 Regency Parkway, Cary, NC 27518
 *      ->
 *   600 Park Offices Dr, suite#LL-52 Durham, NC 27709
 *
 * Strategy per XML part:
 *   1. Direct substring replace on the raw XML (fast path; covers cases where
 *      Word kept the address inside a single <w:t> run).
 *   2. Paragraph-level fallback: if a <w:p> still contains the old address
 *      *split across multiple <w:t> runs*, rewrite the paragraph by collapsing
 *      its <w:t> contents and putting the full updated text into the first
 *      <w:t> while blanking the rest. This preserves the paragraph's
 *      formatting attributes since we don't touch <w:r>/<w:rPr>.
 *
 * Idempotent: running again on already-updated files is a no-op.
 *
 * Run:
 *   node scripts/update-cloudfuze-address-in-templates.cjs
 */

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const TEMPLATES_DIR = path.join(__dirname, '..', 'backend-templates');

const REPLACEMENTS = [
  // Most specific first.
  ['2500 Regency Parkway, Cary, NC 27518', '600 Park Offices Dr, suite#LL-52 Durham, NC 27709'],
  ['2500 Regency Parkway',                  '600 Park Offices Dr, suite#LL-52'],
  ['Cary, NC 27518',                        'Durham, NC 27709'],
];

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function applyDirectReplace(xml) {
  let out = xml;
  for (const [from, to] of REPLACEMENTS) {
    if (out.includes(from)) {
      out = out.split(from).join(to);
    }
  }
  return out;
}

function applyParagraphFallback(xml) {
  // Walk every <w:p>...</w:p>. If its concatenated <w:t> text contains an
  // old address that the direct replace missed (because runs split it),
  // rewrite the paragraph in place.
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gi, (para) => {
    // Collect text content from <w:t> nodes in order.
    const matches = [...para.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)];
    if (matches.length === 0) return para;

    const fullText = matches.map((m) => m[1]).join('');
    let updatedText = fullText;
    for (const [from, to] of REPLACEMENTS) {
      if (updatedText.includes(from)) {
        updatedText = updatedText.split(from).join(to);
      }
    }
    if (updatedText === fullText) return para;

    // Put the full updated text into the first <w:t>; blank the rest.
    let first = true;
    return para.replace(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/gi, (run) => {
      const openTag = run.match(/<w:t\b[^>]*>/i)[0];
      if (first) {
        first = false;
        return `${openTag}${escapeXml(updatedText)}</w:t>`;
      }
      return `${openTag}</w:t>`;
    });
  });
}

function transformXml(xml) {
  const afterDirect = applyDirectReplace(xml);
  // Cheap check: if no old-address tokens remain, skip the heavier walker.
  const stillHasOld =
    afterDirect.includes('Regency Parkway') ||
    afterDirect.includes('27518') ||
    afterDirect.includes('Cary, NC');
  if (!stillHasOld) return afterDirect;
  return applyParagraphFallback(afterDirect);
}

function processDocx(filePath) {
  const buf = fs.readFileSync(filePath);
  const zip = new PizZip(buf);

  // Parts to scan: document body, headers, footers, foot/endnotes, comments,
  // and glossary parts that sometimes carry boilerplate.
  const candidatePaths = Object.keys(zip.files).filter((p) =>
    /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/i.test(p)
  );

  let modified = false;
  const partsTouched = [];

  for (const partPath of candidatePaths) {
    const file = zip.file(partPath);
    if (!file) continue;
    const xml = file.asText();
    const updated = transformXml(xml);
    if (updated !== xml) {
      zip.file(partPath, updated);
      modified = true;
      partsTouched.push(partPath);
    }
  }

  if (!modified) return { changed: false, parts: [] };

  const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(filePath, out);
  return { changed: true, parts: partsTouched };
}

function main() {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    console.error(`Templates dir not found: ${TEMPLATES_DIR}`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(TEMPLATES_DIR)
    .filter((f) => f.toLowerCase().endsWith('.docx'))
    .map((f) => path.join(TEMPLATES_DIR, f));

  console.log(`Scanning ${files.length} .docx files in ${TEMPLATES_DIR}\n`);

  let changedCount = 0;
  let unchangedCount = 0;
  let failedCount = 0;

  for (const f of files) {
    const name = path.basename(f);
    try {
      const { changed, parts } = processDocx(f);
      if (changed) {
        changedCount++;
        console.log(`  updated  ${name}  (${parts.join(', ')})`);
      } else {
        unchangedCount++;
        console.log(`  no-op    ${name}`);
      }
    } catch (err) {
      failedCount++;
      console.log(`  FAILED   ${name}  -> ${err.message}`);
    }
  }

  console.log(
    `\nDone. updated=${changedCount}  unchanged=${unchangedCount}  failed=${failedCount}`
  );
}

main();
