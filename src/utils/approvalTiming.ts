import type { ApprovalWorkflow } from '../types/approval';

export interface TimingStep {
  step?: number | string | null;
  role?: string;
  status?: string;
  timestamp?: string;
  approvedAt?: string;
  completedAt?: string;
}

export interface TimingWorkflow {
  createdAt?: string;
  status?: string;
  workflowSteps?: TimingStep[];
}

type Expect<T extends true> = T;
// Fails to compile if a real workflow stops fitting the timing input
export type ApprovalWorkflowFitsTiming = Expect<ApprovalWorkflow extends TimingWorkflow ? true : false>;

export type StepTiming =
  | { kind: 'done'; ms: number | null }
  | { kind: 'denied'; ms: number | null }
  | { kind: 'waiting'; sinceMs: number | null }
  | { kind: 'unknown' }
  | { kind: 'none' };

export interface TotalTiming {
  label: 'Total' | 'Total so far';
  startMs: number | null;
  endMs: number | null;
  live: boolean;
  hiddenMs: number;
  hiddenRoles: string[];
}

export interface ApprovalTiming {
  byStepNumber: Map<number, StepTiming>;
  total: TotalTiming;
}

interface StepEntry {
  num: number | null;
  orderKey: number;
  role: string;
  status: string;
  visible: boolean;
  duplicate: boolean;
  decided: boolean;
  timeMs: number | null;
  startMs: number | null;
}

type TimedEntry = StepEntry & { timeMs: number };

export const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
// Browser clock vs server clock: tolerate a small negative gap on live values only
const CLOCK_SKEW_TOLERANCE_MS = 5 * MINUTE_MS;
const DECIDED_STATUSES = new Set(['approved', 'denied', 'notified', 'signed']);
const OPEN_WORKFLOW_STATUSES = new Set(['pending', 'in_progress']);
const NO_TIMING: StepTiming = { kind: 'none' };

const parseTimeMs = (raw: unknown): number | null => {
  if (typeof raw !== 'string') return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
};

const isDecided = (step: TimingStep | null | undefined): boolean =>
  DECIDED_STATUSES.has(String(step?.status));

const compareNumbers = (a: number, b: number): number => {
  if (a < b) return -1;
  return a > b ? 1 : 0;
};

export function stepNumberOf(step: TimingStep | null | undefined): number | null {
  const raw: unknown = step?.step;
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  // Number('') is 0, which would pass as a real step number
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

export function decisionTimeMs(step: TimingStep | null | undefined): number | null {
  if (!step || !isDecided(step)) return null;
  return parseTimeMs(step.timestamp) ?? parseTimeMs(step.approvedAt) ?? parseTimeMs(step.completedAt);
}

export function elapsedMs(startMs: number | null, endMs: number | null): number | null {
  if (startMs === null || endMs === null) return null;
  const ms = endMs - startMs;
  return ms < 0 ? null : ms;
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < MINUTE_MS) return '<1m';
  if (ms < HOUR_MS) return `${Math.floor(ms / MINUTE_MS)}m`;
  if (ms < DAY_MS) {
    const hours = Math.floor(ms / HOUR_MS);
    const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

export function liveElapsedLabel(sinceMs: number | null, nowMs: number): string {
  if (sinceMs === null) return '—';
  const gap = nowMs - sinceMs;
  if (gap < 0) return gap >= -CLOCK_SKEW_TOLERANCE_MS ? '<1m' : '—';
  return formatDuration(gap);
}

export function stepTimingTooltip(timing: StepTiming | undefined): string | null {
  switch (timing?.kind) {
    case 'done':
      return `Took: ${formatDuration(timing.ms)}`;
    case 'denied':
      return `Rejected after: ${formatDuration(timing.ms)}`;
    case 'unknown':
      return 'Took: —';
    case 'waiting':
      // A fixed start time stays correct; a duration here would go stale between minute ticks
      return `Waiting since: ${timing.sinceMs === null ? '—' : new Date(timing.sinceMs).toLocaleString()}`;
    default:
      return null;
  }
}

export function timingForStep(
  timing: ApprovalTiming,
  step: TimingStep | null | undefined,
): StepTiming | undefined {
  const num = stepNumberOf(step);
  return num === null ? undefined : timing.byStepNumber.get(num);
}

const duplicateNumbers = (nums: (number | null)[]): Set<number> => {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const num of nums) {
    if (num === null) continue;
    if (seen.has(num)) duplicates.add(num);
    seen.add(num);
  }
  return duplicates;
};

const buildEntries = (workflow: TimingWorkflow, visible: Set<number>): StepEntry[] => {
  const steps = (Array.isArray(workflow.workflowSteps) ? workflow.workflowSteps : []).filter(Boolean);
  const nums = steps.map(stepNumberOf);
  const duplicates = duplicateNumbers(nums);
  let lastNum = -Infinity;
  const entries = steps.map((step, index): StepEntry => {
    const num = nums[index];
    const duplicate = num !== null && duplicates.has(num);
    if (num !== null) lastNum = num;
    return {
      num,
      // An unnumbered step keeps its stored place, right after the step stored before it
      orderKey: num === null ? lastNum + 0.5 : num,
      role: String(step.role ?? ''),
      status: String(step.status ?? ''),
      visible: num !== null && visible.has(num),
      duplicate,
      decided: isDecided(step),
      timeMs: num === null || duplicate ? null : decisionTimeMs(step),
      startMs: null,
    };
  });
  return entries.sort((a, b) => compareNumbers(a.orderKey, b.orderKey));
};

const isTimed = (entry: StepEntry): entry is TimedEntry => entry.timeMs !== null;

// A decision later than a later step's decision means the old route re-stamped it
const clearRestamped = (entries: TimedEntry[]) => {
  let laterMin = Infinity;
  const restamped: StepEntry[] = [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.timeMs > laterMin) restamped.push(entry);
    laterMin = Math.min(laterMin, entry.timeMs);
  }
  restamped.forEach((entry) => {
    entry.timeMs = null;
  });
};

const settleHiddenStep = (entries: StepEntry[], index: number) => {
  const hidden = entries[index];
  const time = hidden.timeMs;
  if (hidden.visible || time === null) return;
  const timedVisible = (list: StepEntry[]) => list.filter((entry) => entry.visible).filter(isTimed);
  const laterBefore: StepEntry[] = timedVisible(entries.slice(0, index)).filter(
    (entry) => entry.timeMs > time,
  );
  const earlierAfter = timedVisible(entries.slice(index + 1)).some((entry) => entry.timeMs < time);
  // Re-stamps only move a time later, so one clash means the visible step before it was re-stamped
  if (earlierAfter || laterBefore.length > 1) {
    hidden.decided = false;
    hidden.timeMs = null;
  } else if (laterBefore.length === 1) {
    laterBefore[0].timeMs = null;
  }
};

const settleDecisionTimes = (entries: StepEntry[], createdMs: number | null) => {
  clearRestamped(entries.filter((entry) => entry.visible).filter(isTimed));
  entries.forEach((_, index) => settleHiddenStep(entries, index));
  clearRestamped(entries.filter((entry) => !entry.visible).filter(isTimed));
  let prevDecisionMs = createdMs;
  for (const entry of entries) {
    entry.startMs = prevDecisionMs;
    if (entry.decided) prevDecisionMs = entry.timeMs;
  }
};

const timingOf = (entry: StepEntry, canWait: boolean): StepTiming => {
  if (entry.duplicate) return { kind: 'unknown' };
  if (entry.decided) {
    const ms = elapsedMs(entry.startMs, entry.timeMs);
    return entry.status === 'denied' ? { kind: 'denied', ms } : { kind: 'done', ms };
  }
  return canWait ? { kind: 'waiting', sinceMs: entry.startMs } : NO_TIMING;
};

const stepTimings = (entries: StepEntry[], open: boolean) => {
  const byStepNumber = new Map<number, StepTiming>();
  let waitingNum: number | undefined;
  let waitingTaken = false;
  let stopped = false;
  for (const entry of entries) {
    if (entry.num === null) continue;
    const canWait = !stopped && open && entry.visible && !waitingTaken && !entry.decided;
    const timing = stopped ? NO_TIMING : timingOf(entry, canWait);
    if (canWait) waitingTaken = true;
    if (timing.kind === 'waiting') waitingNum = entry.num;
    stopped = stopped || (entry.visible && entry.decided && entry.status === 'denied');
    byStepNumber.set(entry.num, timing);
  }
  return { byStepNumber, waitingNum };
};

const lastVisibleDecision = (entries: StepEntry[]): StepEntry | undefined => {
  let last: StepEntry | undefined;
  for (const entry of entries) {
    if (!entry.visible || !entry.decided) continue;
    last = entry;
    if (entry.status === 'denied') break;
  }
  return last;
};

const hiddenTime = (entries: StepEntry[], boundary: number | null | undefined) => {
  if (typeof boundary !== 'number') return { hiddenMs: 0, hiddenRoles: [] as string[] };
  const hidden = entries.filter(
    (entry) => !entry.visible && entry.num !== null && entry.decided && entry.num < boundary,
  );
  const hiddenMs = hidden.reduce((sum, entry) => sum + (elapsedMs(entry.startMs, entry.timeMs) ?? 0), 0);
  const hiddenRoles = Array.from(new Set(hidden.map((entry) => entry.role || 'Step')));
  return { hiddenMs, hiddenRoles };
};

export function computeApprovalTiming(
  workflow: TimingWorkflow,
  visibleStepNumbers: number[],
): ApprovalTiming {
  const open = OPEN_WORKFLOW_STATUSES.has(String(workflow.status));
  const createdMs = parseTimeMs(workflow.createdAt);
  const entries = buildEntries(workflow, new Set(visibleStepNumbers));
  settleDecisionTimes(entries, createdMs);
  const { byStepNumber, waitingNum } = stepTimings(entries, open);
  const last = lastVisibleDecision(entries);
  const boundary = open && waitingNum !== undefined ? waitingNum : last?.num;
  const cancelled = workflow.status === 'denied' && !entries.some((entry) => entry.status === 'denied');
  return {
    byStepNumber,
    total: {
      label: open ? 'Total so far' : 'Total',
      startMs: createdMs,
      endMs: open || cancelled || !last ? null : last.timeMs,
      live: open,
      ...hiddenTime(entries, boundary),
    },
  };
}
