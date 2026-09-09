/**
 * Convert backend-templates/manage-datasprawl.docx to the multi-row Data Sprawl form.
 *
 * Pricing row becomes a same-row docxtemplater loop — one rendered row per selected type:
 *   {{#sprawlRows}}{{sprawlJobRequirement}} | {{sprawlLabel}} | {{sprawlPrice}}{{/sprawlRows}}
 *
 * The overage paragraph becomes a single whole-sentence token:
 *   Overage Charge: {{per_data_cost}} per GB   ->   {{sprawl_overage_line}}
 * The old wording hardcoded "per GB", which mislabelled the per-USER Message/Email rates.
 *
 * Same-row loop form is deliberate: tag-only loop rows (as in MultiCombinations.docx)
 * leave blank rows behind, and the cleanup that removes them only runs when no discount
 * is applied. Do not convert this to the three-row pattern.
 *
 * Word splits tokens across <w:t> runs, so this writes run-aware: the first run of a cell
 * takes the whole string and the rest are emptied, preserving the cell's formatting.
 *
 * Idempotent. Run: node scripts/set-datasprawl-rows.cjs [path/to/file.docx] [--dry-run]
 * With no path it patches backend-templates/manage-datasprawl.docx.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const DRY_RUN = process.argv.includes('--dry-run');
// Optional path argument so this can patch any copy of the agreement, not just the repo one.
const argPath = process.argv.slice(2).find(a => !a.startsWith('--'));
const DOCX_PATH = argPath
  ? path.resolve(argPath)
  : path.join(process.cwd(), 'backend-templates', 'manage-datasprawl.docx');

const LOOP_CELLS = [
  '{{#sprawlRows}}{{sprawlJobRequirement}}',
  '{{sprawlLabel}}',
  '{{sprawlPrice}}{{/sprawlRows}}'
];
const OVERAGE_TOKEN = '{{sprawl_overage_line}}';

function textOf(node) {
  return Array.from(node.getElementsByTagName('w:t'))
    .map(t => t.textContent || '')
    .join('');
}

function setText(node, text) {
  const runs = Array.from(node.getElementsByTagName('w:t'));
  if (runs.length === 0) return false;
  if (textOf(node) === text) return false;
  runs[0].textContent = text;
  runs[0].setAttribute('xml:space', 'preserve');
  for (let i = 1; i < runs.length; i++) runs[i].textContent = '';
  return true;
}

async function main() {
  if (!fs.existsSync(DOCX_PATH)) {
    console.error(`❌ Not found: ${DOCX_PATH}`);
    process.exit(1);
  }

  const zip = await JSZip.loadAsync(fs.readFileSync(DOCX_PATH));
  const xml = await zip.file('word/document.xml').async('string');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  let changed = false;

  // --- pricing row -> loop row ---
  const rows = Array.from(doc.getElementsByTagName('w:tr'));
  // Match any of the single-row tokens, or an already-converted loop row. Deliberately
  // NOT total_price — that also appears in the separate Total Price table below.
  const target = rows.find(tr => {
    const t = textOf(tr);
    return ['manag_data_cost', 'manag_data_label', 'manag_data_size', 'sprawlPrice']
      .some(token => t.includes(token));
  });
  if (!target) {
    console.error('❌ Could not find the Data Sprawl pricing row. Aborting without changes.');
    process.exit(1);
  }
  const cells = Array.from(target.getElementsByTagName('w:tc'));
  if (cells.length !== LOOP_CELLS.length) {
    console.error(`❌ Expected ${LOOP_CELLS.length} columns, found ${cells.length}. Aborting.`);
    process.exit(1);
  }

  console.log('Pricing row before:');
  cells.forEach((c, i) => console.log(`  cell ${i}: ${JSON.stringify(textOf(c))}`));
  LOOP_CELLS.forEach((text, i) => {
    if (setText(cells[i], text)) changed = true;
  });
  console.log('Pricing row after:');
  cells.forEach((c, i) => console.log(`  cell ${i}: ${JSON.stringify(textOf(c))}`));

  // --- overage paragraph -> one whole-sentence token ---
  const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
  const overage = paragraphs.find(pr => {
    const t = textOf(pr);
    return t.includes('per_data_cost') || t.includes('sprawl_overage_line');
  });
  if (overage) {
    console.log(`\nOverage before: ${JSON.stringify(textOf(overage))}`);
    if (setText(overage, OVERAGE_TOKEN)) changed = true;
    console.log(`Overage after:  ${JSON.stringify(textOf(overage))}`);
  } else {
    console.log('\nℹ️ No overage paragraph found — skipping that edit.');
  }

  if (!changed) {
    console.log('\n✅ Already up to date — no changes written.');
    return;
  }
  if (DRY_RUN) {
    console.log('\n🔎 --dry-run: nothing written.');
    return;
  }

  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(DOCX_PATH, out);
  console.log(`\n✅ Wrote ${path.basename(DOCX_PATH)} (${Math.round(out.length / 1024)}KB)`);
  if (!argPath) console.log('   Revert with: git checkout backend-templates/manage-datasprawl.docx');
}

main().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
