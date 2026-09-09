# Feature Design: Scope Document Attachment for SOW / Agreement Generation

**Status:** ⚠ SUPERSEDED IN PART — implemented, but NOT as designed below. See `## IMPLEMENTED DESIGN` at the top.
**Implemented:** 2026-09-07. The append approach was chosen over the extraction approach this document specifies.
**Branch:** `datasprawl`
**Author:** Architect Agent
**Date:** 2026-09-04

---

## IMPLEMENTED DESIGN

Everything below the `## Summary` heading describes an **extraction** feature that was NOT built.
Read this section instead; the rest is retained for its verified findings (§0) and for the
decision record.

### What ships

The user uploads a customer scope document (`.docx`) in the Quote page. On agreement
generation the file's own pages are **appended verbatim** to the end of the generated
agreement, under a `Customer Scope Document` header bar, for **all** agreement types.

Nothing is extracted, parsed, reviewed or edited. No text is pulled out of the file, so
there are no scope tokens, no template edits, and no parser.

### Why this instead of extraction

Chosen by the product owner on 2026-09-07 over the extraction design below. The append
approach reuses `mergeDocxFiles`, which already appends whole DOCX files for the exhibit
flow and is proven in production. That deletes the entire risk surface this document was
written to manage: no `POST /api/scope/extract`, no heading parser, no `configuration.scopeDetails`
persistence, no review UI, and — decisively — no edits to ~113 seeded templates (§5.4).

The trade-off accepted: the scope document appears as an annexure rather than as prose inside
the agreement's own scope section, and PDF uploads are impossible (see Limitations).

### Files

| File | Change |
|---|---|
| `src/utils/scopeAttachment.ts` | NEW. Validation + `appendScopeAttachment()`. |
| `src/utils/docxMerger.ts` | Additive optional 4th param `options?: { sectionTitle?: string }`. |
| `src/components/QuoteGenerator.tsx` | Upload panel, state, validating handler, two merge call sites. |
| `tests/unit/scopeAttachment.test.ts` | NEW. 16 tests. |
| `vitest.config.ts` | Coverage threshold for the new util. |

### Two decisions that are load-bearing — do not “simplify” them

1. **`appendScopeAttachment` passes NO `exhibitMetadata`.** Supplying metadata routes
   `mergeDocxFiles` down its grouped path, which stamps the document
   `Exhibit 1 - INCLUDED IN MIGRATION` (`docxMerger.ts:580`) and applies `skipFirstHeading`
   to the not-included group (`:631`). A customer scope document must go through the
   ungrouped fallback, which preserves all content.

2. **The merge call site is deliberately OUTSIDE the exhibit gate.** Both exhibit merges are
   gated on `uniqueSelectedExhibitsForMerge.length > 0 && configuration.migrationType === 'Multi combination'`.
   Relaxing that gate to cover all agreement types would start appending *exhibits* to
   Migrate / Manage / Bundle agreements — a regression in each. The scope append is therefore
   its own step, after the template-type branch, gated only on “a file was uploaded”.

### Three decisions that are load-bearing - do not “simplify” them

3. **`verbatim: true` is mandatory on this path.** `mergeExhibit` was written for CloudFuze's
   own exhibit files and filters their content: it deletes any heading or >50-character
   paragraph containing “included” (`docxMerger.ts:540`), skips the first heading, and trims
   trailing non-text nodes. Pointed at a customer document those are silent content-deletion
   bugs — “Included Services” and “…are included in the migration scope…” both vanish from a
   signed agreement. `verbatim` disables every one of those filters and makes failures throw
   instead of yielding an empty section. Regression-tested in
   `tests/unit/docxMergerVerbatim.test.ts`.

### What the merge strips, and why

Only `word/document.xml` and `word/styles.xml` are copied — never `document.xml.rels`,
`word/media/*` or `numbering.xml`. Anything addressed through a relationship id would therefore
resolve against the **agreement's** relationships: a dangling id makes Word demand repair on a
signature-bearing document, and a colliding id silently rewires the reference to whichever
agreement part owns that id. `stripUnsupportedForVerbatim` therefore removes:

| Removed | Reason |
|---|---|
| `w:drawing`, `w:pict`, `w:object`, `w:altChunk` | Relationship-addressed; would dangle or cross-wire |
| `w:hyperlink` | **Unwrapped**, not deleted — the link text survives, only the unusable target goes |
| `w:fldSimple`, `w:instrText`, `w:fldChar` | `INCLUDEPICTURE`/`INCLUDETEXT`/`DDE` would fetch an attacker-chosen target on the counter-signer's machine |
| nested `w:sectPr` | A paragraph-level `sectPr` defines the section *ending* at it — it would retroactively re-page the whole agreement |
| residual `r:id` / `r:embed` / `r:link` | Belt and braces against a repair prompt |

Every removal is counted and reported through `onStripReport`, and `inspectScopeAttachment`
warns the user **at attach time** about what will be lost. Silent loss in a contract is not
acceptable; an informed choice is.

### Limitations

- **DOCX only.** A PDF cannot be spliced into `word/document.xml`. PDFs are rejected at
  selection with a message naming the `.docx` alternative, rather than failing inside PizZip.
  If customers commonly send PDF scope documents, this is the gap the extraction design
  below would have covered.
- **PDF-template agreements skip the append** and say so inline.
- **Images are dropped, with a warning.** Full fidelity needs relationship remapping — copying
  `word/media/*`, rewriting `r:id`s, and merging `numbering.xml`. That is the natural follow-up
  and is the one thing standing between this and a byte-faithful annexure.
- **10 MB cap is an upload bound, not a decompression bound.** DEFLATE reaches ~1032:1, so a
  crafted `document.xml` can still exhaust the tab. Blast radius is the rep's own session.

### Review findings addressed (Phases 6 + 7)

Security audit and code review independently converged on the same blockers. All fixed:

| Finding | Fix |
|---|---|
| Scope content containing “included” silently deleted | `verbatim` mode disables the exhibit filters |
| Trailing content trimmed away | Tail-trim skipped in `verbatim` mode |
| Merge failures swallowed — orphan header over nothing | `mergeExhibit` throws in `verbatim`; header removed and the error surfaced if nothing appended |
| Stale attachment reaching another customer's agreement | `scopeAttachmentOwner` tracks the company; a mismatch clears the file |
| Renamed `.zip`/`.xlsx` passing validation | `inspectScopeAttachment` opens the container and requires `word/document.xml` |
| Nested `sectPr` re-paging the agreement; field-code callbacks | Stripped, see table above |
| `octet-stream` falsely rejected | Accepted — the `PK` sniff and container check are the real gates |
| Blocking `alert()` for errors | Inline `scopeAttachmentError` / warning list |
| `docxMerger.ts` at 0 % coverage | `tests/unit/docxMergerVerbatim.test.ts` — 7 tests, 64 % statements, coverage gate added |

### F4 prerequisite: not a blocker on this path

§7.3 made the discount-cleanup fix a hard prerequisite because extracted customer text became
token *values*. The append path writes no token values, so a scope item containing the word
“discount” cannot trigger the cleanup. The fix in `isDiscountOnlyBlock` is still independently
valuable for custom line items and template prose — see §10.2 Q8 — and ships alongside.

---

## Summary

Sales users upload a customer scope document (DOCX or PDF) during the SOW/agreement flow. The
server extracts In-Scope and Out-of-Scope items with heading-based parsing on our own
infrastructure, the user reviews and edits the two lists in the Quote page, confirms them, and the
confirmed lists are merged into the generated agreement for **all** agreement types (Migrate,
Manage incl. Data Sprawl, Bundle, Multi-combination).

The original file is **not** persisted and is **not** attached to the document or the e-sign
envelope.

---

## 0. Findings that shaped this design (verified by execution, not assumed)

These were each confirmed by running code against this repo, and several of them overturn the
obvious design.

| # | Finding | Consequence |
|---|---|---|
| F1 | Any token-map key of the form `{{name}}` flows to docxtemplater automatically. `prepareTemplateData` copies every key matching `key.startsWith('{{')` (`docxTemplateProcessor.ts:2847`), then `docxTemplateProcessor.ts:777-800` strips the braces and also auto-generates space↔underscore variants. | **A string token needs ZERO registration.** The three-place processor registration and the diagnostic registration are required *only* for array/loop keys. This is the single biggest argument for text-block tokens over a loop. |
| F2 | `linebreaks: true` is already set (`docxTemplateProcessor.ts:717`). A `\n` in a token value renders as a real `<w:br/>`, and every line inherits the host paragraph's run formatting (`<w:rPr>` with `<w:b/>`, size, lang all preserved). | One token can render a formatted multi-line bulleted block. No loop needed for visual quality. |
| F3 | docxtemplater escapes token values. Feeding `</w:t></w:r><w:r><w:t>INJECTED & <tag>` into a token produced `&lt;/w:t&gt;&lt;/w:r&gt;&lt;w:r&gt;&lt;w:t&gt;INJECTED &amp; &lt;tag&gt;` in `word/document.xml`. | Extracted customer text **cannot** inject XML through a normal token. No `{@raw}` / rawxml module is used anywhere. Residual risk is control characters (already handled by `sanitizeForXml`) and length only. |
| F4 | **The post-render discount cleanup deletes any paragraph or table row whose text contains the substring `"discount"`** — `docxTemplateProcessor.ts:958-976`, active whenever `{{discount}}` is empty or `'0'`. | **Landmine.** A scope item containing the word "discount" would silently delete the entire scope block. See §7.3 — this requires a prerequisite hardening fix. |
| F5 | Server-side PDF text extraction works from CommonJS with no worker and no network: `await import('pdfjs-dist/legacy/build/pdf.mjs')` in a `.cjs` file returned v5.4.149, opened a 15-page PDF, and extracted 1339 chars from page 1. `textContent.items` expose `hasEOL`. | The no-third-party-calls constraint is satisfiable server-side. Note the **frontend** pdfjs paths all load the worker from `unpkg.com` (`src/utils/pdfProcessor.ts:10`, `pdfWorkerConfig.ts:7`, `tokenFinder.ts:6`) — the server path must not copy that. |
| F6 | This repo's own DOCX files use `<p><strong>` for headings, **not** `<h1>`–`<h6>`. `mammoth.convertToHtml` on `backend-templates/manage-plan-saas-agreement.docx` emitted only `p, strong, br, table, tr, td, ul, li`. | The parser must treat a short bold-only paragraph as a heading candidate. Relying on `<h1>`–`<h6>` alone would find nothing in a typical customer document. |
| F7 | `mammoth.extractRawText` drops `<br/>` **without inserting a separator** — "SaaS<br />Application" became `"SaaSApplication"`. | Use `convertToHtml` and translate `<br/>` → `\n`. `extractRawText` is a lossy fallback only. |
| F8 | Neither `mammoth` nor `pdfjs-dist` is currently required anywhere server-side (frontend-only today). No text-extraction endpoint exists. | Extraction is greenfield; nothing to reuse, nothing to break. |
| F9 | The global multer instances have **no `limits` and no `fileFilter`** (`server.cjs:280-282`, `284-299`). Multipart uploads are effectively unbounded. | Must NOT reuse the global `upload`. A dedicated instance with explicit limits is required. |
| F10 | `POST /api/quotes` (`server.cjs:1859`) writes `configuration` verbatim with no Mongoose model and no schema anywhere in the backend (zero `require('mongoose')` hits repo-wide). It uses `replaceOne` + `upsert:true` on a client-supplied `id`. `PUT /api/quotes/:id` can update **only** `status` (`server.cjs:1948-1956`). | A new `configuration.scopeDetails` field persists for free. But it only reaches Mongo on a full `POST /api/quotes` — never via `PUT`. |
| F11 | `templateDiagnostic.ts:311` rejects any token containing `/`, so `{{/closing}}` tags are invisible to the diagnostic. `templateDiagnostic.ts:170-180` auto-registers **every** `{{#token}}` that is not `#exhibits`/`#servers` as optional. | `{{#has_scope}}` is automatically non-blocking with **no diagnostic change at all**. |
| F12 | Templates live in two places and there are ~113 seeded template entries in `seed-templates.cjs` plus per-combination files. `POST /api/templates/reseed` (`server.cjs:2338`) re-reads from disk and re-tags. Template/exhibit reads are served from a 5-minute in-memory cache (`server.cjs:18-25`), cleared on upload (2152) and reseed (2357). | Rollout must be incremental and must not require touching all ~113 templates. |
| F13 `⚠` | **Every** `/api/quotes` route and **every** upload route is unauthenticated. `POST /api/combinations/:id/file` and `POST /api/templates/reseed` are open to anyone. Auth exists only as in-handler helpers `getExhibitAdminUser` / `getApprovalAdminUser` (`server.cjs:2788`). | Pre-existing, out of scope to fix here, but the new endpoint must not widen it. See §7.5 and Risk R7. |

---

## 1. Architecture

```
┌─────────────────────────── BROWSER ──────────────────────────────┐
│                                                                  │
│  QuoteGenerator.tsx                                              │
│   └─ <ScopeAttachmentPanel>          (new component)             │
│        ├─ file picker  ──POST multipart──┐                       │
│        ├─ two editable lists            │                        │
│        └─ "Confirm scope details"       │                        │
│              │                          │                        │
│              │  parseScopeBlocks()      │                        │
│              │  src/utils/scopeExtraction.ts   (PURE, TESTED)    │
│              ▼                          │                        │
│        configuration.scopeDetails       │                        │
│              │                          │                        │
│              ▼                          │                        │
│  buildScopeAgreementData()              │                        │
│  src/utils/scopeAgreement.ts   (SINGLE BUILDER)                  │
│        │        │        │              │                        │
│    ┌───┘        │        └───┐          │                        │
│    ▼            ▼            ▼          │                        │
│  Map A        Map B        Map C        │                        │
│  (email)    (generate)   (preview)      │                        │
│  :1814        :5131        :2843        │                        │
│    │            │                       │                        │
│    └────────────┴──► docxTemplateProcessor ──► .docx             │
│                                          │                       │
└──────────────────────────────────────────┼───────────────────────┘
                                           │
┌────────────────────── SERVER (server.cjs) ▼ ─────────────────────┐
│  POST /api/scope/extract        (new, scopeUpload.single('file')) │
│    ├─ magic-byte sniff (PK.. / %PDF-)                            │
│    ├─ DOCX → mammoth.convertToHtml  → ScopeBlock[]               │
│    ├─ PDF  → pdfjs legacy (no worker) → ScopeBlock[]             │
│    └─ respond { success, data: { blocks, rawTextPreview, ... } }  │
│       buffer discarded — NOTHING PERSISTED                        │
└──────────────────────────────────────────────────────────────────┘
```

### Why parsing runs in the browser and extraction runs on the server

`server.cjs` is CommonJS; `src/utils/*.ts` is TypeScript compiled only by Vite. A `.cjs` file
cannot import a `.ts` module, so a parser that runs server-side would have to be a **duplicate**
`.cjs` twin of the TS module — exactly the drift this codebase has been burned by (three token
maps, §6).

The split is therefore:

- **Server** owns *text extraction* — it needs `mammoth` and `pdfjs-dist`, which are Node-side
  concerns. The uploaded binary never leaves the server and is never written to disk or Mongo.
- **Browser** owns *parsing* — a pure function over already-extracted text. It gets 100 %
  vitest coverage in the existing harness with zero new tooling, re-runs instantly when the user
  edits, and needs no round-trip.

What crosses the wire is the document's own text returning to the user's own authenticated
session — the same text they are about to read in the review UI. It goes to no third party and to
no LLM, which is what Decision 1 protects. This is called out as **Open Question Q1** in case the
product owner reads "must not leave the server" more strictly, in which case the parser is
duplicated as `scope-extraction.cjs` and the TS module re-exports nothing (accepting the drift
risk and mitigating it with a shared fixture corpus run against both).

---

## 2. Upload + storage

### 2.1 Endpoint

```
POST /api/scope/extract
Content-Type: multipart/form-data
Field: file  (single)
```

**Response (success)** — matches `api-conventions.md` / the `{ success, data }` shape used
throughout `server.cjs`:

```jsonc
{
  "success": true,
  "data": {
    "blocks": [ { "text": "In Scope", "kind": "heading", "level": 1 }, ... ],
    "rawTextPreview": "first 20000 chars of reconstructed plain text",
    "meta": {
      "fileName": "acme-scope.docx",
      "fileType": "docx",
      "pageCount": 4,            // PDF only
      "textLength": 8123,
      "truncated": false,
      "hasTextLayer": true
    }
  }
}
```

**Response (failure)** — `{ success: false, error: "<safe message>" }` with:

| Status | Condition | `error` |
|---|---|---|
| 400 | no file / empty buffer | `Please choose a scope document to upload.` |
| 400 | magic bytes are neither DOCX nor PDF | `Only .docx and .pdf scope documents are supported.` |
| 400 | DOCX/PDF present but unparseable | `That file could not be read. It may be corrupt or password-protected.` |
| 413 | over the size cap (multer `LIMIT_FILE_SIZE`) | `Scope document must be 10 MB or smaller.` |
| 422 | parsed but no text layer | `No text found — this looks like a scanned document. Please type the items in manually.` |
| 500 | unexpected | generic; details logged server-side only |

Per CLAUDE.md ("Error messages don't leak system info") the raw exception text is **not**
returned. Note this differs from the prevailing `server.cjs` habit of
`res.status(500).json({ error: error.message })`; the new endpoint follows the standard, not the
habit.

### 2.2 multer configuration — a dedicated instance

**Do not reuse the module-level `upload`** (`server.cjs:280-282`): it has no `limits` and no
`fileFilter` (F9). Add a third, clearly-scoped instance beside the existing two:

```js
// Scope documents are read once and discarded, so memory storage is right; the global
// `upload` deliberately is not reused because it caps nothing.
const scopeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 4 },
  fileFilter: (req, file, cb) => {
    const ok = SCOPE_MIME_ALLOWLIST.has(file.mimetype) ||
               /\.(docx|pdf)$/i.test(file.originalname || '');
    cb(null, ok);
  }
});
```

`SCOPE_MIME_ALLOWLIST`:
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/pdf`.

**Rationale for the choices**

- **10 MB.** Well under the 50 MB body-parser ceiling and far under the practical ~12 MB
  base64/BSON ceiling that bites other uploads. Scope documents are prose; 10 MB is generous.
  Also bounds peak memory, since multer buffers the whole file before the handler runs.
- **`files: 1`.** One document per quote (Q3 covers multi-file).
- **`fileFilter` is a convenience gate, not the security boundary.** `file.mimetype` is
  client-supplied and must not be trusted; the real check is the magic-byte sniff in §7.1. The
  filter exists to reject obvious mistakes before the buffer is fully read.
- The `LIMIT_FILE_SIZE` multer error must be caught and mapped to 413 — currently no route in
  `server.cjs` handles multer errors, so an uncaught one surfaces as a 500.

### 2.3 What is persisted — recommendation: **nothing but the confirmed lists**

**The raw upload is discarded once extraction returns.** Argued, since the brief asks for it:

*For persisting the file:* re-parsing without re-upload; an audit trail of what the customer sent.

*Against — decisive:*

1. **No consumer.** Decision 2 already rules out attaching it to the document or the envelope.
   Nothing downstream reads it.
2. **The storage layer is a poor fit.** Every blob in this codebase is stored inline in a Mongo
   document in one of *three* mutually incompatible encodings — raw Buffer (`templates`,
   `documents`), base64 string (`combinations`, `exhibits`), and disk paths (e-sign) — forcing
   consumers to sniff (`typeof x.fileData === 'string'` appears at `server.cjs` lines 463, 2277,
   3815, 7253, 7437, 7512, 10284, 11828, 11850). There is no GridFS. Adding a fourth blob site
   adds that tax for no gain.
3. **Base64 in Mongo costs 1.33×** and pushes a 10 MB upload to ~13 MB against a 16 MB BSON
   limit — failing at insert time with a driver error, not a clean 413.
4. **Data-protection surface.** These are customer scope documents. Not storing them is the
   strongest possible answer to "where is this data retained", and CLAUDE.md's Security-First
   value points the same way. The user-visible extracted text is already in the quote.
5. **The confirmed lists are the product of the feature**, and they are what the agreement needs.
   Re-upload is a two-click recovery.

What *is* persisted: `configuration.scopeDetails` (§4), including `sourceFileName` and
`extractedAt` so the audit question "what did this come from" is answerable without the bytes.

---

## 3. Parser design — `src/utils/scopeExtraction.ts`

A pure, side-effect-free, dependency-free TS module. No `fetch`, no DOM, no `File`. Fully
unit-testable in the existing `environment: 'node'` vitest config.

### 3.1 Types

```ts
export type ScopeBlockKind = 'heading' | 'paragraph' | 'listItem' | 'tableCell';

export interface ScopeBlock {
  text: string;
  kind: ScopeBlockKind;
  /** 1-6 for real headings; absent otherwise. */
  level?: number;
  /** True when the source styled this bold-only and short — a heading candidate (F6). */
  boldOnly?: boolean;
}

export type ScopeWarning =
  | 'no-in-scope-heading'
  | 'no-out-of-scope-heading'
  | 'no-scope-headings'
  | 'no-text-layer'
  | 'truncated';

export interface ScopeExtractionResult {
  inScope: string[];
  outOfScope: string[];
  warnings: ScopeWarning[];
}
```

### 3.2 Public API

```ts
/** Primary entry point. Pure. */
export function parseScopeBlocks(blocks: ScopeBlock[]): ScopeExtractionResult;

/** Convenience for plain text (PDF fallback, pasted text, tests). Pure. */
export function parseScopeText(text: string): ScopeExtractionResult;

/** Exported for the server's DOCX pipeline and for tests. Pure. */
export function htmlToBlocks(html: string): ScopeBlock[];

/** Normalises a candidate heading for pattern matching. Exported for tests. */
export function normalizeHeading(raw: string): string;

/** Exported so the UI can label an item's origin. Pure. */
export function classifyHeading(raw: string): 'in' | 'out' | null;
```

Each function stays under 50 lines per CLAUDE.md; `parseScopeBlocks` delegates to
`classifyHeading`, `isHeadingCandidate`, and `splitItems`.

### 3.3 Heading normalisation

`normalizeHeading` applies, in order:

1. Unicode NFKC normalise; convert non-breaking space to space.
2. Strip a leading list marker: `^\s*(\d+|[ivxlcdm]+|[a-z])\s*[.)\]]\s*` (case-insensitive) —
   catches `1.`, `2)`, `A.`, `iii)`.
3. Strip leading/trailing punctuation and decoration: `^[\s\-–—*#•·>]+`, `[\s:;.\-–—*#]+$`.
4. Lowercase; collapse internal whitespace to a single space.
5. Collapse `-` and `_` between word characters to a space, so `in-scope` → `in scope`.

### 3.4 Recognised headings

**Out-of-scope is tested FIRST**, because "Out of Scope" contains "scope" and would otherwise be
swallowed by a loose in-scope pattern. This ordering is load-bearing.

```ts
const OUT_OF_SCOPE_PATTERNS = [
  /^out of scope( items| of work)?$/,
  /^(items? )?not (in scope|included|covered)$/,
  /^exclusions?$/,
  /^excluded( items| services)?$/,
  /^scope exclusions$/,
  /^what'?s not included$/,
  /^outside (the )?scope$/,
];

const IN_SCOPE_PATTERNS = [
  /^in scope( items| of work)?$/,
  /^scope of (work|services|the work)$/,
  /^scope$/,
  /^project scope$/,
  /^included( items| services)?$/,
  /^inclusions?$/,
  /^what'?s included$/,
  /^statement of work$/,
];
```

Because normalisation already removed case, punctuation, colons, hyphens and numbering, this set
covers `In Scope`, `IN-SCOPE:`, `1. In Scope Items`, `Out‑of‑Scope`, `EXCLUSIONS`,
`Scope of Work`, and so on. Every literal above becomes a named test case.

### 3.5 Heading candidates (`isHeadingCandidate`)

A block is a heading candidate if **any** of:

- `kind === 'heading'` (a real `<h1>`–`<h6>`); or
- `boldOnly === true` **and** `text.length <= 80` **and** the text does not end in `.`, `,` or
  `;` — this is the F6 case and the one that will actually fire on real customer documents; or
- `kind === 'paragraph'` and `normalizeHeading(text)` matches an in- or out-of-scope pattern
  exactly. An unstyled line reading exactly `In Scope` must still work.

`kind === 'listItem'` is **never** a heading — a bullet reading "in scope" is an item.

### 3.6 Section boundaries

Walk `blocks` in order with a `current: 'in' | 'out' | null` cursor.

- A heading candidate that `classifyHeading` maps to `'in'` or `'out'` → set the cursor and
  consume the heading (never emit it as an item).
- A heading candidate that classifies as `null` → **close the section** (`current = null`). This
  is what stops an in-scope list running on into "Assumptions" or "Payment Terms".
- Any non-heading block while `current !== null` → split into items and append.
- End of document closes the section.

A repeated heading of the same kind (documents often split scope across pages) **appends** to the
existing list rather than resetting it.

### 3.7 Item splitting (`splitItems`)

Per block:

- `kind === 'listItem'` → exactly one item (the source already delimited it).
- `kind === 'paragraph'` / `'tableCell'` → split on `\n` (which `htmlToBlocks` produced from
  `<br/>`, per F7). If the result is a single line that contains 2+ interior bullet glyphs, split
  on the glyphs too — handles a whole list pasted into one paragraph.

Then per candidate line:

1. Strip leading bullet glyphs: `^[\s•·▪◦‣⁃∙○●□■–—*+>]+`.
2. Strip leading numbering: `^\s*(\d+|[ivxlcdm]+|[a-z])\s*[.)\]]\s+` (requires trailing
   whitespace, so `3.5 GB of data` is not mangled).
3. Trim; collapse internal whitespace runs to one space.
4. Drop if empty, or if it contains no `\p{L}` or `\p{N}` (pure punctuation, e.g. the
   `---------` separator rows seen in this repo's own templates).
5. Drop if identical to the immediately preceding item (tables duplicate cells).
6. Truncate to `MAX_ITEM_CHARS = 500` with a trailing `…`.

Caps: `MAX_ITEMS_PER_LIST = 200`; beyond that stop appending and add the `truncated` warning.

### 3.8 Degenerate cases

| Case | Result |
|---|---|
| In-scope heading found, out-of-scope missing | `outOfScope: []`, warning `no-out-of-scope-heading` |
| Out-of-scope found, in-scope missing | `inScope: []`, warning `no-in-scope-heading` |
| Neither heading found | both `[]`, warning `no-scope-headings`. **Not an error.** UI opens with two empty editable lists and `rawTextPreview` on hand to copy from. |
| Headings found, no items beneath | that list `[]`, no extra warning — a legitimately empty section |
| Scanned PDF / no text layer | server returns 422 with `hasTextLayer: false`; warning `no-text-layer`; UI invites manual entry |
| Password-protected / corrupt | 400, guidance to re-save |

**A failed or empty extraction never blocks the flow.** The user can always type items in by
hand, and can always skip the feature entirely.

### 3.9 DOCX pipeline (server)

```js
const mammoth = require('mammoth');
const { value: html } = await mammoth.convertToHtml({ buffer: req.file.buffer });
// htmlToBlocks equivalent runs here (see Q1) or the html is returned for the client to parse.
```

`convertToHtml` — **not** `extractRawText` (F7 loses `<br/>` boundaries and glues words together).
`htmlToBlocks` maps:

| HTML | `ScopeBlock` |
|---|---|
| `<h1>`…`<h6>` | `kind: 'heading'`, `level: 1..6` |
| `<li>` | `kind: 'listItem'` |
| `<p>` whose entire text sits inside `<strong>`/`<b>` | `kind: 'paragraph'`, `boldOnly: true` |
| other `<p>` | `kind: 'paragraph'` |
| `<td>` | `kind: 'tableCell'` (scope docs commonly use a 2-column In/Out table) |
| `<br/>` | `\n` inside the enclosing block's text |

Entities are decoded (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`, `&nbsp;`) and all other tags
dropped. Nested lists flatten to `listItem` — indentation is not meaningful for these two lists.

A default mammoth style map is sufficient; no custom `styleMap` is needed, because the
`boldOnly` heuristic (F6) is what carries real-world documents.

### 3.10 PDF pipeline (server)

```js
// Legacy build + no worker: v5 ships ESM only, and the browser paths in this repo fetch the
// worker from unpkg — a scope document must not depend on a third-party CDN.
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const doc = await pdfjs.getDocument({
  data: new Uint8Array(req.file.buffer),
  isEvalSupported: false,   // no dynamic code from untrusted PDFs
  useSystemFonts: false,    // no host font enumeration
  disableFontFace: true,
}).promise;
```

Verified working from CJS (F5). The dynamic `await import()` is required because `server.cjs` is
CommonJS and the legacy build is `.mjs`; it must be resolved lazily inside the handler (or cached
in a module-level promise) — a top-level `require` will throw.

Per page: `getTextContent()`, then reconstruct lines by accumulating `items[].str` and breaking on
`item.hasEOL === true` (present in v5.4.149, confirmed). Heading detection has no styles to work
with, so:

- take `Math.abs(item.transform[3])` as the glyph height for each line;
- compute the document's **median** line height;
- a line is `boldOnly: true` (heading candidate) if its height exceeds the median by ≥ 15 %, or if
  it is ≤ 80 chars and entirely uppercase with no terminal `.`;
- everything else is `kind: 'paragraph'`.

Guards: cap at `MAX_PDF_PAGES = 100` (add `truncated`); cap total extracted text at
`MAX_TEXT_CHARS = 500_000`; a per-document timeout so a pathological PDF cannot pin a worker.
Non-whitespace character count `< 20` across all pages ⇒ `hasTextLayer: false` ⇒ 422 (§3.8). OCR
is explicitly out of scope (Q4).

---

## 4. Data shape

### 4.1 Canonical location — `configuration.scopeDetails`

Add to `ConfigurationData` in `src/types/pricing.ts` (after `manageSprawlType`, ~line 134):

```ts
  // Confirmed In-Scope / Out-of-Scope items merged into the generated agreement.
  // Absent on every quote saved before this feature — treated as "no scope".
  scopeDetails?: {
    inScope: string[];
    outOfScope: string[];
    /** Set when the user confirms; absent means "extracted but not yet confirmed". */
    confirmedAt?: string;
    sourceFileName?: string;
    extractedAt?: string;
  };
```

Optional, additive, no migration. F10 confirms `configuration` is written verbatim with no schema,
so nothing server-side needs to change to store it.

**One canonical home, deliberately.** The tempting alternative — mirroring into
`localStorage` the way Custom Line Items do (`cpq_quote_custom_line_items`,
`QuoteGenerator.tsx:771-789`) — creates two sources of truth, which is the exact failure mode this
codebase has repeatedly paid for. Custom Line Items' localStorage-only design is also why they
never reach the saved quote; this feature should not copy that.

### 4.2 Persistence across navigation and refresh

`ConfigurationForm` owns `cpq_configuration_session` and `cpq_navigation_state` and writes them
together in six places (`ConfigurationForm.tsx:179`, `1169`, `1214`, `1318`, `1381`, `2151`).
`src/utils/sessionConfig.ts` exists precisely so the Quote page reads that key without
duplicating knowledge of it.

The Quote page must now *write* it, so extend that same module rather than adding a seventh
inline `setItem` pair:

```ts
// src/utils/sessionConfig.ts — added beside readStoredConfiguration
export function patchStoredConfiguration(
  patch: Partial<ConfigurationData>,
  storage?: Pick<Storage, 'getItem' | 'setItem'>
): ConfigurationData | undefined;
```

It reads the current config, shallow-merges `patch`, writes `cpq_configuration_session`, and
mirrors into `cpq_navigation_state.configuration` — the same pair, in one place, so the two keys
cannot diverge. `sessionConfig.test.ts` already covers the read half; the write half gets the same
treatment.

Flow:

- **Confirm** → `patchStoredConfiguration({ scopeDetails })` + `setConfiguration` in React state.
- **Refresh on `/quote`** → `readStoredConfiguration()` rehydrates `scopeDetails` with everything
  else. No new hydration path.
- **Navigate away and back** → same.
- **Save quote** → `configuration` (with `scopeDetails`) goes to Mongo via `POST /api/quotes`.

`sessionStorage` (not `localStorage`) matches the existing configuration lifetime: scope details
belong to the quote being built, and should not leak into the next one in a new tab.

### 4.3 Backward compatibility

- `scopeDetails === undefined` on every existing quote ⇒ the builder returns empty tokens ⇒
  `{{has_scope}}` is `''` ⇒ the block is removed ⇒ **byte-identical output to today** for every
  existing template and quote.
- `readStoredConfiguration` already guards non-object/array payloads
  (`sessionConfig.ts:19`), so an older or corrupt snapshot degrades to `undefined`.
- The builder defensively coerces: non-array ⇒ `[]`; non-string entries filtered; entries trimmed.
  A hand-edited Mongo document cannot crash generation.

### 4.4 Unconfirmed vs confirmed

Extraction results live in **component state only** until the user presses Confirm. `confirmedAt`
is the gate: `buildScopeAgreementData` ignores `scopeDetails` without a `confirmedAt`, so nothing
half-reviewed can reach an agreement. This is the "confirmed details" requirement, enforced in the
builder rather than by UI discipline.

---

## 5. Agreement rendering

### 5.1 Recommendation: **single text-block tokens**, not a docxtemplater loop

| Criterion | Loop `{{#inScopeItems}}` | **Text-block tokens** |
|---|---|---|
| Processor registration | **3 places** (`DocxTemplateData` ~118, `prepareTemplateData` ~2316, remaining-keys loop ~2847). Miss one ⇒ **zero rows, no error, self-check still passes** | **None.** F1: `{{name}}` keys flow through automatically |
| Diagnostic registration | 2 places (`extractNestedDataTokens` ~34, `optionalLoopItemTokens` ~127) or generation is **blocked** | **None.** F11: `{{#has_scope}}` is auto-optional |
| Token-map typing | Array can't live in `Record<string, string>` ⇒ `(templateData as any).x =` **outside** the literal, **before** the diagnostic. Fragile ordering (`QuoteGenerator.tsx:8462-8468` documents exactly this) | All values are strings ⇒ inside the literal, `...spread`. **No `any`, no ordering hazard** (CLAUDE.md: no unjustified `any`) |
| Template edit by hand in Word | 4+ tokens across cells; Word splits tokens across `<w:t>` runs (F/constraint 8) | 1 token per block |
| Rollout across ~113 templates | Table surgery per template | One paragraph per template |
| Empty state | Table-row loop is OK, but the "tag-only rows" variant leaves blank rows, and the cleanup that removes them **only runs when no discount applies** (`set-datasprawl-rows.cjs:11-13`, `docxTemplateProcessor.ts:970-977`) | `''` ⇒ `{{#has_scope}}` removes the block. Unconditional |
| Per-item Word bullet styling | Native list formatting | Literal `• ` glyphs; F2 confirms run formatting is inherited and `<w:br/>` separates lines |
| Silent-failure surface | High | Effectively zero |

The only real loss is native Word list styling. Against that sits a five-place registration
minefield that fails **silently**, multiplied across ~113 hand-edited templates. For a feature
shipping to *all* agreement types, **text-block tokens win decisively.**

If a flagship template later needs native bullets, §5.5 records the exact loop recipe so it is a
deliberate, checklisted change rather than a discovery.

### 5.2 Tokens

Produced by `buildScopeAgreementData` (§6), all `string`:

| Token | Value when confirmed scope exists | Value otherwise |
|---|---|---|
| `{{in_scope_items}}` | `• Item one\n• Item two\n…` | `''` |
| `{{out_of_scope_items}}` | `• Item one\n• Item two\n…` | `''` |
| `{{has_scope}}` | `'true'` | `''` |
| `{{has_in_scope}}` | `'true'` if `inScope.length > 0` | `''` |
| `{{has_out_of_scope}}` | `'true'` if `outOfScope.length > 0` | `''` |
| `{{in_scope_count}}` | `'7'` | `'0'` |
| `{{out_of_scope_count}}` | `'3'` | `'0'` |

The bullet glyph is `'• '` and the join is `'\n'`, which F2 proved renders as `<w:br/>` with the
paragraph's own formatting preserved.

`{{in scope items}}` (spaces) works for free — `docxTemplateProcessor.ts:793-800` auto-generates
space↔underscore variants of every `{{...}}` key. No extra aliases are defined; alias sprawl is
how the three token maps drifted in the first place.

### 5.3 The exact template edit the user must author

Four paragraphs, each its own Word paragraph (`paragraphLoop: true` is already set, so a
section tag alone on a paragraph is removed cleanly):

```
{{#has_scope}}
In Scope
{{in_scope_items}}
Out of Scope
{{out_of_scope_items}}
{{/has_scope}}
```

Where:

- Line 1 is a paragraph containing **only** `{{#has_scope}}`.
- `In Scope` / `Out of Scope` are ordinary text in the template's existing heading style — they
  are the author's static labels, not tokens.
- `{{in_scope_items}}` / `{{out_of_scope_items}}` each sit alone in a body-text paragraph. Apply
  the paragraph's indent and font there; every rendered line inherits it (F2).
- Last line is a paragraph containing **only** `{{/has_scope}}`.

To suppress just one side when the other is present, wrap each half:
`{{#has_in_scope}}In Scope / {{in_scope_items}}{{/has_in_scope}}`.

**Two authoring rules, both from verified findings:**

1. **Put these tokens in paragraphs, never in table cells.** The post-render pass deletes any
   table row whose stripped text is empty when no discount applies
   (`docxTemplateProcessor.ts:970-977`) — a table-cell scope block with an empty list would
   vanish inconsistently depending on whether a discount is in play.
2. **See §7.3** — the word "discount" appearing in a scope item is currently destructive (F4) and
   must be fixed before this ships.

### 5.4 Rollout across templates (F12)

There are two template homes — the `templates` collection (seeded from `backend-templates/*.docx`
via `POST /api/templates/reseed`) and files attached to combinations
(`POST /api/combinations/:id/file`, which is what the live Data Sprawl agreement uses). The user
edits and re-uploads templates by hand.

**Incremental, opt-in, per template. There is no big-bang.** Because an un-upgraded template is
byte-identical to today (§5.6), templates can be upgraded one at a time, in any order, with no
coordination.

Recommended order:

1. **One pilot** — the Data Sprawl combination file, since it is live and exercises the
   Manage/loop-heavy path. Verify end-to-end before touching anything else.
2. **The templates users actually reach**, by demand order, not all 113.
3. **`backend-templates/*.docx` last**, and only for files that reseed re-tags.

**Provide `scripts/set-scope-tokens.cjs`** — modelled directly on
`scripts/set-datasprawl-rows.cjs` (the run-aware precedent for constraint 8). It must be:

- **run-aware** — `setText()` puts the whole string in the first `<w:t>` of the node, sets
  `xml:space="preserve"`, and empties the rest, so Word's run splitting cannot break a token;
- **idempotent** — re-running writes nothing (`if (textOf(node) === text) return false`);
- **path-argument driven** — `node scripts/set-scope-tokens.cjs path/to/file.docx [--dry-run]`,
  so it patches any downloaded copy, not just repo files;
- **anchor-based and fail-safe** — locate an author-inserted marker paragraph (e.g. a paragraph
  whose text is exactly `SCOPE_BLOCK`) and replace it with the six paragraphs; if the anchor is
  absent, **abort with no changes** rather than guessing.

This makes the human workflow: insert one marker paragraph in Word → run the script → re-upload.
No hand-typed tokens anywhere.

**Reseed caution.** `POST /api/templates/reseed` re-reads DOCX from disk and re-tags
`planType`/`combination`/`name`, which can break Manage template matching. So: a template
upgraded **only** in Mongo is lost on the next reseed, and a template upgraded on disk without
reseeding never reaches users. For any template that reseed manages, patch the file in
`backend-templates/` **and** commit it. Combination files are not touched by reseed and are safe
to upgrade in place. After any upload or reseed, the 5-minute template cache is cleared
(`server.cjs:2152`, `2357`), so no manual cache step is needed.

### 5.5 If a loop is ever needed later — the full checklist

Recorded so it is never rediscovered by debugging. To add `{{#inScopeItems}}`:

1. `docxTemplateProcessor.ts` ~line 118 — add `inScopeItems?: Array<{ scopeItem: string; isLast?: boolean }>` to `DocxTemplateData`.
2. `docxTemplateProcessor.ts` ~line 2316 — add the `Array.isArray` passthrough beside `sprawlRows`, **defaulting to `[]`**.
3. `docxTemplateProcessor.ts` ~line 2847 — extend the remaining-keys condition to `|| key === 'inScopeItems'`.
4. `templateDiagnostic.ts` ~line 34 — in `extractNestedDataTokens`, add the `dataKey === 'inScopeItems'` branch registering `scopeItem` and `isLast` **before** the `value.length === 0` early-continue, so an empty array still registers.
5. `templateDiagnostic.ts` ~line 127 — add `hasScopeLoop = templateTokens.includes('#inScopeItems')` and push the item tokens into `optionalLoopItemTokens`.
6. `QuoteGenerator.tsx` — attach `(templateData as any).inScopeItems = …` **before** line 8472 in Map B, and in Map A before the processor call.
7. Use the **same-row** loop form (`{{#x}}…{{/x}}` opening and closing within one table row). Do **not** use tag-only loop rows — `set-datasprawl-rows.cjs:11-13` records that they leave blank rows the cleanup only removes when no discount applies.

Missing any of 1–3 renders zero rows with no error and the "no remaining tokens" self-check still
passes. Missing 4–5 blocks generation outright.

### 5.6 Degradation matrix (constraint 5)

| Template | Scope confirmed? | Result | Why |
|---|---|---|---|
| **No scope tokens** (all ~113 today) | No | **Byte-identical to today** | Extra data keys are ignored by docxtemplater. `findExtraTokens` reports them but only `filteredMissing`/`filteredMismatched` gate (`QuoteGenerator.tsx:8534`), and adding *data* tokens can never create a missing or mismatched *template* token |
| **No scope tokens** | Yes | **Byte-identical to today**; scope silently omitted | Same. Q2: should the UI warn the user? |
| **Has scope tokens** | No | Whole `{{#has_scope}}` block removed; clean document | `has_scope: ''` is falsy ⇒ section renders nothing |
| **Has scope tokens** | Yes, both lists | Both blocks render | — |
| **Has scope tokens** | Yes, one list empty | `{{#has_in_scope}}` wrapper removes that half; the other renders. Without the wrapper, an empty heading + empty line remain | Author's choice of wrapper granularity |
| **Has `{{#has_scope}}` but old app build** | n/a | `nullGetter` returns `''`; section removed | Forward-compatible: a patched template is safe to deploy **before** the app |

That last row matters for rollout: templates can be upgraded ahead of the app.

**The diagnostic never blocks on this feature.** Adding data tokens cannot create missing tokens;
`{{#has_scope}}` / `{{#has_in_scope}}` are auto-registered optional by
`templateDiagnostic.ts:170-180`; and `{{/has_scope}}` is invisible because tokens containing `/`
are rejected at line 311 (F11). **No change to `templateDiagnostic.ts` is required** — a direct
consequence of choosing tokens over a loop.

---

## 6. The single builder module — `src/utils/scopeAgreement.ts`

Follows the `sprawlAgreement.ts` pattern exactly: one module owns the token shape, and all three
token maps consume it. This is the fix for the three-maps drift (constraint 3), and the reason
`sprawlRows` reached Map A and Map B identically.

```ts
import { ConfigurationData } from '../types/pricing';

export interface ScopeAgreementData {
  inScope: string[];
  outOfScope: string[];
  isEmpty: boolean;
  tokens: Record<string, string>;
}

/**
 * Derived from the live configuration on every render, never from a stored snapshot.
 * One builder for every agreement path — these token maps have drifted apart before.
 * Unconfirmed scope is treated as absent: confirmedAt is the gate.
 */
export function buildScopeAgreementData(
  config: ConfigurationData | undefined
): ScopeAgreementData;
```

Behaviour:

- No `config`, no `scopeDetails`, or no `confirmedAt` ⇒ `isEmpty: true` and every token `''`/`'0'`.
- Coerces defensively: non-array ⇒ `[]`; non-string entries dropped; each entry trimmed; blanks
  dropped; capped at `MAX_ITEMS_PER_LIST`.
- `formatScopeBlock(items)` joins as `items.map(i => '• ' + i).join('\n')` — exported for tests.
- All values are `string`, so `tokens` slots straight into a `Record<string, string>` literal.

### 6.1 Wiring into the three maps

| Map | File / line | Change |
|---|---|---|
| **A — email** | `QuoteGenerator.tsx:1814` (`handleEmailAgreement`, `Record<string, string>`) | add `...scopeAgreement.tokens,` inside the literal, beside the existing `...(sprawlAgreement?.tokens ?? {}),` at 1874 |
| **B — generate** | `QuoteGenerator.tsx:5131` (`handleGenerateAgreement`, `Record<string, string>`) | add `...scopeAgreement.tokens,` inside the literal, beside line 5221 |
| **C — preview** | `QuoteGenerator.tsx:2843` (`generatePlaceholderPreview`, `placeholderMappings`, **untyped**) | add `...scopeAgreement.tokens,` — this map currently has **no** sprawl spread and **no** `sprawlRows`, i.e. it is already drifted |

Because the values are strings, they go **inside** each literal via spread — no `as any`, and no
dependency on running before the diagnostic (constraint 4 is sidestepped rather than managed).

Derivation, once per path, mirroring how `sprawlAgreement` is derived at 1744 / 4964 / 2888:

```ts
const scopeAgreement = buildScopeAgreementData(<the path's config expression>);
```

`⚠ Config-resolution drift.` The three paths resolve "the configuration" three different ways —
Map A uses `configuration`, Map B uses `(finalConfiguration || quoteData.configuration || configuration)`,
Map C uses `quote.configuration`. `sprawlPerDataCost` is already called with three different
expressions (1744, 4962, 2890). To avoid adding a fourth variant, add one exported helper next to
the builder:

```ts
/** The one place that decides which config object an agreement path should read. */
export function resolveAgreementConfig(
  candidates: Array<ConfigurationData | undefined>
): ConfigurationData | undefined;
```

Each path calls it with its own candidate list, so precedence lives in one module. Map C's
untyped `placeholderMappings` should also gain an explicit `Record<string, string>` annotation as
part of this change, so it can no longer drift structurally from A and B.

---

## 7. Security

### 7.1 File-type validation — never trust the client MIME type

`file.mimetype` is client-supplied. It is used only for the cheap `fileFilter` pre-screen; the
authoritative check is a **magic-byte sniff** in the handler, before any parser touches the buffer:

- **DOCX** — bytes 0..1 must be `0x50 0x4B` (`PK`), i.e. a ZIP. This is the check
  `server.cjs:2296-2309` already performs for templates; reuse it.
- **PDF** — bytes 0..4 must be `%PDF-`.

Then **route by sniffed type, not by extension or MIME** — a `.docx` that is really a PDF goes to
the PDF pipeline or is rejected, never to mammoth. Anything matching neither ⇒ 400.

Additionally: `originalname` is never used as a filesystem path (nothing is written to disk), and
it is length-capped and control-char-stripped before being stored as `sourceFileName` or echoed
back.

### 7.2 Size, zip-bombs and malformed archives

- **Wire size** — multer `limits.fileSize: 10 MB`, `files: 1` (§2.2). `LIMIT_FILE_SIZE` mapped to
  413, not an uncaught 500.
- **Zip-bomb / decompression bomb** — a 10 MB DOCX can inflate to gigabytes. mammoth reads the
  archive itself, so before calling it, open the buffer with the already-available `jszip`/`pizzip`
  and reject when: entry count > `MAX_ZIP_ENTRIES` (1000); total uncompressed size of the entries
  we care about > `MAX_UNCOMPRESSED_BYTES` (50 MB); `word/document.xml` is absent (the same
  400 `server.cjs:4730` already returns); or any entry name is absolute or contains `..`
  (zip-slip — defensive, since nothing is extracted to disk).
- **XML-entity expansion (billion laughs)** — `word/document.xml` is parsed by mammoth's own
  parser, not by `@xmldom/xmldom` here. Reject a `document.xml` containing a `<!DOCTYPE` or
  `<!ENTITY` declaration before parsing; legitimate Word output has neither.
- **Malformed PDF** — `isEvalSupported: false`, `useSystemFonts: false`, `disableFontFace: true`
  (§3.10); page cap 100; total-text cap 500 000 chars; per-document timeout. All parser calls are
  wrapped in `try/catch` returning a safe 400 (CLAUDE.md: never skip error handling in async
  functions).
- **Output caps** — 200 items per list, 500 chars per item (§3.7), enforced **again** in the
  builder, so a hand-edited Mongo document cannot produce a 50 MB agreement.

### 7.3 `⚠ REQUIRED PREREQUISITE` — extracted text becomes document content

**Finding F4 is a real, silent, destructive conflict with existing behaviour.**
`docxTemplateProcessor.ts:958-976` runs whenever `{{discount}}` is empty or `'0'` and deletes:

```js
// current predicate — substring match on the whole paragraph/row
return text.includes('discount') ? '' : row;   // and the same for <w:p>
```

With `linebreaks: true`, **all** in-scope items render inside **one** `<w:p>`. So a single
customer scope item such as *"Apply volume discount rules to migrated licences"* would delete the
**entire In-Scope block** — silently, only on quotes without a discount, and only for that
customer. This is precisely the class of defect the brief asks us not to repeat.

**Required fix, before this feature ships** — narrow the predicate from "contains" to "is a
discount label":

```js
// Only strip a row/paragraph that IS a Discount label, not any text mentioning the word.
// Document body text (e.g. scope items) can legitimately contain "discount".
const isDiscountLabel = (text) => /^discount\b/.test(text) && text.length <= 60;
```

This also fixes a latent bug for custom line items (an item named "Loyalty discount" is deleted
today) and for any template with the word in its prose. It touches existing behaviour, so it needs
a regression pass over templates carrying a static Discount row — a Backend/Frontend task with its
own test, listed as step 0 in §8.

Mitigations that were considered and rejected: rewriting the customer's words (alters their
content); emitting one paragraph per item (reduces the blast radius to one item but still loses
customer text silently); reordering the cleanup before render (impossible — docxtemplater has
already rendered).

### 7.4 XML safety of extracted text

- **Injection is not possible via tokens.** F3 verified that docxtemplater escapes `<`, `>`, `&`
  and `"` in values, and no `{@raw}`/rawxml module is configured. Extracted text can never become
  markup.
- **Control characters** are stripped by the existing `sanitizeForXml` /
  `stripXmlControlChars` (`docxTemplateProcessor.ts:2251-2268`), applied to nested strings and
  arrays, which prevents docxtemplater's `invalid_xml_characters` error.
- **The parser should additionally strip**, at extraction time, so bad characters never reach the
  configuration or the review UI: U+0000-U+001F (except tab and newline), U+007F,
  unpaired surrogates, and the zero-width / bidi-override ranges U+200B-U+200F and
  U+202A-U+202E - a bidi override inside a scope item could visually reorder agreement
  text.
- **The review UI renders items as React text**, never `dangerouslySetInnerHTML`, so HTML in a
  scope document cannot execute in the app.

### 7.5 Authentication and rate limiting

F13: every `/api/quotes` route and every upload route in `server.cjs` is currently
unauthenticated, and `GET /api/quotes` returns every quote in the database to any caller. That is
pre-existing and out of scope here, but:

- The new endpoint **must not widen** the gap. `POST /api/scope/extract` performs CPU- and
  memory-heavy parsing, so it is a denial-of-service lever. Recommended: gate it with the existing
  in-handler JWT pattern (a `getAuthenticatedUser(req, res)` sibling of `getExhibitAdminUser`,
  `server.cjs:2788`, without the admin-role check) and apply per-user/per-IP rate limiting —
  CLAUDE.md mandates 100 req/min per IP and rate limiting on sensitive endpoints. A tighter
  bucket (e.g. 10/min) suits an upload endpoint.
- Note that in the existing pattern the auth check runs **after** multer has buffered the whole
  file (as at `server.cjs:3054`). For an upload route the check should run **before** the multer
  middleware so an unauthenticated caller cannot make us buffer 10 MB.
- **Never log document content.** Log only `{ fileName, fileType, byteSize, blockCount,
  itemCounts, warnings }`. Customer scope text must not reach application logs (CLAUDE.md: never
  log sensitive data). This is flagged because the surrounding code logs very freely.
- **No `console.log` in new `src/` code** (CLAUDE.md hard rule) — the parser and builder are silent
  and return warnings as data. Server-side logging follows existing `server.cjs` conventions.

---

## 8. Implementation sequence

Ordered so the highest-risk, highest-value logic is testable in isolation first, and each step is
independently verifiable.

| # | Step | Owner | Testable in isolation | Est. |
|---|---|---|---|---|
| **0** | **`⚠` Harden the discount cleanup** (§7.3) — narrow to `isDiscountLabel`. Regression-check templates with static Discount rows. **Blocks everything else.** | Backend/FE | Yes — unit test the predicate; render a template whose body contains "discount" | 3 h |
| **1** | **`src/utils/scopeExtraction.ts`** — types, `normalizeHeading`, `classifyHeading`, `isHeadingCandidate`, `splitItems`, `htmlToBlocks`, `parseScopeBlocks`, `parseScopeText`. **Pure. No UI, no server, no deps.** | FE | **Yes — fully.** `tests/unit/scopeExtraction.test.ts`, `environment: 'node'` | 10 h |
| **2** | **`src/utils/scopeAgreement.ts`** — `buildScopeAgreementData`, `formatScopeBlock`, `resolveAgreementConfig`. Add `scopeDetails` to `ConfigurationData`. | FE | **Yes.** `tests/unit/scopeAgreement.test.ts` | 4 h |
| **3** | **`POST /api/scope/extract`** in `server.cjs` — `scopeUpload`, magic-byte sniff, zip guards, mammoth pipeline, pdfjs pipeline, error mapping, auth + rate limit. | Backend | Mostly — curl against fixture files | 10 h |
| **4** | **`patchStoredConfiguration`** in `src/utils/sessionConfig.ts` | FE | **Yes.** Extend `tests/unit/sessionConfig.test.ts` | 2 h |
| **5** | **`ScopeAttachmentPanel`** component + wiring into `QuoteGenerator.tsx` after the Custom Line Items block (~11101) | FE | Yes — jsdom component test | 12 h |
| **6** | **Wire the three token maps** (§6.1) — spreads at 1874, 5221, and into Map C; annotate Map C `Record<string, string>` | FE | Via the docx render test | 3 h |
| **7** | **`scripts/set-scope-tokens.cjs`** — run-aware, idempotent, anchor-based, `--dry-run` | FE/DevOps | **Yes** — `--dry-run` on a copy; assert idempotence | 5 h |
| **8** | **Pilot one template** — the Data Sprawl combination file; end-to-end verify | QA | E2E | 3 h |
| **9** | **Docs** — extend `ADD_NEW_COMBINATION_WORKFLOW.md` / `UPLOAD_EXHIBIT_FLOW.md` with the template-authoring recipe | Docs | n/a | 2 h |

**Estimated total: ~54 h (~7 working days).** Steps 1–2 and 3 can proceed in parallel once the
`ScopeBlock` contract is fixed.

### 8.1 New tests

- `tests/unit/scopeExtraction.test.ts` — every literal in `IN_SCOPE_PATTERNS` /
  `OUT_OF_SCOPE_PATTERNS`; the out-before-in ordering; `<li>`/`<br>`/`<td>` splitting; bullet and
  numbering strip (including `3.5 GB` **not** being stripped); the `<p><strong>` heading case
  (F6); section termination at an unrelated heading; repeated same-kind headings appending; each
  degenerate case in §3.8; the caps; control/bidi stripping. **Target 100 % — this is critical
  business logic per CLAUDE.md.**
- `tests/unit/scopeAgreement.test.ts` — empty/undefined/unconfirmed ⇒ all-empty tokens;
  `confirmedAt` gating; bullet formatting; `has_*` truthiness; defensive coercion of malformed
  persisted data; `resolveAgreementConfig` precedence.
- `tests/unit/scopeAgreementDocx.test.ts` — modelled on the existing
  `tests/unit/sprawlAgreementDocx.test.ts` (same `PizZip` + `Docxtemplater` harness, same
  `paragraphLoop`/`linebreaks`/`delimiters`/`nullGetter` options). Render a fixture template
  carrying the §5.3 block and assert: items appear; `<w:br/>` separates them; empty scope removes
  the block; `expect(xml).not.toContain('{{')`; **and a scope item containing the word "discount"
  survives** (the F4 regression).
- `tests/unit/sessionConfig.test.ts` — extend for `patchStoredConfiguration`: merge, both keys
  written, corrupt payload tolerated.

### 8.2 Existing tests to extend

- `tests/unit/sessionConfig.test.ts` — as above.
- `tests/unit/sprawlAgreementDocx.test.ts` — add a case asserting the Data Sprawl agreement is
  **unchanged** when `scopeDetails` is absent, locking in §5.6 row 1.
- `vitest.config.ts` — add `src/utils/scopeExtraction.ts` and `src/utils/scopeAgreement.ts` to
  the per-module `coverage.thresholds` block (the global 80 % gate is deferred there, so new
  modules must be listed explicitly or they are ungated).

### 8.3 Keeping this feature's own code typechecked (constraint 7)

`tsconfig.json` is a solution file (`"files": []`), so `tsc --noEmit -p tsconfig.json` checks
nothing; the real check is `tsc --noEmit -p tsconfig.app.json`, which has ~380 pre-existing
errors, and `vite build` does not typecheck at all.

Approach — **prove the delta is zero rather than fixing the baseline:**

1. Record the baseline once:
   `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`.
2. Before each PR, re-run and assert the count has not increased, and that **no** error line
   references `scopeExtraction.ts`, `scopeAgreement.ts`, `sessionConfig.ts`, `ScopeAttachmentPanel.tsx`,
   or a line the change introduced in `QuoteGenerator.tsx`:
   `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "scopeExtraction|scopeAgreement|ScopeAttachmentPanel"`
   must be empty.
3. Both new `src/utils` modules must be clean under `tsconfig.app.json`'s `strict`,
   `noUnusedLocals`, `noUnusedParameters`. They have no DOM or React dependency, so this is
   cheap to hold.
4. No `any` in the new modules. The `(templateData as any)` pattern is **not needed** here —
   that is a direct benefit of §5.1 (CLAUDE.md: no unjustified `any`).
5. `npm run lint` and `npm test` clean.

A CI step asserting the error count is non-increasing would make this durable, but adding it
touches `.github/workflows/ci.yml` and is a separate, team-approved change.

---

## 9. Review/edit UI

### 9.1 Placement

A new collapsible **`ScopeAttachmentPanel`** in `src/components/`, rendered inside
QuoteGenerator's Client Information Form immediately **after** the Custom Line Items collapsible
(which occupies `QuoteGenerator.tsx:10952-11101`) and **before** the Preview Agreement CTA at
11103. Order becomes:

> Template indicator → Contact/Legal Entity → Dates → Payment Terms → Custom Line Items →
> **Scope Details** → Preview Agreement → Send to Deal Desk

This matches the brief's suggestion and the established precedent: it is optional, agreement-shaping
content that the user reviews just before generating. It follows the Custom Line Items collapsible
pattern (auto-expand when data already exists, `QuoteGenerator.tsx:821-823`).

Unlike Custom Line Items, the panel is a **separate component**, not inline JSX —
`QuoteGenerator.tsx` is already 12 129 lines, and CLAUDE.md caps functions at 50 lines.

### 9.2 States

1. **Empty** — "Upload a scope document (.docx or .pdf, max 10 MB)" + a drop zone, plus
   **"Enter scope manually"**, which opens both lists empty. The feature is usable with no upload
   at all.
2. **Uploading/extracting** — spinner, disabled control, cancellable.
3. **Extracted** — two side-by-side editable lists (In Scope / Out of Scope) with per-list counts,
   plus a **"Confirm scope details"** button.
4. **Extraction warning** — a non-blocking banner per §3.8 (e.g. "We couldn't find an
   Out of Scope heading — add items manually or re-upload"). For `no-scope-headings` the panel
   also shows a collapsible **"View extracted text"** (from `rawTextPreview`) so the user can
   copy items across. For `no-text-layer`, an explicit "scanned document" message.
5. **Confirmed** — collapsed summary: *"Scope confirmed — 7 in scope, 3 out of scope · acme-scope.docx"*
   with **Edit** (reopens step 3, clearing `confirmedAt`) and **Remove** (clears `scopeDetails`).
6. **Error** — the `error` string from §2.1 with a retry.

### 9.3 List behaviour

Each list supports **add / edit / remove / reorder**:

- **Add** — a text input with Enter-to-add; also accepts a multi-line paste, which is run through
  `parseScopeText` so pasting a bulleted block yields several items rather than one. This is a
  direct reuse dividend from the parser being pure and client-side.
- **Edit** — inline; click to edit, blur or Enter to commit, Escape to cancel. Empty ⇒ removed.
- **Remove** — an × per row.
- **Reorder** — up/down buttons (keyboard-accessible, and far less fragile than drag-and-drop).
  Order is meaningful: it is the order printed in the agreement.
- **Move to other list** — a → / ← control. Misclassification is the most likely extraction
  error, so one-click reclassification is the highest-value affordance here.
- Client-side per-item length cap with a counter, matching the parser's 500-char cap.
- Empty lists are legitimate and show *"No items — add one, or leave empty"*.

TailwindCSS only, no inline styles; mobile-first; items rendered as React text (§7.4).

### 9.4 The confirmation step

**Confirm scope details** is what makes content "confirmed". On click:

1. Build `scopeDetails = { inScope, outOfScope, confirmedAt: new Date().toISOString(), sourceFileName, extractedAt }`.
2. `setConfiguration` in React state.
3. `patchStoredConfiguration({ scopeDetails })` (§4.2).
4. Collapse to the summary.

Only then does `buildScopeAgreementData` emit non-empty tokens (§4.4), so the confirmation gate is
enforced in the builder, not by UI discipline. Any subsequent edit clears `confirmedAt` and
requires re-confirmation, so an agreement can never contain unreviewed extracted text.

---

## 10. Risks and open questions

### 10.1 Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| **R1** | **The "discount" cleanup deletes the scope block** (F4, §7.3) | **Critical** — silent customer-content loss | Step 0 is a blocking prerequisite; regression test in `scopeAgreementDocx.test.ts` |
| **R2** | Heading-based parsing misses real-world documents (F6: no `<h1>` in practice) | High | The `boldOnly` heuristic; the exact-text-match fallback; the always-available manual path; a fixture corpus of **real** customer scope documents gathered before step 1 |
| **R3** | Template rollout stalls — ~113 templates, hand-edited (F12) | Medium | Un-upgraded templates are byte-identical to today (§5.6), so rollout is incremental and needs no coordination; `set-scope-tokens.cjs` removes hand-typing |
| **R4** | A template upgraded only in Mongo is reverted by the next reseed (F12) | Medium | Patch `backend-templates/` on disk **and** commit, for any template reseed manages; combination files are unaffected |
| **R5** | Word splits tokens across `<w:t>` runs, so hand-edited tokens silently fail | Medium | `set-scope-tokens.cjs` writes run-aware, exactly as `set-datasprawl-rows.cjs` does; the author only inserts a plain marker paragraph |
| **R6** | Server-side pdfjs is heavy and could exhaust memory or event-loop time | Medium | Page/char caps, timeout, `disableFontFace`, size limit, rate limiting; lazy `await import()` so the cost is only paid when used |
| **R7** | Adding an upload endpoint to a surface where **nothing** is authenticated (F13) | Medium | Auth check **before** multer + tight rate limit (§7.5); flagged for the Security Reviewer as the pre-existing gap it sits in |
| **R8** | `configuration.scopeDetails` reaches Mongo only via `POST /api/quotes`; `PUT /api/quotes/:id` cannot update `configuration` (F10) | Medium | Confirm the Quote page issues a full `POST` after confirmation; otherwise scope survives the session but not a reload from Mongo. **Needs verification during step 5** |
| **R9** | `POST /api/quotes` is `replaceOne` + `upsert` on a client-supplied `id`, so a POST without `configuration` destroys prior config (F10) | Medium | Pre-existing; ensure the save path always sends the full configuration. Worth a Backend ticket of its own |
| **R10** | Map C (`generatePlaceholderPreview`) is untyped and already lacks the sprawl tokens | Low | Annotate it `Record<string, string>` and route it through the builder as part of step 6 |
| **R11** | Very long scope lists produce an unwieldy agreement | Low | 200-item / 500-char caps, enforced in both parser and builder, surfaced as a `truncated` warning |
| **R12** | `htmlToBlocks` is a regex/string HTML reader, not a parser | Low | Input is mammoth's own narrow, well-formed output (F6 shows the tag set is tiny), not arbitrary web HTML; entities decoded explicitly; covered by fixture tests |

### 10.2 Open questions — for the user to decide

- **Q1 — Where should parsing run?** Recommended: extraction server-side, parsing client-side
  (§1), so the parser is a single pure tested TS module. The uploaded file never leaves the
  server, but the extracted **text** returns to the user's own session. If "must not leave the
  server" is meant to include the extracted text, the parser must be duplicated as a `.cjs` twin
  and we accept the drift risk. **Please confirm.**
- **Q2 — Should the user be warned when the selected template has no scope tokens?** Today the
  design fails silently and safely (§5.6 row 2): the user confirms scope and the agreement quietly
  omits it. Detecting this is possible — the diagnostic already extracts template tokens — but a
  warning during rollout would fire on almost every template. Options: (a) silent, as designed;
  (b) a non-blocking notice; (c) hide the whole panel unless the selected template carries the
  tokens. **Recommend (a) during rollout, revisit once coverage is broad.**
- **Q3 — One scope document per quote, or several?** Design assumes one (`files: 1`). Multiple
  would need merge/dedupe semantics and provenance per item.
- **Q4 — Scanned PDFs?** No OCR (it would need a new dependency and probably a third-party
  service, which Decision 1 forbids). Design returns a clear "scanned document" message and
  invites manual entry. **Confirm that is acceptable.**
- **Q5 — Should scope details flow into the e-sign envelope or the quote PDF?** Decision 2 covers
  the generated agreement only. The quote PDF (`quotePDFGenerator.ts`) and the e-sign path are
  untouched by this design. Deliberate?
- **Q6 — Bullet glyph and heading labels.** Design uses `• ` and expects the author to write the
  literal words "In Scope" / "Out of Scope" in the template. If those labels must be
  configurable, they become tokens too (`{{in_scope_heading}}`), which is a small addition —
  but only worth it if templates genuinely differ.
- **Q7 — Retention.** Confirm that discarding the upload (§2.3) is acceptable, i.e. that no audit
  requirement demands keeping the original bytes. `sourceFileName` + `extractedAt` are retained.
- **Q8 — Should step 0 (the discount-cleanup fix) ship as its own PR?** It fixes a latent bug
  affecting custom line items and template prose independently of this feature, and reviewing it
  separately would be cleaner. **Recommended.**

---

## 11. Next steps for the Backend Agent

1. **Start with step 0** (§7.3) — narrow the discount-cleanup predicate in
   `src/utils/docxTemplateProcessor.ts:958-976` to `isDiscountLabel`. It blocks the rest and is
   independently valuable. Confirm Q8 first.
2. **Then step 3** — `POST /api/scope/extract` in `server.cjs`:
   - a new `scopeUpload` multer instance (§2.2) — do **not** reuse the global `upload`;
   - magic-byte sniff and route by sniffed type (§7.1);
   - zip-entry / uncompressed-size / DOCTYPE guards (§7.2);
   - `mammoth.convertToHtml({ buffer })` for DOCX (§3.9) — not `extractRawText`;
   - `await import('pdfjs-dist/legacy/build/pdf.mjs')` for PDF, lazily, with
     `isEvalSupported: false` (§3.10) — verified working from CJS;
   - the exact `{ success, data }` / `{ success, error }` shapes and status codes in §2.1, with
     no exception text leaked;
   - auth **before** multer, plus rate limiting (§7.5);
   - log metadata only, never document content;
   - discard the buffer — **persist nothing** (§2.3).
3. **Do not add dependencies.** `mammoth`, `pdfjs-dist`, `multer`, `jszip`/`pizzip` are all
   already installed.
4. **Confirm R8** — verify that confirming scope on the Quote page results in a full
   `POST /api/quotes` carrying the whole `configuration`, since `PUT /api/quotes/:id` cannot
   update it.
5. **No server-side schema work is needed** — `configuration` is stored verbatim with no Mongoose
   model (F10).

The Frontend Agent should begin with step 1 (`src/utils/scopeExtraction.ts`) in parallel, since it
is pure and fully testable before any endpoint exists — and it is where most of this feature's
risk lives.
