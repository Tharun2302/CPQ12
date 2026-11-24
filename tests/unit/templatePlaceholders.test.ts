import { describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import { placeholderNamesInDocx, templateTagsOfFile } from '../../src/utils/templatePlaceholders';

const run = (text: string) => `<w:r><w:t>${text}</w:t></w:r>`;
const xml = (...runs: string[]) => `<w:document><w:body><w:p>${runs.join('')}</w:p></w:body></w:document>`;

function makeDocx(parts: Record<string, string>): Uint8Array {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<Types/>');
  for (const [name, content] of Object.entries(parts)) zip.file(name, content);
  return zip.generate({ type: 'uint8array' });
}

describe('placeholderNamesInDocx', () => {
  it('reads tags split across runs, trimmed, including headers and footers', () => {
    const docx = makeDocx({
      'word/document.xml': xml(run('Effective {{Effective'), run(' Date}} until {{ service_end_date }}')),
      'word/footer1.xml': xml(run('{{Company Name}}')),
    });
    expect(placeholderNamesInDocx(docx).sort()).toEqual(['Company Name', 'Effective Date', 'service_end_date']);
  });

  it('counts tags missing a closing brace, which the renderer repairs and prints', () => {
    const docx = makeDocx({
      'word/document.xml': xml(run('Effective {{Date} (the Effective Date), {{Company_Name}By and {{end_date}}')),
    });
    expect(placeholderNamesInDocx(docx).sort()).toEqual(['Company_Name', 'Date', 'end_date']);
  });

  it('ignores Word parts outside word/', () => {
    const docx = makeDocx({ 'word/document.xml': xml(run('none')), 'docProps/core.xml': '<x>{{quote_expiry_date}}</x>' });
    expect(placeholderNamesInDocx(docx)).toEqual([]);
  });
});

describe('templateTagsOfFile', () => {
  it('returns the tags of a DOCX file', async () => {
    const file = new Blob([makeDocx({ 'word/document.xml': xml(run('{{Date}}')) }) as BlobPart]);
    expect(await templateTagsOfFile(file)).toEqual(['Date']);
  });

  it('returns null for no file or a file that is not a DOCX, keeping Edit Dates strict', async () => {
    expect(await templateTagsOfFile(null)).toBeNull();
    expect(await templateTagsOfFile(new Blob(['%PDF-1.4 not a zip']))).toBeNull();
  });
});
