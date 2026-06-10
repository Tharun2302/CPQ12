const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// Audit (read-only): report font family + size usage across all exhibit DOCX files.
// Target: Arial, 10.5pt. In OOXML, 10.5pt = w:sz w:val="21" (half-points). Arial = w:rFonts ascii="Arial".

const exhibitsDir = path.resolve(__dirname, '..', 'backend-exhibits');

function tally(map, key) { map.set(key, (map.get(key) || 0) + 1); }

function auditXml(xml) {
  const fonts = new Map();
  const sizes = new Map();
  // run fonts (ascii attribute is what controls Latin text)
  const fontRe = /w:ascii="([^"]*)"/g;
  let m;
  while ((m = fontRe.exec(xml)) !== null) tally(fonts, m[1]);
  // sizes (w:sz and w:szCs), val is half-points
  const szRe = /<w:sz(?:Cs)?\s+w:val="(\d+)"\s*\/?>/g;
  while ((m = szRe.exec(xml)) !== null) tally(sizes, m[1]);
  return { fonts, sizes };
}

function main() {
  const files = fs.readdirSync(exhibitsDir).filter(f => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'));
  console.log(`Auditing ${files.length} exhibit .docx files\n`);

  const clean = [];
  const problems = [];

  for (const file of files) {
    try {
      const zip = new AdmZip(path.join(exhibitsDir, file));
      const docEntry = zip.getEntry('word/document.xml');
      const docXml = docEntry ? zip.readAsText(docEntry) : '';
      const doc = auditXml(docXml);

      // Only judge the VISIBLE CONTENT (document.xml), not styles.xml defaults.
      const nonArialFonts = [...doc.fonts.keys()].filter(f => f && f.toLowerCase() !== 'arial');
      const nonTargetSizes = [...doc.sizes.keys()].filter(s => s !== '21');

      if (nonArialFonts.length === 0 && nonTargetSizes.length === 0) {
        clean.push(file);
      } else {
        problems.push({
          file,
          fonts: [...doc.fonts.entries()],
          sizes: [...doc.sizes.entries()],
          nonArialFonts,
          nonTargetSizes,
        });
      }
    } catch (e) {
      problems.push({ file, error: e.message });
    }
  }

  console.log(`✅ Already Arial 10.5 only: ${clean.length}`);
  console.log(`⚠️  Need attention: ${problems.length}\n`);

  // Aggregate what fonts/sizes appear overall
  console.log('--- Files needing attention ---');
  for (const p of problems) {
    if (p.error) { console.log(`❌ ${p.file} :: ERROR ${p.error}`); continue; }
    const fontStr = p.fonts.map(([k, v]) => `${k}(${v})`).join(', ') || '(none)';
    const sizeStr = p.sizes.map(([k, v]) => `${(k/2)}pt:sz${k}(${v})`).join(', ') || '(none)';
    console.log(`• ${p.file}`);
    console.log(`    fonts: ${fontStr}`);
    console.log(`    sizes: ${sizeStr}`);
  }
}

main();
