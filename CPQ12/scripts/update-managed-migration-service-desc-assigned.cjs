/**
 * Targeted update for backend DOCX templates:
 * - Find table row whose FIRST cell contains "Managed Migration Service"
 * - In that row, ONLY within the SECOND cell (Description),
 *   replace whole-word "Assisted" -> "Assigned"
 *
 * This avoids changing other occurrences such as the header banner text
 * "Assisted Migration Manager".
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const TEMPLATES_DIR = path.join(process.cwd(), 'backend-templates');
const FROM_WORD = 'Assisted';
const TO_WORD = 'Assigned';

function listDocxFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'))
    .map((f) => path.join(dir, f));
}

function normalizeText(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getTextNodesUnder(el, tagName) {
  // xmldom doesn't guarantee iterable NodeList in all environments
  const nodes = el.getElementsByTagName(tagName);
  const out = [];
  for (let i = 0; i < nodes.length; i++) out.push(nodes.item(i));
  return out;
}

function getCellText(tcEl) {
  const tNodes = getTextNodesUnder(tcEl, 'w:t');
  return tNodes.map((n) => n.textContent || '').join('');
}

function replaceWordInCell(tcEl) {
  const tNodes = getTextNodesUnder(tcEl, 'w:t');
  let replaced = 0;
  const re = /\bAssisted\b/g;
  for (const n of tNodes) {
    const before = n.textContent || '';
    const after = before.replace(re, TO_WORD);
    if (after !== before) {
      // count occurrences in this node
      replaced += (before.match(re) || []).length;
      n.textContent = after;
    }
  }
  return replaced;
}

function updateWordXml(xml) {
  const parser = new DOMParser({ errorHandler: { warning: null, error: null, fatalError: null } });
  const doc = parser.parseFromString(xml, 'application/xml');

  const tables = doc.getElementsByTagName('w:tbl');
  let totalReplacements = 0;

  for (let t = 0; t < tables.length; t++) {
    const tbl = tables.item(t);
    const rows = tbl.getElementsByTagName('w:tr');
    for (let r = 0; r < rows.length; r++) {
      const tr = rows.item(r);
      const cells = tr.getElementsByTagName('w:tc');
      if (!cells || cells.length < 2) continue;

      const firstCellText = normalizeText(getCellText(cells.item(0)));
      // Match the label even if it was split by line breaks in Word
      if (!firstCellText.includes('managed migration service')) continue;

      // Only touch the second cell in this row
      totalReplacements += replaceWordInCell(cells.item(1));
    }
  }

  if (totalReplacements === 0) return { xml, totalReplacements: 0 };
  const serializer = new XMLSerializer();
  return { xml: serializer.serializeToString(doc), totalReplacements };
}

async function processDocx(docxPath) {
  const buf = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buf);

  const xmlCandidates = Object.keys(zip.files).filter(
    (name) =>
      name === 'word/document.xml' ||
      name.startsWith('word/header') ||
      name.startsWith('word/footer')
  );

  let replacements = 0;
  for (const name of xmlCandidates) {
    const f = zip.file(name);
    if (!f) continue;
    const xml = await f.async('string');
    const updated = updateWordXml(xml);
    if (updated.totalReplacements > 0) {
      zip.file(name, updated.xml);
      replacements += updated.totalReplacements;
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

  console.log(`🔎 Updating Managed Migration Service description cells in ${files.length} templates...`);
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


