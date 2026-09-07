import type { VerbatimStripReport } from './docxMerger';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const SCOPE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const SCOPE_ATTACHMENT_SECTION_TITLE = 'Customer Scope Document';

export interface ScopeAttachmentMeta {
  name: string;
  size: number;
  type?: string;
}

export type ScopeAttachmentCheck = { ok: true } | { ok: false; error: string };

export interface ScopeAttachmentCounts {
  paragraphs: number;
  drawings: number;
  hyperlinks: number;
  fields: number;
  numberedParagraphs: number;
}

export type ScopeAttachmentInspection =
  | ({ ok: true; warnings: string[] } & ScopeAttachmentCounts)
  | { ok: false; error: string };

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function countMatches(xml: string, pattern: RegExp): number {
  return (xml.match(pattern) || []).length;
}

function plural(n: number, word: string): string {
  return n + ' ' + word + (n === 1 ? '' : 's');
}

/**
 * Validates name/size/type before any bytes are read. Kept separate from the
 * container checks so it stays synchronous and cheap enough to drive the UI.
 */
export function validateScopeAttachmentMeta(file: ScopeAttachmentMeta): ScopeAttachmentCheck {
  const name = String(file?.name || '').trim();
  if (!name) {
    return { ok: false, error: 'The selected file has no name.' };
  }

  const lower = name.toLowerCase();

  // A PDF cannot be spliced into word/document.xml, so say so instead of failing in the ZIP parser
  if (lower.endsWith('.pdf') || file?.type === 'application/pdf') {
    return {
      ok: false,
      error: 'PDF scope documents cannot be merged into the agreement. Please upload the .docx version.'
    };
  }

  if (!lower.endsWith('.docx')) {
    return { ok: false, error: 'Only .docx scope documents can be merged into the agreement.' };
  }

  // Browsers report application/octet-stream when Word is not installed, and File.type is
  // derived from the extension anyway. Only a positively contradictory type is worth rejecting.
  if (file.type && file.type !== DOCX_MIME && file.type !== 'application/octet-stream') {
    return { ok: false, error: 'That file is not a Word .docx document.' };
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, error: 'The selected file is empty.' };
  }

  if (file.size > SCOPE_ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      error: 'Scope document is ' + formatMb(file.size) + '. The limit is ' + formatMb(SCOPE_ATTACHMENT_MAX_BYTES) + '.'
    };
  }

  return { ok: true };
}

/**
 * A .docx extension proves nothing about the contents, and PizZip reports a
 * renamed or corrupt file as an opaque parse error.
 */
export async function isZipContainer(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  return head.length === 2 && head[0] === 0x50 && head[1] === 0x4b;
}

export function buildScopeWarnings(counts: ScopeAttachmentCounts): string[] {
  const warnings: string[] = [];

  // Only word/document.xml and word/styles.xml are copied, so anything addressed through
  // a relationship id cannot come with it. Say so before the user commits to the file.
  if (counts.drawings > 0) {
    warnings.push(plural(counts.drawings, 'image or embedded object') + ' cannot be carried over and will be omitted from the agreement.');
  }
  if (counts.hyperlinks > 0) {
    warnings.push(plural(counts.hyperlinks, 'hyperlink') + ' will appear as plain text.');
  }
  if (counts.fields > 0) {
    warnings.push(plural(counts.fields, 'field code') + ' will be replaced by their current text.');
  }
  if (counts.numberedParagraphs > 0) {
    warnings.push('Numbered and bulleted list formatting may differ from the original.');
  }

  return warnings;
}

/**
 * Opens the container and confirms it really is a Word document, then reports what
 * the merge cannot preserve. Run at attach time: discovering an unusable file at
 * generation time, after the agreement is already built, is far more expensive.
 */
export async function inspectScopeAttachment(
  file: File | (Blob & ScopeAttachmentMeta)
): Promise<ScopeAttachmentInspection> {
  const meta = validateScopeAttachmentMeta({ name: file.name, size: file.size, type: file.type });
  if (!meta.ok) {
    return meta;
  }

  if (!(await isZipContainer(file))) {
    return { ok: false, error: 'That file is not a valid .docx document (it may be renamed or corrupt).' };
  }

  let xml: string | undefined;
  try {
    const PizZip = (await import('pizzip')).default;
    const zip = new PizZip(await file.arrayBuffer());
    xml = zip.file('word/document.xml')?.asText();
  } catch {
    return { ok: false, error: 'That .docx file could not be opened (it may be corrupt).' };
  }

  if (!xml) {
    // A renamed .xlsx or .zip passes the PK signature check but has no Word body
    return { ok: false, error: 'That file is a ZIP archive but not a Word document.' };
  }

  // The trailing class must allow "/" - OOXML writes plenty of empty elements as <w:numPr/>
  const counts: ScopeAttachmentCounts = {
    paragraphs: countMatches(xml, /<w:p[ >/]/g),
    drawings: countMatches(xml, /<w:(drawing|pict|object|altChunk)[ >/]/g),
    hyperlinks: countMatches(xml, /<w:hyperlink[ >/]/g),
    fields: countMatches(xml, /<w:(fldSimple|instrText)[ >/]/g),
    numberedParagraphs: countMatches(xml, /<w:numPr[ >/]/g)
  };

  if (counts.paragraphs === 0 && !/<w:tbl[ >/]/.test(xml)) {
    return { ok: false, error: 'That document appears to be empty.' };
  }

  return { ok: true, ...counts, warnings: buildScopeWarnings(counts) };
}

export async function validateScopeAttachment(
  file: File | (Blob & ScopeAttachmentMeta)
): Promise<ScopeAttachmentCheck> {
  const inspection = await inspectScopeAttachment(file);
  return inspection.ok ? { ok: true } : inspection;
}

export interface ScopeAppendResult {
  blob: Blob;
  stripped: VerbatimStripReport;
}

/**
 * Appends a validated scope document to the end of an already-generated agreement.
 *
 * Passes no exhibit metadata on purpose: metadata routes the merger through its
 * grouped path, which would stamp the scope document as "Exhibit 1 - INCLUDED IN
 * MIGRATION" and strip its first heading. `verbatim` is equally load-bearing - it
 * disables the merger's exhibit-oriented content filters, which would otherwise
 * delete any heading or long paragraph containing the word "included", and makes
 * merge failures throw instead of silently producing an empty section.
 */
export async function appendScopeAttachment(
  agreementDocx: Blob,
  attachment: File | (Blob & ScopeAttachmentMeta),
  sectionTitle: string = SCOPE_ATTACHMENT_SECTION_TITLE
): Promise<ScopeAppendResult> {
  const check = await validateScopeAttachment(attachment);
  if (!check.ok) {
    throw new Error(check.error);
  }

  if (agreementDocx.type && agreementDocx.type !== DOCX_MIME) {
    throw new Error('The scope document can only be merged into a DOCX agreement.');
  }

  let stripped: VerbatimStripReport = { drawings: 0, hyperlinks: 0, fields: 0, sectionBreaks: 0 };

  const { mergeDocxFiles } = await import('./docxMerger');
  const blob = await mergeDocxFiles(agreementDocx, [attachment], undefined, {
    sectionTitle,
    verbatim: true,
    onStripReport: (report) => {
      stripped = report;
    }
  });

  return { blob, stripped };
}
