import { describe, it, expect, afterEach, vi } from 'vitest';
import PizZip from 'pizzip';
import {
  buildExhibitsZip,
  buildZipEntries,
  bulkResultMessage,
  docxFileName,
  exhibitsZipFileName,
  sanitizeZipSegment,
  uniqueName,
  withRequestTimeout,
  DOWNLOAD_ERRORS_FILE_NAME,
  MAX_SEGMENT_LENGTH,
  type ZipEntry,
  type ZipExhibit,
} from '../../src/utils/exhibitBulkDownload';

const ZIP_HEADER = 'PK\u0003\u0004';

const docxBytes = (text: string) =>
  new TextEncoder().encode(`${ZIP_HEADER}${text}`).buffer as ArrayBuffer;
const plainBytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const codePoints = (value: string) => Array.from(value).length;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const hasLoneSurrogate = (value: string) => LONE_SURROGATE.test(value);

function makeEntries(count: number): ZipEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    exhibit: { _id: `id${i}`, name: `Exhibit ${i}` },
    path: `Folder/file-${i}.docx`,
  }));
}

function trackInFlight() {
  const stats = { inFlight: 0, max: 0 };
  const fetchFile = async () => {
    stats.inFlight += 1;
    stats.max = Math.max(stats.max, stats.inFlight);
    await new Promise((resolve) => setTimeout(resolve, 2));
    stats.inFlight -= 1;
    return docxBytes('x');
  };
  return { stats, fetchFile };
}

async function failureFor(rejection: unknown): Promise<string> {
  const { failed } = await buildExhibitsZip(makeEntries(1), () => Promise.reject(rejection));
  return failed[0].error;
}

async function failureForData(data: unknown): Promise<string> {
  const { failed } = await buildExhibitsZip(makeEntries(1), async () => data as ArrayBuffer);
  return failed[0].error;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('sanitizeZipSegment', () => {
  it.each([':', '*', '?', '"', '<', '>', '|'])('strips the banned character %s', (ch) => {
    expect(sanitizeZipSegment(`Box${ch}Drive`, 'x')).toBe('BoxDrive');
  });

  it.each([
    ['OneDrive/SharePoint Online', 'OneDrive-SharePoint Online'],
    ['OneDrive\\SharePoint', 'OneDrive-SharePoint'],
    ['Box / Dropbox', 'Box - Dropbox'],
    ['a//b\\\\c', 'a-b-c'],
    ['a - / - b', 'a - b'],
  ])('turns path separators in %j into a single dash', (input, expected) => {
    expect(sanitizeZipSegment(input, 'x')).toBe(expected);
  });

  it('folds full-width look-alikes with NFKC before cleaning', () => {
    expect(sanitizeZipSegment('Box／Drive', 'x')).toBe('Box-Drive');
    expect(sanitizeZipSegment('Box：Drive？', 'x')).toBe('BoxDrive');
  });

  it('strips bidi overrides, zero-width characters and the BOM', () => {
    expect(sanitizeZipSegment('a‮xcod​‍﻿⁦b', 'x')).toBe('axcodb');
  });

  it('strips C0 and C1 control characters and collapses whitespace', () => {
    const noisy = 'Box\u0000 to\u0007\u001f   Drive\t\nPlan\u0085\u009f';
    expect(sanitizeZipSegment(noisy, 'x')).toBe('Box to Drive Plan');
  });

  it('does not leave a double space where a banned character sat between words', () => {
    expect(sanitizeZipSegment('Box : Drive', 'x')).toBe('Box Drive');
  });

  it('strips trailing dots and spaces, which Windows cannot extract', () => {
    expect(sanitizeZipSegment('Scope v2...', 'x')).toBe('Scope v2');
    expect(sanitizeZipSegment('Scope . . ', 'x')).toBe('Scope');
  });

  it('turns path-traversal segments into the fallback', () => {
    expect(sanitizeZipSegment('..', 'fallback')).toBe('fallback');
    expect(sanitizeZipSegment('.', 'fallback')).toBe('fallback');
  });

  it('uses the fallback when nothing survives sanitising', () => {
    expect(sanitizeZipSegment('', 'fallback')).toBe('fallback');
    expect(sanitizeZipSegment('   ', 'fallback')).toBe('fallback');
    expect(sanitizeZipSegment('<>:*?|', 'fallback')).toBe('fallback');
  });

  it.each([
    ['CON', '_CON'],
    ['nul', '_nul'],
    ['Aux ', '_Aux'],
    ['com1', '_com1'],
    ['LPT9', '_LPT9'],
    ['COM¹', '_COM1'],
    ['con.docx', '_con.docx'],
  ])('prefixes the Windows reserved name %j with an underscore', (input, expected) => {
    expect(sanitizeZipSegment(input, 'x')).toBe(expected);
  });

  it('leaves names that only start with a reserved word alone', () => {
    expect(sanitizeZipSegment('Console', 'x')).toBe('Console');
    expect(sanitizeZipSegment('com10', 'x')).toBe('com10');
  });

  it('leaves an ordinary label untouched', () => {
    const label = 'Box to Google (MyDrive & ShareDrive)';
    expect(sanitizeZipSegment(label, 'x')).toBe(label);
  });
});

describe('docxFileName', () => {
  it.each([
    ['scope.docx', 'scope.docx'],
    ['Scope.DOCX', 'Scope.docx'],
    ['x.js', 'x.docx'],
    ['invoice.pdf.exe', 'invoice.pdf.docx'],
    ['no extension', 'no extension.docx'],
    ['Box to Dropbox v2.5', 'Box to Dropbox v2.5.docx'],
  ])('always ends %j in .docx', (input, expected) => {
    expect(docxFileName(input)).toBe(expected);
  });

  it('defeats an RTL-override extension spoof', () => {
    const name = docxFileName('a‮xcod.exe');
    expect(name).toBe('axcod.docx');
  });

  it('uses the fallback stem instead of producing a hidden ".docx"', () => {
    expect(docxFileName('???.docx')).toBe('exhibit.docx');
    expect(docxFileName('.docx')).toBe('exhibit.docx');
    expect(docxFileName('')).toBe('exhibit.docx');
  });

  it('prefixes a reserved stem', () => {
    expect(docxFileName('CON.docx')).toBe('_CON.docx');
    expect(docxFileName('prn')).toBe('_prn.docx');
  });
});

describe('uniqueName', () => {
  it('returns the name unchanged the first time and records it', () => {
    const used = new Set<string>();
    expect(uniqueName('a.docx', used)).toBe('a.docx');
    expect(used.has('a.docx')).toBe(true);
  });

  it('suffixes before the extension on a repeat', () => {
    const used = new Set<string>();
    uniqueName('a.docx', used);
    expect(uniqueName('a.docx', used)).toBe('a (2).docx');
    expect(uniqueName('a.docx', used)).toBe('a (3).docx');
  });

  it('suffixes at the end when there is no extension', () => {
    const used = new Set<string>();
    uniqueName('x', used);
    expect(uniqueName('x', used)).toBe('x (2)');
  });

  it('treats names that differ only by case as collisions', () => {
    const used = new Set<string>();
    uniqueName('Scope.docx', used);
    expect(uniqueName('SCOPE.DOCX', used)).toBe('SCOPE (2).DOCX');
  });

  it('does not mistake a version number in a folder label for an extension', () => {
    const used = new Set<string>();
    uniqueName('Dropbox v2.5', used);
    expect(uniqueName('Dropbox v2.5', used)).toBe('Dropbox v2.5 (2)');
  });

  it('caps at 80 code points, keeping .docx and counting the (n) suffix', () => {
    const used = new Set<string>();
    const long = `${'a'.repeat(120)}.docx`;

    const first = uniqueName(long, used);
    const second = uniqueName(long, used);

    expect(MAX_SEGMENT_LENGTH).toBe(80);
    expect(first).toBe(`${'a'.repeat(75)}.docx`);
    expect(second).toBe(`${'a'.repeat(71)} (2).docx`);
    expect(codePoints(first)).toBe(80);
    expect(codePoints(second)).toBe(80);
  });

  it('dedupes two long names that only differ after the cap', () => {
    const used = new Set<string>();
    const first = uniqueName(`${'b'.repeat(90)}-one.docx`, used);
    const second = uniqueName(`${'b'.repeat(90)}-two.docx`, used);

    expect(first).toBe(`${'b'.repeat(75)}.docx`);
    expect(second).toBe(`${'b'.repeat(71)} (2).docx`);
  });

  it('truncates by code point so an emoji is never split', () => {
    const name = uniqueName(`${'a'.repeat(74)}\u{1F600}\u{1F600}\u{1F600}.docx`, new Set());

    expect(name).toBe(`${'a'.repeat(74)}\u{1F600}.docx`);
    expect(codePoints(name)).toBe(80);
    expect(hasLoneSurrogate(name)).toBe(false);
  });

  it('caps a long folder label with no extension', () => {
    expect(codePoints(uniqueName('F'.repeat(200), new Set()))).toBe(80);
  });
});

describe('buildZipEntries', () => {
  it('places each exhibit under its folder using its stored file name', () => {
    const a: ZipExhibit = { _id: 'a', name: 'A', fileName: 'a.docx' };
    const b: ZipExhibit = { _id: 'b', name: 'B', fileName: 'b.docx' };
    const c: ZipExhibit = { _id: 'c', name: 'C', fileName: 'c.docx' };
    const entries = buildZipEntries([
      { name: 'Box to OneDrive', exhibits: [a, b] },
      { name: 'Slack to Teams', exhibits: [c] },
    ]);

    expect(entries).toEqual([
      { exhibit: a, path: 'Box to OneDrive/1 - a.docx' },
      { exhibit: b, path: 'Box to OneDrive/2 - b.docx' },
      { exhibit: c, path: 'Slack to Teams/1 - c.docx' },
    ]);
  });

  it('falls back to the exhibit name, then to "exhibit", when fileName is missing', () => {
    const entries = buildZipEntries([
      { name: 'Folder', exhibits: [{ _id: '1', name: 'Scope: Basic' }, { _id: '2' }] },
    ]);

    expect(entries.map((e) => e.path)).toEqual([
      'Folder/1 - Scope Basic.docx',
      'Folder/2 - exhibit.docx',
    ]);
  });

  it('forces .docx on every file entry', () => {
    const entries = buildZipEntries([
      {
        name: 'Folder',
        exhibits: [
          { _id: '1', fileName: 'payload.js' },
          { _id: '2', fileName: 'a‮xcod.exe' },
          { _id: '3', fileName: '???.docx' },
        ],
      },
    ]);

    expect(entries.map((e) => e.path)).toEqual([
      'Folder/1 - payload.docx',
      'Folder/2 - axcod.docx',
      'Folder/3 - exhibit.docx',
    ]);
    entries.forEach((entry) => expect(entry.path.endsWith('.docx')).toBe(true));
  });

  it('keeps a slash in a folder label readable instead of fusing the words', () => {
    const entries = buildZipEntries([
      { name: 'OneDrive/SharePoint Online', exhibits: [{ _id: '1', fileName: 'one.docx' }] },
    ]);

    expect(entries[0].path).toBe('OneDrive-SharePoint Online/1 - one.docx');
  });

  it('dedupes folder labels that collide once sanitised', () => {
    const entries = buildZipEntries([
      { name: 'Box/Drive', exhibits: [{ _id: '1', fileName: 'one.docx' }] },
      { name: 'Box／Drive', exhibits: [{ _id: '2', fileName: 'two.docx' }] },
    ]);

    expect(entries.map((e) => e.path)).toEqual([
      'Box-Drive/1 - one.docx',
      'Box-Drive (2)/1 - two.docx',
    ]);
  });

  it('numbers files from 1 in folder order and restarts the count in each folder', () => {
    const entries = buildZipEntries([
      {
        name: 'Box to Dropbox',
        exhibits: [
          { _id: '1', fileName: 'Box to Dropbox Basic Include.docx' },
          { _id: '2', fileName: 'Box to Dropbox Basic Not Include.docx' },
        ],
      },
      { name: 'Box to OneDrive', exhibits: [{ _id: '3', fileName: 'Box to OneDrive Basic.docx' }] },
    ]);

    expect(entries.map((e) => e.path)).toEqual([
      'Box to Dropbox/1 - Box to Dropbox Basic Include.docx',
      'Box to Dropbox/2 - Box to Dropbox Basic Not Include.docx',
      'Box to OneDrive/1 - Box to OneDrive Basic.docx',
    ]);
  });

  it('keeps same-named files apart through their numbers alone', () => {
    const entries = buildZipEntries([
      {
        name: 'Folder A',
        exhibits: [
          { _id: '1', fileName: 'scope.docx' },
          { _id: '2', fileName: 'Scope.docx' },
          { _id: '3', fileName: 'scope.docx' },
        ],
      },
      { name: 'Folder B', exhibits: [{ _id: '4', fileName: 'scope.docx' }] },
    ]);

    expect(entries.map((e) => e.path)).toEqual([
      'Folder A/1 - scope.docx',
      'Folder A/2 - Scope.docx',
      'Folder A/3 - scope.docx',
      'Folder B/1 - scope.docx',
    ]);
  });

  it('replaces the old number on a file re-uploaded from an earlier ZIP', () => {
    const entries = buildZipEntries([
      {
        name: 'Box to Dropbox',
        exhibits: [
          { _id: '1', fileName: 'Box to Dropbox Standard Include.docx' },
          { _id: '2', fileName: '1 - Box to Dropbox Basic Include.docx' },
          { _id: '3', fileName: '2026 - Box to Dropbox Plan.docx' },
        ],
      },
    ]);

    expect(entries.map((e) => e.path)).toEqual([
      'Box to Dropbox/1 - Box to Dropbox Standard Include.docx',
      'Box to Dropbox/2 - Box to Dropbox Basic Include.docx',
      'Box to Dropbox/3 - 2026 - Box to Dropbox Plan.docx',
    ]);
  });

  it('keeps folder and file segments within 80 code points without losing the number', () => {
    const entries = buildZipEntries([
      { name: 'F'.repeat(150), exhibits: [{ _id: '1', fileName: `${'n'.repeat(150)}.docx` }] },
    ]);
    const [folder, file] = entries[0].path.split('/');

    expect(codePoints(folder)).toBe(80);
    expect(codePoints(file)).toBe(80);
    expect(file.startsWith('1 - nnn')).toBe(true);
    expect(file.endsWith('.docx')).toBe(true);
  });

  it('keeps the whole number and the 80-point cap in folders of more than 9 and 99 files', () => {
    const exhibits = Array.from({ length: 105 }, (_, i) => ({
      _id: `${i}`,
      fileName: `${'n'.repeat(150)}-${i}.docx`,
    }));
    const files = buildZipEntries([{ name: 'Big', exhibits }]).map((e) => e.path.split('/')[1]);

    files.forEach((file, i) => {
      expect(file.startsWith(`${i + 1} - nnn`)).toBe(true);
      expect(file.endsWith('.docx')).toBe(true);
      expect(codePoints(file)).toBe(80);
    });
    expect(files[9]).toBe(`10 - ${'n'.repeat(70)}.docx`);
    expect(files[99]).toBe(`100 - ${'n'.repeat(69)}.docx`);
    expect(new Set(files.map((file) => file.toLowerCase())).size).toBe(105);
  });

  it('leaves short names whole once the number reaches two and three digits', () => {
    const exhibits = Array.from({ length: 100 }, (_, i) => ({ _id: `${i}`, fileName: 'scope.docx' }));
    const files = buildZipEntries([{ name: 'Big', exhibits }]).map((e) => e.path.split('/')[1]);

    expect([files[0], files[9], files[99]]).toEqual([
      '1 - scope.docx',
      '10 - scope.docx',
      '100 - scope.docx',
    ]);
  });

  it('numbers several names that sanitise to nothing without a (2) suffix', () => {
    const entries = buildZipEntries([
      {
        name: 'Folder',
        exhibits: [
          { _id: '1', fileName: '???.docx' },
          { _id: '2', fileName: '<>|' },
          { _id: '3', name: '::' },
        ],
      },
    ]);

    expect(entries.map((e) => e.path)).toEqual([
      'Folder/1 - exhibit.docx',
      'Folder/2 - exhibit.docx',
      'Folder/3 - exhibit.docx',
    ]);
  });

  it('never gives a folder the same name as the error report', () => {
    const entries = buildZipEntries([
      { name: DOWNLOAD_ERRORS_FILE_NAME, exhibits: [{ _id: '1', fileName: 'x.docx' }] },
    ]);

    expect(entries[0].path).toBe('_download-errors (2).txt/1 - x.docx');
  });
});

describe('buildExhibitsZip', () => {
  it('adds every entry to the zip at its path with the fetched bytes', async () => {
    const entries = makeEntries(5);
    const { zip, succeeded, failed } = await buildExhibitsZip(
      entries,
      async (e) => docxBytes(`body-${e._id}`),
    );

    expect(succeeded).toBe(5);
    expect(failed).toEqual([]);
    expect(Object.keys(zip.files).sort()).toEqual(entries.map((e) => e.path).sort());
    expect(zip.file('Folder/file-3.docx')?.asText()).toBe(`${ZIP_HEADER}body-id3`);
    expect(zip.file(DOWNLOAD_ERRORS_FILE_NAME)).toBeNull();
  });

  it('runs at most 4 fetches at once by default, and does run them in parallel', async () => {
    const { stats, fetchFile } = trackInFlight();

    const { succeeded } = await buildExhibitsZip(makeEntries(12), fetchFile);

    expect(succeeded).toBe(12);
    expect(stats.max).toBeLessThanOrEqual(4);
    expect(stats.max).toBe(4);
  });

  it('honours a custom concurrency', async () => {
    const { stats, fetchFile } = trackInFlight();

    await buildExhibitsZip(makeEntries(6), fetchFile, { concurrency: 2 });

    expect(stats.max).toBe(2);
  });

  const NON_FINITE = [NaN, Infinity, -Infinity];

  it.each(NON_FINITE)('downloads everything when concurrency is %s', async (concurrency) => {
    const { stats, fetchFile } = trackInFlight();

    const { succeeded, failed } = await buildExhibitsZip(makeEntries(6), fetchFile, {
      concurrency,
    });

    expect(failed).toEqual([]);
    expect(succeeded).toBe(6);
    expect(stats.max).toBeGreaterThanOrEqual(1);
    expect(stats.max).toBeLessThanOrEqual(4);
  });

  it.each([0, -3, 0.4])('runs one worker when concurrency is %s', async (concurrency) => {
    const { stats, fetchFile } = trackInFlight();

    const { succeeded } = await buildExhibitsZip(makeEntries(4), fetchFile, { concurrency });

    expect(succeeded).toBe(4);
    expect(stats.max).toBe(1);
  });

  it('reports progress once per file and finishes at (n, n)', async () => {
    const calls: [number, number][] = [];
    await buildExhibitsZip(makeEntries(7), async () => docxBytes('x'), {
      onProgress: (done, total) => calls.push([done, total]),
    });

    expect(calls).toHaveLength(7);
    expect(calls.map(([done]) => done)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(calls[calls.length - 1]).toEqual([7, 7]);
  });

  it('records a per-file failure without throwing and writes an error report', async () => {
    const entries = makeEntries(4);
    const { zip, succeeded, failed } = await buildExhibitsZip(entries, async (e) => {
      if (e._id === 'id1') throw new Error('Failed to download file (500)');
      if (e._id === 'id2') throw 'offline';
      return docxBytes('ok');
    });

    expect(succeeded).toBe(2);
    expect(failed).toEqual([
      { path: 'Folder/file-1.docx', error: 'Failed to download file (500)' },
      { path: 'Folder/file-2.docx', error: 'offline' },
    ]);
    expect(zip.file('Folder/file-1.docx')).toBeNull();
    expect(zip.file('Folder/file-0.docx')).not.toBeNull();

    const report = zip.file(DOWNLOAD_ERRORS_FILE_NAME)?.asText() ?? '';
    const lines = report.split(/\r?\n/).filter(Boolean);
    expect(lines).toEqual([
      'Folder/file-1.docx - Failed to download file (500)',
      'Folder/file-2.docx - offline',
    ]);
  });

  it('keeps every number in place when the first file of a folder fails', async () => {
    const entries = buildZipEntries([
      {
        name: 'Box to Dropbox',
        exhibits: [
          { _id: 'a', fileName: 'a.docx' },
          { _id: 'b', fileName: 'b.docx' },
          { _id: 'c', fileName: 'c.docx' },
        ],
      },
    ]);

    const { zip, failed } = await buildExhibitsZip(entries, async (e) => {
      if (e._id === 'a') throw new Error('Failed to download file (404)');
      return docxBytes(String(e._id));
    });

    expect(failed).toEqual([
      { path: 'Box to Dropbox/1 - a.docx', error: 'Failed to download file (404)' },
    ]);
    expect(Object.keys(zip.files)).toEqual([
      'Box to Dropbox/2 - b.docx',
      'Box to Dropbox/3 - c.docx',
      DOWNLOAD_ERRORS_FILE_NAME,
    ]);
    expect(zip.file('Box to Dropbox/2 - b.docx')?.asText()).toBe(`${ZIP_HEADER}b`);
    expect(zip.file(DOWNLOAD_ERRORS_FILE_NAME)?.asText())
      .toBe('Box to Dropbox/1 - a.docx - Failed to download file (404)\r\n');
  });

  it('writes ZIP entries in numbered order even when later files finish first', async () => {
    const entries = buildZipEntries([
      {
        name: 'Folder',
        exhibits: [
          { _id: '30', fileName: 'slow.docx' },
          { _id: '15', fileName: 'medium.docx' },
          { _id: '1', fileName: 'fast.docx' },
        ],
      },
    ]);
    const finished: string[] = [];

    const { zip } = await buildExhibitsZip(entries, async (e) => {
      await new Promise((resolve) => setTimeout(resolve, Number(e._id)));
      finished.push(String(e._id));
      return docxBytes(String(e._id));
    });

    expect(finished).toEqual(['1', '15', '30']);
    expect(Object.keys(zip.files)).toEqual([
      'Folder/1 - slow.docx',
      'Folder/2 - medium.docx',
      'Folder/3 - fast.docx',
    ]);
  });

  it.each([
    [{ status: 500 }, '{"status":500}'],
    [{ message: 'socket hang up' }, 'socket hang up'],
    [42, '42'],
    [undefined, 'Unknown error'],
    [null, 'Unknown error'],
  ])('turns the non-Error rejection %j into readable text', async (rejection, expected) => {
    expect(await failureFor(rejection)).toBe(expected);
  });

  it('never writes "[object Object]" for an object it cannot serialise', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(await failureFor(circular)).toBe('Unknown error');
  });

  it('rejects an empty buffer as "Received empty file"', async () => {
    expect(await failureForData(new ArrayBuffer(0))).toBe('Received empty file');
  });

  it.each([
    ['an HTML error page', plainBytes('<!doctype html><p>Error</p>')],
    ['a JSON body', plainBytes('{"success":false}')],
    ['a truncated header', plainBytes('PK')],
  ])('rejects %s as "Not a valid Word file"', async (_label, data) => {
    expect(await failureForData(data)).toBe('Not a valid Word file');
  });

  it('rejects a missing buffer as "No file data returned"', async () => {
    expect(await failureForData(undefined)).toBe('No file data returned');
  });

  it('returns zero successes when every fetch fails', async () => {
    const { succeeded, failed, zip } = await buildExhibitsZip(makeEntries(3), async () => {
      throw new Error('down');
    });

    expect(succeeded).toBe(0);
    expect(failed).toHaveLength(3);
    expect(Object.keys(zip.files)).toEqual([DOWNLOAD_ERRORS_FILE_NAME]);
  });

  it('handles an empty entry list', async () => {
    const { succeeded, failed, zip } = await buildExhibitsZip([], async () => docxBytes('x'));

    expect(succeeded).toBe(0);
    expect(failed).toEqual([]);
    expect(Object.keys(zip.files)).toEqual([]);
  });

  it('produces a zip that reads back with the same paths', async () => {
    const entries = makeEntries(3);
    const { zip } = await buildExhibitsZip(entries, async () => docxBytes('docx'));

    const reread = new PizZip(zip.generate({ type: 'uint8array', compression: 'STORE' }));

    expect(Object.keys(reread.files).sort()).toEqual(entries.map((e) => e.path).sort());
  });

  it('records a hung request as a timeout failure instead of waiting forever', async () => {
    vi.useFakeTimers();
    const hung = () => withRequestTimeout(() => new Promise<ArrayBuffer>(() => {}), 60_000);

    const pending = buildExhibitsZip(makeEntries(2), hung);
    await vi.advanceTimersByTimeAsync(60_000);
    const { succeeded, failed } = await pending;

    expect(succeeded).toBe(0);
    expect(failed.map((f) => f.error)).toEqual(['Timed out after 60 s', 'Timed out after 60 s']);
  });
});

describe('withRequestTimeout', () => {
  it('resolves with the task value and leaves no timer behind', async () => {
    vi.useFakeTimers();

    await expect(withRequestTimeout(async () => 'ok', 60_000)).resolves.toBe('ok');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('passes a task error straight through', async () => {
    await expect(withRequestTimeout(async () => {
      throw new Error('Failed to download file (404)');
    }, 60_000)).rejects.toThrow('Failed to download file (404)');
  });

  it('aborts the task signal and rejects when the timeout elapses', async () => {
    vi.useFakeTimers();
    let taskSignal: AbortSignal | undefined;
    const result = withRequestTimeout((signal) => {
      taskSignal = signal;
      return new Promise(() => {});
    }, 60_000);
    const assertion = expect(result).rejects.toThrow('Timed out after 60 s');

    await vi.advanceTimersByTimeAsync(59_999);
    expect(taskSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await assertion;
    expect(taskSignal?.aborted).toBe(true);
  });

  it('aborts the task and rejects as soon as the parent signal aborts', async () => {
    const parent = new AbortController();
    let taskSignal: AbortSignal | undefined;
    const result = withRequestTimeout((signal) => {
      taskSignal = signal;
      return new Promise(() => {});
    }, 60_000, parent.signal);
    await Promise.resolve();

    parent.abort();

    await expect(result).rejects.toThrow('Download cancelled');
    expect(taskSignal?.aborted).toBe(true);
  });

  it('never starts the task when the parent signal is already aborted', async () => {
    const parent = new AbortController();
    parent.abort();
    const task = vi.fn(async () => 'never');

    const result = withRequestTimeout(task, 60_000, parent.signal);

    await expect(result).rejects.toThrow('Download cancelled');
    expect(task).not.toHaveBeenCalled();
  });
});

describe('bulkResultMessage', () => {
  const grouped = { isUngrouped: false };
  const ungrouped = { isUngrouped: true };

  it('counts combinations without the Ungrouped folder', () => {
    const folders = [grouped, grouped, ungrouped];
    expect(bulkResultMessage({ total: 5, succeeded: 5, failed: 0, folders }))
      .toEqual({ kind: 'success', text: 'Downloaded 5 exhibits in 2 combinations.' });
  });

  it('uses the singular for one exhibit in one combination', () => {
    expect(bulkResultMessage({ total: 1, succeeded: 1, failed: 0, folders: [grouped] }))
      .toEqual({ kind: 'success', text: 'Downloaded 1 exhibit in 1 combination.' });
  });

  it('warns and points at the error report when some files failed', () => {
    const message = bulkResultMessage({
      total: 180, succeeded: 178, failed: 2, folders: [grouped],
    });
    expect(message).toEqual({
      kind: 'warning',
      text: 'Downloaded 178 of 180. 2 failed — see _download-errors.txt in the ZIP.',
    });
  });

  it('reports an error when nothing could be fetched', () => {
    expect(bulkResultMessage({ total: 3, succeeded: 0, failed: 3, folders: [grouped] })).toEqual({
      kind: 'error',
      text: 'Download failed: none of the 3 exhibits could be fetched. Please try again.',
    });
  });

  it('reports an error when there was nothing to download', () => {
    const message = bulkResultMessage({ total: 0, succeeded: 0, failed: 0, folders: [] });
    expect(message.kind).toBe('error');
  });
});

describe('exhibitsZipFileName', () => {
  it('formats the local date as exhibits-YYYY-MM-DD.zip', () => {
    expect(exhibitsZipFileName(new Date(2026, 0, 5, 23, 59))).toBe('exhibits-2026-01-05.zip');
    expect(exhibitsZipFileName(new Date(2026, 11, 31))).toBe('exhibits-2026-12-31.zip');
  });

  it('defaults to today', () => {
    expect(exhibitsZipFileName()).toMatch(/^exhibits-\d{4}-\d{2}-\d{2}\.zip$/);
  });
});
