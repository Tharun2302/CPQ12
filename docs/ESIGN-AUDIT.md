# E-Signature Logic – Audit (Point-Wise)

Audit of the full e-sign flow: upload → recipients → place fields → send → email → inbox → sign/review → sequential next.

---

## 1. Document & upload

- **Upload:** `POST /api/esign/documents/upload` stores file in `uploads/documents/`, creates `esign_documents` record. OK.
- **From approval:** `POST /api/esign/documents/from-approval` creates e-sign document from approval workflow. OK.
- **List/delete:** `GET /api/esign/documents`, `GET /api/esign/documents/:id`, `DELETE /api/esign/documents/:id`. OK.

**Issues:** None.

---

## 2. Recipients

- **Set recipients:** `POST /api/esign/documents/:id/recipients` replaces all recipients; each has `document_id`, `name`, `email`, `role`, `order` (index). No `signing_token` on insert. OK.
- **Get recipients:** `GET /api/esign/documents/:id/recipients`. OK.
- **Order:** Recipients are sorted by `order: 1, _id: 1` for sequential flow. First = Team Lead, second = Technical, etc. OK.

**Issues:**

1. **Empty email:** If a recipient is saved with blank `email`, they will never get the sequential “next” email. Server logs a warning but does not block save. **Recommendation:** In Place Fields, validate that every recipient has an email before allowing “Send for signature” when Sequential is checked.

---

## 3. Signature fields

- **Save fields:** `POST /api/esign/signature-fields` replaces all fields for the document; supports `recipient_id` per field. OK.
- **Get fields:** `GET /api/esign/signature-fields/:documentId`. OK.
- **Sign page:** Loads fields and filters by `recipient_id` when fields are recipient-assigned. OK.

**Issues:** None.

---

## 4. Send for signature (initial)

- **Endpoint:** `POST /api/esign/documents/:id/send-for-signature` with `{ sequential: true/false }`.
- **Sequential:** When `sequential` is true, only the **first** recipient gets a token and email; others get tokens later when the previous person completes. Document is updated with `sequential: true`. OK.
- **Non-sequential:** All recipients get a token and email in one go. OK.
- **URLs:** Dashboard link and sign link use frontend base URL; `localhost:3001` is forced to `localhost:5173` for dev. OK.
- **Email content:** Option 1 (dashboard) + Option 2 (direct link); role-specific labels (Team Lead / Technical / Legal). Technical Team and Legal Team now get “review” subject/CTA. OK.

**Issues:**

2. **Sequential default:** Sequential checkbox defaults to **unchecked**. If the user forgets to check it, only the first recipient gets an email at send time, and **no “next” emails are sent** after review/sign (because `doc.sequential` is false). **Recommendation:** Consider defaulting Sequential to `true` when there are multiple recipients, or show a clear note: “For Team Lead → Technical → Legal flow, check Sequential.”

---

## 5. Email delivery

- **SendGrid:** Emails are sent only when `SENDGRID_API_KEY` is set. If not set, document is still marked “sent” but no emails go out; server logs a warning. OK.
- **Sequential “next” emails:** Sent in two places: (1) after `mark-reviewed` (reviewer approves), (2) after `generate-signed` (signer signs). Both now use the full template (Option 1 + Option 2) and treat Technical Team / Legal Team as reviewers. OK.

**Issues:**

3. **No email when SENDGRID missing:** If `SENDGRID_API_KEY` is not set, the UI still shows “Sent” and recipients get nothing. **Recommendation:** When SendGrid is not configured, show a warning in the UI (e.g. from a health/config API) or in the send response so the user knows emails were not sent.

---

## 6. Inbox by token (dashboard)

- **Endpoint:** `GET /api/esign/inbox-by-token?token=...`. Token is `signing_token`; no login. OK.
- **Queue:** All pending recipients for that email (same email, status `pending`, doc status `sent`). OK.
- **History:** Up to 50 signed/reviewed items for that email. OK.
- **Role:** Returned for UI title (Team Lead / Technical / Legal). OK.

**Issues:** None.

---

## 7. Sign / review page

- **Load:** `GET /api/esign/sign-by-token/:token` returns recipient, document, and (optionally recipient-filtered) fields. OK.
- **Mark reviewed:** `POST /api/esign/mark-reviewed` with `signing_token`, `action` (approve/deny), `comment` (required for deny). Updates recipient to `reviewed` or `denied`; if sequential, sends email to next recipient. OK.
- **Deny signing:** `POST /api/esign/deny-signing` with `signing_token`, `comment`. Sets recipient and document to denied. **No** “next” email is sent on deny (workflow stops). OK.
- **Generate signed PDF:** `POST /api/esign/documents/generate-signed` with token and field values. Writes signed file; updates recipient to `signed`; if all recipients done, document `completed`; if sequential, sends email to next. OK.

**Issues:** None.

---

## 8. Sequential flow (summary)

- **After review:** Next recipient is found by `order`; token assigned and email sent with Option 1 + Option 2. Technical/Legal get “review” wording. OK.
- **After sign:** Same logic; Technical/Legal get “review” wording; SENDGRID warning logged if key missing. OK.
- **Logging:** Server logs when sequential runs, who is next, and whether email was sent or skipped (no email, no SENDGRID, or sequential false). OK.

**Issues:** None after the fixes applied in this audit.

---

## 9. Routes and redirects

- **Frontend:** `/esign-inbox`, `/sign/:documentId` are public (no login). OK.
- **Backend redirect:** Requests to `localhost:3001/esign-inbox` or `.../sign/:id` redirect to `localhost:5173` so old email links still work. OK.

**Issues:** None.

---

## 10. Summary of issues (actionable)

| # | Issue | Severity | Recommendation |
|---|--------|----------|-----------------|
| 1 | Recipients can be saved with empty email; sequential “next” email is then skipped. | Medium | Validate in Place Fields: when Sequential is checked, require email for every recipient before Send. |
| 2 | Sequential checkbox defaults to false; if unchecked, Technical/Legal never get “next” emails. | Medium | Default Sequential to true when there are 2+ recipients, or show a prominent note to check it for Team Lead → Technical → Legal. |
| 3 | When SENDGRID_API_KEY is not set, UI still shows success but no emails are sent. | Low | Show a warning in UI or in send response when email is not configured. |

---

## Fixes applied during this audit

- **Initial send:** Technical Team and Legal Team now get “review” subject/CTA (same as Reviewer).
- **Sequential after sign:** Technical Team and Legal Team now get “review” email; SENDGRID warning logged when key is missing.
- **Consistency:** All three email paths (initial send, sequential after review, sequential after sign) now use the same reviewer logic and dashboard Option 1 + Option 2 for every role.
