import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import downloadUtils from '../../zoho-sign-download.cjs';

const { resolveZohoDocumentOnlyPdf, resetDocumentOnlyState, FAILURE_COOLDOWN_MS } = downloadUtils as {
  resolveZohoDocumentOnlyPdf: (args: {
    doc: Record<string, unknown> | null;
    client: { downloadPdf: (...a: unknown[]) => Promise<{ buffer: Buffer }> };
    saveDocumentOnly?: (buffer: Buffer) => Promise<void>;
    log?: (m: string) => void;
    now?: () => number;
  }) => Promise<Buffer | null>;
  resetDocumentOnlyState: () => void;
  FAILURE_COOLDOWN_MS: number;
};

const signedDoc = (extra: Record<string, unknown> = {}) => ({
  _id: 'doc1',
  zoho_request_id: 'req1',
  zoho_signed_file_path: '/uploads/signed/signed-doc1.pdf',
  ...extra
});

const pdfClient = (body = '%PDF-1.7 document only') => ({
  downloadPdf: vi.fn().mockResolvedValue({ buffer: Buffer.from(body) })
});

const tempFiles: string[] = [];
afterEach(() => {
  resetDocumentOnlyState();
  tempFiles.splice(0).forEach(f => fs.rmSync(f, { force: true }));
});

describe('resolveZohoDocumentOnlyPdf', () => {
  it('asks Zoho for the merged document without the completion certificate', async () => {
    const client = pdfClient();
    const result = await resolveZohoDocumentOnlyPdf({ doc: signedDoc(), client });

    expect(client.downloadPdf).toHaveBeenCalledWith('req1', { withCoc: false, merge: true });
    expect(result?.toString()).toBe('%PDF-1.7 document only');
  });

  it('caches the fetched copy through saveDocumentOnly', async () => {
    const saveDocumentOnly = vi.fn().mockResolvedValue(undefined);
    await resolveZohoDocumentOnlyPdf({ doc: signedDoc(), client: pdfClient(), saveDocumentOnly });
    expect(saveDocumentOnly).toHaveBeenCalledWith(Buffer.from('%PDF-1.7 document only'));
  });

  it('serves the cached copy without calling Zoho again', async () => {
    const cachedPath = path.join(os.tmpdir(), `zoho-doc-only-${Date.now()}.pdf`);
    fs.writeFileSync(cachedPath, '%PDF cached');
    tempFiles.push(cachedPath);
    const client = pdfClient();

    const result = await resolveZohoDocumentOnlyPdf({
      doc: signedDoc({ zoho_document_only_file_path: cachedPath }),
      client
    });

    expect(result?.toString()).toBe('%PDF cached');
    expect(client.downloadPdf).not.toHaveBeenCalled();
  });

  it('refetches when the cached file is gone from disk', async () => {
    const client = pdfClient();
    await resolveZohoDocumentOnlyPdf({
      doc: signedDoc({ zoho_document_only_file_path: '/nonexistent/doc-only.pdf' }),
      client
    });
    expect(client.downloadPdf).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['in-house (no Zoho request)', { zoho_request_id: undefined }],
    ['Zoho but not yet signed', { zoho_signed_file_path: undefined }]
  ])('leaves %s documents to the normal download', async (_label, extra) => {
    const client = pdfClient();
    expect(await resolveZohoDocumentOnlyPdf({ doc: signedDoc(extra), client })).toBeNull();
    expect(client.downloadPdf).not.toHaveBeenCalled();
  });

  it('returns null when Zoho fails so the stored file is served instead', async () => {
    const log = vi.fn();
    const client = { downloadPdf: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { code: 'RATE_LIMITED' })) };
    expect(await resolveZohoDocumentOnlyPdf({ doc: signedDoc(), client, log })).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('RATE_LIMITED'));
  });

  it('rejects a non-PDF response such as a zip', async () => {
    const saveDocumentOnly = vi.fn();
    const result = await resolveZohoDocumentOnlyPdf({
      doc: signedDoc(),
      client: pdfClient('PK\u0003\u0004zip'),
      saveDocumentOnly
    });
    expect(result).toBeNull();
    expect(saveDocumentOnly).not.toHaveBeenCalled();
  });

  it('still serves the PDF when caching it fails', async () => {
    const saveDocumentOnly = vi.fn().mockRejectedValue(new Error('disk full'));
    const result = await resolveZohoDocumentOnlyPdf({ doc: signedDoc(), client: pdfClient(), saveDocumentOnly });
    expect(result?.toString()).toBe('%PDF-1.7 document only');
  });

  it('shares one Zoho request between simultaneous first downloads', async () => {
    const client = pdfClient();
    const [a, b] = await Promise.all([
      resolveZohoDocumentOnlyPdf({ doc: signedDoc(), client }),
      resolveZohoDocumentOnlyPdf({ doc: signedDoc(), client })
    ]);
    expect(client.downloadPdf).toHaveBeenCalledTimes(1);
    expect(a?.toString()).toBe(b?.toString());
  });

  it('does not call Zoho again during the cooldown after a failure, then retries', async () => {
    let clock = 1_000_000;
    const now = () => clock;
    const client = { downloadPdf: vi.fn().mockRejectedValue(new Error('down')) };

    await resolveZohoDocumentOnlyPdf({ doc: signedDoc(), client, now });
    expect(await resolveZohoDocumentOnlyPdf({ doc: signedDoc(), client, now })).toBeNull();
    expect(client.downloadPdf).toHaveBeenCalledTimes(1);

    clock += FAILURE_COOLDOWN_MS;
    client.downloadPdf.mockResolvedValue({ buffer: Buffer.from('%PDF ok') });
    expect((await resolveZohoDocumentOnlyPdf({ doc: signedDoc(), client, now }))?.toString()).toBe('%PDF ok');
    expect(client.downloadPdf).toHaveBeenCalledTimes(2);
  });

  it('falls back instead of waiting when Zoho is too slow', async () => {
    const log = vi.fn();
    const client = { downloadPdf: vi.fn(() => new Promise<{ buffer: Buffer }>(() => {})) };
    expect(await resolveZohoDocumentOnlyPdf({ doc: signedDoc(), client, log, deadlineMs: 20 })).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('DEADLINE_EXCEEDED'));
  });
});
