// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import { mergeDocxFiles } from '../../src/utils/docxMerger';
import { DOCX_MIME } from '../../src/utils/scopeAttachment';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

// No whitespace between elements: mergeDocxFiles inserts before body.lastChild and relies on
// that being w:sectPr, exactly as docxtemplater's serializer emits it.
function makeDocx(bodyXml: string, extraFiles: Record<string, string> = {}): Blob {
  const zip = new PizZip();
  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:a="${A}">` +
    `<w:body>${bodyXml}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body>` +
    `</w:document>`;
  zip.file('word/document.xml', xml);
  for (const [path, content] of Object.entries(extraFiles)) zip.file(path, content);
  return new Blob([zip.generate({ type: 'arraybuffer' })], { type: DOCX_MIME });
}

function para(text: string, style?: string): string {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${pPr}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

async function textOf(blob: Blob): Promise<string> {
  const zip = new PizZip(await blob.arrayBuffer());
  const xml = zip.file('word/document.xml')?.asText() || '';
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

async function rawXml(blob: Blob): Promise<string> {
  const zip = new PizZip(await blob.arrayBuffer());
  return zip.file('word/document.xml')?.asText() || '';
}

const AGREEMENT = () => makeDocx(para('CloudFuze Purchase Agreement') + para('Total Price $1,000.00'));

// The exact phrasings that the exhibit filter used to delete from a customer document.
const LONG_INCLUDED = 'The following Google Workspace services are included in the migration scope for Phase 1.';

const SCOPE_BODY =
  para('Included Services', 'Heading1') +
  para(LONG_INCLUDED) +
  para('Short line.') +
  `<w:tbl><w:tblPr/><w:tr><w:tc><w:p><w:r><w:t>Mailboxes</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;

describe('verbatim append preserves customer scope content', () => {
  it('regression: keeps headings and long paragraphs containing "included"', async () => {
    const merged = await mergeDocxFiles(AGREEMENT(), [makeDocx(SCOPE_BODY)], undefined, {
      sectionTitle: 'Customer Scope Document',
      verbatim: true
    });

    const text = await textOf(merged);
    // Each of these was silently deleted by the exhibit content filter before verbatim mode
    expect(text).toContain('Included Services');
    expect(text).toContain(LONG_INCLUDED);
    expect(text).toContain('Short line.');
    expect(text).toContain('Mailboxes');
    expect(text).toContain('Customer Scope Document');
    // The agreement itself must be untouched
    expect(text).toContain('CloudFuze Purchase Agreement');
    expect(text).toContain('Total Price $1,000.00');
  });

  it('keeps trailing content that the exhibit tail-trim would have dropped', async () => {
    const trailing = para('Final scope note.') + `<w:p><w:r><w:drawing/></w:r></w:p>`;
    const merged = await mergeDocxFiles(AGREEMENT(), [makeDocx(trailing)], undefined, {
      sectionTitle: 'Customer Scope Document',
      verbatim: true
    });

    expect(await textOf(merged)).toContain('Final scope note.');
  });
});

describe('verbatim append strips only what cannot be carried', () => {
  it('removes drawings, unwraps hyperlinks, drops field codes and nested sectPr', async () => {
    const hostile =
      para('Scope intro.') +
      `<w:p><w:r><w:drawing><a:blip r:embed="rId5"/></w:drawing></w:r></w:p>` +
      `<w:p><w:hyperlink r:id="rId9"><w:r><w:t>Linked text</w:t></w:r></w:hyperlink></w:p>` +
      `<w:p><w:r><w:instrText>INCLUDEPICTURE "\\\\attacker.tld\\s\\p.png"</w:instrText></w:r></w:p>` +
      `<w:p><w:pPr><w:sectPr><w:pgSz w:w="1" w:h="1"/></w:sectPr></w:pPr><w:r><w:t>Re-sections host</w:t></w:r></w:p>`;

    const report: Array<Record<string, number>> = [];
    const merged = await mergeDocxFiles(AGREEMENT(), [makeDocx(hostile)], undefined, {
      sectionTitle: 'Customer Scope Document',
      verbatim: true,
      onStripReport: (r) => report.push({ ...r })
    });

    const xml = await rawXml(merged);
    const text = await textOf(merged);

    expect(text).toContain('Scope intro.');
    // Hyperlink is unwrapped, so the words survive but the unusable target does not
    expect(text).toContain('Linked text');
    expect(xml).not.toContain('<w:hyperlink');
    expect(xml).not.toContain('w:drawing');
    expect(xml).not.toContain('INCLUDEPICTURE');
    expect(xml).not.toContain('r:embed');
    expect(xml).not.toContain('r:id="rId9"');
    // The agreement keeps exactly one section definition - its own
    expect(xml.match(/<w:sectPr/g) || []).toHaveLength(1);
    expect(xml).toContain('w:w="12240"');

    expect(report).toHaveLength(1);
    expect(report[0].drawings).toBe(1);
    expect(report[0].hyperlinks).toBe(1);
    expect(report[0].fields).toBeGreaterThan(0);
    expect(report[0].sectionBreaks).toBe(1);
  });
});

describe('verbatim append surfaces failure instead of leaving an orphan header', () => {
  it('rejects a ZIP that is not a Word document and leaves no section header behind', async () => {
    const notWord = new PizZip();
    notWord.file('xl/workbook.xml', '<workbook/>');
    const renamed = new Blob([notWord.generate({ type: 'arraybuffer' })], { type: DOCX_MIME });

    await expect(
      mergeDocxFiles(AGREEMENT(), [renamed], undefined, {
        sectionTitle: 'Customer Scope Document',
        verbatim: true
      })
    ).rejects.toThrow(/word\/document\.xml|no content/i);
  });

  it('rejects an empty document body rather than appending a bare header', async () => {
    await expect(
      mergeDocxFiles(AGREEMENT(), [makeDocx('')], undefined, {
        sectionTitle: 'Customer Scope Document',
        verbatim: true
      })
    ).rejects.toThrow(/no content/i);
  });
});

describe('exhibit path is unaffected by the verbatim option', () => {
  it('still groups, labels and filters when metadata is supplied and options are not', async () => {
    const exhibit = makeDocx(para('Included Feature List', 'Heading1') + para('Mailbox migration.'));

    const merged = await mergeDocxFiles(AGREEMENT(), [exhibit], [
      { name: 'Gmail to Gmail inscope.docx', includeType: 'included' }
    ]);

    const text = await textOf(merged);
    expect(text).toContain('Exhibit 1 - INCLUDED IN MIGRATION');
    expect(text).toContain('Mailbox migration.');
    expect(text).not.toContain('Customer Scope Document');
  });

  it('does not throw on an unreadable exhibit - it warns and skips, as before', async () => {
    const broken = new Blob([new Uint8Array([1, 2, 3, 4])], { type: DOCX_MIME });

    const merged = await mergeDocxFiles(AGREEMENT(), [broken], [
      { name: 'broken.docx', includeType: 'included' }
    ]);

    expect(await textOf(merged)).toContain('CloudFuze Purchase Agreement');
  });
});
