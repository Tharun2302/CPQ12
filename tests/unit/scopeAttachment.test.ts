import { describe, it, expect, vi, beforeEach } from 'vitest';
import PizZip from 'pizzip';
import {
  validateScopeAttachmentMeta,
  isZipContainer,
  validateScopeAttachment,
  inspectScopeAttachment,
  buildScopeWarnings,
  appendScopeAttachment,
  SCOPE_ATTACHMENT_MAX_BYTES,
  SCOPE_ATTACHMENT_SECTION_TITLE,
  DOCX_MIME,
} from '../../src/utils/scopeAttachment';

import type { VerbatimStripReport } from '../../src/utils/docxMerger';

interface MergeOptions {
  sectionTitle?: string;
  verbatim?: boolean;
  onStripReport?: (report: VerbatimStripReport) => void;
}
type MergeArgs = [Blob, Blob[], unknown, MergeOptions | undefined];

const mergeDocxFiles = vi.fn(async (_main: Blob, _blobs: Blob[], _meta: unknown, options?: MergeOptions) => {
  options?.onStripReport?.({ drawings: 2, hyperlinks: 1, fields: 0, sectionBreaks: 0 });
  return new Blob(['merged'], { type: DOCX_MIME });
});
vi.mock('../../src/utils/docxMerger', () => ({
  mergeDocxFiles: (...args: unknown[]) => mergeDocxFiles(...(args as MergeArgs)),
}));

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** A real (if minimal) Word container - validation now looks inside, not just at the signature. */
function docxFile(name = 'scope.docx', bodyXml = '<w:p><w:r><w:t>Scope</w:t></w:r></w:p>'): File {
  const zip = new PizZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body>${bodyXml}</w:body></w:document>`
  );
  return new File([zip.generate({ type: 'arraybuffer' })], name, { type: DOCX_MIME });
}

function zipButNotWord(name = 'scope.docx'): File {
  const zip = new PizZip();
  zip.file('xl/workbook.xml', '<workbook/>');
  return new File([zip.generate({ type: 'arraybuffer' })], name, { type: DOCX_MIME });
}

describe('validateScopeAttachmentMeta', () => {
  it('accepts a Word .docx within the size limit', () => {
    expect(validateScopeAttachmentMeta({ name: 'scope.docx', size: 1024, type: DOCX_MIME })).toEqual({ ok: true });
  });

  it('accepts a .docx with no reported MIME type', () => {
    expect(validateScopeAttachmentMeta({ name: 'Customer Scope.DOCX', size: 10 })).toEqual({ ok: true });
  });

  it('accepts application/octet-stream, which browsers report when Word is not installed', () => {
    expect(
      validateScopeAttachmentMeta({ name: 'scope.docx', size: 10, type: 'application/octet-stream' })
    ).toEqual({ ok: true });
  });

  it('rejects a PDF with an actionable message, not a generic failure', () => {
    const byExtension = validateScopeAttachmentMeta({ name: 'scope.pdf', size: 1024 });
    const byMime = validateScopeAttachmentMeta({ name: 'scope', size: 1024, type: 'application/pdf' });

    for (const result of [byExtension, byMime]) {
      expect(result.ok).toBe(false);
      expect((result as { error: string }).error).toMatch(/\.docx version/);
    }
  });

  it('rejects other extensions', () => {
    for (const name of ['scope.doc', 'scope.txt', 'scope.docx.exe', 'scope']) {
      expect(validateScopeAttachmentMeta({ name, size: 1024 }).ok).toBe(false);
    }
  });

  it('rejects a .docx whose MIME type contradicts the extension', () => {
    expect(validateScopeAttachmentMeta({ name: 'scope.docx', size: 1024, type: 'application/zip' }).ok).toBe(false);
  });

  it('rejects a missing or blank name', () => {
    expect(validateScopeAttachmentMeta({ name: '', size: 1024 }).ok).toBe(false);
    expect(validateScopeAttachmentMeta({ name: '   ', size: 1024 }).ok).toBe(false);
  });

  it('rejects empty and non-finite sizes', () => {
    for (const size of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateScopeAttachmentMeta({ name: 'scope.docx', size }).ok).toBe(false);
    }
  });

  it('accepts exactly the limit and rejects one byte over', () => {
    expect(validateScopeAttachmentMeta({ name: 'scope.docx', size: SCOPE_ATTACHMENT_MAX_BYTES }).ok).toBe(true);

    const over = validateScopeAttachmentMeta({ name: 'scope.docx', size: SCOPE_ATTACHMENT_MAX_BYTES + 1 });
    expect(over.ok).toBe(false);
    expect((over as { error: string }).error).toMatch(/limit is 10\.0 MB/);
  });
});

describe('isZipContainer', () => {
  it('recognises the ZIP local file header', async () => {
    await expect(isZipContainer(docxFile())).resolves.toBe(true);
  });

  it('rejects non-ZIP content and files too short to have a signature', async () => {
    await expect(isZipContainer(new Blob(['%PDF-1.7']))).resolves.toBe(false);
    await expect(isZipContainer(new Blob([new Uint8Array([0x50])]))).resolves.toBe(false);
    await expect(isZipContainer(new Blob([]))).resolves.toBe(false);
  });
});

describe('inspectScopeAttachment', () => {
  it('accepts a real .docx and reports no warnings for plain text', async () => {
    const result = await inspectScopeAttachment(docxFile());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.paragraphs).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it('rejects a valid ZIP that is not a Word document', async () => {
    const result = await inspectScopeAttachment(zipButNotWord());

    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/not a Word document/);
  });

  it('rejects a renamed file that fails the ZIP signature', async () => {
    const renamed = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'scope.docx', { type: DOCX_MIME });
    const result = await inspectScopeAttachment(renamed);

    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/renamed or corrupt/);
  });

  it('rejects a Word document with no paragraphs or tables', async () => {
    const result = await inspectScopeAttachment(docxFile('scope.docx', ''));

    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/appears to be empty/);
  });

  it('warns up front about content the merge cannot carry', async () => {
    const body =
      '<w:p><w:r><w:t>Intro</w:t></w:r></w:p>' +
      '<w:p><w:r><w:drawing/></w:r></w:p>' +
      '<w:p><w:hyperlink><w:r><w:t>link</w:t></w:r></w:hyperlink></w:p>' +
      '<w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>item</w:t></w:r></w:p>';
    const result = await inspectScopeAttachment(docxFile('scope.docx', body));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.drawings).toBe(1);
    expect(result.hyperlinks).toBe(1);
    expect(result.numberedParagraphs).toBe(1);
    expect(result.warnings.join(' ')).toMatch(/image or embedded object/);
    expect(result.warnings.join(' ')).toMatch(/hyperlink/);
    expect(result.warnings.join(' ')).toMatch(/list formatting/);
  });
});

describe('buildScopeWarnings', () => {
  const none = { paragraphs: 3, drawings: 0, hyperlinks: 0, fields: 0, numberedParagraphs: 0 };

  it('says nothing when everything can be carried', () => {
    expect(buildScopeWarnings(none)).toEqual([]);
  });

  it('uses singular and plural correctly', () => {
    expect(buildScopeWarnings({ ...none, drawings: 1 })[0]).toMatch(/^1 image or embedded object /);
    expect(buildScopeWarnings({ ...none, drawings: 3 })[0]).toMatch(/^3 image or embedded objects /);
  });
});

describe('validateScopeAttachment', () => {
  it('accepts a real .docx', async () => {
    await expect(validateScopeAttachment(docxFile())).resolves.toEqual({ ok: true });
  });
});

describe('appendScopeAttachment', () => {
  beforeEach(() => {
    mergeDocxFiles.mockClear();
  });

  it('appends without exhibit metadata and in verbatim mode', async () => {
    const agreement = new Blob(['agreement'], { type: DOCX_MIME });
    const attachment = docxFile();

    const { blob, stripped } = await appendScopeAttachment(agreement, attachment);

    expect(mergeDocxFiles).toHaveBeenCalledTimes(1);
    const [main, blobs, metadata, options] = mergeDocxFiles.mock.calls[0];
    expect(main).toBe(agreement);
    expect(blobs).toEqual([attachment]);
    // Metadata would route the merger down the grouped path and label this an exhibit
    expect(metadata).toBeUndefined();
    // Verbatim disables the exhibit content filters that would delete "included" paragraphs
    expect(options?.verbatim).toBe(true);
    expect(options?.sectionTitle).toBe(SCOPE_ATTACHMENT_SECTION_TITLE);

    expect(blob).toBeInstanceOf(Blob);
    expect(stripped).toEqual({ drawings: 2, hyperlinks: 1, fields: 0, sectionBreaks: 0 });
  });

  it('honours a caller-supplied section title', async () => {
    await appendScopeAttachment(new Blob(['a'], { type: DOCX_MIME }), docxFile(), 'Annexure A');

    expect(mergeDocxFiles.mock.calls[0][3]?.sectionTitle).toBe('Annexure A');
  });

  it('refuses to merge into a non-DOCX agreement', async () => {
    const pdfAgreement = new Blob(['%PDF-'], { type: 'application/pdf' });

    await expect(appendScopeAttachment(pdfAgreement, docxFile())).rejects.toThrow(/only be merged into a DOCX/);
    expect(mergeDocxFiles).not.toHaveBeenCalled();
  });

  it('surfaces the validation error and never reaches the merger', async () => {
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'scope.pdf', { type: 'application/pdf' });

    await expect(appendScopeAttachment(new Blob(['a'], { type: DOCX_MIME }), pdf)).rejects.toThrow(/\.docx version/);
    expect(mergeDocxFiles).not.toHaveBeenCalled();
  });

  it('rejects a valid ZIP that is not a Word document before merging', async () => {
    await expect(
      appendScopeAttachment(new Blob(['a'], { type: DOCX_MIME }), zipButNotWord())
    ).rejects.toThrow(/not a Word document/);
    expect(mergeDocxFiles).not.toHaveBeenCalled();
  });
});
