# Zenop.ai CPQ — App Model (for the onboarding video)

Written 2026-10-28 from the code in `CPQ12/` (`server.cjs`, the `*-guard.cjs` helpers, `src/`).
**Status:** verified live. Every flow in sections 3–5 was clicked through in the running app, against a **local** copy
of the production configuration (`cpq_demo` on 127.0.0.1:27018). `.env` points at production Atlas, so the app was
never run against it. Two full dry runs passed, followed by database checks of every record's end state (`lib/verify-db.mjs`).

---

## 1. What it is, who uses it

Zenop.ai is CloudFuze's internal **Configure–Price–Quote** tool. A sales rep turns a HubSpot deal
into a priced migration quote and generates the customer agreement (a Word/PDF with
exhibits merged in). The rep gets the agreement approved internally, then sends it to the
customer for e-signature. All of this happens in one app.

| Person | What they do in the app | How they get in |
|---|---|---|
| **Sales rep (requester)** | Deal → Configure → Quote → Send for Approval → track → e-Sign | Microsoft sign-in (`@cloudfuze.com` only), or the email form (locked to `cpq@zenop.ai`) |
| **Team Lead** (per team: SMB, AM, ENT, DEV, DEV2…) | Step 1 approve / deny / comment | Emailed link `/approval/<id>?role=teamlead&token=…` (7-day token) |
| **Technical team** (shared mailbox) | Step 2 approve / deny | Emailed link, **plus** a Microsoft sign-in with an email on `team_approval_settings.technicalEmails` |
| **Legal team** (shared mailbox) | Step 3, the final approval | Emailed link |
| **Deal Desk** (salesops@) | Step 4, "Notified" automatically after Legal | Nothing to click |
| **Customer signer / reviewer** | Signs or reviews the agreement | Emailed link `/sign/<token>` (15-day token) |
| **Approval admin** | Discount cap, approval-admin list, Edit Dates | Flag computed from env / `settings` (`server.cjs:3243-3271`) |
| **Exhibit admin** | Edit exhibits and combinations | `exhibit_admin` role, env list or `settings` (`server.cjs:3133-3188`) |

There is no general role system. Stored roles are only `viewer` and `exhibit_admin`. Approvers
are **not** user accounts: they are identified by the token in their email link.

**Login** (`src/contexts/AuthContext.tsx`, `server.cjs:1819-2100`): the server issues a 7-day JWT.
The client keeps `localStorage.cpq_token` and `cpq_user`, and re-checks a JWT with `/api/auth/me` on
load. Success lands on `/deal`. Sign-out clears both keys.

---

## 2. Navigation (left sidebar, desktop ≥1024 px)

Deal · Configure · Quote · Approval · Manual Approval · Manual e-sign · e sign status ·
Templates · Exhibits · Documents · Admin Settings (approval admins only) · Help / Contact Us · user menu.

---

## 3. The core record and its lifecycle

The deal flows through **five linked records**:

```
HubSpot deal ─▶ quote (quotes) ─▶ agreement (documents) ─▶ approval workflow (approval_workflows)
                                                          └▶ e-sign envelope (esign_documents + esign_recipients + signature_fields)
```

### 3.1 Deal (Deal tab)
- It arrives from HubSpot's "Zenop.ai" link as URL parameters (`dealId`, `dealName`, `ContactEmail`,
  `CompanyName`…; `App.tsx:508-716`). With a numeric dealId the server also fetches the live
  contact and company (needs `HUBSPOT_API_KEY`).
- With no deal, the tab shows a placeholder demo deal ("TEST-12345").
- **"Use Deal Data"** makes it the active deal and goes to Configure.

### 3.2 Configure → price
- Choose **Migrate / Manage / Bundle**. Migrate has a tick-list: *Multi combination*, *Overage
  Agreement*, *Data Sprawl*, *DIY*. These can be combined into one agreement; DIY is always alone.
- **Contact Name / Contact Email / Company Name are required.** "Not Available" / "N/A" count as empty.
- Multi combination: pick exhibits (searchable), *Customer Location* (Region 1 ×1.0, Region 2 ×0.8,
  Region 3 ×0.65), *Common Instance Type*, *Duration (Months)*, then per exhibit: users, instances,
  instance type, and data size (GB) or messages.
- There is no submit button: prices recalculate as you type. The plan cards (**Basic**, **Standard**) appear
  once the config is valid. **"Select Basic/Standard"** picks the agreement template and opens Quote.
- **Discount (%)**: capped by the admin policy (default **15%**). Typing more clamps it, with the message
  *"The maximum discount is 15% (set by admin). The value was capped."* The server enforces the same cap
  (`discount-policy.cjs`, 400 `DISCOUNT_EXCEEDS_MAX`).
- A browser refresh on /configure deliberately starts the quote over (the contact and deal are kept).

### 3.3 Quote → agreement
- The template is pre-selected. Contact Name, **Legal Entity Name**, Email are filled from Configure.
- Three dates: **Project Start**, **Effective**, **Quote Expiry** (default +30 days).
  **Rule: Project Start must be after the Effective Date**, or Generate is refused with
  *"Date validation error: Project Start Date must be after the Effective Date"*.
  ⚠ The defaults (start = today, effective = today + 1 month) **always** fail this rule, so every rep has
  to set the dates.
- Optional: custom line items, custom-items discount, scope .docx.
- **Generate Agreement** → *"🎉 Agreement Generated!"* preview (PDF), with **Save**, **✏️ Edit for RedLine**
  (OnlyOffice Word editor) and **Send for Approval**.

### 3.4 Approval workflow (`approval_workflows`)
- **Send for Approval** modal: pick the Team Lead group (e.g. `SMB (lead@…)`). Technical, Legal and
  Deal Desk use the default mailboxes. This creates a workflow with 4 steps:
  `1 Team Approval → 2 Technical Team → 3 Legal Team → 4 Deal Desk`. Workflow `pending`, `currentStep 1`.
- Statuses: workflow `pending → in_progress → approved | denied`. A step is `pending` until `approved | denied`.
- **Strictly sequential.** Only the current step can act. A stale page, double click or out-of-turn click
  gets a 409 with a plain message (*"This document is already approved by the Technical Team."*)
  (`approval-step-guard.cjs`).
- **Hand-offs are emails**, sent as each approver acts (frontend-driven):
  create → Team Lead; Team Lead approves → Technical; Technical approves → Legal; Legal approves →
  "completed" email to the rep (agreement attached) + Deal Desk step "Notified" + **auto-send for
  e-signature** if signature fields were already placed.
- **Overage deals skip Technical** automatically after the Team Lead approves.
- **Deny requires a comment** (*"Provide Reason for Denial" → Save & Deny*). A deny closes the workflow
  for good and emails the rep. **There is no resubmit**: the rep fixes the deal and sends a *new* approval.
- **Cancel Approval** (requester only): the workflow becomes `denied` with no denied step. Approver links
  then say *"This approval was cancelled by the requester."*
- **Edit for RedLine** while a workflow is open: the rep edits the Word file and the old version is backed
  up. The *current* approver is re-emailed, and approvals already given are kept.
- **Approval tab card**: Team / Tech / Legal stepper with the time each stage took, "waiting X" on the open
  step, and "Total so far". The ⋮ menu has Reminder, Download PDF, Edit Dates, Edit for RedLine,
  Reset e-Sign, Cancel Approval, Delete. The copy icon copies an approver link.

### 3.5 E-signature (`esign_documents`)
- Once the workflow is **approved**, the card shows **e-Sign**. It opens Place Fields:
  1 Recipients → 2 Place Fields → 3 Review & Send.
- Recipients are *Signer* or *Reviewer*. For agreements that came through approval, **signing order is not
  enforced**: everyone is emailed at once. Only the Manual e-sign page has a signing-order switch.
- Fields are dragged onto the page. For the Multi-Combination template, the customer's block
  ("For <Company>": By / Name / Title / Date) is on **page 3**.
- The signer sees a review screen first (**Approve & Sign** / Decline / Forward), then **Sign Here** → *Add your
  signature* → fill any Date field → **Finish**. A reviewer just approves, with an optional comment.
- **Review & Send stays disabled** until the checklist passes: at least one recipient, at least one field,
  and a signature field for every signer.
- Document status: `draft → sent → completed`, or `denied` / `voided`. Recipient status:
  `pending → viewed → signed | reviewed | denied`. The tracker shows Sent, Viewed, Waiting for others,
  Completed, Declined, Voided, Expired.
- Links expire after **15 days**, and one reminder goes out 3 days before. The creator can **Send Reminder**,
  **Extend expiry** (up to 90 days) or **Cancel Signing** (void, reason required).
- Signer page: "Review and complete" → click each **Sign Here** → *Add your signature* (Type / Upload /
  Draw) → **Finish**.
- Completed: the signed PDF is stored, and "Download signed PDF" appears on **e sign status**.
- **Manual e-sign** tab: upload any document and send it for signature with no approval.
  Provider: CPQ built-in (default) or Zoho Sign (`ZOHO_SIGN_ENABLED`).
- **Manual Approval** (sidebar): upload any agreement and run Team → Technical → Legal on it.

---

## 4. Time-based rules

| Rule | Value | Enforced? |
|---|---|---|
| Quote expiry date | default today + 30 days | Printed on the agreement only |
| Approver link token | 7 days, re-minted by Reminder / copy link | Yes |
| Technical Microsoft sign-in | valid 12 hours | Yes (server) |
| Approval SLA | none; the card only *shows* step durations | Measured, not enforced |
| Auto approval reminders | hourly job, but only if `reminderDays > 0`, which nothing sets | Effectively off |
| E-sign link | 15 days, reminder at day 12, extend ≤ 90 days | Yes (hourly job) |
| Discount cap cache | 30 s | — |

---

## 5. Rules of the road for a new rep

1. **Start from the HubSpot deal.** Never retype customer details. A placeholder such as "N/A" blocks you.
2. **Discount ≤ the admin cap (15%).** Above that is impossible, so ask an approval admin instead.
3. **Set the dates: Project Start after Effective.** The defaults won't generate.
4. **Read the agreement preview before Send for Approval.** After a deny there's no resubmit, only a new approval.
5. **Pick the right Team Lead group.** That person gets step 1.
6. **Deny = comment.** If you're an approver, say *what* to fix. The rep receives it by email.
7. **Your work lives on the Approval tab** (filter by requester, search by client) and on **e sign status**
   (All / Completed / Pending / Rejected tabs).
8. **Only the requester** can cancel, remind, redline, delete or start e-sign on a workflow.
9. Approval emails can land in **Microsoft 365 Quarantine/Junk**. Check there before chasing an approver.
10. What gets measured: the time each approval stage took (Approval card), and e-sign status.

---

## 6. Data the normal flow writes (for demo setup / teardown)

`users`, `daily_logins`, `quotes`, `documents`, `document_versions`, `approval_workflows`,
`approval_access_tokens`, `team_approval_settings`, `settings`, `esign_documents`, `esign_recipients`,
`signature_fields`, `esign_signature_secrets`, `audit_logs`. Files are also written under the upload / signed directories.

**Configuration to clone for a realistic demo:** `combinations`, `templates`, `exhibits`, `pricing_tiers`,
`settings` (discount policy only), `team_approval_settings` (shape only, with emails replaced by `@demo.local`).

## 7. Side effects and how the demo neutralises them

| Side effect | Where | Demo handling |
|---|---|---|
| SendGrid email (no kill-switch; some paths call it even without a key) | `server.cjs:1254` and direct calls | Node preload **blocks every non-localhost connection**. SendGrid calls are answered locally with 202 and written to `demo-video/out/outbox/` |
| Zoho Sign API + poller | `ZOHO_SIGN_ENABLED`, `ZOHO_SIGN_POLL_ENABLED` | Set empty for the demo server |
| HubSpot, Microsoft Graph, OpenAI, Clarity | various | Blocked by the preload; Clarity is off on localhost |
| Production MongoDB | `.env` `MONGODB_URI` | Demo server gets `MONGODB_URI=mongodb://127.0.0.1:27017`. Setup refuses any non-localhost URI |

## 8. Things that differ from production in the demo

- The Technical step's Microsoft sign-in cannot be done with fake users.
  The demo server runs with `TECH_APPROVER_SIGNIN_REQUIRED=false`, and the narration explains the real sign-in.
- The HubSpot deal arrives through the same URL parameters HubSpot uses. The live HubSpot refresh is blocked.
- The OnlyOffice Word editor (a 3 GB container) is not run, so redlining is described, not shown.

## 9. Bugs and risks noticed (kept out of the video)

1. `POST /api/auth/microsoft` issues a JWT for **any posted email** without verifying the Microsoft token (`server.cjs:2045-2095`).
2. `AuthContext.tsx:210-250` has a **hard-coded fallback password** that logs in with a mock token when the backend login fails.
3. The approval step route does not check the portal token for Team Lead / Legal. Anyone with the workflow id can approve (`server.cjs:12534`).
4. `PUT /api/team-approval-settings` is unauthenticated and `$set`s the whole body. The Approval page also auto-saves settings 1 s after load (`ApprovalWorkflow.tsx:157-199`).
5. The creator-only e-sign actions (void, remind, extend) trust `actor_email` from the request body (`server.cjs:8532`, `8596`, `9530`).
6. Cancel Approval and Reset e-Sign have no server-side caller check.
7. The **default Quote dates always fail validation** (start today < effective +1 month), so every user hits an error first.
8. Without a SendGrid key, the `send-*-email` routes fail **before** minting approver tokens, so links break.
9. `/api/send-authorization-request` references an undefined `EMAIL_FROM` and throws after inserting a row (`server.cjs:13600`).
10. `GET /api/approval-workflows` mutates data (it auto-approves complete workflows) (`server.cjs:12157-12179`).
11. `additionalRecipients` is sent to `/api/send-team-email` but ignored by the server.
12. Auto approval reminders never fire, because nothing sets `reminderDays`.
13. `JWT_SECRET` falls back to a hard-coded string if unset (`server.cjs:826`).
14. A denied approval has no resubmit path. The rep must regenerate and start over (a product gap rather than a bug).
15. **Configure carries the previous deal's ticks into the next deal.** Open deal B in the same tab after quoting
    deal A and the Migrate options and exhibits from A are still selected. A's lines then end up in B's agreement.
    Seen live: a Harbor Health agreement contained Northwind's "Box to Microsoft, 250 users, 1,200 GB" line.
    Only a browser refresh on /configure clears it. That's easy to miss, and it puts wrong lines in a customer contract.
16. In dev, the Manual Approval upload calls `http://localhost:3001` directly (`ApprovalWorkflow.tsx:459`), bypassing
    the Vite proxy that every other call uses.
17. The workflow's `clientName`, shown as CLIENT on approval cards, is the **contact** name ("Emma Clarke"), not the
    company ("Northwind Logistics").
18. For Slack to Teams, quoting 200,000 or 2,000,000 messages gave the same price ($5,032). That may be intended
    (the message count changes the scope wording, not the price), but it's worth confirming with pricing owners.
