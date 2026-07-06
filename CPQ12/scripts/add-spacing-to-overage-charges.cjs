/**
 * Add spacing between overage charges in MultiCombinations template
 * Restructures the template so each overage charge iteration creates its own paragraph with spacing
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const DOCX_PATH = 'backend-templates/MultiCombinations-fixed.docx';

async function addSpacingToOverageCharges(docxPath) {
  const buf = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buf);

  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    throw new Error('No document.xml found');
  }

  let xml = await docXmlFile.async('string');
  
  // Current structure: 
  // Paragraph 1: <w:p>...<w:t>{{#exhibits}}Overage Charges for...{{/exhibitOveragePerGB}}</w:t>...</w:p>
  // Paragraph 2: <w:p>...<w:t>{{/exhibits}}</w:t>...</w:p>
  // We need: {{#exhibits}}<w:p>...<w:t>Overage Charges for...</w:t>...</w:p>{{/exhibits}}
  
  // Find both paragraphs (the loop spans two paragraphs)
  const pattern = /(<w:p[^>]*>[\s\S]*?<w:t[^>]*>)\{\{#exhibits\}\}(Overage Charges for \{\{exhibitCombinationName\}\}: \{\{exhibitOveragePerUser\}\} per User \| \{\{exhibitOveragePerServer\}\} per server per month)(\{\{#exhibitOveragePerGB\}\} \| \{\{exhibitOveragePerGB\}\} per GB\{\{\/exhibitOveragePerGB\}\})?([\s\S]*?<\/w:t>[\s\S]*?<\/w:p>)(<w:p[^>]*>[\s\S]*?<w:t[^>]*>)\{\{\/exhibits\}\}([\s\S]*?<\/w:t>[\s\S]*?<\/w:p>)/;
  
  const match = xml.match(pattern);
  if (!match) {
    console.log('⚠️  Could not find overage charges pattern in template');
    return false;
  }
  
  const fullMatch = match[0];
  const para1Start = match[1]; // First paragraph start
  const overageContent = match[2]; // Overage Charges for...
  const perGBPart = match[3] || ''; // {{#exhibitOveragePerGB}}...{{/exhibitOveragePerGB}}
  const para1End = match[4]; // First paragraph end
  const para2Start = match[5]; // Second paragraph start (with {{/exhibits}})
  const para2End = match[6]; // Second paragraph end
  
  // Extract paragraph properties from second paragraph (has spacing)
  const paraPrMatch = para2Start.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
  let paraPrContent = '';
  if (paraPrMatch) {
    paraPrContent = paraPrMatch[1];
  } else {
    // Default paragraph properties with spacing
    paraPrContent = '<w:spacing w:after="314" w:line="265" w:lineRule="auto"/><w:jc w:val="left"/><w:rPr><w:b/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr>';
  }
  
  // Extract text run properties from first paragraph
  const rPrMatch = fullMatch.match(/<w:rPr[^>]*>([\s\S]*?)<\/w:rPr>/);
  let rPrContent = '';
  if (rPrMatch) {
    rPrContent = rPrMatch[1];
  } else {
    rPrContent = '<w:b/><w:sz w:val="21"/><w:szCs w:val="21"/>';
  }
  
  // Create new structure: {{#exhibits}} wraps a paragraph, {{/exhibits}} is outside
  const newStructure = `{{#exhibits}}<w:p><w:pPr>${paraPrContent}</w:pPr><w:r><w:rPr>${rPrContent}</w:rPr><w:t>${overageContent}${perGBPart}</w:t></w:r></w:p>{{/exhibits}}`;
  
  // Replace both paragraphs with new structure
  xml = xml.replace(fullMatch, newStructure);
  
  zip.file('word/document.xml', xml);
  const out = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(docxPath, out);
  
  return true;
}

async function main() {
  const docxPath = path.join(process.cwd(), DOCX_PATH);
  
  if (!fs.existsSync(docxPath)) {
    console.error(`❌ Template not found: ${docxPath}`);
    process.exit(1);
  }

  console.log(`🔧 Adding spacing to overage charges in ${DOCX_PATH}...`);
  
  try {
    const success = await addSpacingToOverageCharges(docxPath);
    if (success) {
      console.log(`✅ Updated template: Each overage charge now creates its own paragraph with spacing`);
      console.log(`   The loop now wraps a paragraph, so each iteration will have spacing between them`);
    } else {
      console.log(`⚠️  Template structure may need manual adjustment`);
    }
  } catch (e) {
    console.error(`❌ Failed:`, e?.message || String(e));
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });
}
