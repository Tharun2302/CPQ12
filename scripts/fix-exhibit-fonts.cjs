const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// Force every exhibit's text to Arial 10.5pt (sz21 = 21 half-points).
// Rewrites document.xml + styles.xml: all w:sz/w:szCs -> 21, all w:rFonts -> Arial,
// and the docDefaults run properties -> Arial/21 so font-less/inherited runs comply too.
// Backups of every modified original are written to scripts/exhibit-font-backups/.

const exhibitsDir = path.resolve(__dirname, '..', 'backend-exhibits');
const backupDir = path.resolve(__dirname, 'exhibit-font-backups');

const ARIAL_RFONTS = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/>';

function normalize(xml) {
  let out = xml;
  // Force all explicit run/complex-script sizes to 10.5pt (21 half-points)
  out = out.replace(/<w:sz\s+w:val="\d+"\s*\/>/g, '<w:sz w:val="21"/>');
  out = out.replace(/<w:szCs\s+w:val="\d+"\s*\/>/g, '<w:szCs w:val="21"/>');
  // Force all font tables to Arial (handles ascii/hAnsi/cs/eastAsia + themed fonts)
  out = out.replace(/<w:rFonts\b[^>]*\/>/g, ARIAL_RFONTS);
  out = out.replace(/<w:rFonts\b[^>]*>[\s\S]*?<\/w:rFonts>/g, ARIAL_RFONTS);
  return out;
}

// Ensure styles.xml docDefaults force Arial 10.5 for anything that inherits.
function ensureDocDefaults(stylesXml) {
  let xml = normalize(stylesXml);
  if (!/<w:docDefaults>/.test(xml)) {
    const block = '<w:docDefaults><w:rPrDefault><w:rPr>' + ARIAL_RFONTS +
      '<w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault></w:docDefaults>';
    xml = xml.replace(/(<w:styles\b[^>]*>)/, `$1${block}`);
    return xml;
  }
  // docDefaults exists. Make sure rPrDefault has an rPr with Arial + sz21.
  if (!/<w:rPrDefault>/.test(xml)) {
    xml = xml.replace(/<w:docDefaults>/, '<w:docDefaults><w:rPrDefault><w:rPr>' +
      ARIAL_RFONTS + '<w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault>');
    return xml;
  }
  // rPrDefault exists; normalize already fixed any rFonts/sz inside it.
  // If its rPr lacks rFonts or sz, inject them.
  xml = xml.replace(/<w:rPrDefault>\s*<w:rPr>([\s\S]*?)<\/w:rPr>\s*<\/w:rPrDefault>/, (full, inner) => {
    let body = inner;
    if (!/<w:rFonts/.test(body)) body = ARIAL_RFONTS + body;
    if (!/<w:sz\b/.test(body)) body += '<w:sz w:val="21"/>';
    if (!/<w:szCs\b/.test(body)) body += '<w:szCs w:val="21"/>';
    return `<w:rPrDefault><w:rPr>${body}</w:rPr></w:rPrDefault>`;
  });
  // Handle empty <w:rPrDefault/> or <w:rPrDefault></w:rPrDefault>
  xml = xml.replace(/<w:rPrDefault\s*\/>/, '<w:rPrDefault><w:rPr>' + ARIAL_RFONTS +
    '<w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault>');
  return xml;
}

function main() {
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const files = fs.readdirSync(exhibitsDir)
    .filter(f => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'));

  let changed = 0, unchanged = 0, errors = 0;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  for (const file of files) {
    const full = path.join(exhibitsDir, file);
    try {
      const zip = new AdmZip(full);
      let dirty = false;

      const docEntry = zip.getEntry('word/document.xml');
      if (docEntry) {
        const orig = zip.readAsText(docEntry);
        const next = normalize(orig);
        if (next !== orig) { zip.updateFile('word/document.xml', Buffer.from(next, 'utf8')); dirty = true; }
      }

      const stylesEntry = zip.getEntry('word/styles.xml');
      if (stylesEntry) {
        const orig = zip.readAsText(stylesEntry);
        const next = ensureDocDefaults(orig);
        if (next !== orig) { zip.updateFile('word/styles.xml', Buffer.from(next, 'utf8')); dirty = true; }
      }

      if (dirty) {
        fs.copyFileSync(full, path.join(backupDir, `${file}.${stamp}.bak`));
        zip.writeZip(full);
        console.log(`✅ Normalized: ${file}`);
        changed++;
      } else {
        unchanged++;
      }
    } catch (e) {
      console.error(`❌ ${file}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\nDone. Modified ${changed}, already-fine ${unchanged}, errors ${errors}.`);
  console.log(`Backups: ${backupDir}`);
}

main();
