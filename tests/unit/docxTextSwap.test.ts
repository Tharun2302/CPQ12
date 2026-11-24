import { describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import { planTextReplacements, replaceTextInDocx, swapText } from '../../src/utils/docxTextSwap';

const run = (text: string, attrs = '') => `<w:r><w:rPr><w:b/></w:rPr><w:t${attrs}>${text}</w:t></w:r>`;
const para = (...runs: string[]) => `<w:p>${runs.join('')}</w:p>`;
const body = (...paras: string[]) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="w"><w:body>${paras.join('')}</w:body></w:document>`;

function makeDocx(parts: Record<string, string>): Uint8Array {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<Types/>');
  for (const [name, xml] of Object.entries(parts)) zip.file(name, xml);
  return zip.generate({ type: 'uint8array' });
}

const readPart = (docx: Uint8Array, name: string) => new PizZip(docx).file(name)!.asText();
const textOf = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');

describe('replaceTextInDocx', () => {
  it('swaps a date held in one run and keeps the run formatting', () => {
    const docx = makeDocx({ 'word/document.xml': body(para(run('Start: 07/01/2026'))) });
    const { docx: out, counts } = replaceTextInDocx(docx, [{ from: '07/01/2026', to: '08/15/2026' }]);
    const xml = readPart(out, 'word/document.xml');
    expect(textOf(xml)).toBe('Start: 08/15/2026');
    expect(xml).toContain('<w:rPr><w:b/></w:rPr>');
    expect(counts['07/01/2026']).toBe(1);
  });

  it('swaps a date that Word split across several runs', () => {
    const docx = makeDocx({ 'word/document.xml': body(para(run('Starts on 07/'), run('01/'), run('2026 sharp'))) });
    const { docx: out } = replaceTextInDocx(docx, [{ from: '07/01/2026', to: '08/15/2026' }]);
    expect(textOf(readPart(out, 'word/document.xml'))).toBe('Starts on 08/15/2026 sharp');
  });

  it('swaps every place the date is printed, including exhibits further down', () => {
    const docx = makeDocx({
      'word/document.xml': body(para(run('Effective 07/01/2026')), para(run('Exhibit 1')), para(run('From 07/01/2026 on'))),
    });
    const { docx: out, counts } = replaceTextInDocx(docx, [{ from: '07/01/2026', to: '09/01/2026' }]);
    expect(textOf(readPart(out, 'word/document.xml'))).toBe('Effective 09/01/2026Exhibit 1From 09/01/2026 on');
    expect(counts['07/01/2026']).toBe(2);
  });

  it('swaps all dates at once, so one new date is never swapped again', () => {
    const docx = makeDocx({ 'word/document.xml': body(para(run('Start 07/01/2026, effective 08/01/2026'))) });
    const { docx: out } = replaceTextInDocx(docx, [
      { from: '07/01/2026', to: '08/01/2026' },
      { from: '08/01/2026', to: '09/01/2026' },
    ]);
    expect(textOf(readPart(out, 'word/document.xml'))).toBe('Start 08/01/2026, effective 09/01/2026');
  });

  it('never matches text that runs across two paragraphs', () => {
    const docx = makeDocx({ 'word/document.xml': body(para(run('07/01/')), para(run('2026'))) });
    const { counts } = replaceTextInDocx(docx, [{ from: '07/01/2026', to: '08/15/2026' }]);
    expect(counts['07/01/2026']).toBeUndefined();
  });

  it('updates headers and footers too', () => {
    const docx = makeDocx({
      'word/document.xml': body(para(run('Body'))),
      'word/header1.xml': `<w:hdr>${para(run('Valid till 1st of July, 2026'))}</w:hdr>`,
      'word/footer2.xml': `<w:ftr>${para(run('1st of July, 2026'))}</w:ftr>`,
    });
    const { docx: out, counts } = replaceTextInDocx(docx, [{ from: '1st of July, 2026', to: '5th of August, 2026' }]);
    expect(textOf(readPart(out, 'word/header1.xml'))).toBe('Valid till 5th of August, 2026');
    expect(textOf(readPart(out, 'word/footer2.xml'))).toBe('5th of August, 2026');
    expect(counts['1st of July, 2026']).toBe(2);
  });

  it('leaves parts without a match byte-for-byte unchanged', () => {
    const header = `<w:hdr>${para(run('Fish &amp; chips'))}</w:hdr>`;
    const docx = makeDocx({ 'word/document.xml': body(para(run('07/01/2026'))), 'word/header1.xml': header });
    const { docx: out } = replaceTextInDocx(docx, [{ from: '07/01/2026', to: '08/15/2026' }]);
    expect(readPart(out, 'word/header1.xml')).toBe(header);
  });

  it('handles escaped characters and keeps edge spaces', () => {
    const docx = makeDocx({ 'word/document.xml': body(para(run('A &amp; B, 07/'), run('01/2026'))) });
    const { docx: out } = replaceTextInDocx(docx, [{ from: '07/01/2026', to: ' 08/15/2026 ' }]);
    const xml = readPart(out, 'word/document.xml');
    expect(xml).toContain('A &amp; B, ');
    expect(xml).toContain('xml:space="preserve"');
  });

  it('is not fooled by a self-closing text tag', () => {
    const docx = makeDocx({ 'word/document.xml': body(para(`<w:r><w:t xml:space="preserve"/></w:r>`, run('07/01/2026'))) });
    const { docx: out } = replaceTextInDocx(docx, [{ from: '07/01/2026', to: '08/15/2026' }]);
    const xml = readPart(out, 'word/document.xml');
    expect(xml).toContain('<w:t xml:space="preserve"/>');
    expect(textOf(xml)).toBe('08/15/2026');
  });

  it('ignores deleted tracked-change text', () => {
    const docx = makeDocx({ 'word/document.xml': body(para('<w:r><w:delText>07/01/2026</w:delText></w:r>')) });
    const { counts } = replaceTextInDocx(docx, [{ from: '07/01/2026', to: '08/15/2026' }]);
    expect(counts['07/01/2026']).toBeUndefined();
  });
});

describe('swapText', () => {
  it('applies all swaps at once, like the file swap', () => {
    expect(swapText('Start 07/01/2026, effective 08/01/2026', [
      { from: '07/01/2026', to: '08/01/2026' },
      { from: '08/01/2026', to: '09/01/2026' },
    ])).toBe('Start 08/01/2026, effective 09/01/2026');
  });

  it('leaves text without a match unchanged', () => {
    expect(swapText('N/A', [{ from: '07/01/2026', to: '08/01/2026' }])).toBe('N/A');
  });
});

describe('planTextReplacements', () => {
  it('lists each changed date once', () => {
    const plan = planTextReplacements(
      { '{{start_date}}': '07/01/2026', '{{project_start_date}}': '07/01/2026', '{{client}}': 'Acme' },
      { '{{start_date}}': '08/01/2026', '{{project_start_date}}': '08/01/2026', '{{client}}': 'Acme' }
    );
    expect(plan).toEqual({ ok: true, replacements: [{ from: '07/01/2026', to: '08/01/2026' }], unplaceable: [] });
  });

  it('ignores names the agreement never had', () => {
    const plan = planTextReplacements({ '{{effective_date}}': '07/01/2026' }, { '{{effective_date}}': '07/01/2026', '{{today}}': '07/01/2026' });
    expect(plan).toEqual({ ok: true, replacements: [], unplaceable: [] });
  });

  it('stops when the same text must become two different dates', () => {
    const plan = planTextReplacements(
      { '{{start_date}}': '07/01/2026', '{{effective_date}}': '07/01/2026' },
      { '{{start_date}}': '08/01/2026', '{{effective_date}}': '07/01/2026' }
    );
    expect(plan).toEqual({ ok: false, sharedText: '07/01/2026' });
  });

  it('stops when unchanged text contains a date that is changing', () => {
    const plan = planTextReplacements(
      { '{{start_date}}': '07/01/2026', '{{signed_line}}': 'Signed 07/01/2026' },
      { '{{start_date}}': '08/01/2026', '{{signed_line}}': 'Signed 07/01/2026' }
    );
    expect(plan).toEqual({ ok: false, sharedText: '07/01/2026' });
  });

  it('drops the validity line because the bare expiry swap already fixes it', () => {
    const plan = planTextReplacements(
      { '{{quote_expiry_date_long}}': '1st of July, 2026', '{{quote_validity_line}}': 'This quote is valid till 1st of July, 2026' },
      { '{{quote_expiry_date_long}}': '5th of August, 2026', '{{quote_validity_line}}': 'This quote is valid till 5th of August, 2026' }
    );
    expect(plan).toEqual({ ok: true, replacements: [{ from: '1st of July, 2026', to: '5th of August, 2026' }], unplaceable: [] });
  });

  it('reports dates that were blank in the agreement instead of guessing where they go', () => {
    const plan = planTextReplacements({ '{{quote_expiry_date_long}}': '' }, { '{{quote_expiry_date_long}}': '5th of August, 2026' });
    expect(plan).toEqual({ ok: true, replacements: [], unplaceable: ['{{quote_expiry_date_long}}'] });
  });
});
