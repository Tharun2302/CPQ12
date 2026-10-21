# Feature Design: Technical Approver Sign-In and Allow-List

**Status:** Draft for review
**Date:** 2026-10-21
**Workflow:** GStack `new-feature` (touches auth, API endpoints, approval logic)
**Scope:** Technical Team approval step only. Team Lead and Legal remain token-link only.

## Summary

Anyone who opens a Technical approval email link today can approve or deny, and the record only shows the shared mailbox. This feature makes the approver sign in with Microsoft before acting on the Technical step. Only people on an admin-managed allow-list can act, and the server records who did it (`actedBy: { name, email }`). The Approval dashboard tooltip and denial email then name that person instead of `cpq.zenop.ai.technical@cloudfuze.com`.

---

## 1. Current State (verified in code)

| Area | Location | Finding |
|---|---|---|
| Portal gate | `src/components/ApprovalPortalGate.tsx` | Calls `GET /api/approval-workflows/verify-access` (token only) and then renders `TechnicalTeamApprovalDashboard`. No sign-in. |
| Link token check | `server.cjs` ~12146 | Looks up `approval_access_tokens` by `{workflowId, role, token}` and checks the 7-day `expiresAt`. |
| Step decision | `server.cjs` ~12379 `PUT /api/approval-workflows/:id/step/:stepNumber` | **No authentication at all.** It does not check a JWT or the link token. Guarded only by `sanitizeStepUpdates` + `applyStepUpdate` (`approval-step-guard.cjs`). |
| Generic workflow update | `server.cjs` ~12293 `PUT /api/approval-workflows/:id` | **No authentication.** `stripLockedWorkflowFields` does not lock `workflowSteps`, `currentStep` or `status`, so anyone can mark the Technical step (or the whole workflow) approved through this route. **This bypasses any step-level control and must be closed (see §5.4).** |
| Frontend step call | `src/services/approvalWorkflowServiceMongoDB.ts` `updateWorkflowStep` | Sends no `Authorization` header. |
| JWT issuance | `server.cjs` ~2020 `POST /api/auth/microsoft` | **Trusts `{id, name, email}` from the request body and never verifies the Microsoft `accessToken`.** Anyone can POST any `@cloudfuze.com` email and get a valid CPQ JWT. `MicrosoftCallback.tsx` even posts `accessToken: 'fallback_token_…'` on Graph failure. **Without fixing this, the allow-list can be bypassed in one request (see §5.1).** |
| JWT verify helpers | `server.cjs` ~3245–3312 | `getOptionalAuthenticatedUser`, `getAuthenticatedUser`, `getApprovalAdminUser`. JWT payload is `{ userId, email }`, 7-day expiry, `JWT_SECRET`. |
| Admin-managed lists | `server.cjs` ~3210–3377 | `settings` collection docs `{ _id: 'approval_admins', emails: [] }` / `exhibit_admins`, with GET/POST/DELETE `/api/settings/...` guarded by `getApprovalAdminUser`. **This is the pattern to reuse.** |
| Admin UI | `src/pages/AdminSettingsPage.tsx` | Approval-admin-only page that currently renders `src/components/admin/DiscountPolicySettings.tsx`. **The new section goes here.** |
| Sign-in UX | `src/contexts/AuthContext.tsx` `loginWithMicrosoft` | **Popup** PKCE flow. The page URL (including `?role=technical&token=…`) is not changed, so we do not need any redirect-back handling. `logout()` navigates home, which is unsuitable inside the portal. |
| Tooltip | `src/components/ApprovalDashboard.tsx` ~1279 | `const who = item.step?.email ? \`Email: ${item.step.email}\` : null;` |
| Denial email | `server.cjs` `notifyCreatorOfDenial` ~12350, `generateDenialEmailHTML` ~1215 | `deniedBy` = role. `deniedBy` and `comments` are interpolated **unescaped** into HTML. |
| Deal Desk email | `server.cjs` ~1190 | Static line "Technical Team - Approved". |
| Step type | `src/types/approval.ts` `ApprovalStep` | No actor field. |
| Unguarded route | `src/App.tsx` `/technical-approval` | Renders `TechnicalTeamApprovalDashboard` with no gate. |

The Technical step is step 2 in quote workflows and step 1 in manual workflows. **All new logic must detect it by `role === 'Technical Team'`, never by step number.**

---

## 2. Requirements

- **Who:** a small, named group of Technical approvers. They use the email links that are sent to the shared Technical mailbox.
- **Problem:** anyone holding the link can decide, and the audit trail shows only the shared mailbox.
- **Constraints:**
  - Reuse the existing Microsoft sign-in and CPQ JWT.
  - Do not hardcode personal emails.
  - Team Lead and Legal are unchanged.
  - Existing guard rules stay: step order, no re-decision, closed/denied workflows.
  - Old records keep rendering.

---

## 3. Architecture

```
Email link /approval/:wf?role=technical&token=T
        |
        v
ApprovalPortalGate ──GET verify-access?workflowId&role&token  (+ Authorization: Bearer JWT if present)
        |                    |
        |          server: 1) link token valid & unexpired ─── no ──> 403 TOKEN_INVALID / TOKEN_EXPIRED
        |                    2) role=technical & flag on:
        |                         no/invalid JWT or !msVerified ──> 200 { approver:{signedIn:false} }
        |                         email not on allow-list      ──> 200 { approver:{signedIn:true, authorised:false, email} }
        |                         ok                            ──> 200 { approver:{signedIn:true, authorised:true, name, email} }
        v
 needs sign-in ──> TechnicalApproverSignIn (popup loginWithMicrosoft) ──> re-run verify (same URL, token kept)
 not authorised ─> "You're not authorised to approve Technical steps" + Switch account
 authorised ────> TechnicalTeamApprovalDashboard (banner "Signed in as …")
        |
        v
PUT /api/approval-workflows/:id/step/:n   (Authorization: Bearer JWT)
   sanitizeStepUpdates -> load workflow -> findStep
   if step.role === 'Technical Team' && flag on:
        resolveVerifiedUser(req)            401 TECH_SIGNIN_REQUIRED
        isTechnicalApprover(email, list)    403 TECH_NOT_AUTHORISED
        updates.actedBy = { name, email, userId }   (from DB user + verified JWT; never body)
   applyStepUpdate (unchanged guard: order / already handled / closed / race)
   logger.info audit line; denial email names the individual
```

**Decision: the link token is checked at the portal gate. The step PUT for Technical requires JWT + allow-list but not the link token.**
- A signed-in, allow-listed identity is a stronger credential than a forwarded link.
- This also lets the existing `/technical-approval` page work for signed-in approvers.
- Team Lead and Legal PUTs keep today's behaviour exactly.

---

## 4. Database

### 4.1 Allow-list: `settings` collection (existing), new document

```js
{
  _id: 'technical_approvers',
  emails: ['first.last@cloudfuze.com', ...],   // stored trimmed + lowercased, unique
  updatedAt: Date,
  updatedBy: 'admin@cloudfuze.com'
}
```

- **Why here:** it is the same store and shape as `approval_admins` / `exhibit_admins`. It needs no new collection or index, and admins already manage similar lists.
- **Who manages it:** approval admins (`hasApprovalAdminAccess`), through Admin Settings.
- **Bootstrap (no personal emails in code):**
  - Optional env `TECH_APPROVER_EMAILS` (comma-separated).
  - It is used **once** at startup with `$setOnInsert` when the doc does not exist.
  - It is not unioned on every read, because then removing someone in the UI would not take effect.
- **Empty list:** fail closed. Nobody can act on Technical steps. The admin UI shows a warning banner when the list is empty, and the deploy checklist (§10) populates it before the flag is turned on.
- **Read path:** read with `findOne` on every Technical decision and every verify. There is no cache, so removing someone takes effect immediately. The cost is one indexed `_id` lookup.

### 4.2 Step record: new optional fields on `approval_workflows.workflowSteps[]`

```js
actedBy:     { name: 'Jane Doe', email: 'jane.doe@cloudfuze.com', userId: 'microsoft_…' }  // set on approve/deny
commentedBy: { name, email, userId }                                                         // set on comment-only update
```

- Written via the existing `planStepWrite` path. It already `$set`s every key in `updates` onto `workflowSteps.$[target]`, so it needs no change.
- `step.email` stays the shared mailbox and is untouched. Emails and reminders still route there.
- No migration is needed: the fields are additive and optional, and old records simply lack them.

---

## 5. Backend

### 5.1 Make Microsoft identity verifiable (prerequisite)

**File:** `server.cjs` `POST /api/auth/microsoft`.

**What it does:**
- Call `GET https://graph.microsoft.com/v1.0/me` server-side with the posted `accessToken`. Use Node 20 global `fetch` with a 5s `AbortController` timeout.
- If Graph returns 200 **and** `(mail || userPrincipalName).toLowerCase() === body.email.toLowerCase()`:
  - Take `name` from Graph `displayName`, not from the body.
  - If `AZURE_TENANT_ID` is set, also require the token's `tid` claim to equal it. Graph has already validated the token's signature, so decoding the payload is safe at this point. This blocks personal or other-tenant Microsoft accounts.
  - Sign the JWT as `{ userId, email, msVerified: true }`.
- Otherwise keep today's behaviour (JWT without `msVerified`) so general app login is not broken. Only the Technical flow requires `msVerified`.

**Supporting changes:**
- Add `authMicrosoftLimiter = rateLimit({ windowMs: 60_000, max: 20 })`, because the endpoint now makes an outbound call.
- Never log the access token. `MicrosoftCallback.tsx` currently logs token prefixes with `console.log`; remove those lines in this change, since they break CLAUDE.md "never log tokens".

**New pure helper** (server.cjs, near `getOptionalAuthenticatedUser`):

```js
// Returns { user, claims } only for a CPQ JWT minted after a server-verified Microsoft sign-in.
async function getVerifiedMicrosoftUser(req)
```

It returns `null` in any of these cases:
- the token is missing or invalid
- `claims.msVerified !== true`
- the user is not found in the DB
- `user.email.toLowerCase() !== claims.email.toLowerCase()`

### 5.2 Allow-list helpers and settings API

**Pure helpers.** Add these to `approval-step-guard.cjs` so they can be unit-tested without a DB:

```js
const TECHNICAL_ROLE = 'Technical Team';
function normalizeEmail(e)                    // trim + lowercase, '' for non-strings
function isTechnicalApprover(email, list)     // normalized membership
function requiresVerifiedApprover(step, { enabled })  // enabled && step?.role === TECHNICAL_ROLE
function checkApproverAllowed({ step, verified, allowList, enabled })
//  -> { ok: true, actor } | { ok:false, httpStatus:401, code:'TECH_SIGNIN_REQUIRED', error }
//                         | { ok:false, httpStatus:403, code:'TECH_NOT_AUTHORISED', error }
//  actor = { name: user.name || email, email: normalized, userId }
function validateApproverEmail(raw, { domain })  // format, length <= 254, optional domain check
```

Export `findStep` too (it already exists but is not exported).

**server.cjs:**
- `async function getTechnicalApproverEmails()` reads `settings/technical_approvers`.
- `const TECH_APPROVER_SIGNIN_REQUIRED = process.env.TECH_APPROVER_SIGNIN_REQUIRED !== 'false'` is the kill switch. It defaults to on.

**Endpoints.** All three are guarded by `getApprovalAdminUser` and use the `{ success, data | error }` response shape:

| Method | URL | Body | Response |
|---|---|---|---|
| GET | `/api/settings/technical-approvers` | — | `{ success, data: { emails, updatedAt, updatedBy } }` |
| POST | `/api/settings/technical-approvers` | `{ email }` | `{ success, data: { emails } }`. Returns 400 `INVALID_EMAIL`, or 400 `LIST_FULL` when there are more than 50. Adding an existing email is idempotent. |
| DELETE | `/api/settings/technical-approvers/:email` | — | `{ success, data: { emails } }` |

- Use an `$addToSet` / `$pull` on the normalized email, with `upsert`, so concurrent admin edits are safe.
- Log `logger.info('Technical approver list changed', { source: 'technical-approvers', actor, action, target })`.
- Add a 20/min limiter, the same as `discountPolicyLimiter`.

Note on versioning: CLAUDE.md prefers `/api/v1/...`, but every existing settings route is `/api/settings/...`. **Follow the existing convention for consistency.**

### 5.3 `verify-access` extension

**File:** `server.cjs` ~12146.

- After the existing token checks pass, and only when `normalizedRole === 'technical' && TECH_APPROVER_SIGNIN_REQUIRED`, resolve `getVerifiedMicrosoftUser(req)` and the allow-list, then add:

  ```js
  requiresSignIn: true,
  approver: { signedIn: bool, authorised: bool, name?: string, email?: string }
  ```

- Keep the existing token errors (403) and add codes `TOKEN_INVALID` / `TOKEN_EXPIRED` / `TOKEN_MISSING`, so the UI does not parse message strings.
- Return 200 for the not-signed-in and not-authorised cases. The link is valid, and the UI decides which screen to show. The authoritative check is still on the PUT.
- Teamlead and legal responses are unchanged.

### 5.4 Step PUT enforcement and closing the generic-PUT bypass

**`PUT /api/approval-workflows/:id/step/:stepNumber` (~12379)**, after `sanitizeStepUpdates` and loading the workflow:

```js
const target = findStep(workflow, parseStepNumber(stepNumber));
if (requiresVerifiedApprover(target, { enabled: TECH_APPROVER_SIGNIN_REQUIRED })) {
  const verified = await getVerifiedMicrosoftUser(req);
  const allowList = await getTechnicalApproverEmails();
  const check = checkApproverAllowed({ step: target, verified, allowList, enabled: true });
  if (!check.ok) { logger.warn(...); return res.status(check.httpStatus).json({ success:false, code:check.code, error:check.error }); }
  if (stepUpdates.status) stepUpdates.actedBy = check.actor; else stepUpdates.commentedBy = check.actor;
}
```

Notes:
- **Auth runs before `applyStepUpdate`.** An unauthenticated caller gets 401 and learns nothing about the step's state.
- `sanitizeStepUpdates` already whitelists `status`/`comments`, so a body `actedBy` is dropped. A test pins this.
- The guard (order, `STEP_ALREADY_HANDLED`, `WORKFLOW_CLOSED`, `NOT_CURRENT_STEP`, race re-check) is unchanged.
- `alreadyHandledMessage(step)` uses `step.actedBy.name` when present, for example "This document is already approved by Jane Doe (Technical Team)." It falls back to the role label.
- Pass the actor to `notifyCreatorOfDenial(workflow, outcome.step, stepUpdates.comments, stepUpdates.actedBy)`.
- Add `approvalStepLimiter = rateLimit({ windowMs: 60_000, max: 30 })` on this route.
- Replace `console.log('📝 Updating workflow step:', …, req.body)` with a log line that omits the comment body.

**`PUT /api/approval-workflows/:id` (~12293) bypass.** Add a pure guard `checkGenericUpdateAgainstApprovalSteps(stored, updates)` in `approval-step-guard.cjs`. It rejects with 409 `USE_STEP_ENDPOINT` any update that:
- contains a dotted key under `workflowSteps.` or any `$`-key (already stripped)
- includes `workflowSteps` in which an approval-role step (`APPROVAL_ROLES`) differs from the stored one in `status`, `timestamp`, `actedBy`, `commentedBy` or `comments`
- sets `status: 'approved'` or changes `currentStep` while the stored Technical step is not `approved` (when the flag is on)

This keeps current callers working:
- `ApprovalDashboard` cancel sends `status:'denied'`.
- `InfrateamDashboard` and `ClientNotification` only touch non-approval steps after the approval steps.

**Open question:** could this route be locked further (creator-only JWT)? That is outside this feature's scope.

### 5.5 Emails

- **`notifyCreatorOfDenial`:**
  - When `actedBy` is present, set `deniedBy = \`${actedBy.name} (Technical Team)\``. Otherwise use the role, as today.
  - Build the subject via `sanitizeEmailSubject`.
- **`generateDenialEmailHTML`:** wrap `deniedBy`, `comments`, `documentId`, `clientName` and the workflow id in `escapeHtml`. This is an existing XSS-in-email issue that becomes more exposed now that a user-controlled display name flows in.
- **Deal Desk email (~1190):**
  - When the route has `workflowId`, load the stored workflow (the same pattern as `enrichWorkflowDataFromRecord`).
  - Render `Technical Team - Approved by ${escapeHtml(name)}` when `actedBy` exists. Otherwise keep the static line.
  - Recommended, but it can ship in a follow-up.
- **Legal "next step" email (`/api/send-ceo-email`):** unchanged. Adding "Technical approved by X" is optional and would need a DB read rather than trusting the body.
- Approver reminders and the initial Technical email still go to the shared mailbox (`step.email`). That is unchanged.

### 5.6 Audit logging

- **Every Technical decision:**

  ```js
  logger.info('Approval step decided', { source: 'approval-step', workflowId, documentId, step, role, status, actorEmail, actorUserId })
  ```

- **Every rejected attempt:**

  ```js
  logger.warn('Technical approval blocked', { source: 'approval-step', workflowId, code, actorEmail: verified?.user.email || null })
  ```

- Do not log comments, tokens or link tokens.
- The durable audit record is `actedBy` + `timestamp` on the step itself.
- Do **not** write to Mongo `audit_logs`, because that collection backs the e-sign activity timeline.

---

## 6. Frontend

### 6.1 Components and files

| File | Change |
|---|---|
| `src/components/ApprovalPortalGate.tsx` | Send `getAuthHeaders()` on verify. New states: `needs-signin`, `not-authorised`. When `role==='technical'`: if `approver.signedIn` is false, render `<TechnicalApproverSignIn onSignedIn={reverify} />`; if signed in but not authorised, render `<TechnicalApproverSignIn notAuthorisedEmail=… />`; if authorised, render the dashboard with `approver` prop. Map `TOKEN_EXPIRED` to "This approval link has expired. Ask the requester to send a reminder; it issues a fresh link." |
| `src/components/approval/TechnicalApproverSignIn.tsx` (new) | Card with a "Sign in with Microsoft" button that calls `useAuth().loginWithMicrosoft()`. The popup keeps the URL, so the token is preserved; on success the card calls `onSignedIn`. Not-authorised variant: "You're not authorised to approve Technical steps. You're signed in as **x@cloudfuze.com**." plus a "Use a different account" button, which clears the session without navigating and re-runs the popup (`prompt=select_account` is already set). It also handles popup blocked/closed and the case where the backend did not issue a JWT ("Sign-in didn't complete. Please try again."). Uses Tailwind and is mobile-first. |
| `src/contexts/AuthContext.tsx` | Add `clearSession()` (or `logout({ navigate: false })`) so the portal can switch accounts without leaving the page. Do not change other flows. |
| `src/components/TechnicalTeamApprovalDashboard.tsx` | Accept an optional `approver` prop and show a "Signed in as Name (email)" banner. In `handleApprove` / `handleDeny` / comment save, catch `TECH_SIGNIN_REQUIRED` (prompt sign-in) and `TECH_NOT_AUTHORISED` (show the message) instead of the generic "Failed to approve". Remove the `console.log` of the full workflows array (leftover debug output that dumps workflow data to the console). |
| `src/App.tsx` `/technical-approval` | Wrap in a small `TechnicalApproverRoute` that runs the same sign-in + authorisation check, using a new `GET /api/approval-workflows/technical-approver/me` or reusing verify without a token. **Open question:** keep this route at all? |
| `src/services/approvalWorkflowServiceMongoDB.ts` `updateWorkflowStep` | Add `...getAuthHeaders()`. This is harmless for Team Lead and Legal, which ignore it. `WorkflowStepError` already carries `status`/`code`. Add `isTechnicalAuthError(err)`. |
| `src/types/approval.ts` | `export interface StepActor { name: string; email: string }`; on `ApprovalStep` add `actedBy?: StepActor; commentedBy?: StepActor`. |
| `src/utils/approvalActor.ts` (new) | `stepActorLine(step): string \| null`. Returns `By: Jane Doe (jane@cloudfuze.com)` when `actedBy` is present, otherwise `Email: ${step.email}`, otherwise `null`. |
| `src/components/ApprovalDashboard.tsx` ~1279 | `const who = stepActorLine(item.step);` gives tooltip "Tech: approved / By: Jane Doe (jane@…) / Time / Took". Old records still show `Email: <shared mailbox>`. |
| `src/utils/approvalLinkNotice.ts` | Optional: include `actedBy.name` in "already approved by …" notices. |
| `src/components/admin/TechnicalApproversSettings.tsx` (new) + `src/services/technicalApproversService.ts` (new) | List / add / remove emails, with an empty-list warning: "No one can approve Technical steps until you add at least one approver." Follows the `DiscountPolicySettings` + `discountPolicyService` pattern (`authAwareError`, `getAuthHeaders`). |
| `src/pages/AdminSettingsPage.tsx` | Render `<TechnicalApproversSettings />` below `<DiscountPolicySettings />` for approval admins. |

**State:** local component state plus the existing `AuthContext`. No new context.

### 6.2 UX states (Technical portal)

| Situation | Screen |
|---|---|
| Missing, invalid or unknown link token | Existing Access Denied (unchanged text) |
| Expired link token | "This approval link has expired…" plus reminder hint |
| Valid link, not signed in, or signed in before this release (no `msVerified`) | "Sign in with Microsoft to review this Technical approval." |
| Signed in, not on allow-list | "You're not authorised to approve Technical steps. Signed in as x@…" plus Use a different account |
| Authorised | Dashboard with "Signed in as Jane Doe" banner |
| Removed from list mid-session / JWT expired, then clicks Approve | Inline error from the PUT code. The decision is not recorded and the modal stays open. |
| Step already handled by someone else | Existing `STEP_ALREADY_HANDLED` notice, now naming the person |

---

## 7. Security Considerations

1. **Identity must be server-verified.** §5.1 is mandatory. Without it, `POST /api/auth/microsoft` mints a JWT for any claimed email and the allow-list is meaningless.
2. **Authorization is server-side.** The PUT re-checks the JWT and the allow-list on every call. The frontend gate is UX only.
3. **Actor data comes from the verified JWT and DB user**, never from the request body (whitelisting in `sanitizeStepUpdates` plus a test).
4. **Close the generic-PUT bypass** (§5.4). Otherwise the step control can be skipped.
5. **Tenant restriction.** Set `AZURE_TENANT_ID` in staging and prod. Domain-only checks can be spoofed by other-tenant or personal Microsoft accounts.
6. **Output encoding.** Escape names and comments in email HTML. React escapes the tooltip `title` automatically.
7. **Rate limiting:**
   - step PUT: 30/min per IP
   - `/api/auth/microsoft`: 20/min
   - technical-approver settings: 20/min
   - The global 100/min policy still applies.
8. **No sensitive logging.** No tokens, link tokens or comments. Remove the existing token-prefix logs in `MicrosoftCallback.tsx`.
9. **Fail closed.** Empty allow-list, DB error or missing `msVerified` all mean no Technical decision is possible.
10. **Kill switch.** `TECH_APPROVER_SIGNIN_REQUIRED=false` restores today's behaviour without a code rollback.

---

## 8. Backward Compatibility

- **In-flight workflows with the Technical step pending:**
  - Existing email links keep working (same token and expiry), but now require sign-in.
  - Reminders still go to the shared mailbox.
  - Approvers holding a pre-release JWT (no `msVerified`) must sign in once.
- **Already-decided Technical steps** have no `actedBy`. The tooltip falls back to `Email: <step.email>` and the emails fall back to the role.
- **Team Lead and Legal:**
  - The portal flow and PUT behaviour are unchanged.
  - Their dashboards now send an `Authorization` header if one exists, which the server ignores for them.
- **Manual workflows** (Technical = step 1) are covered by role-based detection.
- **E-sign "Technical Team" recipients** (`/api/esign/fixed-role-recipients`) are a separate flow and out of scope.

---

## 9. Tests (Vitest)

**`tests/unit/approvalStepGuard.test.ts`** (extend; pure, no DB):
- `sanitizeStepUpdates` drops `actedBy`, `commentedBy`, `email` and `role` from the body.
- `requiresVerifiedApprover`:
  - true for `Technical Team` when enabled
  - false for Team Approval, Legal and Deal Desk
  - false when disabled
- `checkApproverAllowed`:
  - no verified user gives 401 `TECH_SIGNIN_REQUIRED`
  - an email not on the list gives 403 `TECH_NOT_AUTHORISED`
  - matching is case and whitespace insensitive
  - an empty list gives 403
  - the actor comes from the verified user
- `alreadyHandledMessage` names `actedBy.name` when present and falls back to the role.
- `planStepWrite` writes `workflowSteps.$[target].actedBy` when `updates.actedBy` is set.
- `checkGenericUpdateAgainstApprovalSteps`:
  - rejects a Technical status change
  - rejects dotted `workflowSteps.*` keys
  - rejects `status:'approved'` while Technical is pending
  - allows `status:'denied'` (cancel)
  - allows non-approval step edits
- `validateApproverEmail` checks format, length and domain.

**`tests/unit/approvalActor.test.ts`** (new):
- `stepActorLine` with `actedBy`
- without `actedBy` (falls back to `Email:`)
- with no email (returns null)

**`tests/unit/approvalPortalGateTechnical.test.tsx`** (new, RTL, mocked fetch and `useAuth`):
- not signed in shows the sign-in card
- not authorised shows the message and the signed-in email
- authorised renders the dashboard
- expired token shows the expiry text
- `role=legal` never shows sign-in

**`tests/unit/technicalApproversSettings.test.tsx`** (new): list, add, remove, the empty-list warning, and the API error path.

**`tests/unit/approvalStaleAction.test.tsx` / Technical dashboard:** a `TECH_NOT_AUTHORISED` error shows the specific message and does not mark the workflow as acted on.

**Integration** (supertest against an Express app with an in-memory Mongo, if available):
- step PUT on the Technical step: without JWT gives 401; non-listed gives 403; listed gives 200 and stores `actedBy`
- Legal PUT without JWT still gives 200
- generic PUT that flips the Technical step gives 409
- `/api/auth/microsoft` with Graph mocked: a mismatched email produces a JWT without `msVerified`

---

## 10. Implementation Sequence

**Backend:**
1. `approval-step-guard.cjs`: export `findStep`; add `normalizeEmail`, `isTechnicalApprover`, `requiresVerifiedApprover`, `checkApproverAllowed`, `validateApproverEmail`, `checkGenericUpdateAgainstApprovalSteps`; make `alreadyHandledMessage` actor-aware. Unit tests first.
2. `server.cjs` `/api/auth/microsoft`: Graph `/me` verification, tenant check, `msVerified` claim, limiter. Add `getVerifiedMicrosoftUser`.
3. `server.cjs`: `getTechnicalApproverEmails`, startup `$setOnInsert` from `TECH_APPROVER_EMAILS`, the GET/POST/DELETE `/api/settings/technical-approvers` routes, and the `TECH_APPROVER_SIGNIN_REQUIRED` flag.
4. `server.cjs` `verify-access`: `requiresSignIn` + `approver` block and error codes.
5. `server.cjs` step PUT: enforcement, `actedBy`/`commentedBy`, limiter, audit logs, actor-aware `notifyCreatorOfDenial`.
6. `server.cjs` generic PUT: call `checkGenericUpdateAgainstApprovalSteps`.
7. `server.cjs` emails: escape `generateDenialEmailHTML`; Deal Desk "Approved by" (optional).

**Frontend:**

8. `src/types/approval.ts`, `src/utils/approvalActor.ts`, and the `ApprovalDashboard.tsx` tooltip.
9. `approvalWorkflowServiceMongoDB.updateWorkflowStep` auth header and error helper.
10. `AuthContext` `clearSession`; new `TechnicalApproverSignIn.tsx`; `ApprovalPortalGate.tsx` states.
11. `TechnicalTeamApprovalDashboard.tsx`: banner, error codes, debug log removal. Gate the `/technical-approval` route.
12. `technicalApproversService.ts` + `TechnicalApproversSettings.tsx` + `AdminSettingsPage.tsx`.
13. Remove the token logging in `MicrosoftCallback.tsx`.

**Rollout:**

14. Run the full test suite and build, then deploy to staging with `TECH_APPROVER_SIGNIN_REQUIRED=false`.
15. Set `AZURE_TENANT_ID`, add the approvers in Admin Settings, and verify sign-in on staging.
16. Flip the flag to true, then repeat for production through the normal gates.

**Estimate:** Backend ~10–12h, frontend ~8–10h, tests ~6h, review/QA ~4h. About **3–4 dev-days**.

**Dependencies:**
- the Azure app registration (already used)
- `AZURE_TENANT_ID` value
- an initial list of approver emails from the Technical lead

**Risks:**
- Popup blockers. These are already a requirement for app login. The sign-in card explains them.
- Graph outage blocks Technical decisions. Fail-closed is intended, and the kill switch exists.
- Hidden callers of the generic PUT that rely on editing approval steps. Grep shows none besides those listed, so verify in QA.

---

## 11. Open Questions

1. **Tenant restriction:** may we require `AZURE_TENANT_ID` (CloudFuze tenant only) for the Technical sign-in? This is recommended.
2. **Domain rule for the allow-list:** restrict entries to `@cloudfuze.com`? The current proposal is yes, configurable.
3. **`/technical-approval` route:** gate it as designed, or remove it so the email link is the only entry point?
4. **Generic `PUT /api/approval-workflows/:id`:** is the targeted guard in §5.4 acceptable here? Full creator-only auth could follow as a separate change.
5. **Deal Desk / Legal emails:** include "Technical approved by <name>" in this release or a follow-up?
6. **Comment-only actions** on the Technical step: is requiring sign-in acceptable? The proposal is yes, recorded as `commentedBy`.
7. **Who seeds the initial allow-list,** and should the shared mailbox owner be on it?
