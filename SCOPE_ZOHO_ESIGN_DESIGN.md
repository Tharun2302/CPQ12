# Feature Design: Zoho Sign as a Second, Optional Signing Provider

**Status:** Design only — no code written, nothing committed
**Author:** GStack Architect
**Date:** 2026-09-14
**Branch:** `feature/zoho-esign`
**Flow used:** GStack `new-feature` — design stage only
**Proposed target files (none created yet):** `zoho-sign-config.cjs`, `zoho-sign-auth.cjs`, `zoho-sign-client.cjs`, `zoho-sign-mapper.cjs`, `zoho-sign-status.cjs`, `zoho-sign-poller.cjs` (new, repo root) · `server.cjs` (additive route block, additive index block, one middleware insert) · `env-template.txt` (new empty keys) · `src/pages/EsignPlaceFieldsPage.tsx`, `src/pages/EsignSendPage.tsx`, `src/pages/EsignTrackingPage.tsx`, `src/components/EsignAgreementStatusDashboard.tsx`, `src/services/esignDocumentService.ts` · new tests under `tests/unit/`

---

## 1. Summary

1. CPQ12 already has a complete, in-house e-signature system. It is ours. It is not a wrapper around any vendor.
2. This design **adds** Zoho Sign beside it. It does **not** replace it.
3. The built-in flow stays the default and keeps working exactly as it does today.
4. On the send screen the user gets one new choice: **"Send with CPQ e-sign"** (default) or **"Send with Zoho Sign"**.
5. If they choose Zoho, CPQ uploads the same PDF to Zoho over Zoho's REST API. Zoho emails the signers. Zoho hosts the signing page.
6. CPQ tracks the result, then pulls the signed PDF and Zoho's completion certificate back in.
7. Both providers feed the same tracking screens, so the user sees one list, not two.
8. Every database change is a brand-new optional field. Nothing is renamed, repurposed or dropped.

**Two things block a working end-to-end demo. Neither is a coding problem.**

- **No Zoho credentials.** Nobody has confirmed CloudFuze holds a Zoho Sign plan that includes API access. Without that, not one live API call is possible.
- **No public HTTPS URL on dev.** Dev is `159.89.175.168:3001`, plain HTTP, no nginx. Zoho webhooks require a public HTTPS callback. Webhooks therefore **cannot** be tested on dev today. This design ships a **polling fallback** that works without webhooks.

Section 13 is the blunt 3-day assessment. Read that one first if you are short on time.

---

## 2. Scope

### 2.1 In scope

| # | Item |
|---|---|
| S1 | Zoho OAuth 2.0 (self client), access-token cache and refresh |
| S2 | Data-centre-aware base URLs, configurable, never hardcoded |
| S3 | Create a Zoho signature request from an already-uploaded CPQ document |
| S4 | Map CPQ recipients to Zoho actions, including signing order and the reviewer step |
| S5 | Place signature / name / title / date / text fields via the Zoho submit call |
| S6 | Status sync: webhook (preferred) **plus** polling (fallback, works today) |
| S7 | Download the completed PDF and completion certificate back into CPQ |
| S8 | Recall (CPQ's "void") and remind, routed to Zoho for Zoho documents |
| S9 | Provider picker in the send UI, provider badge in the tracking UI |
| S10 | Embedded signing token — optional, keeps signers inside CPQ (section 8.6) |

### 2.2 Explicitly out of scope

| # | Item | Why |
|---|---|---|
| X1 | Rewriting or refactoring the in-house flow | The scope decision says leave it alone. It is 32 working production endpoints. |
| X2 | Migrating existing documents to Zoho | Existing documents stay in-house permanently. |
| X3 | Zoho templates, bulk send, payments, SMS/offline verification | Not needed for the CPQ use case. |
| X4 | Replacing the in-house `pdf-lib` signed-PDF generator | It stays the engine for in-house documents. |
| X5 | Zoho on the `from-approval` auto-send path | Phase 2. That path auto-sends with no user present; a provider choice there needs product input. |
| X6 | Removing the BoldSign stub | Separate cleanup. Untouched here. |
| X7 | Fixing the pre-existing auth gaps on `/api/esign/*` | Documented in 4.4 because it shapes this design, but fixing 31 endpoints is its own workstream. |

---

## 3. Requirements

### 3.1 Functional

| # | Requirement |
|---|---|
| F1 | A user preparing a document can choose CPQ e-sign (default) or Zoho Sign before sending. |
| F2 | Choosing Zoho sends the same PDF, the same recipients, in the same order, with the same field positions. |
| F3 | A CPQ reviewer maps to a Zoho `APPROVER` action; a CPQ signer maps to `SIGN`. |
| F4 | The tracking screens show Zoho documents next to in-house documents, with a provider badge and per-recipient status. |
| F5 | When Zoho reports completion, CPQ stores the signed PDF and the completion certificate and marks the document `completed`. |
| F6 | Void on a Zoho document recalls it at Zoho. Remind on a Zoho document triggers Zoho's reminder. |
| F7 | Status stays correct **without** webhooks, via polling. |
| F8 | With `ZOHO_SIGN_ENABLED` unset or empty, the provider picker is hidden, no Zoho route does anything but return 503, no poller runs, and the app behaves exactly as it does today. |
| F9 | Every Zoho failure surfaces a plain-English message to the user and leaves the CPQ document in a recoverable state. |

### 3.2 Non-functional

| # | Requirement |
|---|---|
| N1 | Zero behaviour change for any document without `provider: 'zoho'`. |
| N2 | Additive schema only. No rename, no repurpose, no drop, no backfill, no migration script. |
| N3 | Secrets live only in `.env`. Never committed. Never logged, not even truncated. |
| N4 | Stay under Zoho's 50 calls/minute ceiling under all conditions, including a full poll sweep. |
| N5 | New endpoints require a verified JWT and are rate limited — a higher bar than the endpoints beside them. |
| N6 | No new npm dependencies. `axios`, `express-rate-limit`, `multer` and Node 20 globals (`FormData`, `Blob`, `crypto`) are already present. |
| N7 | Provider-specific logic is confined to the new `zoho-sign-*.cjs` modules, in the same testable-helper style as the existing `esign-*.cjs` modules. |
| N8 | Nothing in this feature is ever tested against the production MongoDB (see 12.6). |

### 3.3 Acceptance criteria

1. With `ZOHO_SIGN_ENABLED` empty: `npm test` passes, the picker is absent, `GET /api/zoho-sign/status` returns `{success:true, enabled:false}`, and no in-house behaviour changes.
2. With Zoho enabled but no credentials: the send call returns 503 with a clear message naming the missing env keys, and the CPQ document stays `draft`.
3. A document sent via Zoho gets `provider:'zoho'`, a `zoho_request_id`, and `status:'sent'`; every recipient row gets a `zoho_action_id`.
4. Polling a completed Zoho request flips CPQ to `status:'completed'`, stores the signed PDF, and stores the certificate.
5. A webhook with a bad HMAC is rejected with 401 and nothing is written.
6. A webhook and a poll reporting the same event produce exactly one state change and one `zoho_sign_events` row.
7. `POST /api/esign/documents/:id/send` on a Zoho document returns 409 with a pointer to the Zoho route. It does not send anything.
8. An expired access token triggers exactly one refresh and one retry, and the caller never sees the 401.
9. A 429 from Zoho backs off and does not mark the document failed.
10. No test makes a network call. No test connects to the production database.

---

## 4. Current-state analysis

Verified by reading the repository on 2026-09-14. `server.cjs` is 517,054 bytes / 12,759 lines, CommonJS, Express 5, raw MongoDB driver (no Mongoose on this path).

### 4.1 The 32 e-sign endpoints

| Group | Routes (line numbers in `server.cjs`) |
|---|---|
| Document lifecycle | `POST .../upload` (7309), `POST .../from-approval` (7441), `GET /api/esign/documents` (10399), `GET .../:id` (7537), `GET .../:id/file` (7583), `DELETE .../:id` (7853) |
| Sending | `POST .../:id/send` (7823), `POST .../:id/send-for-signature` (8449), `POST /api/approval-workflows/send-esign` (11678) |
| Recipients | `GET .../:id/recipients` (8090), `POST .../:id/recipients` (8164), `GET /api/esign/fixed-role-recipients` (9041) |
| Public token paths | `GET /api/esign/sign-by-token/:token` (9187), `GET /api/esign/inbox-by-token` (9105), `GET /api/esign/pending-for-email` (9068), `POST /api/esign/forward-signing-request` (9299), `POST /api/esign/deny-signing` (9614) |
| Reviewer step | `POST /api/esign/reviewer-save-fields` (9462), `POST /api/esign/mark-reviewed` (9498) |
| Fields & signatures | `POST /api/esign/signature-fields` (9671), `GET /api/esign/signature-fields/:documentId` (9731), `POST /api/esign/signatures/save` (9799), `POST .../store-encrypted` (9745), `POST .../clear-stored` (9783) |
| Output | `POST /api/esign/documents/generate-signed` (10067), `POST .../bulk-download` (7741) |
| Management | `POST .../:id/void` (7904), `POST .../:id/remind` (7954), `POST .../:id/extend-expiry` (8479), `PATCH .../:id/dates` (8887), `GET .../:id/activity` (8137), `GET .../:id/edit-context` (8800), `GET /api/esign/agreement-status` (10424), `POST /api/approval-workflows/:workflowId/reset-esign` (8037) |

### 4.2 Collections and their real field names

Index setup lives at `server.cjs:468-491`.

**`esign_documents`** — on create (7402-7410 manual, 7484-7502 from-approval):
`file_name`, `file_path`, `file_data` (base64 PDF), `uploaded_by`, `upload_source` (`'manual'` | `'approval'`), `created_at`, `status`, and for approval docs `source_document_id`, `requested_by_name`, `requested_by_email`, `dates`, `templateData`, `templateId`, `customLineItems`, `dateHistory`.

Added later by other endpoints: `sent_at`, `signing_order_enforced`, `signed_at`, `signed_file_path`, `signed_file_data`, `signer_email`, `review_merged_file_path`, `review_merged_at`, `reviewer_field_values`, `reviewer_field_values_at`, `voided_at`, `voided_by`, `void_reason`.

Indexes: `created_at:-1`, `status:1`, `uploaded_by:1`.

**`esign_recipients`** — on create (8230-8244):
`document_id` (ObjectId; legacy rows may hold a string — helper `esignRecipientsDocumentFilter` at line 104 matches both), `name`, `email` (lowercased, the upsert key), `role` (`'signer'` default, also `'Team Lead'`, `'Team Approval'`, `'Technical Team'`, `'Legal Team'`), `status`, `order` (0-based), `action` (`'signer'` | `'reviewer'`, `$unset` otherwise), `email_message` (≤1000 chars), `signing_token`.

Added later: `token_created_at`, `token_expires_at`, `sent_at`, `viewed_at`, `signed_at`, `review_decision`, `sign_decision`, `comment`, `expiry_reminder_sent_at`, `expiry_extended_at`, `expiry_extended_by`, `expiry_extension_count`, `original_recipient_email/_name`, `forwarded_from_email/_name`, `forwarded_by_email`, `forwarded_to_email/_name`, `forwarded_at`, `forward_comment`, `forward_count`.

Indexes: `document_id:1`, `signing_token:1` **unique + sparse**.

**`signature_fields`** — full replace on every save (9671-9728):
`document_id`, `page` (1-based), `type` (`signature` | `name` | `title` | `date` | `text`), `recipient_id` (nullable), `prefill`, `text_color` (`#RRGGBB`, default `#dc2626`), `text_font` (`helvetica` | `times` | `courier`), and **three mutually exclusive geometries** — percent (`xPct`, `yPct`, `widthPct`, `heightPct`), absolute (`x`, `y`, `width`, `height`), and an optional normalized 0..1 overlay (`xNorm`, `yNorm`, `widthNorm`, `heightNorm`) which the PDF merger prefers.

**`esign_signature_secrets`** — effectively dead. Nothing writes it; `POST .../store-encrypted` returns `{deprecated:true}` without inserting. Read only as a legacy fallback. **This feature does not touch it.**

**`audit_logs`** — `logAudit()` at 7095-7103 writes `{document_id, action, user_email, timestamp, ip_address, ...extra}`.

**Nothing in either collection starts with `zoho_`.** That prefix is free.

### 4.3 Status vocabularies

| Collection | Values actually set |
|---|---|
| `esign_documents.status` | `draft` (7409, 7494) → `sent` (7836, 8383) → `completed` (9572, 10345); plus `signed` (10372, legacy no-token path), `denied` (9540, 9650), `voided` (7932) |
| `esign_recipients.status` | `pending` (8235, 8332) → `viewed` (9222) → `signed` (10333) / `reviewed` (9560) / `denied` (9536, 9646) |

There is **no `'expired'` document status**. Expiry is per-recipient only, via `token_expires_at` and `isEsignTokenExpired()` (778-781), surfaced as HTTP 410. This matters in 6.4 — Zoho has an `expired` request status and CPQ has nowhere natural to put it.

### 4.4 Auth and rate limiting today — read this before section 12

This is uncomfortable but it is the truth and it shapes the design.

- There is **no auth middleware** of any kind mounted via `app.use()`. No `authenticateToken`, no `requireAuth`. Grep returns zero definitions.
- `getAuthenticatedUser(req, res)` (3041-3062) is the one real JWT gate. It is called at exactly **two** sites in the entire 12,759-line file: line 7870 and line 11701.
- **Of the 32 `/api/esign/*` routes, exactly one verifies a JWT**: `DELETE /api/esign/documents/:id` (7853 → 7870).
- Two more read the actor's email from the **request body** and trust it: `POST .../:id/remind` (7963) and `POST .../:id/extend-expiry` (8494). Both are spoofable.
- `GET /api/esign/documents` and `GET /api/esign/agreement-status` return **every agreement in the system** to any caller who can reach the port.
- `POST /api/esign/signature-fields` lets any caller wipe and rewrite any document's field placements.
- `express-rate-limit` is required at line 18 and used **once**, for `clientLogLimiter` (5938-5943) on `POST /api/client-log`. **No `/api/esign/*` route is rate limited**, including the token-resolution endpoint.
- CORS is origin-restricted with `credentials:true`, but that is a browser control only. It stops nothing coming from curl.

**Design consequence:** the new Zoho endpoints are held to the CLAUDE.md standard — verified JWT, rate limited, backend validation — even though their neighbours are not. Copying the surrounding pattern would be copying a defect. The gap on the existing 31 endpoints is logged in section 14 as a separate risk, not fixed here.

### 4.5 Token-based signing (in-house), for contrast

Token is a bare `crypto.randomUUID()` (8324), 15-day expiry (`ESIGN_LINK_EXPIRY_DAYS = 15`, line 770), rotated on forward (9392) and extend (8549). URL shape from `getEsignRecipientUrls` (7142-7148): `${APP_BASE_URL}/sign/${token}` and `${base}/esign-inbox?token=...`. Public routes registered in `src/App.tsx:2023-2024`.

**Zoho replaces this entire mechanism for Zoho documents.** Zoho issues its own links and hosts its own signing page. CPQ's tokens, `sign-by-token`, `generate-signed`, `signatures/save` and the whole reviewer/forward machinery are **not used** on the Zoho path.

### 4.6 File storage

Not GridFS. **Dual storage** — filesystem plus base64 inline in the same Mongo document. Directories created at startup (403-409): `uploads/documents/`, `uploads/signatures/`, `uploads/signed/`. `GET .../:id/file` (7583-7680) resolves disk first (`signed_file_path` → `review_merged_file_path` → `file_path`), then base64 (`signed_file_data` → `file_data`) with a write-back-to-disk self-heal, then an approval-source recovery path.

This is directly reusable: the Zoho signed PDF lands in `uploads/signed/` exactly like an in-house one.

### 4.7 Helper-module pattern to follow

Five small `.cjs` modules exist in the repo root — `esign-creator-utils`, `esign-sequential-utils`, `esign-progress-utils`, `esign-field-carry`, `esign-bulk-download-utils` — each carrying a header comment saying it exists **so the rules can be unit-tested without booting the server, MongoDB or SendGrid**. There are nine matching tests in `tests/unit/`. There are **no** route-level or integration tests for any `/api/esign/*` endpoint.

The Zoho modules follow this pattern exactly: pure logic (config resolution, status mapping, field mapping, backoff) in testable `.cjs` modules; only thin glue in `server.cjs`.

### 4.8 Frontend

21 files. The relevant ones:

| File | Role |
|---|---|
| `src/pages/EsignPlaceFieldsPage.tsx` (81 KB) | **The main prepare-and-send screen.** 3-step indicator at 1034-1065 (`1 Recipients · 2 Place Fields · 3 Review & Send`). Two-column layout from 1084. Right sidebar: recipients (~1441), field palette (to ~1586), validation checklist (1589-1601), sequential notice (1604-1610), footer bar (1612-1631) with the primary button `id="esign-tour-send-signature"` labelled **"Review & Send"**. `handleSendForSignature` at 774-830: validate → `POST /api/esign/signature-fields` → save recipients → `POST /api/esign/documents/${id}/send-for-signature` with an **empty body `{}`** (line 812) → success modal (972-1010). |
| `src/pages/EsignSendPage.tsx` (5.7 KB) | Secondary standalone send screen; same empty-body POST at line 59, button at 131-138. |
| `src/pages/EsignTrackingPage.tsx` (18 KB) | Per-document status view. |
| `src/components/EsignAgreementStatusDashboard.tsx` (96 KB) | Org-wide tracking: search, filters, bulk ZIP, remind / extend / void / forward / delete. |
| `src/components/EsignPrepareModal.tsx` (21 KB) | **Older** modal flow using percentage coords. Not the current send path. |
| `src/services/esignDocumentService.ts` | Only `deleteEsignDocument`. The **only** frontend call that sends `Authorization: Bearer ${localStorage.cpq_token}`. |

### 4.9 The BoldSign stub — a cautionary example, not a pattern

`server.cjs:1485-1611`, two routes. There is no BoldSign SDK in `package.json`, no API key handling, and **no BoldSign HTTP call anywhere**.

- `GET /api/boldsign/download-document/:documentId` (1486) — serves a CPQ file as an attachment. Nothing more.
- `POST /api/boldsign/create-embedded-send` (1557) — the name promises an embedded-send session. It does not create one. It builds `${BOLDSIGN_APP_URL}/document/new` and returns `instructions: 'Free plan: Download the document and upload it manually to BoldSign', freePlanMode: true`.

It exists because the plan did not include API access. Nothing in CPQ ever learns the outcome. It shares no data model, no status vocabulary and no code path with the in-house system.

**This is precisely the failure mode to avoid with Zoho.** If the Zoho plan turns out not to include API access, the honest outcome is *"blocked, waiting on a plan"* — not a second manual-upload stub.

### 4.10 Where Zoho plugs in

Zoho replaces exactly one slice: **everything between "the PDF and the recipient list exist" and "a completed signed PDF exists."**

```
   UPLOAD / FROM-APPROVAL        PREPARE               SEND · SIGN · COMPLETE
   ──────────────────────  ──────────────────   ─────────────────────────────────────────────
   POST .../upload         POST .../recipients   ┌─ IN-HOUSE (default, unchanged) ───────────┐
   POST .../from-approval  POST /signature-      │ POST .../send-for-signature               │
          │                     fields           │   → emailed link  /sign/<uuid>            │
          │                       │              │   → GET  /api/esign/sign-by-token/:token  │
          ▼                       ▼              │   → POST /api/esign/documents/            │
   esign_documents        esign_recipients       │          generate-signed   (pdf-lib)      │
   (file_name, file_data,  signature_fields      └───────────────────────────────────────────┘
    status:'draft')                              ┌─ ZOHO (new, opt-in) ──────────────────────┐
          │                                      │ POST /api/zoho-sign/documents/:id/send    │
          └──── SHARED. UNCHANGED. ──────────────│   → POST sign.zoho.<dc>/api/v1/requests   │
                                                 │   → POST .../requests/{id}/submit         │
                                                 │   Zoho emails signers, hosts signing page │
                                                 │   ← POST /api/zoho-sign/webhook  (HMAC)   │
                                                 │   ← OR  poller: GET .../requests/{id}     │
                                                 │   → GET .../requests/{id}/pdf?with_coc    │
                                                 └───────────────────────────────────────────┘
                                                                    │
                                                    Both converge on the SAME tracking
                                                    screens, keyed off esign_documents.provider
```

---

## 5. Architecture recommendation: the provider split

### 5.1 The three options

| Option | What it means | Verdict |
|---|---|---|
| **A. Thin provider layer behind the existing `/api/esign/*` routes** | Every existing endpoint gains `if (provider === 'zoho') {...}`. The UI never changes its URLs. | **Reject.** There is no abstraction to slot into — the endpoints are written directly against CPQ concepts that have no Zoho equivalent (`signing_token`, `esign_signature_secrets`, `signature_fields` geometry, `generate-signed`, forward, reviewer-save-fields, extend-expiry). Making 32 endpoints provider-aware means editing 32 sites in a 517 KB file with **zero route-level test coverage** (4.7). That is a rewrite wearing an integration's clothes, and the first regression lands on production signing. |
| **B. A fully parallel `/api/zoho-sign/*` route set, and nothing else** | Zoho gets its own routes, its own collection, its own screens. Nothing existing is touched. | **Reject as the whole answer.** Blast radius is near zero, which is right, but it forks the product: two inboxes, two tracking dashboards, two bulk-download paths, two mental models. The user asked for "send with Zoho instead" on one document — not a second application. |
| **C. Hybrid — parallel write path, shared read path** | All Zoho **actions** live on new `/api/zoho-sign/*` routes. A `provider` discriminator on `esign_documents` makes a **small, named set** of existing **read** endpoints return provider info, branches **two** action endpoints, and **guards** five that must not run on Zoho documents. | **Recommended.** |

### 5.2 Why C

1. **The dangerous code stays untouched.** Everything token-based — `sign-by-token`, `generate-signed`, `signatures/*`, forward, reviewer, inbox — is never modified. Those are the paths that, if broken, break live customer signing.
2. **The changes that do land on existing endpoints are overwhelmingly read-only passthroughs.** Adding `provider` to a response object cannot break a signing flow.
3. **One product, one inbox.** The tracking dashboards already list documents from `esign_documents`. Because Zoho documents are rows in that same collection, they appear automatically. Only the badge and a few action buttons need provider awareness.
4. **Reversible.** Turning `ZOHO_SIGN_ENABLED` off returns the app to today's behaviour with no data cleanup. Deleting the feature means deleting the new files and one route block.
5. **It matches how the codebase is already organised** — small testable `.cjs` helpers plus thin glue (4.7).

### 5.3 Exactly which existing endpoints change

**Group 1 — provider-aware, read-only passthrough (5 endpoints, low risk).** Each gains `provider` in the response and, when `provider === 'zoho'`, the `zoho_*` summary fields. No branching logic, no writes.

| Endpoint | Line | Change |
|---|---|---|
| `GET /api/esign/documents` | 10399 | add `provider`, `zoho_request_status` to each row |
| `GET /api/esign/documents/:id` | 7537 | add `provider`, `zoho_request_id`, `zoho_request_status`, `zoho_dc` |
| `GET /api/esign/documents/:id/recipients` | 8090 | add `zoho_action_status` per recipient when present |
| `GET /api/esign/documents/:id/activity` | 8137 | merge `zoho_sign_events` rows into the activity list, sorted by time |
| `GET /api/esign/agreement-status` | 10424 | add `provider` to each row |

**Group 2 — provider-branching action (2 endpoints).** These keep their URL because the dashboards already call them from menus.

| Endpoint | Line | Change |
|---|---|---|
| `POST /api/esign/documents/:id/void` | 7904 | if `provider==='zoho'`, call Zoho recall first; on success continue into the existing void bookkeeping unchanged; on failure return the Zoho error and write nothing |
| `POST /api/esign/documents/:id/remind` | 7954 | if `provider==='zoho'`, call Zoho remind instead of the CPQ mailer; audit as today |

**Group 3 — provider-guarded, refuse rather than branch (5 endpoints).** A guard is three lines and cannot regress the in-house path.

| Endpoint | Line | Guard |
|---|---|---|
| `POST /api/esign/documents/:id/send` | 7823 | 409 `{error:'This document uses Zoho Sign', use:'/api/zoho-sign/documents/:id/send'}` |
| `POST /api/esign/documents/:id/send-for-signature` | 8449 | same 409 |
| `POST /api/esign/documents/:id/extend-expiry` | 8479 | 409 — Zoho has no extend-expiry API; the answer is recall and resend |
| `POST /api/esign/documents/generate-signed` | 10067 | 409 — the signed PDF for a Zoho document comes from Zoho, never from `pdf-lib` |
| `DELETE /api/esign/documents/:id` | 7853 | if `provider==='zoho'` and the request is still in progress, recall at Zoho first, then fall through to the existing delete (which is already the one JWT-protected endpoint) |

**Untouched — every other endpoint,** in particular all seven public token paths, both reviewer endpoints, all four field/signature endpoints, `upload`, `from-approval`, `:id/file`, `bulk-download`, `:id/dates`, `:id/edit-context`, `fixed-role-recipients`, and the approval-workflow routes.

Count: **12 of 32 existing endpoints touched, of which 5 are read-only passthroughs and 5 are refusal guards.** Only 2 gain real branching logic.

### 5.4 New module boundary

| Module | Responsibility | Pure? |
|---|---|---|
| `zoho-sign-config.cjs` | Read env, resolve the DC → `{apiBase, accountsBase}` pair, expose `zohoSignEnabled()`, validate config and list what is missing | Yes — fully unit-testable |
| `zoho-sign-auth.cjs` | Access-token cache, refresh, single-flight lock, 401-retry decision | Mostly; HTTP injected |
| `zoho-sign-client.cjs` | One function per Zoho call: `createRequest`, `submitRequest`, `getRequest`, `listRequests`, `recall`, `remind`, `downloadPdf`, `downloadCertificate`, `embedToken`. Owns retry/backoff and error normalisation | HTTP injected |
| `zoho-sign-mapper.cjs` | CPQ recipients → Zoho `actions`; CPQ `signature_fields` → Zoho `fields`; coordinate conversion | Yes — fully unit-testable |
| `zoho-sign-status.cjs` | Zoho `request_status`/`action_status` → CPQ `status`; event idempotency key; webhook HMAC verification | Yes — fully unit-testable |
| `zoho-sign-poller.cjs` | Selection query, batch cap, interval, backoff state | Yes — fully unit-testable with an injected clock |

`server.cjs` gets one additive route block (~250 lines) that wires these together. No business logic in it.

---

## 6. Data model changes

**Every field below is new, optional, and absent on every existing document. Nothing is renamed, repurposed or dropped. There is no backfill and no migration script.**

### 6.1 New optional fields on `esign_documents`

| Field | Type | Written when | Meaning |
|---|---|---|---|
| `provider` | string | on Zoho send only | `'zoho'`. **Absent means in-house.** Never written as `'inhouse'`, never backfilled — absence is the default and that is what keeps this backward-compatible. |
| `zoho_request_id` | string | on create | Zoho's request id. The join key for webhooks and polling. |
| `zoho_document_ids` | array of `{document_id, document_name, total_pages}` | on create | Returned by Zoho; needed to address fields per document |
| `zoho_request_status` | string | create, poll, webhook | Zoho's raw status verbatim (`draft`, `inprogress`, `completed`, `declined`, `recalled`, `expired`) |
| `zoho_dc` | string | on create | `us` \| `eu` \| `in` \| `au` \| `jp` \| `ca` \| `sa`. **Recorded at send time** so a later config change cannot orphan an in-flight request. |
| `zoho_sent_at` | Date | on submit | |
| `zoho_completed_at` | Date | on completion | |
| `zoho_last_polled_at` | Date | every poll | Drives the poller's selection query |
| `zoho_last_synced_at` | Date | poll or webhook | Last time status actually changed |
| `zoho_last_error` | `{code, message, at}` | on failure | Surfaced in the UI; never contains a token |
| `zoho_signed_file_path` | string | on completion | Path under `uploads/signed/` |
| `zoho_certificate_file_path` | string | on completion | Zoho completion certificate PDF |
| `zoho_webhook_last_event_at` | Date | on webhook | If this stays null while documents complete, webhooks are not arriving — a cheap health signal |

**New index:** `{ zoho_request_id: 1 }`, **unique + sparse**. Sparse is mandatory — every existing document lacks the field, and a non-sparse unique index would throw `E11000` on the second such document. This is the same trap the codebase already hit and fixed for `signing_token` (474-486); the fix is copied deliberately.
**Second index:** `{ provider: 1, zoho_request_status: 1, zoho_last_polled_at: 1 }`, sparse — the poller's selection query.

Both are added inside the existing `// E-Signature collections` block at `server.cjs:468-491`. `createIndex` is idempotent and additive; it writes no document data.

### 6.2 New optional fields on `esign_recipients`

| Field | Type | Meaning |
|---|---|---|
| `zoho_action_id` | string | Zoho's `action_id`. Required for embed tokens and per-recipient status. |
| `zoho_action_status` | string | Zoho's raw `action_status` (`NOTACTIONYET`, `VIEWED`, `SIGNED`, `APPROVED`, `DECLINED`, …) |
| `zoho_action_type` | string | `SIGN` \| `APPROVER` \| `VIEW` — what CPQ asked Zoho for |
| `zoho_embed_token_issued_at` | Date | Only if embedded signing is used (8.6) |

**New index:** `{ zoho_action_id: 1 }`, sparse (not unique — a Zoho action id is only unique within a request).

**Note the interaction with the existing sparse unique `signing_token` index:** Zoho recipients never get a `signing_token`, so they simply fall outside that index. Nothing to change.

### 6.3 New collections

Names use `snake_case` to match the neighbouring `esign_*` collections. **This deviates from CLAUDE.md**, which says MongoDB collections are `camelCase`. Local consistency wins here — a `zohoSignEvents` sitting beside `esign_documents` and `esign_recipients` would be worse. Flagged in section 14 for a ruling.

**`zoho_sign_tokens`** — exactly one document, the access-token cache. Survives a server restart so a restart loop cannot burn through refresh calls.

| Field | Type |
|---|---|
| `_id` | fixed string `'zoho-sign'` |
| `access_token` | string |
| `expires_at` | Date |
| `api_domain` | string (as returned by Zoho) |
| `updated_at` | Date |

The **refresh token is never stored here.** It lives in `.env` only.

**`zoho_sign_events`** — append-only event log; the idempotency spine that lets webhooks and polling coexist.

| Field | Type |
|---|---|
| `zoho_request_id` | string |
| `document_id` | ObjectId |
| `operation_type` | string (from the webhook payload) |
| `action_id` | string \| null |
| `performed_by_email` | string \| null |
| `performed_at` | Date |
| `source` | `'webhook'` \| `'poll'` |
| `request_status` | string |
| `dedupe_key` | string — `sha256(zoho_request_id + '|' + operation_type + '|' + (action_id||'') + '|' + performed_at_iso)` |
| `created_at` | Date |

**Index:** `{ dedupe_key: 1 }` **unique**. A duplicate insert throws `E11000`, which the handler catches and treats as "already processed, do nothing." That is the whole idempotency mechanism, and it is why a webhook and a poll reporting the same event produce one state change. Plus `{ document_id: 1, performed_at: -1 }` for the activity merge.

### 6.4 Status mapping — and one honest wart

Zoho's `request_status` maps onto CPQ's existing vocabulary. **No new value is added to `esign_documents.status`**, because dashboards switch on it and an unknown value would render as a blank chip.

| Zoho `request_status` | CPQ `esign_documents.status` | Note |
|---|---|---|
| `draft` | `draft` | |
| `inprogress` | `sent` | |
| `completed` | `completed` | |
| `declined` | `denied` | exact match |
| `recalled` | `voided` | exact match |
| `expired` | `voided` | **Imperfect.** CPQ has no `expired` document status (4.3). `voided` is the closest true statement — "no longer actionable" — and the precise state stays visible in `zoho_request_status`, which the UI shows as a sub-label. |

Recipient mapping: `NOTACTIONYET` → `pending`, `VIEWED` → `viewed`, `SIGNED` → `signed`, `APPROVED` → `reviewed`, `DECLINED` → `denied`.

### 6.5 The one judgement call — needs your approval

When a Zoho document completes, the signed PDF path is written to the **new** `zoho_signed_file_path`. The question is whether to **also** write the existing `signed_file_path`.

- **If we do:** `GET /api/esign/documents/:id/file` (7583), `POST .../bulk-download` (7741) and every download button work on Zoho documents with **zero code change**, because that endpoint already prefers `signed_file_path`. The field's meaning is unchanged — "path to the signed PDF" — so this is filling an existing field, not repurposing it.
- **If we don't:** `GET .../:id/file` needs a provider branch, moving it from the untouched list into Group 1.

**Recommendation: write both.** Same semantics, no branch on a download path used by every dashboard. **But this is the only place the design writes an existing field on a new code path, so it needs an explicit yes from you.** Section 14, Q4.

### 6.6 Migration note

There is **no migration**. In full:

1. No existing document is read, written, updated or deleted by the rollout.
2. No field is renamed, repurposed or dropped.
3. The only schema-adjacent operation is `createIndex` on three new sparse indexes, added to the existing startup block. Sparse means existing documents are simply not in the index.
4. A rollback is: stop writing the new fields. Old documents never had them; new documents keep them harmlessly. Dropping the three indexes is optional and safe.
5. **Nothing in this feature runs against the production database during development.** See 12.6.

---

## 7. Zoho Sign API — verified facts

Everything in this section was checked against Zoho's current documentation on 2026-09-14. URLs are cited in section 16. Where the documentation is silent, this section says so rather than guessing.

### 7.1 Data centres — configurable, never hardcoded

Zoho runs region-specific instances. **The base URL is a config value, not a constant.**

| DC | Sign API root | Accounts / OAuth root |
|---|---|---|
| US | `https://sign.zoho.com/api/v1/` | `https://accounts.zoho.com` |
| EU | `https://sign.zoho.eu/api/v1/` | `https://accounts.zoho.eu` |
| India | `https://sign.zoho.in/api/v1/` | `https://accounts.zoho.in` |
| Japan | `https://sign.zoho.jp/api/v1/` | `https://accounts.zoho.jp` |
| Australia | `https://sign.zoho.com.au/api/v1/` | `https://accounts.zoho.com.au` |
| Canada | `https://sign.zohocloud.ca/api/v1/` | `https://accounts.zohocloud.ca` |
| Saudi Arabia | `https://sign.zoho.sa/api/v1/` | `https://accounts.zoho.sa` |

Zoho's own guidance: *"The authorization request, token creation must be made from the appropriate domain URL."* A token minted on `accounts.zoho.com` will not work against `sign.zoho.eu`.

The generic multi-DC page also lists UK (`accounts.zoho.uk`). The Sign endpoint page does not list a UK Sign root. `ZOHO_SIGN_API_BASE` exists as an escape hatch for exactly this kind of gap.

**Implementation:** `zoho-sign-config.cjs` holds the table above keyed by `ZOHO_SIGN_DC`. `ZOHO_SIGN_API_BASE` and `ZOHO_SIGN_ACCOUNTS_BASE`, if set, override the table entry. Unknown `ZOHO_SIGN_DC` with no override = configuration error, logged once at boot, feature reports itself disabled. **Zero hardcoded `sign.zoho.com` anywhere outside that table.**

### 7.2 OAuth 2.0

**Scopes needed:** `ZohoSign.documents.CREATE`, `ZohoSign.documents.READ`, `ZohoSign.documents.UPDATE`. (`ZohoSign.account.READ` is worth adding only if we surface account/credit info; not needed for this scope.)

**Self client vs server-based — recommendation: Self Client.**

| | Self Client | Server-based (web app) |
|---|---|---|
| Redirect URI | **None needed** | Must be a **registered, public HTTPS** URL |
| Consent | One-time, in the Zoho API console | Per-user browser round trip |
| Fits CPQ? | Yes — CPQ sends as one CloudFuze service account | No — would need per-user Zoho accounts |
| Works on the dev box today? | **Yes** | **No** — no public HTTPS (blocker #2) |

CPQ sends every agreement from one CloudFuze identity. There is no per-user Zoho account. Self Client is both the correct model and the one that does not trip over the missing HTTPS.

**Flow, one time, by hand:**
1. In the Zoho API Console (on the correct DC), create a **Self Client**.
2. Generate a grant code for the three scopes above.
3. Exchange it once: `POST {accountsBase}/oauth/v2/token` with `grant_type=authorization_code`, `client_id`, `client_secret`, `code`.
4. The response contains `access_token`, `refresh_token`, `api_domain`, `expires_in: 3600`.
5. Put `client_id`, `client_secret` and `refresh_token` in `.env`. **The grant code is single-use and short-lived; the refresh token is the durable secret.**

**Runtime refresh:** `POST {accountsBase}/oauth/v2/token` with `grant_type=refresh_token`, `refresh_token`, `client_id`, `client_secret`.

**Key facts:** access token validity is **1 hour** (`expires_in: 3600`). The refresh token **does not expire** — it must be treated as a long-lived credential (section 12). If we ever move to the server-based flow, `access_type=offline` and `prompt=consent` on `{accountsBase}/oauth/v2/auth` are what produce a refresh token, and the `redirect_uri` must exactly match the one registered in the console.

**Header on every API call:** `Authorization: Zoho-oauthtoken <access_token>` — note the scheme is `Zoho-oauthtoken`, **not** `Bearer`.

### 7.3 Creating and submitting a request

**Step 1 — create.** `POST {apiBase}/requests`, `multipart/form-data`:

- `file` — the PDF binary. Multiple files allowed in one call.
- `data` — a JSON **string**:

```json
{
  "requests": {
    "request_name": "string (required)",
    "description": "string",
    "is_sequential": true,
    "expiration_days": 10,
    "email_reminders": true,
    "reminder_period": 5,
    "notes": "string",
    "actions": [
      {
        "action_type": "SIGN | VIEW | INPERSONSIGN | APPROVER",
        "recipient_name": "string (required)",
        "recipient_email": "string (required)",
        "signing_order": 0,
        "verify_recipient": false,
        "verification_type": "EMAIL | SMS | OFFLINE",
        "private_notes": "string",
        "is_embedded": false
      }
    ]
  }
}
```

Response: `{ code: 0, status: "success", requests: { request_id, document_ids: [{document_id, document_name, total_pages}], actions: [{action_id, ...}] } }`.

**Step 2 — place fields and submit.** `POST {apiBase}/requests/{request_id}/submit`.

**VERIFIED LIVE 2026-09-14.** The shape below is not read off the documentation — it is the payload that actually worked against the real Zoho account (`request_id 610752000000046007`, which moved to `inprogress`). The documented shape does **not** work.

```json
{
  "requests": {
    "actions": [{
      "action_id": "<from step 1>",
      "action_type": "SIGN",
      "recipient_name": "Dana Signer",
      "recipient_email": "dana@example.com",
      "signing_order": 0,
      "verify_recipient": false,
      "fields": [{
        "document_id": "<from step 1>",
        "field_name": "Signature_1",
        "field_type_name": "Signature",
        "field_label": "Sign Here",
        "is_mandatory": true,
        "page_no": 0,
        "x_coord": 31,
        "y_coord": 40,
        "abs_width": 153,
        "abs_height": 40
      }]
    }]
  }
}
```

**Three rules, each proved by that send:**

1. **The action object must carry the full writable attribute set, not just `action_id`.** `{action_id, fields}` alone is refused. Omitting any one of `action_type`, `recipient_name`, `recipient_email`, `signing_order`, `verify_recipient` is also refused.
2. **`field_category` must NOT be sent on a signature field.** Zoho uses `field_category` for payment/checkout fields only; the earlier `Signature`/`DateProperty`/`TextProperty` mapping in this design was a guess and was wrong. `field_type_name` alone places the field. Also note `abs_width`/`abs_height` go over the wire as **numbers**, not the quoted strings the docs show.
3. **Read-only keys are rejected.** Echoing Zoho's own action object back verbatim fails, because the create response carries keys a submit will not accept: `action_status`, `cloud_provider_name`, `cloud_provider_id`, `is_bulk`, `is_signing_group`, `delivery_mode`, `send_completed_document`, `recipient_countrycode`, `recipient_countrycode_iso`, `recipient_phonenumber`. `zoho-sign-mapper.cjs` therefore filters by an **allowlist** of writable keys (`ZOHO_WRITABLE_ACTION_KEYS`), not a denylist, so a key Zoho adds to a future response can never leak into a submit.

**Debugging note for this API.** Breaking rule 1 or 2 returns `{"code":9039,"message":"Unable to process your request"}`, which names nothing at all. Breaking rule 3 returns `{"code":9043,"error_param":"action_status","message":"Extra key found"}`, which names the offending key. So when a submit is refused, **send a superset and let 9043 tell you what to strip** — guessing against 9039 is what cost the first several attempts.

Also confirmed on 2026-09-14: `GET /api/v1/account` does not exist (code `9004`). Do not add a call to it.

**Hard constraint from Zoho:** *"Every action except `VIEW` actions must have at least one field."* A CPQ reviewer with no fields placed would therefore be rejected. The mapper must guarantee at least one field per non-VIEW action — see 7.4.

Field types available: `Signature`, `Initial`, `Name`, `Email`, `Company`, `Jobtitle`, `Date`, `Textfield`, `Checkbox`, `Dropdown`.

**Note `page_no` is 0-based** in Zoho — **confirmed live 2026-09-14**, page 0 is the first page; CPQ's `signature_fields.page` is **1-based**. Off-by-one is guaranteed if that is not handled in the mapper. The mapper's 1-based-to-0-based conversion is correct as written.

### 7.4 Coordinate system — RESOLVED 2026-09-15

**CLOSED by visual confirmation of a rendered Zoho document (request 610752000000046007).**

- **Origin is TOP-LEFT.** `y_coord` counts DOWN from the top of the page. Confirmed against an on-page ruler: the `0.0/0pt` tick renders at the top edge.
- **Unit is PostScript points (pt).** Confirmed: `0.1/79pt` on a 792pt US Letter page.
- **Reference size is the PDF page size in points** (612 x 792 for US Letter), not a scaled raster size.
- Probes asked at norm (0.05,0.05), (0.7,0.05), (0.375,0.475), (0.05,0.9), (0.7,0.9) rendered with Zoho's signature boxes sitting on the red outlines drawn at those same positions.
- Therefore the shipped defaults `ZOHO_SIGN_COORD_ORIGIN=top` and `ZOHO_SIGN_COORD_UNIT=pt` are CORRECT and need no change.
- They remain configurable on purpose: Zoho does not document this, so it could change, and a non-Letter page size must still be driven by the real page dimensions.

Also observed: trial documents carry a red 'For demo purpose only / Powered by Zoho Sign' watermark.


Zoho's documentation shows `x_coord`, `y_coord`, `abs_width`, `abs_height` as plain integers/strings in examples (`x_coord: 30`, `abs_width: "200"`). **It does not document the unit, the origin, or the page reference size.** I checked; it is genuinely absent from the published docs.

**What the live send settled:** `abs_width`/`abs_height` are numbers, not strings (7.3).

**What it did NOT settle, and cannot:** Zoho stores `x_coord`/`y_coord` **exactly as sent** and echoes them back unchanged, with no transformation at the API level. An API round-trip therefore carries no information about the rendering origin or unit. **The origin/unit question remains OPEN and can only be closed by a human looking at a rendered document.** Until then, `ZOHO_SIGN_COORD_ORIGIN` and `ZOHO_SIGN_COORD_UNIT` stay config with no pinned value, and `tests/unit/zohoSignMapper.test.ts` deliberately asserts that both directions work rather than which one is right.

CPQ stores three geometries (4.2) and the merger prefers `xNorm/yNorm` (0..1 fractions of the page), with `xPct/yPct` and absolute `x/y` as fallbacks.

Consequence: `zoho-sign-mapper.cjs` must convert normalized fractions into Zoho's unit, and **the conversion constant cannot be derived from documentation — it must be calibrated empirically against a real Zoho account.** Plan:

1. Mapper exposes `normToZohoCoords(field, pageWidth, pageHeight, opts)` with the page reference size and Y-axis direction as **parameters**, not constants.
2. Two config knobs: `ZOHO_SIGN_COORD_ORIGIN` (`top` | `bottom`) and `ZOHO_SIGN_COORD_UNIT` (`pt` | `px`), defaulting to the values found during calibration.
3. Calibration is a manual one-off: send one document with a field at a known fraction, open it in Zoho, measure, fix the constants, pin them in a unit test.

**This is a full working day that cannot start before credentials exist.** It is the single largest reason the 3-day target does not include a correct end-to-end send.

### 7.5 Status, download, recall, remind

| Purpose | Call |
|---|---|
| Status of one request | `GET {apiBase}/requests/{request_id}` → `requests.request_status`, `requests.actions[].action_status` |
| List requests (polling at scale) | `GET {apiBase}/requests` with `data={"page_context":{"row_count":N,"start_index":M,"sort_column":"created_time","sort_order":"DESC"}}`. **No documented `request_status` filter**, so per-request GETs are the reliable path — see 9.2. |
| Download signed PDF | `GET {apiBase}/requests/{request_id}/pdf?with_coc=true&merge=true` → `application/pdf` (or `application/zip` for multiple documents) |
| Download one document's PDF | `GET {apiBase}/requests/{request_id}/documents/{document_id}/pdf` |
| Completion certificate (audit trail) | `GET {apiBase}/requests/{request_id}/completioncertificate` → `application/pdf` |
| Recall (CPQ "void") | `POST {apiBase}/requests/{request_id}/recall` — recipients can no longer view or sign |
| Remind | `POST {apiBase}/requests/{request_id}/remind` |

`with_coc=true&merge=true` gives one PDF containing the signed document plus the certificate. CPQ stores **both** that merged file (as the signed PDF) and the certificate separately, so the tracking screen can offer "Signed document" and "Audit trail" as distinct downloads.

### 7.6 Embedded signing — optional, and it suits CPQ

`POST {apiBase}/requests/{request_id}/actions/{action_id}/embedtoken` with `host=<CPQ origin>` and optional `redirect_pages` (`sign_success`, `sign_completed`, `sign_declined`, `sign_later`). Requires `is_embedded: true` on that action at submit time.

**Two constraints that decide the design:**
1. The returned URL is **valid for two minutes** and is **single use**. It must be minted on demand, immediately before the iframe loads — never stored, never emailed, never put in a list response.
2. Embedded recipients **do not receive Zoho's email reminders**. If every recipient is embedded, CPQ owns all notification.

**Recommendation: ship non-embedded first (Zoho emails the signers), add embedded signing as a later step.** Non-embedded is one fewer moving part, gets a working end-to-end flow sooner, and Zoho's reminders come free. Embedded is the better long-term UX because signers stay inside CPQ, and the design keeps the door open (`zoho_embed_token_issued_at`, endpoint E8).

### 7.7 Rate limits and resource limits

| Limit | Value |
|---|---|
| General API threshold | **50 calls per minute** ("most" calls) |
| Export templates / import templates | 2/min, 1/min |
| Recipients per request | 25 |
| Documents per request | 40 |
| Envelope size | 40 MB |
| Single document size | 25 MB |
| Total fields per envelope | 2,000 |
| Signature-type fields per recipient | 300 |

Exceeding the rate limit reportedly returns **HTTP 429** with code **2955**, *"You have reached your API call limit for a minute."* The published limits page does not itself document the error code, so treat any 429 as retryable regardless of code.

**Design consequence:** the poller batch cap and backoff in section 9.2 exist specifically to keep every worst case under 50/min.

### 7.8 Error handling

Zoho wraps responses in `{ code, message, status }` with `code: 0` and `status: "success"` on success. Observed error codes from Zoho's community and docs: `9004` not found, `9015` extra/unknown key, `9043` extra key in `checked_by`, `2955` rate limit. **There is no published exhaustive error-code table.** The client therefore normalises defensively:

| Condition | CPQ behaviour |
|---|---|
| HTTP 401, or `code` indicating an invalid token | Refresh once, retry once. If it fails again, surface `ZOHO_AUTH_FAILED`. |
| HTTP 429 | Exponential backoff with jitter, max 3 attempts, then leave the document untouched and record `zoho_last_error`. Never mark failed on a 429. |
| HTTP 5xx / timeout | Same backoff. Idempotency is preserved because create is only attempted once per document (guarded by `zoho_request_id` already being set). |
| HTTP 4xx other | No retry. Return a mapped, user-readable message. Never echo Zoho's raw body to the browser (it can contain account detail). |
| `code !== 0` on an HTTP 200 | Treated as an error. Zoho can return 200 with a failure code. |

---

## 8. New API endpoints

All under `/api/zoho-sign/*`. **All require a verified JWT via `getAuthenticatedUser` (3041-3062), except the webhook**, which is authenticated by HMAC instead. All validate input on the backend. All are rate limited. All return the CPQ house shape `{ success: boolean, ... }` / `{ success: false, error: string }`.

If `ZOHO_SIGN_ENABLED` is not truthy, every endpoint except E1 returns **503** `{success:false, error:'Zoho Sign is not enabled'}` before doing anything else.

### E1 · `GET /api/zoho-sign/status`

Health and configuration check. **Auth:** JWT. **Limit:** 30/min/IP.

Response `200`:
```json
{ "success": true, "enabled": true, "dc": "us", "api_base": "https://sign.zoho.com/api/v1",
  "configured": true, "missing_keys": [], "token_valid_until": "2026-09-14T11:00:00.000Z",
  "webhook_configured": false, "polling": { "enabled": true, "interval_ms": 300000 } }
```
Never returns any secret, not even a prefix. `missing_keys` lists env **names** only.

### E2 · `POST /api/zoho-sign/documents/:id/send`

The core call. **Auth:** JWT; the caller must be the document creator (reusing `actorIsEsignDocumentCreator` from `esign-creator-utils.cjs` with the **JWT** email — the sound pattern at 7872, not the spoofable one at 7963). **Limit:** 10/min/IP.

Request:
```json
{ "expiration_days": 15, "is_sequential": true, "email_reminders": true,
  "reminder_period": 5, "notes": "optional", "request_name": "optional" }
```
Recipients and fields are **not** in the body — they are read from `esign_recipients` and `signature_fields`, exactly as the in-house `send-for-signature` does. This keeps one source of truth and means the existing prepare UI needs no new data plumbing.

Validation, in order: valid ObjectId · document exists · `status === 'draft'` · `provider` absent · at least one recipient · ≤25 recipients (7.7) · every non-reviewer recipient has ≥1 field (7.3) · file ≤25 MB · `expiration_days` integer 1–90 · Zoho configured.

Behaviour: resolve PDF (disk, else base64) → `POST /requests` → persist `zoho_request_id`, `zoho_document_ids`, `zoho_dc`, `provider:'zoho'` **before** submitting (so a crash between the two calls leaves a recoverable record, not an orphan at Zoho) → map fields → `POST /requests/{id}/submit` → set `status:'sent'`, `sent_at`, `zoho_sent_at`, `zoho_request_status` → `logAudit(documentId, 'sent', jwtEmail, req.ip, { provider:'zoho', zoho_request_id })`.

Responses:

| Code | Body |
|---|---|
| 200 | `{success:true, document:{id, provider:'zoho', status:'sent', zoho_request_id}, recipients:[{id, email, zoho_action_id}]}` |
| 400 | invalid id · not a draft · no recipients · >25 recipients · a signer has no fields · bad `expiration_days` |
| 401 | no/invalid JWT |
| 403 | caller is not the document creator |
| 404 | document not found |
| 409 | already sent, or already has a `zoho_request_id` |
| 413 | document exceeds Zoho's 25 MB limit |
| 429 | CPQ limiter, or Zoho 429 after backoff |
| 502 | `ZOHO_API_ERROR` with a mapped message |
| 503 | Zoho not enabled or not configured |

### E3 · `GET /api/zoho-sign/documents/:id`

Pull-through status refresh. **Auth:** JWT. **Limit:** 60/min/IP.

Calls `GET /requests/{request_id}` **only if** `zoho_last_polled_at` is older than `ZOHO_SIGN_MIN_REFRESH_MS` (default 30 s); otherwise returns the cached state with `stale:false`. This stops a dashboard with the page open from eating the 50/min budget. `?force=1` bypasses the throttle and is itself limited to 5/min.

`200`: `{success:true, document:{id, provider, status, zoho_request_status, zoho_sent_at, zoho_completed_at}, recipients:[{id, email, status, zoho_action_status}], refreshed:true}`.
Errors: 400 invalid id · 404 not found · 409 not a Zoho document · 502 · 503.

### E4 · `POST /api/zoho-sign/documents/:id/recall`

**Auth:** JWT + creator. **Limit:** 10/min/IP. Body `{ "reason": "optional string ≤500" }`.
Calls Zoho recall, then writes `status:'voided'`, `voided_at`, `voided_by` (JWT email), `void_reason`, `zoho_request_status:'recalled'`. Audits `voided`.
`409` if the request is already `completed`, `declined` or `recalled`.

> Note: `POST /api/esign/documents/:id/void` (Group 2, 5.3) branches here internally, so existing dashboard menus keep working. E4 exists as the explicit provider-native route.

### E5 · `POST /api/zoho-sign/documents/:id/remind`

**Auth:** JWT + creator. **Limit:** 5/min/IP (reminders are emails to customers; this one is deliberately tight). Empty body.
`409` if not in progress. Audits `reminder_sent` with `provider:'zoho'`.

### E6 · `GET /api/zoho-sign/documents/:id/signed-pdf`

**Auth:** JWT. **Limit:** 30/min/IP.
Serves `zoho_signed_file_path` from disk if present; otherwise fetches `GET /requests/{id}/pdf?with_coc=true&merge=true`, writes it to `uploads/signed/zoho-signed-{documentId}-{ts}.pdf`, records the path, then serves it. Same `?attachment=1` convention as the existing file endpoint (7583).
`409` if the request is not completed. `502` on a Zoho failure.

### E7 · `GET /api/zoho-sign/documents/:id/certificate`

As E6, against `/completioncertificate`, stored at `uploads/signed/zoho-coc-{documentId}-{ts}.pdf` and recorded in `zoho_certificate_file_path`.

### E8 · `POST /api/zoho-sign/documents/:id/recipients/:recipientId/embed-token`

Only if embedded signing is enabled. **Auth:** JWT. **Limit:** 20/min/IP.
Body `{ "host": "<CPQ origin>" }` — validated against the existing CORS allow-list (`isAllowedOrigin`, ~188) rather than trusted, so this cannot be used to point Zoho at an arbitrary host.
Returns `{success:true, sign_url, expires_in_seconds:120}`. **The URL is never persisted and never logged.** `403` if the recipient is not embedded or it is not their turn.

### E9 · `POST /api/zoho-sign/webhook`

**Public. No JWT — that is correct and intentional; Zoho cannot hold one.** Authenticated by HMAC (section 9.1). **Limit:** 240/min/IP, generous so a burst is never dropped.

Always returns **`200 {received:true}`** once the HMAC verifies, **before** doing the work — Zoho must not retry because our database was briefly slow. Invalid HMAC returns **401** with no body detail.

### E10 · `POST /api/zoho-sign/poll`

Manual trigger for the poller, for operators and tests. **Auth:** JWT **and** the caller must be an admin (reusing the existing admin check at 3052/3076). **Limit:** 2/min/IP.
Body `{ "document_id": "optional — poll just this one" }`. Returns `{success:true, polled:N, updated:M, skipped:K}`.

### 8.1 What the client sends to Zoho — summary

| CPQ action | Zoho call |
|---|---|
| E2 create | `POST {apiBase}/requests` (multipart) |
| E2 submit | `POST {apiBase}/requests/{id}/submit` |
| E3 / poller | `GET {apiBase}/requests/{id}` |
| E4 | `POST {apiBase}/requests/{id}/recall` |
| E5 | `POST {apiBase}/requests/{id}/remind` |
| E6 | `GET {apiBase}/requests/{id}/pdf?with_coc=true&merge=true` |
| E7 | `GET {apiBase}/requests/{id}/completioncertificate` |
| E8 | `POST {apiBase}/requests/{id}/actions/{action_id}/embedtoken` |

---

## 9. Status sync: webhook, and the polling fallback

### 9.1 Webhook design (preferred, but blocked today)

**The blocker, stated plainly.** Zoho delivers webhooks to a **public HTTPS callback URL**. The dev server is `159.89.175.168:3001` — **plain HTTP, no nginx, no TLS, no domain**. Zoho cannot deliver to it. This is not a configuration detail to sort out later; **webhooks cannot be developed or tested on dev as it stands.** Options, in order of preference:

1. Put the dev server behind the same nginx + TLS arrangement production uses (see the `deploymentgigitaldocker` stack). Proper fix, needs DevOps time.
2. Get a dev subdomain with a certificate pointing at port 3001.
3. Use a tunnel (ngrok/Cloudflare Tunnel) for **manual testing only**. Not a deployment answer, and the URL changes each session.
4. **Test webhooks only on production, after polling has proven the flow.** Realistic, and what this design assumes by default.

**Second, independent blocker: plan tier.** Zoho's documentation states webhooks are available on **Enterprise, API, Zoho One and People Plus plans** only, with a **maximum of two webhooks per account**. So even with HTTPS, webhooks need the right plan — and two slots total means dev and production would compete for them.

**Because of both, polling is not a nice-to-have. It is the primary mechanism at launch.**

**Design, for when webhooks become available:**

Events Zoho can send: `Sent`, `Viewed`, `Signed by a recipient`, `Completed by all`, `Declined`, `Reassigned`, `Expires`, `Recalled`, `Approved`.

Payload shape: two objects —
`notifications`: `performed_by_email`, `performed_by_name`, `performed_at`, `reason`, `activity`, `operation_type`, `action_id`, `ip_address`
`requests`: `request_status`, `request_name`, `request_id`, `document_ids[]`

**Verification (HMAC-SHA256):**
1. Read the payload **as a raw string**. Zoho is explicit: *"read the payload as a string to avoid reordering keys when read in JSON format."* Parsing and re-serialising breaks the signature.
2. `base64( HMAC_SHA256(rawBody, ZOHO_SIGN_WEBHOOK_SECRET) )`.
3. Compare to the `X-ZS-WEBHOOK-SIGNATURE` header using `crypto.timingSafeEqual` on equal-length buffers. Mismatch → 401, nothing written, one warning logged **without** the payload.

**Implementation gotcha that will bite whoever writes this.** `server.cjs` mounts `express.json({limit:'50mb'})` at line 288, which consumes the stream and leaves only the parsed object — the raw bytes are gone, so the HMAC cannot be computed. Two ways out:

- **(a) Recommended.** Insert `app.use('/api/zoho-sign/webhook', express.raw({ type: 'application/json', limit: '1mb' }))` **immediately before** line 288. Path-scoped, affects nothing else, one added line. `req.body` is then a Buffer on that route only; the handler does `JSON.parse(raw.toString('utf8'))` **after** verifying.
- **(b) Rejected.** Adding a `verify` callback to the existing `express.json` options. That edits an existing line and attaches a raw copy of **every** request body — including 50 MB `generate-signed` payloads — to `req`. Unacceptable memory cost for one route's benefit.

**Processing:** verify → respond 200 → build `dedupe_key` → insert into `zoho_sign_events` (unique index; `E11000` means already handled, stop) → look up the document by `zoho_request_id` (unknown id: record the event, log once, do not error — it may belong to another environment sharing the account) → map statuses (6.4) → update document and recipients → on `completed`, fetch the signed PDF and certificate → `logAudit`.

**Registration:** the webhook is configured **in the Zoho Sign admin UI, not via API**, and it is **account-level, not per-request**. One URL for the whole Zoho account. With a two-webhook cap, dev and production cannot both have one without burning both slots.

### 9.2 Polling fallback — the mechanism that actually works today

`zoho-sign-poller.cjs`, started from `server.cjs` only when `ZOHO_SIGN_ENABLED` and `ZOHO_SIGN_POLL_ENABLED` are both truthy.

**Selection query** (served by the compound index in 6.1):
```
{ provider: 'zoho',
  zoho_request_status: { $in: ['draft','inprogress'] },
  $or: [ { zoho_last_polled_at: { $exists: false } },
         { zoho_last_polled_at: { $lt: new Date(Date.now() - intervalMs) } } ] }
```
sorted by `zoho_last_polled_at` ascending, `limit: ZOHO_SIGN_POLL_BATCH` (default **20**).

**Budget arithmetic — this is why the numbers are what they are.** Default interval 5 minutes, batch 20. Each document costs one `GET /requests/{id}`. Worst case 20 calls in one tick, against a **50 calls/minute** ceiling (7.7). That leaves 30 calls of headroom per minute for user-initiated sends, downloads and reminders. A backlog of 200 in-flight documents clears in 10 ticks ≈ 50 minutes, which is acceptable for a signature workflow where the customer is being emailed anyway.

**Other properties:**
- One tick never overlaps the previous one (an in-flight flag, not a naive `setInterval` fire-and-forget).
- A 429 sets a cooldown: skip the next `2^n` ticks, capped at 8, reset on success.
- Every document gets `zoho_last_polled_at` updated **even when nothing changed**, so one stuck document cannot starve the queue.
- A status change writes a `zoho_sign_events` row with `source:'poll'` and the **same `dedupe_key` shape** as the webhook path. That is what makes the two mechanisms safe to run simultaneously — whichever arrives first wins, the second is a no-op.
- On `completed`, the same download-and-store path as the webhook runs. One implementation, two triggers.
- The poller never throws into the event loop. Every tick is wrapped; failures log and continue.

**Cost of polling instead of webhooks:** status is up to 5 minutes stale. For a signature workflow measured in hours or days, that is fine. Say so in the status update rather than presenting webhooks as imminent.

---

## 10. Frontend changes

Small and contained. Four files, one of them optional.

### 10.1 `src/pages/EsignPlaceFieldsPage.tsx` — the provider picker

The one place the user makes the choice. It goes in the right sidebar **between the validation section (ends 1601) and the footer action bar (starts 1612)**, so it sits directly above the send button and is impossible to miss.

What the user sees — two radio cards:

```
  Signing method
  ( ) CPQ e-signature        Built in. Signers get a CPQ link.       [Default]
  ( ) Zoho Sign              Sent through Zoho. Signers get a Zoho email.
```

Rules:
1. The whole block **renders only if** `GET /api/zoho-sign/status` returned `enabled: true`. Fetched once when the page mounts. If it fails or returns disabled, the block is absent and the page is byte-identical to today.
2. Default is always CPQ e-signature. Selection is component state; it is **not** persisted anywhere.
3. Picking Zoho shows one short line of consequences: *"Zoho emails the signers. Reminders and the audit trail come from Zoho. Status updates can take up to 5 minutes."* Honest, and it pre-empts the "why is it still showing as sent" question.
4. The existing validation checklist (`validationItems`, 949-960) gains two Zoho-only items: **"25 recipients or fewer"** and **"Every signer has at least one field"** (7.3 — Zoho rejects a non-VIEW action with no fields, where CPQ today tolerates it).

`handleSendForSignature` (774-830) changes at exactly one line — the final POST, currently `JSON.stringify({})` at line 812:

| Provider | Call |
|---|---|
| CPQ (default) | `POST /api/esign/documents/${id}/send-for-signature` — **unchanged, empty body** |
| Zoho | `POST /api/zoho-sign/documents/${id}/send` with `{expiration_days, is_sequential, email_reminders}` and `Authorization: Bearer ${localStorage.cpq_token}` |

The two preceding calls — `POST /api/esign/signature-fields` and the recipient save — are **identical for both providers**. That is the payoff of reading recipients and fields server-side in E2.

The success modal (972-1010) gains one provider-specific line: *"Sent via Zoho Sign. Signers will receive an email from Zoho."*

### 10.2 `src/pages/EsignSendPage.tsx` — the secondary send screen

Same picker, same branch on the POST at line 59. Must not be forgotten, or a user reaching send by that route silently gets the wrong provider.

### 10.3 `src/pages/EsignTrackingPage.tsx` and `src/components/EsignAgreementStatusDashboard.tsx`

Read-only, plus button gating:

1. A **provider badge** on each row — "CPQ" or "Zoho" — driven by the `provider` field the Group 1 endpoints now return (5.3).
2. For Zoho rows, a sub-label showing `zoho_request_status` verbatim, so `expired` is visible even though CPQ stores `voided` (6.4).
3. Buttons that cannot work on a Zoho document are **hidden**, not merely disabled-on-click: *Copy signing link* (there is no CPQ token), *Extend expiry* (no Zoho equivalent), *Forward* (Zoho's reassign is a different mechanism, out of scope).
4. *Download* on a completed Zoho row gets a second item, **"Audit trail (Zoho)"** → E7.
5. *Void* and *Remind* keep their current URLs and work unchanged, because those two branch server-side (Group 2).

### 10.4 `src/services/esignDocumentService.ts`

Add `getZohoSignStatus()`, `sendWithZohoSign(documentId, options)`, `refreshZohoDocument(documentId)`. Every one sends `Authorization: Bearer ${localStorage.cpq_token}`, following the pattern already pinned by `esignDocumentDelete.test.ts`. This keeps the new auth-bearing calls in the one service file that already does this correctly.

### 10.5 What deliberately does not change

`EsignSignPage.tsx`, `EsignInboxByToken.tsx`, `EsignSignedPage.tsx`, `EsignPdfPageView.tsx`, all four role dashboards, and every `src/utils/esign*.ts` helper. Zoho signers never touch CPQ's signing UI — they sign at Zoho.

---

## 11. Configuration

### 11.1 New `.env` keys

Appended to `env-template.txt` **with empty values**, following the file's existing conventions: a three-line `# ====` header sandwich, `SCREAMING_SNAKE_CASE`, no spaces around `=`, no quotes, a provenance comment above each key, and blank (not placeholder) values for anything secret.

```
# ===========================================
# ZOHO SIGN (Optional second e-signature provider)
# ===========================================
# Leave ZOHO_SIGN_ENABLED blank to keep Zoho Sign completely off.
# Blank means: no provider picker in the UI, no poller, and every
# /api/zoho-sign/* route returns 503. The built-in e-sign flow is unaffected.
ZOHO_SIGN_ENABLED=

# Data centre of the Zoho Sign account: us | eu | in | au | jp | ca | sa
# Find it by opening Zoho Sign in a browser and reading the domain
# (sign.zoho.in means "in"). Tokens are NOT portable between data centres.
ZOHO_SIGN_DC=us

# From the Zoho API Console (https://api-console.zoho.<dc>), Self Client.
# NEVER commit real values. NEVER log them.
ZOHO_SIGN_CLIENT_ID=
ZOHO_SIGN_CLIENT_SECRET=

# One-time exchange of the Self Client grant code. Long-lived: Zoho refresh
# tokens do not expire. Treat this as a password.
ZOHO_SIGN_REFRESH_TOKEN=

# Shared secret entered in Zoho Sign > Settings > Webhooks.
# Blank disables webhook processing entirely (polling still works).
ZOHO_SIGN_WEBHOOK_SECRET=

# Polling fallback. Required while there is no public HTTPS callback URL.
ZOHO_SIGN_POLL_ENABLED=1
ZOHO_SIGN_POLL_INTERVAL_MS=300000
ZOHO_SIGN_POLL_BATCH=20
ZOHO_SIGN_MIN_REFRESH_MS=30000

# Field coordinate calibration. Set once, after measuring against a real
# Zoho account. Zoho does not document the unit or the origin.
ZOHO_SIGN_COORD_ORIGIN=top
ZOHO_SIGN_COORD_UNIT=pt

# Optional overrides. Leave blank to use the built-in data centre table.
ZOHO_SIGN_API_BASE=
ZOHO_SIGN_ACCOUNTS_BASE=
```

### 11.2 Config rules

1. `.env` is already in `.gitignore`. It stays there. Nothing secret ever reaches `env-template.txt`.
2. `zoho-sign-config.cjs` reads env **once at boot** and exposes a frozen object. No scattered `process.env` reads.
3. On boot with `ZOHO_SIGN_ENABLED` truthy but keys missing, log **one** warning naming the missing **variable names** — never values — and report the feature as not configured. Do not crash the server.
4. `console.log` is already used throughout `server.cjs`, which CLAUDE.md forbids in production code. The new modules do not add to that: they route through the existing logging path and **never** log a token, a refresh token, a webhook secret, a signed-URL, or a raw Zoho error body.

---

## 12. Security review

### 12.1 Secrets

| Secret | Where it lives | Rules |
|---|---|---|
| `ZOHO_SIGN_CLIENT_SECRET` | `.env` only | Never in git, logs, error responses, or `GET /api/zoho-sign/status` |
| `ZOHO_SIGN_REFRESH_TOKEN` | `.env` only | Does not expire — compromise is permanent until revoked in the Zoho console. Highest-value secret in this feature. |
| Access token | Memory + `zoho_sign_tokens` | Never returned to any client. `E1` exposes only `token_valid_until`. |
| `ZOHO_SIGN_WEBHOOK_SECRET` | `.env` only | Zoho does not let you read it back after saving, so record it somewhere safe at the moment of creation. |
| Embedded `sign_url` | Nowhere | Returned to the browser once, never persisted, never logged. Two-minute, single-use. |

A redaction guard in the client wraps every outbound-error log: if the string contains the client secret, refresh token or webhook secret, the log is dropped rather than printed. This mirrors the fix already made for the Mongo password in boot logs.

### 12.2 Webhook callback verification

Covered in 9.1. Restating the controls: HMAC-SHA256 base64 over the **raw body**; `timingSafeEqual` on equal-length buffers; 401 with no detail on mismatch; a blank `ZOHO_SIGN_WEBHOOK_SECRET` means the route **rejects everything** rather than accepting unverified posts — fail closed, never open. A 1 MB body cap on the raw parser. Unknown `request_id` is recorded and ignored, never treated as an error, because the two-webhook account-level cap means another environment's events can legitimately arrive.

### 12.3 Authorization on the new endpoints

As established in 4.4, the surrounding endpoints are largely unauthenticated. The new ones are not, because copying that pattern would be copying a defect.

| Endpoint | Auth |
|---|---|
| E1 status | JWT |
| E2 send | JWT **+ creator check using the JWT email** |
| E3 refresh | JWT |
| E4 recall / E5 remind | JWT + creator |
| E6 signed-pdf / E7 certificate | JWT |
| E8 embed-token | JWT + turn check + `host` validated against the CORS allow-list |
| E9 webhook | HMAC only — by design |
| E10 poll | JWT + admin |

The creator check reuses `actorIsEsignDocumentCreator` from `esign-creator-utils.cjs`, fed the **verified JWT email** (the sound call site at 7872) and never a body-supplied address (the spoofable pattern at 7963/8494).

### 12.4 Input validation (backend, always)

| Input | Rule |
|---|---|
| `:id`, `:recipientId` | `/^[0-9a-fA-F]{24}$/` before any `new ObjectId()` — reusing the existing `normalizeBulkDownloadIds` idiom |
| `expiration_days` | integer, 1–90 |
| `reminder_period` | integer, 1–30 |
| `is_sequential`, `email_reminders` | strict boolean; anything else rejected |
| `notes`, `request_name`, `reason` | strings, trimmed, length-capped (500 / 200 / 500) |
| `host` (E8) | must match an allowed CORS origin exactly |
| Recipient emails | re-validated server-side before going to Zoho — a malformed address fails the whole Zoho request, so catching it early gives a much better error |
| Recipient count | ≤25 (7.7) |
| PDF size | ≤25 MB (7.7) |
| Webhook body | ≤1 MB, parsed **only after** HMAC verification |

### 12.5 Rate limiting

Per-endpoint `express-rate-limit` instances as listed in section 8, using the library already required at line 18. The tightest is E5 remind at **5/min** because it sends email to customers. This makes the new surface the **only** rate-limited part of the e-sign system — worth stating in the status update as a small net security improvement.

### 12.6 Testing must never touch production data

This is a hard constraint, and it is the one most likely to be violated by accident.

**`MONGODB_URI` in `.env` IS the live production database. There is no separate dev database.**

Therefore:

1. No test, script or manual step in this feature ever connects using the `.env` `MONGODB_URI`. Unit tests use injected fakes and touch no database at all, exactly like the nine existing `esign*.test.ts` files.
2. Any manual end-to-end run uses an explicitly overridden `MONGODB_URI` pointing at a local or throwaway MongoDB. Overriding is a deliberate, stated step in the runbook — never a default.
3. The poller is off unless `ZOHO_SIGN_POLL_ENABLED` is set, so merely importing the module cannot start background writes.
4. The feature ships no data-fixing script, no backfill and no `updateMany`. The three `createIndex` calls are the only database-structural change, and they write no document data.
5. **Before any code lands that touches database logic, ask first.** That is a standing rule on this project and it applies here.

### 12.7 Data sensitivity

Sending a document to Zoho means the **full contract PDF, recipient names and recipient email addresses leave CloudFuze infrastructure** and are stored by Zoho. That is the point of the integration, but it is a genuine data-processing change and it deserves a yes from whoever owns vendor/legal sign-off before the first real customer document goes through. Flagged in section 14.

---

## 13. Feasibility against the 3-day deadline — blunt assessment

Today is **2026-09-14**. The status update is due **2026-09-17**. That is roughly **three working days for one engineer**.

### 13.1 Full effort estimate

| Step | Work | Est. |
|---|---|---|
| S0 | Zoho account with API access, API console, Self Client, first refresh token | **External. 0.5–3 days of waiting.** Cannot be shortened by engineering. |
| S1 | `zoho-sign-config.cjs` — DC table, env, enabled flag + tests | 3h |
| S2 | `zoho-sign-auth.cjs` — token cache, refresh, single-flight, 401 retry + tests | 5h |
| S3 | `zoho-sign-client.cjs` — 9 calls, backoff, error normalisation + tests | 9h |
| S4 | Additive fields, 3 sparse indexes, `zoho_sign_tokens`, `zoho_sign_events` | 2h |
| S5 | `zoho-sign-mapper.cjs` — recipients→actions, fields→fields + tests | 6h |
| S5b | **Coordinate calibration against a real Zoho account** (7.4) | **8h, and it cannot start before S0 completes** |
| S6 | E2 send route, wiring, validation, audit | 7h |
| S7 | `zoho-sign-status.cjs` + poller + E3/E10 + tests | 8h |
| S8 | E9 webhook: raw-body middleware, HMAC, idempotency + tests | 6h |
| S9 | E4–E7: recall, remind, signed PDF, certificate | 5h |
| S10 | Group 1/2/3 changes to the 12 existing endpoints | 5h |
| S11 | Frontend: picker, two send screens, badges, button gating, service methods | 10h |
| S12 | Embedded signing (E8), optional | 6h |
| S13 | Tests to CLAUDE.md's 80%, docs, code review, security review | 8h |
| | **Total** | **≈ 88 hours ≈ 11 working days**, excluding S0 waiting and excluding deployment |

Excluding the optional S12, it is roughly **10 working days**.

### 13.2 What is genuinely achievable by 2026-09-17

**If credentials exist on day 1:** S1, S2, S3, S4, S5 and a first cut of S6. That is the config layer, the OAuth layer, the API client, the schema, the mapper, and a send route that compiles — with unit tests against mocked HTTP. Possibly one real document created at Zoho with fields in the wrong places.

**If credentials do not exist:** S1, S2, S3, S4, S5 and their unit tests, written against mocked HTTP and **never executed against Zoho even once.**

### 13.3 What is not achievable in 3 days — say so plainly

1. **A verified end-to-end signed document through Zoho.** Not close.
2. **Correct field placement.** The coordinate system is undocumented (7.4) and needs a full day of empirical calibration that cannot begin without credentials.
3. **Webhooks.** Blocked twice over: no public HTTPS on dev, and an Enterprise/API plan requirement. Not a 3-day item under any staffing.
4. **Frontend work.** 10 hours, and it should follow a working backend or it gets built against guesses.
5. **Production deployment.** Needs code review, security review, QA and the two-step commit gate plus the three-step deploy gate. Not in this window.
6. **80% test coverage on the new modules.** The pure helpers can get there; the route glue cannot, because there is no route-test harness in this repo at all (4.7).

### 13.4 The credentials problem — the thing to lead with

**Nobody has confirmed CloudFuze has a Zoho Sign plan that includes API access.** Until that exists:

- Zero live API calls are possible. Not one.
- Every module is written against documentation and mocks.
- Every "done" is **unverified**. Unit tests would pass against a fake that encodes my reading of the docs. If that reading is wrong — and the coordinate system alone says parts of it will be — the tests pass and the feature does not work.

Third-party sources (SignWell, Verdocs, Certinal) report that Zoho Sign's API requires an **Enterprise plan or a separate credit-based API plan**, with API sends consuming credits (reportedly around 5 credits per document). **Those are not Zoho's own pages and must be confirmed with Zoho sales or the billing console before anyone plans around them.** What is confirmed from Zoho's own documentation is narrower and still decisive: **webhooks require Enterprise, API, Zoho One or People Plus.**

There is precedent in this repository for what happens when a plan does not include API access: the BoldSign stub (4.9) — an "integration" that downloads a file and tells the user to upload it by hand. **Do not repeat that.** If the plan is wrong, the answer is "blocked on procurement", not a second stub.

### 13.5 Suggested wording for the 3-day status update

> Zoho Sign integration — design complete, implementation started, not yet verifiable.
>
> 1. Design is done: Zoho Sign will be an **optional second** signing provider. The built-in e-sign flow stays the default and is not being changed.
> 2. The architecture is decided: new `/api/zoho-sign/*` routes for all Zoho actions, plus a `provider` flag so both kinds of document appear in one tracking list. 12 of 32 existing endpoints are touched; 5 of those are read-only and 5 are simple guards.
> 3. Every database change is a new optional field. Nothing existing is renamed or removed. No migration.
> 4. Built so far: configuration, OAuth token handling, the Zoho API client, and the recipient/field mapper, with unit tests.
> 5. **Not yet proven against Zoho.** We do not have confirmed Zoho Sign API credentials. Until we do, nothing can be tested for real.
> 6. **Two known blockers.** (a) We need a Zoho Sign plan that includes API access — needs confirming with Zoho. (b) Zoho webhooks need a public HTTPS address; the dev server is plain HTTP, so we will run on **polling** (status refresh every 5 minutes) until that is fixed. Polling is designed in and works without webhooks.
> 7. Realistic remaining effort once credentials arrive: **8–10 working days**, of which about one full day is calibrating signature-field positions, because Zoho does not document its coordinate system.

That is honest, it leads with the blocker, and it does not promise a demo that cannot happen.

---

## 14. Open questions and risks

### 14.1 Questions that need an answer before coding

| # | Question | Why it blocks |
|---|---|---|
| Q1 | **Does CloudFuze have a Zoho Sign plan with API access?** If not, who buys it and when? | Nothing can be verified without it. This is the top blocker. |
| Q2 | **Which data centre is the account in?** (`sign.zoho.com` vs `.eu` vs `.in` …) | Tokens are not portable between DCs. Wrong guess means redoing OAuth setup. |
| Q3 | **Can DevOps put the dev server behind HTTPS?** If not, do we accept polling-only until production? | Decides whether webhooks are in this project at all. |
| Q4 | **Approve writing `signed_file_path` as well as `zoho_signed_file_path` on completion?** (6.5) | The only place this design writes an existing field on a new path. Yes = downloads work with no code change; No = one more endpoint becomes provider-aware. |
| Q5 | **New collections named `zoho_sign_events` / `zoho_sign_tokens` (snake_case, matching `esign_*`) or camelCase per CLAUDE.md?** | Consistency ruling. Cheap now, annoying later. |
| Q6 | **Embedded signing or Zoho-hosted emails?** (7.6) | Recommendation is Zoho-hosted first. Changes UX and roughly a day of work. |
| Q7 | **Has anyone signed off on customer contract PDFs and recipient emails leaving CloudFuze for Zoho?** (12.7) | A real data-processing change. Same class of sign-off as the log-monitor freeform-text question. |
| Q8 | **Should the approval workflow's auto-send ever use Zoho?** (X5) | Currently out of scope. If it must be in, add ~a day and a product decision about who chooses. |

### 14.2 Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | No API-capable Zoho plan | **High** — unconfirmed | Blocks everything | Confirm before any more engineering. Do not build a BoldSign-style stub as a consolation. |
| R2 | Field coordinates land in the wrong place | **High** — Zoho does not document the unit or origin | Signatures on the wrong part of the contract. Customer-visible. | Origin and unit are config, not constants. Budget a full calibration day. Pin the result in a test. |
| R3 | Webhooks never become available (no HTTPS, or wrong plan tier) | Medium-high | Status lags by up to 5 min | Polling is designed as the primary mechanism, not a fallback bolted on later. |
| R4 | Two-webhook account cap means dev and prod compete | Medium | Cannot test webhooks safely | Prefer polling on dev permanently; reserve webhook slots for production. |
| R5 | 50 calls/min ceiling hit by polling plus user activity | Low | 429s, delayed status | Batch cap 20 per 5-minute tick leaves 30 calls/min headroom. Backoff on 429. Throttle E3. |
| R6 | A regression in one of the 12 touched endpoints | Medium — **there are no route-level tests in this repo** | Breaks live signing | 5 of 12 are read-only, 5 are guards, only 2 branch. Manual QA script for the in-house happy path before merge. |
| R7 | Someone tests against the production database | **Medium — there is no dev database, so the default connection IS production** | Corrupted live agreements | Explicit `MONGODB_URI` override in the runbook. No backfill scripts exist to run by accident. Ask before any DB-touching change. |
| R8 | Refresh token leaks | Low | Permanent access until revoked | `.env` only, redaction guard on all logs, never in an API response, rotate via the Zoho console if suspected. |
| R9 | Sparse index omitted on `zoho_request_id` | Low but nasty | `E11000` on the **second** Zoho document — passes the first test, fails in production | Explicitly specified in 6.1. The codebase already hit this exact bug on `signing_token`. |
| R10 | `page_no` off-by-one (Zoho 0-based, CPQ 1-based) | Medium | Fields on the wrong page | Conversion isolated in the mapper with a dedicated unit test. |
| R11 | Zoho rejects a reviewer action that has no fields | Medium | Send fails at submit, after the request already exists at Zoho | Pre-validate in E2 **before** the create call; surface it in the frontend checklist (10.1). |
| R12 | Unit tests pass against mocks that encode a misreading of the docs | **High while credentials are missing** | False confidence | State plainly that nothing is verified until it runs against Zoho. Verify at the real entry point before calling anything done. |

---

## 15. Implementation sequence

Ordered so that each step is independently reviewable and nothing early depends on credentials.

| Step | Work | Est. | Depends on |
|---|---|---|---|
| 0 | **Answer Q1–Q3.** Obtain plan, DC, Self Client, refresh token. | external | — |
| 1 | `zoho-sign-config.cjs` + `tests/unit/zohoSignConfig.test.ts` — DC table, env resolution, `zohoSignEnabled()`, missing-key report | 3h | — |
| 2 | `zoho-sign-auth.cjs` + tests — cache, refresh, single-flight lock, 401-retry decision, `zoho_sign_tokens` shape | 5h | 1 |
| 3 | `zoho-sign-client.cjs` + tests — the 9 calls, backoff with jitter, error normalisation, redaction guard | 9h | 2 |
| 4 | Additive fields and 3 sparse indexes in the existing block at `server.cjs:468-491` | 2h | — |
| 5 | `zoho-sign-mapper.cjs` + tests — recipients→actions, `signature_fields`→Zoho fields, `page_no` conversion, coordinate function with injectable origin/unit | 6h | — |
| 6 | **Coordinate calibration** against a real account; pin constants in a test | 8h | 0, 5 |
| 7 | E2 send route + validation + audit + `env-template.txt` keys | 7h | 3,4,5 |
| 8 | `zoho-sign-status.cjs` + `zoho-sign-poller.cjs` + E3 + E10 + tests | 8h | 3,4 |
| 9 | E9 webhook: path-scoped raw parser, HMAC verify, dedupe, shared processing + tests | 6h | 8 |
| 10 | E4–E7: recall, remind, signed PDF, certificate | 5h | 3,4 |
| 11 | Group 1/2/3 changes to the 12 existing endpoints + manual in-house regression pass | 5h | 7,10 |
| 12 | Frontend: picker on both send screens, badges, button gating, service methods | 10h | 7 |
| 13 | E8 embedded signing — **optional, only if Q6 says so** | 6h | 7 |
| 14 | Test coverage, docs, `/code-review`, `/security-review` | 8h | all |

**Sum excluding step 0 and step 13: ≈ 82 hours ≈ 10 working days.**

Steps 1–5 are the only ones that can proceed today without credentials, and they total **25 hours ≈ 3 days** — which is exactly what section 13.2 says is achievable, and exactly why no demo is possible in that window.

---

## 16. Documentation sources

All checked 2026-09-14.

**Zoho Sign API**
- API introduction and root endpoint — https://www.zoho.com/sign/api/introduction.html
- Data-centre endpoints — https://www.zoho.com/sign/api/api-endpoint.html
- OAuth for Zoho Sign, scopes — https://www.zoho.com/sign/api/oauth.html
- OAuth getting-started — https://www.zoho.com/sign/api/getting-started-guide/outh.html
- Create document request — https://www.zoho.com/sign/api/document-managment/create-document.html
- Use case: sending a document for signature (create → fields → submit) — https://www.zoho.com/sign/api/use-cases/sending-a-document-for-signature.html
- Use case: adding a recipient / field properties — https://www.zoho.com/sign/api/getting-started-guide/use-cases/adding-a-recipient.html
- Get details of a particular document (status) — https://www.zoho.com/sign/api/document-managment/get-details-of-a-particular-document.html
- Get document list (pagination) — https://www.zoho.com/sign/api/document-managment/get-document-list.html
- Download PDF (`with_coc`, `merge`) — https://www.zoho.com/sign/api/document-managment/download-pdf.html
- Download particular PDF — https://www.zoho.com/sign/api/document-managment/download-particular-pdf.html
- Download completion certificate — https://www.zoho.com/sign/api/document-managment/download-completion-certificate.html
- Recall document — https://www.zoho.com/sign/api/document-managment/recall-document.html
- Remind recipient — https://www.zoho.com/sign/api/document-managment/remind-recipient.html
- Embedded signing — https://www.zoho.com/sign/api/embedded-signing.html
- API rules and resource limitations (50/min, sizes, field caps) — https://www.zoho.com/sign/api/api-limitations.html

**Zoho Sign webhooks**
- Webhooks management: plans, events, two-webhook cap, payload — https://help.zoho.com/portal/en/kb/zoho-sign/admin-guide/webhooks/articles/webhooks-management
- Securing webhooks with HMAC (`X-ZS-WEBHOOK-SIGNATURE`, base64) — https://help.zoho.com/portal/en/kb/zoho-sign/admin-guide/webhooks/articles/securing-zoho-sign-webhooks-with-hmac-authentication
- Webhooks feature page — https://www.zoho.com/sign/features-and-benefits/webhooks.html

**Zoho accounts / OAuth**
- Multi-DC domains and the `location` parameter — https://www.zoho.com/accounts/protocol/oauth/multi-dc.html
- Self Client authorization-code flow (3600 s token, non-expiring refresh token) — https://www.zoho.com/accounts/protocol/oauth/self-client/authorization-code-flow.html
- Web-app authorization request (`access_type=offline`, `prompt=consent`) — https://www.zoho.com/accounts/protocol/oauth/web-apps/authorization.html

**Plan/pricing — third-party, NOT authoritative, must be confirmed with Zoho**
- https://www.signwell.com/resources/zoho-sign-api/
- https://verdocs.com/blog/zoho-sign-pricing
- https://www.certinal.com/blog/zoho-sign-pricing

---

## 17. Next steps for the Backend Engineer

Do **not** start coding until Q1, Q2, Q4 and Q5 are answered.

When they are, build in this order and stop after each for review:

1. `zoho-sign-config.cjs` + tests (step 1).
2. `zoho-sign-auth.cjs` + tests (step 2).
3. `zoho-sign-client.cjs` + tests (step 3).
4. `zoho-sign-mapper.cjs` + tests (step 5) — write the coordinate function with origin and unit as **parameters**, and leave the constants unpinned until calibration.
5. Only then touch `server.cjs`, and only additively.

Three rules that are not negotiable on this feature:

- **Never point the new code at the `.env` `MONGODB_URI`.** That is production. Override it explicitly for any run that writes.
- **Ask before any change that touches database logic**, including the index block.
- **Do not claim anything works until it has been driven through the real entry point** against a real Zoho account. Passing unit tests against a mock built from these docs is not verification.
