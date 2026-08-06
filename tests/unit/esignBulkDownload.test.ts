import { describe, it, expect } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import bulkUtils from '../../esign-bulk-download-utils.cjs';

const { BULK_DOWNLOAD_MAX_DOCS, uniqueZipEntryName, normalizeBulkDownloadIds } = bulkUtils as {
  BULK_DOWNLOAD_MAX_DOCS: number;
  uniqueZipEntryName: (raw: unknown, fallbackId: string, used: Set<string>) => string;
  normalizeBulkDownloadIds: (raw: unknown) => string[];
};

const oid = (suffix: string) => `507f1f77bcf86cd7994${suffix.padStart(5, '0')}`;

describe('uniqueZipEntryName', () => {
  it('keeps a clean pdf name as-is', () => {
    expect(uniqueZipEntryName('CloudFuze Agreement.pdf', 'abc', new Set())).toBe('CloudFuze Agreement.pdf');
  });

  it('appends .pdf when the stored file name has no extension', () => {
    expect(uniqueZipEntryName('Vendasta 2026-08-05', 'abc', new Set())).toBe('Vendasta 2026-08-05.pdf');
  });

  it('suffixes duplicates instead of overwriting the earlier zip entry', () => {
    const used = new Set<string>();
    expect(uniqueZipEntryName('Agreement.pdf', 'a', used)).toBe('Agreement.pdf');
    expect(uniqueZipEntryName('Agreement.pdf', 'b', used)).toBe('Agreement-2.pdf');
    expect(uniqueZipEntryName('Agreement.pdf', 'c', used)).toBe('Agreement-3.pdf');
  });

  it('treats case-differing names as collisions, since Windows zips are case-insensitive', () => {
    const used = new Set<string>();
    uniqueZipEntryName('Agreement.pdf', 'a', used);
    expect(uniqueZipEntryName('AGREEMENT.pdf', 'b', used)).toBe('AGREEMENT-2.pdf');
  });

  it('strips path separators and other unsafe characters', () => {
    expect(uniqueZipEntryName('../../etc/pass:wd?.pdf', 'a', new Set())).toBe('.._.._etc_pass_wd_.pdf');
  });

  it('falls back to the document id when the name is empty or missing', () => {
    expect(uniqueZipEntryName('', 'doc1', new Set())).toBe('document-doc1.pdf');
    expect(uniqueZipEntryName(null, 'doc2', new Set())).toBe('document-doc2.pdf');
    expect(uniqueZipEntryName('   ', 'doc3', new Set())).toBe('document-doc3.pdf');
  });

  it('caps very long names so the zip entry stays writable on all platforms', () => {
    const name = uniqueZipEntryName(`${'x'.repeat(400)}.pdf`, 'a', new Set());
    expect(name.length).toBe(150);
    expect(name.endsWith('.pdf')).toBe(true);
  });
});

describe('normalizeBulkDownloadIds', () => {
  it('keeps valid ObjectId hex strings in order', () => {
    expect(normalizeBulkDownloadIds([oid('1'), oid('2')])).toEqual([oid('1'), oid('2')]);
  });

  it('de-duplicates repeated ids so a file is zipped once', () => {
    expect(normalizeBulkDownloadIds([oid('1'), oid('1'), oid('2')])).toEqual([oid('1'), oid('2')]);
  });

  it('drops malformed ids rather than failing the whole download', () => {
    expect(normalizeBulkDownloadIds([oid('1'), 'not-an-id', '', null, undefined, 123, oid('2')]))
      .toEqual([oid('1'), oid('2')]);
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeBulkDownloadIds([`  ${oid('1')}  `])).toEqual([oid('1')]);
  });

  it('returns an empty list for non-array input', () => {
    expect(normalizeBulkDownloadIds(null)).toEqual([]);
    expect(normalizeBulkDownloadIds('abc')).toEqual([]);
    expect(normalizeBulkDownloadIds({})).toEqual([]);
  });

  it('exposes a per-request document cap the endpoint enforces', () => {
    expect(BULK_DOWNLOAD_MAX_DOCS).toBe(200);
  });
});
