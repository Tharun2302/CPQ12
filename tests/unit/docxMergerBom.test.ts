// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PizZip from 'pizzip';
import { mergeDocxFiles, parseOoxml } from '../../src/utils/docxMerger';
import { DOCX_MIME } from '../../src/utils/scopeAttachment';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const BOM = '\uFEFF';

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `</Types>`;

const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

function documentXml(bodyXml: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}" xmlns:r="${R}">` +
    `<w:body>${bodyXml}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body>` +
    `</w:document>`
  );
}

// prefix carries the UTF-8 BOM that non-Word exhibit tooling writes ahead of the declaration
function makeDocx(bodyXml: string, prefix = '', extraParts: Record<string, string> = {}): Blob {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/document.xml', prefix + documentXml(bodyXml));
  for (const [name, content] of Object.entries(extraParts)) zip.file(name, content);
  return new Blob([zip.generate({ type: 'arraybuffer' })], { type: DOCX_MIME });
}

function para(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

async function textOf(blob: Blob): Promise<string> {
  const zip = new PizZip(await blob.arrayBuffer());
  const xml = zip.file('word/document.xml')?.asText() || '';
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

const AGREEMENT = () => makeDocx(para('CloudFuze Purchase Agreement'));

describe('parseOoxml', () => {
  it('strips the leading BOM before the string reaches the parser', () => {
    const real = new DOMParser();
    const seen: string[] = [];
    const spy = {
      parseFromString: (xml: string, type: string) => {
        seen.push(xml);
        return real.parseFromString(xml, type as DOMParserSupportedType);
      }
    } as unknown as DOMParser;

    // jsdom tolerates the BOM, so assert on the string handed to the parser, not the result
    parseOoxml(BOM + documentXml(para('Hello')), spy);

    expect(seen).toHaveLength(1);
    expect(seen[0].startsWith(BOM)).toBe(false);
    expect(seen[0].charCodeAt(0)).not.toBe(0xfeff);
    expect(seen[0].startsWith('<?xml')).toBe(true);
  });

  it('returns a document with a reachable w:body for BOM-prefixed XML', () => {
    const doc = parseOoxml(BOM + documentXml(para('Hello')), new DOMParser());

    expect(doc).not.toBeNull();
    expect(doc!.documentElement.nodeName).toBe('w:document');
    expect(doc!.getElementsByTagName('w:body')[0]).toBeTruthy();
  });

  it('returns null for genuinely malformed XML instead of a parsererror document', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(parseOoxml('<w:document><w:body></w:document>', new DOMParser())).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('returns a document unchanged when there is no BOM', () => {
    const doc = parseOoxml(documentXml(para('Hello')), new DOMParser());
    expect(doc).not.toBeNull();
    expect(doc!.getElementsByTagName('w:t')[0].textContent).toBe('Hello');
  });
});

// jsdom tolerates a leading BOM but Chromium does not, so these tests would pass against the
// unfixed code. Swap in a parser that rejects the BOM the way the browser actually does.
function useChromiumLikeParser() {
  const Real = globalThis.DOMParser;
  const PARSERERROR =
    `<html xmlns="http://www.w3.org/1999/xhtml"><body>` +
    `<parsererror>XML declaration allowed only at the start of the document</parsererror>` +
    `</body></html>`;

  beforeEach(() => {
    globalThis.DOMParser = class {
      parseFromString(xml: string, type: string) {
        const real = new Real();
        return xml.charCodeAt(0) === 0xfeff
          ? real.parseFromString(PARSERERROR, 'text/xml')
          : real.parseFromString(xml, type as DOMParserSupportedType);
      }
    } as unknown as typeof DOMParser;
  });

  afterEach(() => {
    globalThis.DOMParser = Real;
  });
}

describe('mergeDocxFiles with BOM-prefixed parts', () => {
  useChromiumLikeParser();

  it('merges a BOM-prefixed exhibit instead of silently skipping it', async () => {
    // Exhibit shape mirrors prod: own banner paragraph (dropped by skipFirstHeading) then rows
    const exhibit = makeDocx(
      para('NOT INCLUDED IN MIGRATION FEATURES') + para('Public channel message history'),
      BOM
    );

    const merged = await mergeDocxFiles(AGREEMENT(), [exhibit], [
      { name: 'Slack to Teams Standard Plan - Standard Not Include', includeType: 'notincluded' }
    ]);

    const text = await textOf(merged);
    expect(text).toContain('Public channel message history');
    expect(text).toContain('CloudFuze Purchase Agreement');
    expect(text).toContain('Exhibit 2 - NOT INCLUDED IN MIGRATION FEATURES');
  });

  it('merges when the main document itself carries a BOM', async () => {
    const main = makeDocx(para('CloudFuze Purchase Agreement'), BOM);
    const exhibit = makeDocx(para('Included feature row'));

    const merged = await mergeDocxFiles(main, [exhibit], [
      { name: 'Slack to Teams Standard Plan', includeType: 'included' }
    ]);

    const text = await textOf(merged);
    expect(text).toContain('CloudFuze Purchase Agreement');
    expect(text).toContain('Included feature row');
  });

  it('merges styles from an exhibit whose styles.xml carries a BOM', async () => {
    const styles = (id: string) =>
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:styles xmlns:w="${W}"><w:style w:type="table" w:styleId="${id}"/></w:styles>`;

    const main = makeDocx(para('CloudFuze Purchase Agreement'), '', { 'word/styles.xml': styles('MainGrid') });
    const exhibit = makeDocx(para('Exhibit row'), BOM, { 'word/styles.xml': BOM + styles('ExhibitGrid') });

    const merged = await mergeDocxFiles(main, [exhibit], [
      { name: 'Slack to Teams Standard Plan', includeType: 'included' }
    ]);

    const mergedStyles = new PizZip(await merged.arrayBuffer()).file('word/styles.xml')?.asText() || '';
    expect(mergedStyles).toContain('ExhibitGrid');
    expect(await textOf(merged)).toContain('Exhibit row');
  });

  it('throws under verbatim when a BOM exhibit cannot be parsed, rather than leaving an orphan header', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Malformed even after the BOM strip, so the parse fails for a real reason
      const broken = new Blob([(() => {
        const zip = new PizZip();
        zip.file('[Content_Types].xml', CONTENT_TYPES);
        zip.file('_rels/.rels', ROOT_RELS);
        zip.file('word/document.xml', `${BOM}<w:document><w:body></w:document>`);
        return zip.generate({ type: 'arraybuffer' });
      })()], { type: DOCX_MIME });

      await expect(
        mergeDocxFiles(AGREEMENT(), [broken], undefined, { sectionTitle: 'Scope', verbatim: true })
      ).rejects.toThrow(/could not be parsed/i);
    } finally {
      warn.mockRestore();
    }
  });
});
