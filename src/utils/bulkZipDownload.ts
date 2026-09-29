import PizZip from 'pizzip';

export type ZipFailure = { path: string; error: string; code?: string };

export type ZipBuildResult = { zip: PizZip; succeeded: number; failed: ZipFailure[] };

export type FileValidator = (data: unknown) => string | null;

export type BuildZipOptions = {
  validate?: FileValidator;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
};

export type BulkResultMessage = { kind: 'success' | 'warning' | 'error'; text: string };

export const DOWNLOAD_ERRORS_FILE_NAME = '_download-errors.txt';
export const MAX_SEGMENT_LENGTH = 80;
export const DEFAULT_CONCURRENCY = 4;

const DEFAULT_FALLBACK_STEM = 'file';
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const BANNED_CHARS = /[:*?"<>|\p{Cc}]/gu;
// Windows also reserves these names when followed by an extension, e.g. "con.docx"
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
// Letter-led so a version like "v2.5" in a folder label is not mistaken for an extension
const EXTENSION_PATTERN = /\.[A-Za-z][A-Za-z0-9]{0,9}$/;

export class ZipFetchError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ZipFetchError';
    this.code = code;
  }
}

function splitExtension(name: string): { stem: string; ext: string } {
  const match = EXTENSION_PATTERN.exec(name);
  if (!match || match.index === 0) return { stem: name, ext: '' };
  return { stem: name.slice(0, match.index), ext: match[0] };
}

function trimTrailingDotsAndSpaces(name: string): string {
  return name.replace(/[. ]+$/, '');
}

export function sanitizeZipSegment(name: string, fallback: string): string {
  const cleaned = String(name ?? '')
    // NFKC folds look-alikes such as the full-width slash into the ASCII character they mimic
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/[/\\]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(BANNED_CHARS, '')
    .replace(/-+/g, '-')
    .replace(/-(\s*-)+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  // Windows cannot extract names ending in dots or spaces; this also neutralises "." and ".."
  const safe = trimTrailingDotsAndSpaces(cleaned);
  if (!safe) return fallback;
  return WINDOWS_RESERVED.test(safe) ? `_${safe}` : safe;
}

export function fileNameWithExtension(rawName: string, ext: string, fallbackStem: string): string {
  const withoutExtension = sanitizeZipSegment(rawName, '').replace(EXTENSION_PATTERN, '');
  // Forcing the extension stops a stored "x.js" or an RTL-spoofed ".exe" reaching the user
  return `${sanitizeZipSegment(withoutExtension, fallbackStem)}${ext}`;
}

function fitToLength(
  stem: string,
  suffix: string,
  ext: string,
  maxLength: number,
  fallbackStem: string,
): string {
  const room = Math.max(1, maxLength - Array.from(suffix + ext).length);
  // Array.from splits by code point, so an emoji is never cut in half
  const fitted = trimTrailingDotsAndSpaces(Array.from(stem).slice(0, room).join(''));
  return `${fitted || fallbackStem}${suffix}${ext}`;
}

export function uniqueName(
  name: string,
  used: Set<string>,
  maxLength: number = MAX_SEGMENT_LENGTH,
  fallbackStem: string = DEFAULT_FALLBACK_STEM,
): string {
  const { stem, ext } = splitExtension(name);
  // Capping each candidate (suffix included) means two long names cannot collide after truncation
  for (let n = 1; ; n += 1) {
    const candidate = fitToLength(stem, n === 1 ? '' : ` (${n})`, ext, maxLength, fallbackStem);
    // Windows treats names that differ only by case as the same file
    const key = candidate.toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      return candidate;
    }
  }
}

export function isZipBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < ZIP_SIGNATURE.length) return false;
  const head = new Uint8Array(buffer, 0, ZIP_SIGNATURE.length);
  return ZIP_SIGNATURE.every((byte, i) => head[i] === byte);
}

export function validateFileBuffer(data: unknown): string | null {
  const buffer = data as ArrayBuffer | null | undefined;
  if (!buffer || typeof buffer.byteLength !== 'number') return 'No file data returned';
  if (buffer.byteLength === 0) return 'Received empty file';
  return null;
}

export function bufferValidator(
  isExpectedType: (buffer: ArrayBuffer) => boolean,
  invalidMessage: string,
): FileValidator {
  return (data) => validateFileBuffer(data)
    ?? (isExpectedType(data as ArrayBuffer) ? null : invalidMessage);
}

function describeError(error: unknown): string {
  let message = '';
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else if (error && typeof (error as { message?: unknown }).message === 'string') {
    message = (error as { message: string }).message;
  } else if (error !== undefined && error !== null) {
    try {
      message = JSON.stringify(error) ?? String(error);
    } catch {
      message = '';
    }
  }
  const readable = message.replace(/\s+/g, ' ').trim().slice(0, 300);
  return readable && readable !== '[object Object]' ? readable : 'Unknown error';
}

type FetchOutcome = { data: ArrayBuffer | null; error: string; code?: string };

async function fetchOne<E>(
  entry: E,
  fetchFile: (entry: E) => Promise<ArrayBuffer>,
  validate: FileValidator,
): Promise<FetchOutcome> {
  try {
    const data = await fetchFile(entry);
    const problem = validate(data);
    return problem ? { data: null, error: problem } : { data, error: '' };
  } catch (error) {
    // Only our own error class carries a code, so a stray library code never leaks into results
    const code = error instanceof ZipFetchError ? error.code : undefined;
    return { data: null, error: describeError(error), ...(code ? { code } : {}) };
  }
}

function resolveWorkerCount(concurrency: number | undefined, total: number): number {
  const requested = Number.isFinite(concurrency)
    ? Math.floor(concurrency as number)
    : DEFAULT_CONCURRENCY;
  return Math.max(1, Math.min(requested, total));
}

function assembleZip<E extends { path: string }>(
  entries: E[],
  outcomes: FetchOutcome[],
): ZipBuildResult {
  // Added after fetching so ZIP order is stable no matter which request finished first
  const zip = new PizZip();
  const failed: ZipFailure[] = [];
  let succeeded = 0;
  entries.forEach((entry, index) => {
    const { data, error, code } = outcomes[index];
    if (data) {
      zip.file(entry.path, data);
      succeeded += 1;
    } else {
      const reason = error || 'No file data returned';
      failed.push({ path: entry.path, error: reason, ...(code ? { code } : {}) });
    }
  });
  return { zip, succeeded, failed };
}

export async function buildZip<E extends { path: string }>(
  entries: E[],
  fetchFile: (entry: E) => Promise<ArrayBuffer>,
  opts: BuildZipOptions = {},
): Promise<ZipBuildResult> {
  const total = entries.length;
  const validate = opts.validate ?? validateFileBuffer;
  const outcomes: FetchOutcome[] = new Array(total);
  let nextIndex = 0;
  let done = 0;

  const runWorker = async () => {
    while (nextIndex < total) {
      const index = nextIndex;
      nextIndex += 1;
      outcomes[index] = await fetchOne(entries[index], fetchFile, validate);
      done += 1;
      opts.onProgress?.(done, total);
    }
  };

  await Promise.all(Array.from({ length: resolveWorkerCount(opts.concurrency, total) }, runWorker));
  return assembleZip(entries, outcomes);
}

export function formatFailureLines(failures: ZipFailure[], separator: string = ' - '): string {
  return failures.map((failure) => `${failure.path}${separator}${failure.error}\r\n`).join('');
}

export function addErrorReport(
  zip: PizZip,
  failures: ZipFailure[],
  formatReport: (failures: ZipFailure[]) => string,
): void {
  if (failures.length > 0) zip.file(DOWNLOAD_ERRORS_FILE_NAME, formatReport(failures));
}

export function withRequestTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    if (parentSignal?.aborted) {
      reject(new Error('Download cancelled'));
      return;
    }
    const settle = (finish: () => void) => {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', onParentAbort);
      finish();
    };
    // Rejecting here, not only aborting, covers a task that ignores its signal
    const abortWith = (message: string) => settle(() => {
      controller.abort();
      reject(new Error(message));
    });
    const onParentAbort = () => abortWith('Download cancelled');
    const timeoutMessage = `Timed out after ${Math.round(timeoutMs / 1000)} s`;
    const timer = setTimeout(() => abortWith(timeoutMessage), timeoutMs);
    parentSignal?.addEventListener('abort', onParentAbort, { once: true });
    Promise.resolve()
      .then(() => task(controller.signal))
      .then(
        (value) => settle(() => resolve(value)),
        (error) => settle(() => reject(error)),
      );
  });
}

export function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

export function datedZipFileName(prefix: string, date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${prefix}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.zip`;
}
