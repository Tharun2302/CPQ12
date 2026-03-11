# API Endpoints Reference

All endpoints are relative to `VITE_BACKEND_URL` (e.g. `http://localhost:3001`).  
Checked against `server.cjs` and frontend usage (full audit).

---

## E-Sign (built-in)

| Method | Endpoint | Used by |
|--------|----------|--------|
| GET | `/api/esign/documents` | EsignDocumentsPage, EsignTrackingPage |
| POST | `/api/esign/documents/upload` | EsignDocumentsPage |
| POST | `/api/esign/documents/from-approval` | QuoteGenerator |
| GET | `/api/esign/documents/:id` | EsignPlaceFieldsPage, EsignSendPage, EsignTrackingPage, EsignSignPage, EsignSignedPage |
| GET | `/api/esign/documents/:id/file` | Place Fields, Tracking, Sign page, EsignTeamLeadDashboard, EsignTechnicalDashboard, EsignLegalDashboard |
| POST | `/api/esign/documents/:id/send` | EsignSendPage |
| DELETE | `/api/esign/documents/:id` | EsignDocumentsPage |
| GET | `/api/esign/documents/:id/recipients` | EsignPlaceFieldsPage, EsignTrackingPage |
| POST | `/api/esign/documents/:id/recipients` | EsignPlaceFieldsPage |
| POST | `/api/esign/documents/:id/send-for-signature` | EsignPlaceFieldsPage, EsignSendPage |
| POST | `/api/esign/documents/generate-signed` | EsignSignPage |
| GET | `/api/esign/fixed-role-recipients` | (?team= optional) |
| GET | `/api/esign/pending-for-email` | EsignTeamLeadDashboard, EsignTechnicalDashboard, EsignLegalDashboard (?email= required) |
| **GET** | **`/api/esign/inbox-by-token`** | **EsignInboxByToken** (?token= required, no login) |
| GET | `/api/esign/sign-by-token/:token` | EsignSignPage |
| POST | `/api/esign/mark-reviewed` | EsignSignPage |
| POST | `/api/esign/deny-signing` | EsignSignPage |
| POST | `/api/esign/signature-fields` | EsignPlaceFieldsPage, EsignSignPage |
| GET | `/api/esign/signature-fields/:documentId` | EsignPlaceFieldsPage, EsignSignPage |
| POST | `/api/esign/signatures/save` | EsignSignPage |

---

## Approval workflows

| Method | Endpoint | Used by |
|--------|----------|--------|
| POST | `/api/approval-workflows` | EsignPlaceFieldsPage, QuoteGenerator, ApprovalWorkflow |
| GET | `/api/approval-workflows` | ApprovalDashboard, document list |
| **GET** | **`/api/approval-workflows/verify-access`** | **ApprovalPortalGate** (?workflowId, role, token) |
| **GET** | **`/api/approval-workflows/:workflowId/document`** | Deal Desk email download (token in query) |
| GET | `/api/approval-workflows/:id` | TeamApprovalDashboard, Legal/TechnicalTeamApprovalDashboard, ClientNotification |
| PUT | `/api/approval-workflows/:id` | (backend/internal) |
| PUT | `/api/approval-workflows/:id/step/:stepNumber` | Team/Technical/Legal dashboards |
| POST | `/api/approval-workflows/send-esign` | (approval completion flow) |
| DELETE | `/api/approval-workflows/:id` | (if used) |

---

## Team approval settings

| Method | Endpoint | Used by |
|--------|----------|--------|
| GET | `/api/team-approval-settings` | QuoteGenerator, ApprovalWorkflow, EsignPlaceFieldsPage |
| PUT | `/api/team-approval-settings` | QuoteGenerator, ApprovalWorkflow |
| GET | `/api/team-approval-settings/team/:teamName` | (optional) |
| POST | `/api/send-authorization-request` | QuoteGenerator |

---

## Approval emails

| Method | Endpoint | Used by |
|--------|----------|--------|
| POST | `/api/send-team-email` | QuoteGenerator, EsignPlaceFieldsPage |
| POST | `/api/send-manager-email` | TechnicalTeamApprovalDashboard, MigrationManagerDashboard |
| POST | `/api/send-ceo-email` | LegalTeamApprovalDashboard, TeamApprovalDashboard |
| POST | `/api/send-client-email` | (after approval) |
| POST | `/api/send-deal-desk-email` | LegalTeamApprovalDashboard, ClientNotification |
| POST | `/api/send-approval-emails` | (if used) |

---

## Documents (agreement PDFs, preview)

| Method | Endpoint | Used by |
|--------|----------|--------|
| GET | `/api/documents/:id/preview` | Approval dashboards, ClientNotification, etc. |
| GET | `/api/documents/:id` | Legal/Technical dashboards, ClientNotification |
| GET | `/api/documents/:id/file` | EsignPrepareModal (approval doc file) |
| POST | `/api/documents/upload` | (doc upload) |
| GET | `/api/documents` | (list) |
| POST | `/api/documents` | (create) |
| GET | `/api/documents/search` | (search) |
| DELETE | `/api/documents/:id` | (delete) |

---

## Other (quotes, templates, auth, HubSpot, etc.)

| Method | Endpoint |
|--------|----------|
| GET | `/api/health` |
| GET | `/api/auth/me` |
| POST | `/api/auth/login`, `/api/auth/register`, `/api/auth/microsoft` |
| GET | `/api/quotes`, POST, PUT, DELETE |
| GET | `/api/templates`, GET `/:id/file`, POST, PUT, DELETE |
| GET | `/api/exhibits`, GET `/:id/file`, POST, PUT, DELETE |
| GET | `/api/hubspot/contacts`, GET `/contacts/:contactId` |
| GET | `/api/hubspot/deals`, GET `/deals/:dealId` |
| POST | `/api/email/send` |
| POST | `/api/convert/docx-to-pdf` |
| GET | `/api/combinations`, GET `/:id/file`, POST, PUT, DELETE |
| GET | `/api/pricing-tiers`, POST |
| GET | `/api/signature/form/:formId`, GET `/forms-by-quote/:quoteId`, POST create/submit |
| GET | `/api/settings/exhibit-admins`, POST, DELETE |
| GET | `/api/migration-lifecycle/workflows` |
| GET | `/api/database/health`, `/api/test-mongodb`, `/api/libreoffice/health` |
| POST | `/api/boldsign/...` (if used) |

---

## Server route order (duplicates)

In `server.cjs`, Express uses the **first** matching route. These paths are registered more than once; the **first** handler runs:

- **GET** `/api/documents/:id` — registered at ~3380 and ~7660 → **first** (documents by `id`, smart search) is used.
- **GET** `/api/documents/:id/preview` — registered at ~6432 and ~7827 → **first** is used.
- **DELETE** `/api/documents/:id` — registered at ~3523 and ~7917 → **first** is used.

No frontend change needed; first handlers are the ones intended for approval/document flows.

---

## Frontend call with no server endpoint

- **POST** `/api/signature/upload-image` — called by **TemplateManager** (signature image upload). Not implemented in `server.cjs`. The frontend catches the failure and continues with a warning; flow does not break. To support it, add a POST handler in `server.cjs` that accepts multipart and returns `{ success, ... }`.

---

## Fix applied (historical)

- **App.tsx** was calling `GET /api/hubspot/deal/:dealId` (singular). The server has `GET /api/hubspot/deals/:dealId` (plural). The frontend uses `/api/hubspot/deals/${dealData.dealId}`.

---

**Audit summary:** All APIs used by E-Sign (including inbox-by-token), Approval (including verify-access and workflow document), Documents, Exhibits, Auth, Quotes, Templates, HubSpot, Email, and Migration Lifecycle are present and consistent. Only missing endpoint: `POST /api/signature/upload-image` (optional; frontend degrades gracefully).
