import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import { DocxTemplateProcessor } from '../../src/utils/docxTemplateProcessor';
import {
  QUOTE_VALIDITY_TEXT,
  removeElementsContaining,
  removeExistingValidityLines,
} from '../../src/utils/docxValidityLine';

const VALIDITY = 'This quote is valid till 2nd of January, 2026';
const visibleText = (xml: string) => xml.replace(/<[^>]+>/g, '');

const para = (text: string, attrs = '') =>
  `<w:p${attrs}><w:pPr><w:ind w:left="29"/></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const cell = (text: string) => `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>${para(text)}</w:tc>`;
const tr = (...cells: string[]) => `<w:tr w:rsidR="001"><w:trPr><w:trHeight w:val="400"/></w:trPr>${cells.map(cell).join('')}</w:tr>`;
const tbl = (...rows: string[]) => `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr>${rows.join('')}</w:tbl>`;

const PRICING_TABLE = tbl(
  tr('Job Requirement', 'Description', 'Price'),
  tr('CloudFuze Manage', 'Users', '{{users_cost}}'),
  tr('Total Price', '', '{{total_price}}'),
);
const SIGNATURE_TABLE = tbl(tr('Signature', 'Name'), tr('Title', 'Date'));

// Mirrors the uploaded Manage Standalone template: the validity line is a plain paragraph between tables.
const STANDALONE_BODY = PRICING_TABLE
  + '<w:p w14:paraId="74962071" w:rsidR="00BD78CD"/>'
  + `<w:p w14:paraId="269BFA9A"><w:pPr><w:ind w:left="29"/></w:pPr><w:proofErr w:type="spellStart"/>`
  + `<w:r><w:t xml:space="preserve">${QUOTE_VALIDITY_TEXT} </w:t></w:r><w:r><w:t>{{quote_expiry_date}}</w:t></w:r></w:p>`
  + para('Important Payment Notes')
  + para('SAAS SERVICE AGREEMENT')
  + SIGNATURE_TABLE;

describe('removeExistingValidityLines', () => {
  it('removes only the validity paragraph when it sits between tables', () => {
    const out = removeExistingValidityLines(STANDALONE_BODY);
    expect(out).not.toContain(QUOTE_VALIDITY_TEXT);
    expect(out).toBe(STANDALONE_BODY.replace(/<w:p w14:paraId="269BFA9A">[\s\S]*?<\/w:p>/, ''));
    expect(out).toContain(PRICING_TABLE);
    expect(out).toContain(SIGNATURE_TABLE);
    expect(out).toContain('Important Payment Notes');
    expect(out).toContain('SAAS SERVICE AGREEMENT');
  });

  it('removes only the table row that carries the validity line', () => {
    const validityRow = tr(`${VALIDITY}`);
    const xml = tbl(tr('A', 'B'), validityRow, tr('Total Price', '$1')) + SIGNATURE_TABLE;
    const out = removeExistingValidityLines(xml);
    expect(out).toBe(tbl(tr('A', 'B'), tr('Total Price', '$1')) + SIGNATURE_TABLE);
  });

  it('removes only the nested row when the line is inside a nested table', () => {
    const inner = tbl(tr('inner A'), tr(VALIDITY));
    const outerRow = `<w:tr><w:tc>${para('outer')}${inner}${para('after inner')}</w:tc></w:tr>`;
    const xml = `<w:tbl>${tr('first')}${outerRow}${tr('last')}</w:tbl>`;
    const out = removeExistingValidityLines(xml);
    expect(out).toBe(xml.replace(tr(VALIDITY), ''));
  });

  it('removes every copy, rows and paragraphs alike', () => {
    const xml = tbl(tr('A'), tr(VALIDITY)) + para(VALIDITY) + para('keep') + para(VALIDITY);
    expect(removeExistingValidityLines(xml)).toBe(tbl(tr('A')) + para('keep'));
  });

  it('leaves XML without a validity line unchanged', () => {
    const xml = PRICING_TABLE + para('Important Payment Notes') + SIGNATURE_TABLE;
    expect(removeExistingValidityLines(xml)).toBe(xml);
  });

  it('does not treat <w:pPr>, <w:proofErr> or <w:trPr> as element starts', () => {
    const xml = `<w:p><w:pPr/><w:proofErr w:type="spellStart"/><w:r><w:t>${VALIDITY}</w:t></w:r></w:p>`;
    expect(removeElementsContaining(para('before') + xml + para('after'), QUOTE_VALIDITY_TEXT, 'p'))
      .toBe(para('before') + para('after'));
  });

  it('leaves text that is in no enclosing element', () => {
    const xml = `<w:body>${VALIDITY}${para('keep')}</w:body>`;
    expect(removeElementsContaining(xml, QUOTE_VALIDITY_TEXT, 'tr')).toBe(xml);
  });
});

describe('DocxTemplateProcessor keeps everything after a between-tables validity paragraph', () => {
  const MULTI_COMBO = path.resolve(__dirname, '../../backend-templates/MultiCombinations.docx');

  function docxWithBody(body: string): File {
    const zip = new PizZip(fs.readFileSync(MULTI_COMBO));
    const xml = zip.file('word/document.xml')!.asText();
    const sectPr = xml.match(/<w:sectPr[\s\S]*<\/w:sectPr>/)![0];
    const start = xml.indexOf('<w:body>') + '<w:body>'.length;
    const end = xml.indexOf('</w:body>');
    zip.file('word/document.xml', xml.slice(0, start) + body + sectPr + xml.slice(end));
    return new File([zip.generate({ type: 'uint8array' })], 'manage-standalone.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  it('renders the pricing table, notes, SaaS agreement, signature table and one validity line', async () => {
    const data = {
      // Without it the processor falls back to a require() that only resolves in the bundled app.
      '{{instance_cost}}': '$0.00',
      '{{users_cost}}': '$1,800.00',
      '{{total_price}}': '$1,800.00',
      '{{quote_expiry_date}}': '2nd of January, 2026',
      '{{quote_validity_line}}': VALIDITY,
    } as unknown as Parameters<DocxTemplateProcessor['processDocxTemplate']>[1];
    const result = await new DocxTemplateProcessor().processDocxTemplate(docxWithBody(STANDALONE_BODY), data);
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    const xml = new PizZip(await result.processedDocx!.arrayBuffer()).file('word/document.xml')!.asText();
    const text = visibleText(xml);

    for (const s of ['Job Requirement', 'CloudFuze Manage', 'Total Price', 'Important Payment Notes',
      'SAAS SERVICE AGREEMENT', 'Signature', 'Title']) {
      expect(text).toContain(s);
    }
    expect((xml.match(/<w:tbl>/g) || []).length).toBe(2);
    expect(text.split(QUOTE_VALIDITY_TEXT)).toHaveLength(2);
    expect(text.indexOf('Total Price')).toBeLessThan(text.indexOf('SAAS SERVICE AGREEMENT'));
  });
});
