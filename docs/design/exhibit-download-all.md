# Feature: Download All Exhibits (ZIP)

**Status:** Restored 2026-09-28 with file numbering; not yet committed or deployed
**Date:** 2026-09-26 (first version), 2026-09-28 (numbering)
**Applies to:** `src/components/ExhibitManager.tsx`, `src/components/BulkDownloadBanner.tsx`, `src/utils/exhibitBulkDownload.ts`, `src/utils/bulkZipDownload.ts`

---

## What it does

The Exhibit Manager (`/exhibits`) has a **Download All (N)** button in its header. One click downloads every exhibit as a single ZIP file, `exhibits-YYYY-MM-DD.zip`, with one folder per combination (for example `Box to Dropbox/`). Each folder holds that combination's `.docx` files, numbered:

```
Box to Dropbox/1 - Box to Dropbox Basic Include.docx
Box to Dropbox/2 - Box to Dropbox Basic Not Include.docx
```

- **Who sees it:** every user, the same people who can already download exhibits one at a time. Admins see it before "Exhibit Admins"; other users see it next to the view-only note.
- **What it includes:** the full exhibit list. Search, category and agreement filters are ignored on purpose.
- **Folders:** they come from the same `buildFolderGroups` grouping the page shows, so folder names match the list on screen. Exhibits with no combination go in `Ungrouped/`.
- **Numbering:**
  - Files are numbered in the order the folder lists them on screen: newest first by upload date. Exhibits with a missing or unreadable date come last.
  - Numbering restarts at 1 in each folder, `Ungrouped/` included.
  - Numbers follow the full folder, because filters are ignored. With a search active, the numbers can differ from the positions of the cards you see.
  - Numbers are positions, not IDs. A new upload becomes `1 - ` and moves the rest down by one.
  - A file that was re-uploaded from an earlier ZIP (`1 - X.docx`) loses its old number first, so it never becomes `2 - 1 - X.docx`.
  - Numbers are not zero-padded. Windows Explorer and macOS Finder sort `10 - ` after `9 - `; a plain alphabetical sort does not.
- **Totals:** under the page title, "Total combinations" and "Total exhibits" count the full list, so they match the button's number and do not change with search or filters. "Ungrouped" is not counted as a combination.
- **Progress:** the button shows `Downloading 5 / 180`, then `Building ZIP…`. It is disabled while the list loads, when there are no exhibits, and while a download is running.
- **Result:** a banner reports the outcome:
  - Green: all files downloaded.
  - Amber: some files failed. The ZIP is still saved, with `_download-errors.txt` at its root listing each failure by its numbered path. The other files keep their numbers.
  - Red: nothing downloaded, so no ZIP is saved.

## How it works

The feature runs entirely in the browser. It has no server, API or database changes, and it only reads data.

1. The exhibit list is already loaded by the page (`GET /api/exhibits`). The page sorts it once, newest first; both the folder cards and the ZIP use that one sorted list, so their order cannot drift apart.
2. Each file is fetched with the existing `GET /api/exhibits/:id/file`, four at a time. Each request has a 60-second timeout.
3. The files are packed with `pizzip` using STORE compression, because `.docx` is already compressed. The ZIP is saved with `file-saver`.
4. If the user leaves the page mid-download, all requests are cancelled and no ZIP is saved.

## File name safety

All names inside the ZIP come from database fields, so `exhibitBulkDownload.ts` cleans every folder and file name:

- Every file ends in `.docx`, whatever extension is stored.
- Unicode is NFKC-normalised. Invisible and direction-reversing characters and control characters are removed.
- `/` and `\` become `-`. The characters `: * ? " < > |` are removed.
- Windows reserved names (`CON`, `NUL`, `COM1`…) get a `_` prefix. Empty names fall back to `exhibit`.
- Each name is capped at 80 characters. The `N - ` number and `.docx` are always kept; the end of the name is cut.
- Folder names that collide get ` (2)`, ` (3)`… without regard to case, so Windows can extract them. File names cannot collide inside a folder because each has its own number.
- A file that arrives empty, or that does not start with the ZIP signature a `.docx` must have, is recorded as a failure.

## Limits

- The whole ZIP is built in memory, which peaks at about 3× the total file size. That is fine at today's roughly 2.6 MB, but it would need a streaming approach at hundreds of MB.
- A path inside the ZIP is at most 161 characters (two 80-character names plus `/`). Extracting into a normal folder such as `Downloads\` works. A very deeply nested destination can reach the Windows 260-character path limit.
- `/api/exhibits` and `/api/exhibits/:id/file` do not check authentication. That was true before this feature and is tracked separately. If `/api` is ever rate-limited to 100 requests/minute, a full download would hit HTTP 429 errors.

## Verification

**2026-09-26 (first version, before numbering):**

- The real component was run against the dev server with every non-GET request blocked. It downloaded 180 of 180 files into 60 folders.
- Windows `Expand-Archive` extracted all of them, and every `.docx` contained `word/document.xml`.
- GStack code review, security review and QA found no blockers; all findings were fixed in one follow-up pass.

**2026-09-28 (numbering):**

- **Tests:** `tests/unit/bulkZipDownload.test.ts`, `tests/unit/exhibitBulkDownload.test.ts` and `tests/unit/exhibitManagerDownloadAll.test.tsx`. They check that ZIP number N in each folder is the Nth card the page renders, with the API list in order and reversed, with tied, missing and unreadable dates, and with filters active. `npm run build` passes.
- **Extraction:** a 130-file ZIP built by the real helper extracted with Windows `Expand-Archive`, numbered names intact.
- **Reviews:** GStack code review and QA found no blockers. The low-severity findings (unreadable dates, double numbers on re-upload, this document) were fixed.
- **Not yet done:** a real-data run with numbering. Do it before deploying.
