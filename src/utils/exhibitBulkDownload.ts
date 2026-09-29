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
  uniqueName as uniqueZipName,
  DOWNLOAD_ERRORS_FILE_NAME,
  MAX_SEGMENT_LENGTH,
  type BulkResultMessage,
  type ZipFailure,
} from './bulkZipDownload';

export {
  sanitizeZipSegment,
  withRequestTimeout,
  DOWNLOAD_ERRORS_FILE_NAME,
  MAX_SEGMENT_LENGTH,
  type BulkResultMessage,
  type ZipFailure,
} from './bulkZipDownload';

export type ZipExhibit = { _id?: string; id?: string; name?: string; fileName?: string };

export type ZipFolderInput = { name: string; exhibits: ZipExhibit[] };

export type ZipEntry = { exhibit: ZipExhibit; path: string };

export type ExhibitsZipResult = { zip: PizZip; succeeded: number; failed: ZipFailure[] };

export type BuildExhibitsZipOptions = {
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
};

export type BulkResultInput = {
  total: number;
  succeeded: number;
  failed: number;
  folders: { isUngrouped?: boolean }[];
};

const DOCX_EXTENSION = '.docx';
const FALLBACK_FILE_STEM = 'exhibit';
const ZIP_NUMBER_PREFIX = /^\d{1,3} - /;
// Every .docx is a ZIP; anything else is an error page or a corrupt upload
const validateDocxBuffer = bufferValidator(isZipBuffer, 'Not a valid Word file');

export function docxFileName(rawName: string, fallbackStem: string = FALLBACK_FILE_STEM): string {
  return fileNameWithExtension(rawName, DOCX_EXTENSION, fallbackStem);
}

export function uniqueName(
  name: string,
  used: Set<string>,
  maxLength: number = MAX_SEGMENT_LENGTH,
): string {
  return uniqueZipName(name, used, maxLength, FALLBACK_FILE_STEM);
}

export function buildZipEntries(folders: ZipFolderInput[]): ZipEntry[] {
  // A root folder with the same name as the error report would collide on extraction
  const usedFolderNames = new Set<string>([DOWNLOAD_ERRORS_FILE_NAME.toLowerCase()]);
  const entries: ZipEntry[] = [];

  folders.forEach((folder) => {
    const folderName = uniqueName(sanitizeZipSegment(folder.name, 'Folder'), usedFolderNames);
    const usedFileNames = new Set<string>();
    folder.exhibits.forEach((exhibit, index) => {
      const rawFileName = exhibit.fileName
        || `${exhibit.name || FALLBACK_FILE_STEM}${DOCX_EXTENSION}`;
      // A file re-uploaded from an earlier ZIP keeps its old number, so drop it before renumbering
      const unnumberedName = docxFileName(rawFileName).replace(ZIP_NUMBER_PREFIX, '');
      // Unfiltered, "3 - …" is the third card in that folder on screen
      const numberedName = `${index + 1} - ${unnumberedName}`;
      const fileName = uniqueName(numberedName, usedFileNames);
      entries.push({ exhibit, path: `${folderName}/${fileName}` });
    });
  });

  return entries;
}

export async function buildExhibitsZip(
  entries: ZipEntry[],
  fetchFile: (exhibit: ZipExhibit) => Promise<ArrayBuffer>,
  opts: BuildExhibitsZipOptions = {},
): Promise<ExhibitsZipResult> {
  const result = await buildZip(entries, (entry) => fetchFile(entry.exhibit), {
    ...opts,
    validate: validateDocxBuffer,
  });
  addErrorReport(result.zip, result.failed, (failed) => formatFailureLines(failed));
  return result;
}

export function bulkResultMessage(result: BulkResultInput): BulkResultMessage {
  const { total, succeeded, failed, folders } = result;
  if (succeeded === 0) {
    const text = total === 0
      ? 'There are no exhibits to download.'
      : `Download failed: none of the ${pluralize(total, 'exhibit')} could be fetched. `
        + 'Please try again.';
    return { kind: 'error', text };
  }
  if (failed > 0) {
    const text = `Downloaded ${succeeded} of ${total}. ${failed} failed — `
      + `see ${DOWNLOAD_ERRORS_FILE_NAME} in the ZIP.`;
    return { kind: 'warning', text };
  }
  // "Ungrouped" is a catch-all bucket, not a migration combination
  const combinations = folders.filter((folder) => !folder.isUngrouped).length;
  const text = `Downloaded ${pluralize(total, 'exhibit')} `
    + `in ${pluralize(combinations, 'combination')}.`;
  return { kind: 'success', text };
}

export function exhibitsZipFileName(date: Date = new Date()): string {
  return datedZipFileName('exhibits', date);
}
