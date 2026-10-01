# Feature Design: Approval Step Timing

**Date:** 2026-10-02
**Flow:** GStack `new-feature` (design only, no code written)
**Scope:** Frontend only. No API, database or model change.

## Summary

Each card on the Approval page shows how long every approval step took, a live "waiting X" under the step that is open now, and a total at the bottom right.

```
APPROVALS                                          Step 3 / 3
     ✔ Team              ✔ Tech              ● Legal
     2h 15m              1d 4h               waiting 6h 10m
Current: Legal: —                           Total so far: 1d 12h
```

No averages or summary box at the top. The user turned that down for now.

## 1. What the code does today (checked, not assumed)

| Fact | Where |
|------|-------|
| Steps are created with no time field: `{ step, role, email, status, group?, comments? }` | `QuoteGenerator.tsx:3504`, `ApprovalWorkflow.tsx:585`, `EsignPlaceFieldsPage.tsx:881` |
| The server sets the workflow's `createdAt` when it creates the workflow (server clock) | `server.cjs:11903` (POST `/api/approval-workflows`) |
| The step route sets `timestamp` to server time on every write to that step | `approval-step-guard.cjs:141` `planStepWrite`, route `server.cjs:12263` |
| The body's `timestamp` is dropped. Only `status` (approved/denied) and `comments` are accepted | `sanitizeStepUpdates`, `approval-step-guard.cjs:32` |
| A step that is already decided cannot be written again (409 `STEP_ALREADY_HANDLED`) | `checkStepUpdateAllowed`, `approval-step-guard.cjs:104` |
| The type has `timestamp?: string` on `ApprovalStep`. Nothing ever writes `approvedAt`, `completedAt` or a per-step `updatedAt` | `src/types/approval.ts`, grep of `src/` and `server.cjs` |
| The card tooltip reads `approvedAt \|\| completedAt \|\| updatedAt \|\| createdAt`. All four are missing on steps, so the tooltip never shows a time | `ApprovalDashboard.tsx:1282` |
| `getApprovalCompletedAtMs` reads the same missing fields. It is defined but never used | `ApprovalDashboard.tsx:50` |
| Deal Desk is step 4, after Legal, in quote workflows. Manual and e-sign workflows have no Deal Desk | `QuoteGenerator.tsx:3509` |
| "Cancel Approval" sets only `workflow.status = 'denied'`. No step is denied and no time is saved | `ApprovalDashboard.tsx:340` |

## 2. Answers to the design questions

### Q1. Which field is the decision time? Can it be rewritten?

**Use `step.timestamp`, but only when the step status is decided** (`approved`, `denied`, `notified`, `signed`).

Fallbacks: `approvedAt`, then `completedAt`. They are never written today, so they are harmless and cover any very old import. **Do not** fall back to step `updatedAt`/`createdAt` or the workflow's `updatedAt`. Reminders, redline saves and Edit Dates all bump the workflow's `updatedAt`, so it is not a decision time.

How `timestamp` can change:

| Case | Rewrites a decided step? | How we handle it |
|------|--------------------------|------------------|
| Comment on an **open** step (Tech `:408`, Legal `:418`) | No. It stamps the **pending** step. The later approve/deny stamps it again. | Ignore `timestamp` on steps that are not decided. |
| Comment or second click on a **decided** step | No, blocked by the guard since `3dd6f60` (2026-09-29) | None needed |
| Same, on records written **before** `3dd6f60` | **Yes.** The old route re-stamped any step on every write, including stale-page comments and double clicks. | Order check (below). Per team notes, `3dd6f60` is on dev only, **not yet on production**, so prod still re-stamps until it ships. |
| Redline edit (`onlyoffice-redline.cjs`) | No. It only sets workflow-level fields and pushes `redlineEdits`. | None |
| Reset e-sign (`server.cjs:8592`) | No. It only unsets `esignDocumentId`. | None |
| Remind (`server.cjs:12442`) | No. It only sets `lastReminderSentAt` and `updatedAt`. | None |
| Generic PUT `/api/approval-workflows/:id` | It *could*, because `workflowSteps` is not a locked field. Today's only caller (`InfrateamDashboard`) spreads the existing steps unchanged. | Order check. Locking `workflowSteps` on that route is a separate backend fix and is out of scope here. |

**Order check:** decision times must not go backwards along step order. If a decided step's time is later than the time of a later decided step, that step was re-stamped. Show "—" for that step and for the step right after it, because its start is unknown. Never show a made-up number.

Known limit: if the **last** decided step was re-stamped, nothing comes after it to catch it, so the total can come out too long. This only affects records written by the old route.

### Q2. Denied step

Show `rejected after 3h` in red, with the same start rule as an approved step. Steps after it show nothing. The total ends at the denial time and is labelled **"Total"**.

**Cancelled by the requester** (workflow `denied`, no denied step): no time is saved for the cancel. Show nothing under the open step and **"Total: —"**. *(Decided by the user 2026-10-02.)*

### Hidden Deal Desk: what counts as the "previous stage"

**Rule:** a step starts at the **latest decision time of any lower-numbered decided step**, hidden steps included. With no such step, it starts at the workflow's `createdAt`.

- Quote flows: Deal Desk is step 4, after Legal, so it never sits between visible steps. It does not change Team, Tech or Legal times.
- If a decided Deal Desk ever sits between visible steps (for example Legal, then Deal Desk, then MM), MM starts when Deal Desk was decided. MM does **not** take Deal Desk's time. That time is still inside the Total, and the Total tooltip says so: "Includes 2h on Deal Desk (not shown)". Nothing is hidden silently.
- A Deal Desk step that is never decided (it stays `pending` and is only notified) is skipped, so the next visible step starts at Legal's decision.
- The total ends at the last decided **visible** step. A Deal Desk "notified" write after Legal does not add to it.
- Non-standard workflows (no Team Approval step) already show every step, Deal Desk included, so there is nothing hidden there.

### Q3. Where the logic lives

**New file `src/utils/approvalTiming.ts`.** Pure functions with no React and no `Date.now()` inside.

```ts
export type StepTiming =
  | { kind: 'done'; ms: number | null }       // approved / notified / signed
  | { kind: 'denied'; ms: number | null }
  | { kind: 'waiting'; sinceMs: number | null }
  | { kind: 'none' };                          // not reached, or closed without a decision

export interface ApprovalTiming {
  byStepNumber: Map<number, StepTiming>;
  total: { label: 'Total' | 'Total so far'; startMs: number | null; endMs: number | null; live: boolean; hiddenMs: number; hiddenRoles: string[] };
}

export function decisionTimeMs(step): number | null;           // decided + valid ISO, else null
export function computeApprovalTiming(
  workflow: Pick<ApprovalWorkflow, 'createdAt' | 'status' | 'workflowSteps'>,
  visibleStepNumbers: number[],                                  // the steps the card shows, in order
  nowMs: number,
): ApprovalTiming;
export function elapsedMs(startMs, endMs): number | null;        // null if either is missing or the result is negative
export function formatDuration(ms: number | null): string;      // see below
```

Rules inside `computeApprovalTiming`:
- "Open" means workflow status is `pending` or `in_progress`. Only an open workflow gets a `waiting` step. It is the first visible step that is not decided. Approved and cancelled workflows never tick.
- `waiting.sinceMs` uses the same start rule as a finished step.
- Total: start is `createdAt`. The end is the last visible decision when the workflow is finished, or `null` with `live: true` when it is open.
- Invalid dates (`Date.parse` gives NaN) become `null`, and `null` shows as "—".

`formatDuration` (rounds down, never rounds up):

| Input | Output |
|-------|--------|
| `null`, NaN, negative | `—` |
| under 60 s | `<1m` |
| under 1 h | `45m` |
| under 1 day | `2h 15m` (`2h` when minutes are 0) |
| 1 day or more | `1d 4h` (`3d` when hours are 0) |

**Clock skew** on live values: `now` is the browser clock and `sinceMs` is the server clock. A small negative gap (up to 5 minutes) shows `<1m`. A bigger one shows `—`. This lives in `liveElapsedLabel(sinceMs, nowMs)` in the same util. Gaps between two server times use no tolerance, so any negative shows `—`.

**New file `src/hooks/useMinuteClock.ts`.** One shared `setInterval(60_000)` for the whole page, read through `useSyncExternalStore`. It starts with the first subscriber and stops with the last. Only the small live labels subscribe, so the list and the 1,484-line dashboard **do not** re-render every minute.

### Q4. Component changes (`ApprovalDashboard.tsx`, kept small)

1. **New small components** in `src/components/approval/ApprovalStepTime.tsx`. Each is well under 50 lines.
   - `StepTimeLabel({ timing })`: shows `done` as grey text, `denied` as red "rejected after X", `waiting` through `<LiveElapsed prefix="waiting " />` in amber, and `none` as nothing.
   - `LiveElapsed({ sinceMs, prefix })`: calls `useMinuteClock()`. Only this re-renders each minute.
   - `TotalTimeLabel({ total })`: "Total" / "Total so far". Uses `LiveElapsed` when `live`. Its tooltip names any hidden-step time.
2. **In the card IIFE (around line 1248):** one call:
   `const timing = computeApprovalTiming(workflow, steps.map(i => Number(i.step?.step)).filter(Number.isFinite), Date.now());`
   Pass `Date.now()` once per render. Live labels take over from there.
3. **Inside `steps.map` (around line 1308):** add `<StepTimeLabel timing={timing.byStepNumber.get(Number(item.step?.step)) ?? NONE} />` under the label div. Styles: `mt-0.5 text-[11px] leading-tight tabular-nums truncate max-w-full whitespace-nowrap`, with the full text in `title` so cut-off text can still be read.
4. **"Current" line (around line 1315):** wrap it in `flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between`. Put `<TotalTimeLabel />` on the right with `shrink-0`. On phones the total goes on its own line under "Current".
5. **Tooltip fix (around line 1282):** replace the dead `approvedAt || completedAt || updatedAt || createdAt` with `decisionTimeMs(item.step)`, so the hover shows the real decision time. This is the same bug the feature fixes, so it belongs in the same change.
6. Delete the unused `getApprovalCompletedAtMs` (approved by the user 2026-10-02) (line 50), which reads the same missing fields.

**Mobile:** the stepper keeps `min-w-[520px]` inside the existing `overflow-x-auto`. At 5 steps that is about 104 px per column. "waiting 12d 23h" fits at 11 px. Longer text such as "rejected after 1d 4h" is cut with an ellipsis and can be read in full on hover or long-press. No new horizontal scroll on the page.

## 3. Test plan (Vitest, `npm test`)

**`tests/unit/approvalTiming.test.ts`** (node). Target 100% statements, branches and functions. Add a threshold entry for `src/utils/approvalTiming.ts` in `vitest.config.ts`.

- Happy path: Team, Tech and Legal all approved. Durations add up and Total = createdAt to Legal's time, labelled "Total".
- Waiting step: Tech approved, Legal pending. Legal is `waiting` from Tech's time. Total is live, labelled "Total so far".
- A pending step with a comment `timestamp` is still `waiting` and its timestamp is ignored.
- Denied: Tech denied. `denied` with a duration. Legal is `none`. Total ends at the denial and is labelled "Total".
- Cancelled: workflow `denied`, no denied step. No `waiting`. Total end is `null` and shows "—".
- Approved workflow with Deal Desk `pending`: nothing is waiting and the total ends at Legal.
- Missing or invalid `createdAt`: first step "—" and total "—". The others still work.
- Missing or invalid step `timestamp` on a decided step: that step "—", next step "—".
- Re-stamped step (Team's time is after Tech's): Team "—", Tech "—", Legal still correct.
- Hidden Deal Desk decided between Legal and MM: MM starts at Deal Desk's time. `hiddenMs` and `hiddenRoles` are filled in.
- Hidden Deal Desk never decided between Legal and MM: MM starts at Legal's time.
- Fallback to `approvedAt` when `timestamp` is missing.
- Clock skew: `now` 2 min before `sinceMs` gives `<1m`. 10 min before gives `—`.
- `formatDuration`: null, NaN, -1, 0, 59 999, 60 000, 45 min, 2 h 0 m, 2 h 15 m, 1 d 0 h, 1 d 4 h.

**`tests/unit/approvalStepTimingCard.test.tsx`** (`// @vitest-environment jsdom`). Follow `approvalDashboardLoading.test.tsx`: same mocks, `vi.spyOn(approvalWorkflowServiceMongoDB, 'getAllWorkflows')`, and `vi.useFakeTimers()` with `vi.setSystemTime`.

- An open workflow shows "2h 15m", "1d 4h", "waiting 6h 10m" and "Total so far: 1d 12h" in the card.
- Moving fake time forward 60 s updates the waiting label. Only the live labels change.
- A denied workflow shows "rejected after 3h" and a "Total: …" label.
- An old record with no timestamps shows "—" and never "NaN" or a minus sign.
- The tooltip on a decided step contains "Time:" with that step's `timestamp`.

## 4. Implementation sequence

No backend or database steps.
1. `src/utils/approvalTiming.ts` and its unit tests (test first)
2. `src/hooks/useMinuteClock.ts`
3. `src/components/approval/ApprovalStepTime.tsx`
4. Wire them into `ApprovalDashboard.tsx` (items 2-5 in Q4)
5. Card test and a manual check at 375 px and desktop width on dev

## 5. Notes

- **Estimate:** about 6 hours (util and tests 3h, hook and components 1.5h, wiring and card test 1.5h).
- **Dependencies:** none new (`useSyncExternalStore` is in React 18).
- **Risks:** (a) production still runs the pre-`3dd6f60` step route, so prod records can be re-stamped until that ships (the order check catches most cases). (b) A re-stamped last step makes the total too long. (c) Optimistic local updates in the role dashboards use the browser clock until the next refetch. The skew rule covers this.
- **Security:** read-only display of data the page already loads. Nothing new is sent to the server and there is no new input.
- **Out of scope:** locking `workflowSteps` on generic PUT `/api/approval-workflows/:id`, and saving a `cancelledAt` time. Both are backend changes.

## 6. User decisions (2026-10-02)

- Design approved.
- Cancelled by the requester: Total shows "—".
- Delete the unused `getApprovalCompletedAtMs` in this change.
- No averages box at the top for now.

## 7. Changes after review (2026-10-02)

- **No `nowMs` argument.** `computeApprovalTiming(workflow, visibleStepNumbers)` never reads the clock. Only the live labels do, through `useMinuteClock`.
- **Fresh time after a remount.** When no interval is running, `useMinuteClock` reads the time, rounded down to the minute, on the first render. It no longer shows an old value until the next tick.
- **Missing or invalid step number** (including `null` and `''`, which `Number()` turns into 0). The step stays where it is stored, right after the step stored before it. If it is decided, the next decided step's start is unknown and shows "—". It never shows on the card and never counts as hidden time.
- **Duplicate step numbers.** Every step with that number shows "—" (new `unknown` kind), and so does the step whose start depends on them. An open duplicate takes the "waiting" slot, so "waiting" does not jump past it.
- **Hidden step out of order.** The order check runs on visible steps first. A hidden step can then mark as re-stamped only the visible step right before it (re-stamps only move a time later). If its time is earlier than two or more visible decisions, or later than a later visible decision, the hidden step is dropped from timing and visible steps keep their times. Hidden steps are then checked against each other. As a result, Deal Desk now catches a re-stamped last step, and the total shows "—" instead of a time that is too long.
- **Tooltip.** The time label has no `title` of its own, so hovering it shows the full column tooltip. That tooltip now ends with "Took: X", "Rejected after: X" or "Waiting since: <date>". It shows a fixed start time, not a duration, so it never goes out of date between minute ticks.
- **Hidden-time note.** The "Includes … (not shown)" note is left out when the total shows "—".
