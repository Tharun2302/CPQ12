// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import { mergeDocxFiles } from '../../src/utils/docxMerger';
import { DOCX_MIME } from '../../src/utils/scopeAttachment';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// No whitespace between elements: the merger inserts before body.lastChild (the w:sectPr)
function makeDocx(bodyXml: string): Blob {
  const zip = new PizZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}">` +
      `<w:body>${bodyXml}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`,
  );
  return new Blob([zip.generate({ type: 'arraybuffer' })], { type: DOCX_MIME });
}

const para = (text: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${text}</w:t></w:r></w:p>`;

async function textOf(blob: Blob): Promise<string> {
  const zip = new PizZip(await blob.arrayBuffer());
  return (zip.file('word/document.xml')?.asText() || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

const LONG_INCLUDED = 'Every repository listed below is included in the Data Sprawl assessment for this term.';
const MANAGE_EXHIBIT = () => makeDocx(para('Features Included', 'Heading1') + para(LONG_INCLUDED) + para('Short line.'));

describe('mergeDocxFiles keepAllContent', () => {
  it('regression: without the option the ungrouped append drops "included" headings and long paragraphs', async () => {
    const merged = await mergeDocxFiles(makeDocx(para('Agreement')), [MANAGE_EXHIBIT()]);
    const text = await textOf(merged);
    expect(text).not.toContain('Features Included');
    expect(text).not.toContain(LONG_INCLUDED);
  });

  it('appends each file as-is, with no auto headings', async () => {
    const merged = await mergeDocxFiles(
      makeDocx(para('Agreement')),
      [MANAGE_EXHIBIT(), makeDocx(para('Items not included in this plan', 'Heading1'))],
      undefined,
      { keepAllContent: true },
    );
    const text = await textOf(merged);
    expect(text).toContain('Features Included');
    expect(text).toContain(LONG_INCLUDED);
    expect(text).toContain('Short line.');
    expect(text).toContain('Items not included in this plan');
    expect(text).not.toContain('INCLUDED IN MIGRATION');
    expect(text.indexOf('Features Included')).toBeLessThan(text.indexOf('Items not included in this plan'));
  });
});
