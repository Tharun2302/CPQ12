import { describe, it, expect, afterEach, vi } from 'vitest';
import PizZip from 'pizzip';
import {
  addErrorReport,
  bufferValidator,
  buildZip,
  datedZipFileName,
  fileNameWithExtension,
  formatFailureLines,
  isZipBuffer,
  pluralize,
  sanitizeZipSegment,
  uniqueName,
  validateFileBuffer,
  withRequestTimeout,
  ZipFetchError,
  DEFAULT_CONCURRENCY,
  DOWNLOAD_ERRORS_FILE_NAME,
  MAX_SEGMENT_LENGTH,
} from '../../src/utils/bulkZipDownload';

type Entry = { path: string; id: string };

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const codePoints = (value: string) => Array.from(value).length;

function makeEntries(count: number): Entry[] {
  return Array.from({ length: count }, (_, i) => ({ id: `id${i}`, path: `Folder/file-${i}.pdf` }));
}

function trackInFlight() {
  const stats = { inFlight: 0, max: 0 };
  const fetchFile = async () => {
    stats.inFlight += 1;
    stats.max = Math.max(stats.max, stats.inFlight);
    await new Promise((resolve) => setTimeout(resolve, 2));
    stats.inFlight -= 1;
    return bytes('data');
  };
  return { stats, fetchFile };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('sanitizeZipSegment', () => {
  it('turns separators into dashes, strips banned characters and falls back when empty', () => {
    expect(sanitizeZipSegment('Box / Drive: v2...', 'x')).toBe('Box - Drive v2');
    expect(sanitizeZipSegment('..', 'fallback')).toBe('fallback');
    expect(sanitizeZipSegment('CON', 'x')).toBe('_CON');
  });
});

describe('fileNameWithExtension', () => {
  it.each([
    ['report.docx', '.pdf', 'report.pdf'],
    ['payload.exe', '.pdf', 'payload.pdf'],
    ['a‮xcod.exe', '.pdf', 'axcod.pdf'],
    ['no extension', '.pdf', 'no extension.pdf'],
    ['scope.pdf', '.docx', 'scope.docx'],
  ])('forces %j to end in %s', (raw, ext, expected) => {
    expect(fileNameWithExtension(raw, ext, 'fallback')).toBe(expected);
  });

  it('uses the given fallback stem when nothing usable survives', () => {
    expect(fileNameWithExtension('???.pdf', '.pdf', 'document')).toBe('document.pdf');
    expect(fileNameWithExtension('', '.pdf', 'document')).toBe('document.pdf');
  });
});

describe('uniqueName', () => {
  it('caps at 80 code points including the (n) suffix', () => {
    const used = new Set<string>();
    const long = `${'d'.repeat(120)}.pdf`;

    const first = uniqueName(long, used);
    const second = uniqueName(long, used);

    expect(MAX_SEGMENT_LENGTH).toBe(80);
    expect(first).toBe(`${'d'.repeat(76)}.pdf`);
    expect(second).toBe(`${'d'.repeat(72)} (2).pdf`);
    expect(codePoints(first)).toBe(80);
    expect(codePoints(second)).toBe(80);
  });

  it('truncates by code point so an emoji is never split', () => {
    const name = uniqueName(`${'a'.repeat(75)}\u{1F600}\u{1F600}.pdf`, new Set());

    expect(name).toBe(`${'a'.repeat(75)}\u{1F600}.pdf`);
    expect(codePoints(name)).toBe(80);
  });

  it('treats case-only differences as collisions', () => {
    const used = new Set<string>();
    uniqueName('Deal.pdf', used);
    expect(uniqueName('DEAL.PDF', used)).toBe('DEAL (2).PDF');
  });

  it('uses the fallback stem when truncation leaves nothing, defaulting to "file"', () => {
    expect(uniqueName('. . .pdf', new Set(), 80, 'document')).toBe('document.pdf');
    expect(uniqueName('. . .pdf', new Set())).toBe('file.pdf');
  });
});

describe('isZipBuffer', () => {
  it('recognises the local-file header and rejects anything shorter or different', () => {
    expect(isZipBuffer(bytes('PK\u0003\u0004rest'))).toBe(true);
    expect(isZipBuffer(bytes('PK'))).toBe(false);
    expect(isZipBuffer(bytes('%PDF-1.7'))).toBe(false);
    expect(isZipBuffer(new ArrayBuffer(0))).toBe(false);
  });
});

describe('validateFileBuffer and bufferValidator', () => {
  it('flags missing and empty data before checking the type', () => {
    const validate = bufferValidator(isZipBuffer, 'Not a valid Word file');

    expect(validateFileBuffer(undefined)).toBe('No file data returned');
    expect(validateFileBuffer(new ArrayBuffer(0))).toBe('Received empty file');
    expect(validateFileBuffer(bytes('anything'))).toBeNull();
    expect(validate(new ArrayBuffer(0))).toBe('Received empty file');
    expect(validate(bytes('<html>'))).toBe('Not a valid Word file');
    expect(validate(bytes('PK\u0003\u0004rest'))).toBeNull();
  });
});

describe('buildZip', () => {
  it('keeps entry order in the zip no matter which request finishes first', async () => {
    const entries = makeEntries(6);
    const delays = [30, 5, 20, 1, 15, 10];

    const { zip, succeeded } = await buildZip(entries, async (entry) => {
      await new Promise((resolve) => setTimeout(resolve, delays[Number(entry.id.slice(2))]));
      return bytes(`body-${entry.id}`);
    });

    expect(succeeded).toBe(6);
    expect(Object.keys(zip.files)).toEqual(entries.map((e) => e.path));
    expect(zip.file('Folder/file-3.pdf')?.asText()).toBe('body-id3');
  });

  it('runs at most 4 requests at once by default, and does run them in parallel', async () => {
    const { stats, fetchFile } = trackInFlight();

    await buildZip(makeEntries(12), fetchFile);

    expect(DEFAULT_CONCURRENCY).toBe(4);
    expect(stats.max).toBe(4);
  });

  it('honours a custom concurrency', async () => {
    const { stats, fetchFile } = trackInFlight();

    await buildZip(makeEntries(6), fetchFile, { concurrency: 2 });

    expect(stats.max).toBe(2);
  });

  it('reports progress once per entry, ending at (n, n)', async () => {
    const calls: [number, number][] = [];

    await buildZip(makeEntries(5), async () => bytes('x'), {
      onProgress: (done, total) => calls.push([done, total]),
    });

    expect(calls).toEqual([[1, 5], [2, 5], [3, 5], [4, 5], [5, 5]]);
  });

  it('carries the code of a ZipFetchError into the failure, e.g. "pending"', async () => {
    const { failed, succeeded } = await buildZip(makeEntries(3), async (entry) => {
      if (entry.id === 'id1') throw new ZipFetchError('Approval pending', 'pending');
      if (entry.id === 'id2') throw new Error('Failed to download file (500)');
      return bytes('ok');
    });

    expect(succeeded).toBe(1);
    expect(failed).toEqual([
      { path: 'Folder/file-1.pdf', error: 'Approval pending', code: 'pending' },
      { path: 'Folder/file-2.pdf', error: 'Failed to download file (500)' },
    ]);
    expect(failed[1]).not.toHaveProperty('code');
  });

  it('ignores a code on any other error, so library codes never look like "pending"', async () => {
    const networkError = Object.assign(new Error('socket hang up'), { code: 'pending' });

    const { failed } = await buildZip(makeEntries(1), () => Promise.reject(networkError));

    expect(failed).toEqual([{ path: 'Folder/file-0.pdf', error: 'socket hang up' }]);
  });

  it('applies the validate option and records its message', async () => {
    const validate = bufferValidator(isZipBuffer, 'Not a valid Word file');

    const { failed, succeeded } = await buildZip(
      makeEntries(2),
      async (entry) => bytes(entry.id === 'id0' ? 'PK\u0003\u0004rest' : '<html>'),
      { validate },
    );

    expect(succeeded).toBe(1);
    expect(failed).toEqual([{ path: 'Folder/file-1.pdf', error: 'Not a valid Word file' }]);
  });

  it('by default accepts any non-empty buffer and rejects an empty one', async () => {
    const { failed, succeeded } = await buildZip(
      makeEntries(2),
      async (entry) => (entry.id === 'id0' ? bytes('plain') : new ArrayBuffer(0)),
    );

    expect(succeeded).toBe(1);
    expect(failed).toEqual([{ path: 'Folder/file-1.pdf', error: 'Received empty file' }]);
  });

  it('turns non-Error rejections into readable text', async () => {
    const { failed } = await buildZip(makeEntries(3), async (entry) => {
      if (entry.id === 'id0') throw 'offline';
      if (entry.id === 'id1') throw { status: 500 };
      throw undefined;
    });

    expect(failed.map((f) => f.error)).toEqual(['offline', '{"status":500}', 'Unknown error']);
  });

  it('leaves the error report to the caller', async () => {
    const { zip } = await buildZip(makeEntries(1), async () => {
      throw new Error('down');
    });

    expect(Object.keys(zip.files)).toEqual([]);
  });

  it('handles an empty entry list', async () => {
    const onProgress = vi.fn();

    const { zip, succeeded, failed } = await buildZip([], async () => bytes('x'), { onProgress });

    expect(succeeded).toBe(0);
    expect(failed).toEqual([]);
    expect(Object.keys(zip.files)).toEqual([]);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('produces a zip that reads back with the same paths', async () => {
    const entries = makeEntries(3);
    const { zip } = await buildZip(entries, async () => bytes('%PDF-1.7'));

    const reread = new PizZip(zip.generate({ type: 'uint8array', compression: 'STORE' }));

    expect(Object.keys(reread.files)).toEqual(entries.map((e) => e.path));
  });
});

describe('formatFailureLines and addErrorReport', () => {
  const failures = [
    { path: 'A/one.pdf', error: 'Failed to download file (500)' },
    { path: 'B/two.pdf', error: 'Approval pending', code: 'pending' },
  ];

  it('writes one CRLF-terminated line per failure with the chosen separator', () => {
    expect(formatFailureLines(failures)).toBe(
      'A/one.pdf - Failed to download file (500)\r\nB/two.pdf - Approval pending\r\n',
    );
    expect(formatFailureLines(failures, ' – ')).toBe(
      'A/one.pdf – Failed to download file (500)\r\nB/two.pdf – Approval pending\r\n',
    );
  });

  it('adds the report at the zip root only when something failed', () => {
    const empty = new PizZip();
    addErrorReport(empty, [], () => 'never');
    expect(empty.file(DOWNLOAD_ERRORS_FILE_NAME)).toBeNull();

    const zip = new PizZip();
    addErrorReport(zip, failures, (list) => `${list.length} problems`);
    expect(zip.file(DOWNLOAD_ERRORS_FILE_NAME)?.asText()).toBe('2 problems');
  });
});

describe('withRequestTimeout', () => {
  it('rejects with a timeout message and aborts the task signal', async () => {
    vi.useFakeTimers();
    let taskSignal: AbortSignal | undefined;
    const result = withRequestTimeout((signal) => {
      taskSignal = signal;
      return new Promise(() => {});
    }, 60_000);
    const assertion = expect(result).rejects.toThrow('Timed out after 60 s');

    await vi.advanceTimersByTimeAsync(60_000);

    await assertion;
    expect(taskSignal?.aborted).toBe(true);
  });

  it('rejects as cancelled when the parent signal aborts', async () => {
    const parent = new AbortController();
    const result = withRequestTimeout(() => new Promise(() => {}), 60_000, parent.signal);
    await Promise.resolve();

    parent.abort();

    await expect(result).rejects.toThrow('Download cancelled');
  });

  it('passes a ZipFetchError through untouched so its code survives', async () => {
    const error = new ZipFetchError('Approval pending', 'pending');

    await expect(withRequestTimeout(async () => {
      throw error;
    }, 60_000)).rejects.toBe(error);
  });
});

describe('pluralize and datedZipFileName', () => {
  it('pluralizes by count', () => {
    expect(pluralize(1, 'document')).toBe('1 document');
    expect(pluralize(0, 'document')).toBe('0 documents');
    expect(pluralize(537, 'document')).toBe('537 documents');
  });

  it('formats the local date after the prefix', () => {
    expect(datedZipFileName('deal-documents', new Date(2026, 0, 5, 23, 59)))
      .toBe('deal-documents-2026-01-05.zip');
    expect(datedZipFileName('exhibits', new Date(2026, 11, 31))).toBe('exhibits-2026-12-31.zip');
    expect(datedZipFileName('x')).toMatch(/^x-\d{4}-\d{2}-\d{2}\.zip$/);
  });
});
