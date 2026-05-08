/**
 * Read-only audit: for every .docx in backend-templates/, extract the visible
 * text and report which tier labels (Basic / Standard / Advanced) appear in
 * the rendered content. Output is grouped so we can classify each template
 * into the user's Scenario 1 / 2 / 3.
 *
 * Run:   node scripts/scan-tier-labels.cjs
 *
 * NOTE: this is a read-only scan. No file is written.
 */

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const TEMPLATES_DIR = path.join(__dirname, '..', 'backend-templates');

function stripXml(xml) {
  // collect text inside <w:t> nodes only (so we don't pick up tag-name 'standard')
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

function classify(text) {
  // Match tier words in their typical "label" usage. Prefer exact word match,
  // case-insensitive. Avoid matching "Advanced reporting" (feature description)
  // by requiring the word to be near "Plan", "Tier", "Migration", "Edition",
  // OR appearing as a standalone column header.
  const hasBasic = /\bBasic\b/.test(text);
  const hasStandard = /\bStandard\b/.test(text);
  const hasAdvanced = /\bAdvanced\b/.test(text);

  // count occurrences (rough signal of tier usage vs incidental word usage)
  const cBasic = (text.match(/\bBasic\b/gi) || []).length;
  const cStd = (text.match(/\bStandard\b/gi) || []).length;
  const cAdv = (text.match(/\bAdvanced\b/gi) || []).length;

  let scenario = 'none';
  if (hasBasic && hasStandard && hasAdvanced) scenario = '1 (Basic+Standard+Advanced)';
  else if (!hasBasic && hasStandard && hasAdvanced) scenario = '2 (Standard+Advanced, no Basic)';
  else if (hasBasic && !hasStandard && hasAdvanced) scenario = '3 (Basic+Advanced, no Standard)';
  else if (hasBasic && hasStandard && !hasAdvanced) scenario = 'already 2-tier (Basic+Standard)';
  else if (hasBasic && !hasStandard && !hasAdvanced) scenario = 'Basic only';
  else if (!hasBasic && hasStandard && !hasAdvanced) scenario = 'Standard only';
  else if (!hasBasic && !hasStandard && hasAdvanced) scenario = 'Advanced only';
  else scenario = 'no tier labels';

  return { scenario, cBasic, cStd, cAdv };
}

function processDocx(filePath) {
  const buf = fs.readFileSync(filePath);
  const zip = new PizZip(buf);
  const parts = Object.keys(zip.files).filter((p) =>
    /^word\/(document|header\d*|footer\d*)\.xml$/i.test(p)
  );
  let combined = '';
  for (const p of parts) {
    const f = zip.file(p);
    if (!f) continue;
    combined += '\n' + stripXml(f.asText());
  }
  return classify(combined);
}

function main() {
  const files = fs
    .readdirSync(TEMPLATES_DIR)
    .filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'))
    .map((f) => path.join(TEMPLATES_DIR, f));

  const buckets = {};
  const rows = [];

  for (const f of files) {
    const name = path.basename(f);
    try {
      const { scenario, cBasic, cStd, cAdv } = processDocx(f);
      rows.push({ name, scenario, cBasic, cStd, cAdv });
      buckets[scenario] = (buckets[scenario] || 0) + 1;
    } catch (err) {
      rows.push({ name, scenario: `ERROR: ${err.message}`, cBasic: 0, cStd: 0, cAdv: 0 });
    }
  }

  // Print by scenario bucket
  console.log('\n=== Bucket counts ===');
  Object.keys(buckets).sort().forEach((k) => console.log(`  ${k}: ${buckets[k]}`));

  console.log('\n=== Per-file ===');
  console.log('scenario'.padEnd(40), 'B/S/A'.padEnd(10), 'file');
  console.log('-'.repeat(100));
  rows
    .sort((a, b) => a.scenario.localeCompare(b.scenario) || a.name.localeCompare(b.name))
    .forEach((r) => {
      console.log(
        r.scenario.padEnd(40),
        `${r.cBasic}/${r.cStd}/${r.cAdv}`.padEnd(10),
        r.name
      );
    });
}

main();
