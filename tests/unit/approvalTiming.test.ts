import { describe, it, expect } from 'vitest';
import {
  computeApprovalTiming,
  decisionTimeMs,
  elapsedMs,
  formatDuration,
  liveElapsedLabel,
  stepNumberOf,
  stepTimingTooltip,
  timingForStep,
  type TimingStep,
  type TimingWorkflow,
} from '../../src/utils/approvalTiming';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = Date.parse('2026-09-20T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

const TEAM_MS = T0 + 2 * HOUR + 15 * MIN;
const TECH_MS = TEAM_MS + DAY + 4 * HOUR;
const LEGAL_MS = TECH_MS + 6 * HOUR;

const step = (
  n: number,
  role: string,
  status: string,
  timeMs?: number,
  extra: Partial<TimingStep> = {},
): TimingStep => ({
  step: n,
  role,
  status,
  ...(timeMs === undefined ? {} : { timestamp: iso(timeMs) }),
  ...extra,
});

const workflow = (status: string, steps: TimingStep[]): TimingWorkflow => ({
  createdAt: iso(T0),
  status,
  workflowSteps: steps,
});

const VISIBLE = [1, 2, 3];

describe('formatDuration', () => {
  it.each([
    [null, '—'],
    [Number.NaN, '—'],
    [Number.POSITIVE_INFINITY, '—'],
    [-1, '—'],
    [0, '<1m'],
    [59_999, '<1m'],
    [60_000, '1m'],
    [45 * MIN, '45m'],
    [2 * HOUR, '2h'],
    [2 * HOUR + 15 * MIN, '2h 15m'],
    [DAY, '1d'],
    [DAY + 4 * HOUR, '1d 4h'],
    [DAY + 4 * HOUR + 59 * MIN, '1d 4h'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatDuration(input as number | null)).toBe(expected);
  });
});

describe('elapsedMs', () => {
  it('returns the gap between two times', () => {
    expect(elapsedMs(1000, 4000)).toBe(3000);
  });

  it('returns null when either side is missing or the gap is negative', () => {
    expect(elapsedMs(null, 4000)).toBeNull();
    expect(elapsedMs(1000, null)).toBeNull();
    expect(elapsedMs(4000, 1000)).toBeNull();
  });
});

describe('liveElapsedLabel', () => {
  it('formats a normal live gap', () => {
    expect(liveElapsedLabel(T0, T0 + 6 * HOUR + 10 * MIN)).toBe('6h 10m');
  });

  it('shows <1m for small clock skew and — for a large one', () => {
    expect(liveElapsedLabel(T0, T0 - 2 * MIN)).toBe('<1m');
    expect(liveElapsedLabel(T0, T0 - 5 * MIN)).toBe('<1m');
    expect(liveElapsedLabel(T0, T0 - 10 * MIN)).toBe('—');
  });

  it('shows — when the start is unknown', () => {
    expect(liveElapsedLabel(null, T0)).toBe('—');
  });
});

describe('decisionTimeMs', () => {
  it('reads the timestamp of a decided step', () => {
    for (const status of ['approved', 'denied', 'notified', 'signed']) {
      expect(decisionTimeMs(step(1, 'Team Approval', status, TEAM_MS))).toBe(TEAM_MS);
    }
  });

  it('ignores the timestamp of a step that is not decided', () => {
    expect(decisionTimeMs(step(1, 'Team Approval', 'pending', TEAM_MS))).toBeNull();
    expect(decisionTimeMs({ step: 1, timestamp: iso(TEAM_MS) })).toBeNull();
  });

  it('falls back to approvedAt, then completedAt', () => {
    const approvedWith = (extra: Partial<TimingStep>) =>
      step(1, 'Team Approval', 'approved', undefined, extra);
    expect(decisionTimeMs(approvedWith({ approvedAt: iso(TEAM_MS) }))).toBe(TEAM_MS);
    expect(decisionTimeMs(approvedWith({ completedAt: iso(TECH_MS) }))).toBe(TECH_MS);
    expect(decisionTimeMs(approvedWith({ timestamp: 'garbage', approvedAt: iso(TEAM_MS) }))).toBe(TEAM_MS);
  });

  it('returns null for missing steps, missing times and non-string times', () => {
    expect(decisionTimeMs(null)).toBeNull();
    expect(decisionTimeMs(undefined)).toBeNull();
    expect(decisionTimeMs(step(1, 'Team Approval', 'approved'))).toBeNull();
    expect(decisionTimeMs({ status: 'approved', timestamp: 12345 as unknown as string })).toBeNull();
  });
});

describe('computeApprovalTiming', () => {
  it('times every approved step and closes the total at the last visible decision', () => {
    const wf = workflow('approved', [
      step(3, 'Legal Team', 'approved', LEGAL_MS),
      step(1, 'Team Approval', 'approved', TEAM_MS),
      step(2, 'Technical Team', 'approved', TECH_MS),
    ]);
    const { byStepNumber, total } = computeApprovalTiming(wf, VISIBLE);

    expect(byStepNumber.get(1)).toEqual({ kind: 'done', ms: 2 * HOUR + 15 * MIN });
    expect(byStepNumber.get(2)).toEqual({ kind: 'done', ms: DAY + 4 * HOUR });
    expect(byStepNumber.get(3)).toEqual({ kind: 'done', ms: 6 * HOUR });
    expect(total).toEqual({
      label: 'Total',
      startMs: T0,
      endMs: LEGAL_MS,
      live: false,
      hiddenMs: 0,
      hiddenRoles: [],
    });
    expect(elapsedMs(total.startMs, total.endMs)).toBe(2 * HOUR + 15 * MIN + DAY + 4 * HOUR + 6 * HOUR);
  });

  it('marks the first open visible step as waiting from the previous decision', () => {
    const wf = workflow('in_progress', [
      step(1, 'Team Approval', 'approved', TEAM_MS),
      step(2, 'Technical Team', 'approved', TECH_MS),
      step(3, 'Legal Team', 'pending'),
    ]);
    const { byStepNumber, total } = computeApprovalTiming(wf, VISIBLE);

    expect(byStepNumber.get(3)).toEqual({ kind: 'waiting', sinceMs: TECH_MS });
    expect(total.label).toBe('Total so far');
    expect(total.live).toBe(true);
    expect(total.endMs).toBeNull();
    expect(total.startMs).toBe(T0);
  });

  it('ignores a comment timestamp on a pending step', () => {
    const wf = workflow('pending', [
      step(1, 'Team Approval', 'approved', TEAM_MS),
      step(2, 'Technical Team', 'pending', TEAM_MS + HOUR, { comments: 'looking' }),
      step(3, 'Legal Team', 'pending'),
    ]);
    const { byStepNumber } = computeApprovalTiming(wf, VISIBLE);

    expect(byStepNumber.get(2)).toEqual({ kind: 'waiting', sinceMs: TEAM_MS });
    expect(byStepNumber.get(3)).toEqual({ kind: 'none' });
  });

  it('times a denied step and stops the total at the denial', () => {
    const deniedAt = TEAM_MS + 3 * HOUR;
    const wf = workflow('denied', [
      step(1, 'Team Approval', 'approved', TEAM_MS),
      step(2, 'Technical Team', 'denied', deniedAt),
      step(3, 'Legal Team', 'pending'),
    ]);
    const { byStepNumber, total } = computeApprovalTiming(wf, VISIBLE);

    expect(byStepNumber.get(2)).toEqual({ kind: 'denied', ms: 3 * HOUR });
    expect(byStepNumber.get(3)).toEqual({ kind: 'none' });
    expect(total.label).toBe('Total');
    expect(total.endMs).toBe(deniedAt);
  });

  it('shows nothing after a denied step, even a later decided or hidden step', () => {
    const deniedAt = TEAM_MS + 3 * HOUR;
    const wf = workflow('denied', [
      step(1, 'Team Approval', 'denied', deniedAt),
      step(2, 'Technical Team', 'approved', deniedAt + HOUR),
      step(4, 'Deal Desk', 'notified', deniedAt + 2 * HOUR),
    ]);
    const { byStepNumber, total } = computeApprovalTiming(wf, [1, 2]);

    expect(byStepNumber.get(1)).toEqual({ kind: 'denied', ms: deniedAt - T0 });
    expect(byStepNumber.get(2)).toEqual({ kind: 'none' });
    expect(byStepNumber.get(4)).toEqual({ kind: 'none' });
    expect(total.endMs).toBe(deniedAt);
    expect(total.hiddenRoles).toEqual([]);
  });

  it('gives a cancelled workflow no waiting step and an unknown total end', () => {
    const wf = workflow('denied', [
      step(1, 'Team Approval', 'approved', TEAM_MS),
      step(2, 'Technical Team', 'pending'),
      step(3, 'Legal Team', 'pending'),
    ]);
    const { byStepNumber, total } = computeApprovalTiming(wf, VISIBLE);

    expect(byStepNumber.get(1)).toEqual({ kind: 'done', ms: TEAM_MS - T0 });
    expect(byStepNumber.get(2)).toEqual({ kind: 'none' });
    expect(total).toMatchObject({ label: 'Total', endMs: null, live: false });
  });

  it('handles a workflow cancelled before any decision', () => {
    const wf = workflow('denied', [step(1, 'Team Approval', 'pending'), step(4, 'Deal Desk', 'pending')]);
    const { byStepNumber, total } = computeApprovalTiming(wf, [1]);

    expect(byStepNumber.get(1)).toEqual({ kind: 'none' });
    expect(total).toMatchObject({ endMs: null, hiddenMs: 0, hiddenRoles: [] });
  });

  it('ends an approved workflow at Legal when Deal Desk is still pending', () => {
    const wf = workflow('approved', [
      step(1, 'Team Approval', 'approved', TEAM_MS),
      step(2, 'Technical Team', 'approved', TECH_MS),
      step(3, 'Legal Team', 'approved', LEGAL_MS),
      step(4, 'Deal Desk', 'pending'),
    ]);
    const { byStepNumber, total } = computeApprovalTiming(wf, VISIBLE);

    expect([...byStepNumber.values()].some((t) => t.kind === 'waiting')).toBe(false);
    expect(total.endMs).toBe(LEGAL_MS);
  });

  it('does not add a Deal Desk notified after Legal to the total', () => {
    const wf = workflow('approved', [
      step(1, 'Team Approval', 'approved', TEAM_MS),
      step(2, 'Technical Team', 'approved', TECH_MS),
      step(3, 'Legal Team', 'approved', LEGAL_MS),
      step(4, 'Deal Desk', 'notified', LEGAL_MS + MIN),
    ]);
    const { total } = computeApprovalTiming(wf, VISIBLE);

    expect(total.endMs).toBe(LEGAL_MS);
    expect(total.hiddenMs).toBe(0);
    expect(total.hiddenRoles).toEqual([]);
  });

  it('returns — for the first step and total when createdAt is missing or invalid', () => {
    for (const createdAt of [undefined, 'not-a-date']) {
      const wf: TimingWorkflow = {
        createdAt,
        status: 'approved',
        workflowSteps: [
          step(1, 'Team Approval', 'approved', TEAM_MS),
          step(2, 'Technical Team', 'approved', TECH_MS),
          step(3, 'Legal Team', 'approved', LEGAL_MS),
        ],
      };
      const { byStepNumber, total } = computeApprovalTiming(wf, VISIBLE);

      expect(byStepNumber.get(1)).toEqual({ kind: 'done', ms: null });
      expect(byStepNumber.get(2)).toEqual({ kind: 'done', ms: DAY + 4 * HOUR });
      expect(total.startMs).toBeNull();
      expect(formatDuration(elapsedMs(total.startMs, total.endMs))).toBe('—');
    }
  });

  it('returns — for a decided step with no valid time and for the step after it', () => {
    for (const extra of [{}, { timestamp: 'garbage' }]) {
      const wf = workflow('approved', [
        step(1, 'Team Approval', 'approved', TEAM_MS),
        step(2, 'Technical Team', 'approved', undefined, extra),
        step(3, 'Legal Team', 'approved', LEGAL_MS),
      ]);
      const { byStepNumber } = computeApprovalTiming(wf, VISIBLE);

      expect(byStepNumber.get(1)).toEqual({ kind: 'done', ms: TEAM_MS - T0 });
      expect(byStepNumber.get(2)).toEqual({ kind: 'done', ms: null });
      expect(byStepNumber.get(3)).toEqual({ kind: 'done', ms: null });
    }
  });

  it('returns — for a re-stamped step and the step after it', () => {
    const wf = workflow('approved', [
      step(1, 'Team Approval', 'approved', TECH_MS + HOUR),
      step(2, 'Technical Team', 'approved', TECH_MS),
      step(3, 'Legal Team', 'approved', LEGAL_MS),
    ]);
    const { byStepNumber, total } = computeApprovalTiming(wf, VISIBLE);

    expect(byStepNumber.get(1)).toEqual({ kind: 'done', ms: null });
    expect(byStepNumber.get(2)).toEqual({ kind: 'done', ms: null });
    expect(byStepNumber.get(3)).toEqual({ kind: 'done', ms: 6 * HOUR });
    expect(total.endMs).toBe(LEGAL_MS);
  });

  it('starts MM at a decided hidden Deal Desk and reports the hidden time', () => {
    const dealDeskMs = LEGAL_MS + 2 * HOUR;
    const mmMs = dealDeskMs + 3 * HOUR;
    const wf = workflow('approved', [
      step(1, 'Team Approval', 'approved', TEAM_MS),
      step(2, 'Technical Team', 'approved', TECH_MS),
      step(3, 'Legal Team', 'approved', LEGAL_MS),
      step(4, 'Deal Desk', 'notified', dealDeskMs),
      step(5, 'Migration Manager', 'approved', mmMs),
    ]);
    const { byStepNumber, total } = computeApprovalTiming(wf, [1, 2, 3, 5]);

    expect(byStepNumber.get(5)).toEqual({ kind: 'done', ms: 3 * HOUR });
    expect(total.endMs).toBe(mmMs);
    expect(total.hiddenMs).toBe(2 * HOUR);
    expect(total.hiddenRoles).toEqual(['Deal Desk']);
  });

  it('counts a hidden Deal Desk in a live total and names an unnamed hidden step', () => {
    const wf = workflow('pending', [
      step(1, 'Team Approval', 'approved', TEAM_MS),
      { step: 2, status: 'approved' },
      step(3, 'Legal Team', 'pending'),
    ]);
    const { byStepNumber, total } = computeApprovalTiming(wf, [1, 3]);

    expect(byStepNumber.get(3)).toEqual({ kind: 'waiting', sinceMs: null });
    expect(total.live).toBe(true);
    expect(total.hiddenMs).toBe(0);
    expect(total.hiddenRoles).toEqual(['Step']);
  });

  it('starts MM at Legal when a hidden Deal Desk was never decided', () => {
    const wf = workflow('pending', [
      step(1, 'Team Approval', 'approved', TEAM_MS),
      step(2, 'Technical Team', 'approved', TECH_MS),
      step(3, 'Legal Team', 'approved', LEGAL_MS),
      step(4, 'Deal Desk', 'pending'),
      step(5, 'Migration Manager', 'pending'),
    ]);
    const { byStepNumber, total } = computeApprovalTiming(wf, [1, 2, 3, 5]);

    expect(byStepNumber.get(4)).toEqual({ kind: 'none' });
    expect(byStepNumber.get(5)).toEqual({ kind: 'waiting', sinceMs: LEGAL_MS });
    expect(total.hiddenRoles).toEqual([]);
  });

  it('keeps an open workflow live even when every visible step is decided', () => {
    const wf = workflow('in_progress', [
      step(1, 'Team Approval', 'approved', TEAM_MS),
      step(2, 'Deal Desk', 'approved', TEAM_MS + HOUR),
      step(3, 'Legal Team', 'approved', LEGAL_MS),
    ]);
    const { byStepNumber, total } = computeApprovalTiming(wf, [1, 3]);

    expect([...byStepNumber.values()].some((t) => t.kind === 'waiting')).toBe(false);
    expect(total).toMatchObject({ live: true, endMs: null, hiddenMs: HOUR, hiddenRoles: ['Deal Desk'] });
  });

  it('uses approvedAt when timestamp is missing', () => {
    const wf = workflow('approved', [
      step(1, 'Team Approval', 'approved', undefined, { approvedAt: iso(TEAM_MS) }),
    ]);
    const { byStepNumber, total } = computeApprovalTiming(wf, [1]);

    expect(byStepNumber.get(1)).toEqual({ kind: 'done', ms: TEAM_MS - T0 });
    expect(total.endMs).toBe(TEAM_MS);
  });

  it('gives an approved workflow with no decided step an unknown end', () => {
    const wf = workflow('approved', [step(1, 'Team Approval', 'pending')]);

    expect(computeApprovalTiming(wf, [1]).total.endMs).toBeNull();
  });

  it('survives missing, malformed and unnumbered steps', () => {
    const malformed = [
      null,
      { role: 'No number', status: 'approved' },
      { step: 1 },
    ] as unknown as TimingStep[];
    const noSteps = computeApprovalTiming({ createdAt: iso(T0), status: 'pending' }, [1]);
    const bad = computeApprovalTiming(workflow('pending', malformed), [1]);

    expect(noSteps.byStepNumber.size).toBe(0);
    expect(noSteps.total).toMatchObject({ label: 'Total so far', startMs: T0, live: true });
    expect(bad.byStepNumber.size).toBe(1);
    // The decided unnumbered step is stored before step 1, so step 1's start is unknown
    expect(bad.byStepNumber.get(1)).toEqual({ kind: 'waiting', sinceMs: null });
  });

  describe('steps with a missing or invalid number', () => {
    const BAD_NUMBERS = [null, '', '  ', undefined, 'abc'];

    it.each(BAD_NUMBERS)('makes the next decided step unknown for step %j', (badNumber) => {
      const wf = workflow('approved', [
        step(1, 'Team Approval', 'approved', TEAM_MS),
        { step: badNumber, role: 'Technical Team', status: 'approved', timestamp: iso(TECH_MS) },
        step(3, 'Legal Team', 'approved', LEGAL_MS),
      ]);
      const { byStepNumber, total } = computeApprovalTiming(wf, [1, 3]);

      expect(byStepNumber.get(1)).toEqual({ kind: 'done', ms: TEAM_MS - T0 });
      expect(byStepNumber.get(3)).toEqual({ kind: 'done', ms: null });
      expect(byStepNumber.has(0)).toBe(false);
      expect(total.endMs).toBe(LEGAL_MS);
      expect(total.hiddenRoles).toEqual([]);
    });

    it('leaves the next step alone when the unnumbered step was never decided', () => {
      const wf = workflow('approved', [
        step(1, 'Team Approval', 'approved', TEAM_MS),
        { step: null, role: 'Technical Team', status: 'pending' },
        step(3, 'Legal Team', 'approved', LEGAL_MS),
      ]);

      expect(computeApprovalTiming(wf, [1, 3]).byStepNumber.get(3)).toEqual({
        kind: 'done',
        ms: LEGAL_MS - TEAM_MS,
      });
    });

    it('keeps several unnumbered steps stored first ahead of step 1', () => {
      const wf = workflow('approved', [
        { step: null, status: 'approved', timestamp: iso(TEAM_MS) },
        { step: '', status: 'pending' },
        step(2, 'Technical Team', 'approved', TECH_MS),
        step(1, 'Team Approval', 'approved', TEAM_MS),
      ]);
      const { byStepNumber } = computeApprovalTiming(wf, [1, 2]);

      expect(byStepNumber.get(1)).toEqual({ kind: 'done', ms: null });
      expect(byStepNumber.get(2)).toEqual({ kind: 'done', ms: TECH_MS - TEAM_MS });
    });
  });

  describe('duplicate step numbers', () => {
    it('shows both duplicates and the step that starts after them as unknown', () => {
      const wf = workflow('approved', [
        step(1, 'Team Approval', 'approved', TEAM_MS),
        step(2, 'Technical Team', 'approved', TECH_MS),
        step(2, 'Legal Team', 'approved', LEGAL_MS),
        step(3, 'Migration Manager', 'approved', LEGAL_MS + HOUR),
      ]);
      const { byStepNumber, total } = computeApprovalTiming(wf, [1, 2, 3]);

      expect(byStepNumber.get(1)).toEqual({ kind: 'done', ms: TEAM_MS - T0 });
      expect(byStepNumber.get(2)).toEqual({ kind: 'unknown' });
      expect(byStepNumber.get(3)).toEqual({ kind: 'done', ms: null });
      expect(total.endMs).toBe(LEGAL_MS + HOUR);
    });

    it('does not move the waiting label past an open duplicate', () => {
      const wf = workflow('pending', [
        step(1, 'Team Approval', 'approved', TEAM_MS),
        step(2, 'Technical Team', 'pending'),
        step(2, 'Legal Team', 'pending'),
        step(3, 'Migration Manager', 'pending'),
      ]);
      const { byStepNumber } = computeApprovalTiming(wf, [1, 2, 3]);

      expect(byStepNumber.get(2)).toEqual({ kind: 'unknown' });
      expect(byStepNumber.get(3)).toEqual({ kind: 'none' });
    });
  });

  describe('hidden steps out of order', () => {
    const base = [
      step(1, 'Team Approval', 'approved', T0 + HOUR),
      step(2, 'Technical Team', 'approved', T0 + 2 * HOUR),
    ];

    it('drops a hidden step that is earlier than two visible decisions', () => {
      const wf = workflow('approved', [
        ...base,
        step(3, 'Legal Team', 'approved', T0 + 4 * HOUR),
        step(4, 'Deal Desk', 'notified', T0 + 90 * MIN),
      ]);
      const { byStepNumber, total } = computeApprovalTiming(wf, VISIBLE);

      expect(byStepNumber.get(2)).toEqual({ kind: 'done', ms: HOUR });
      expect(byStepNumber.get(3)).toEqual({ kind: 'done', ms: 2 * HOUR });
      expect(total.endMs).toBe(T0 + 4 * HOUR);
      expect(total.hiddenRoles).toEqual([]);
    });

    it('lets Deal Desk catch a re-stamped Legal', () => {
      const wf = workflow('approved', [
        ...base,
        step(3, 'Legal Team', 'approved', T0 + 10 * HOUR),
        step(4, 'Deal Desk', 'notified', T0 + 5 * HOUR),
        // MM is later than Legal, so only Deal Desk can show that Legal was re-stamped
        step(5, 'Migration Manager', 'approved', T0 + 11 * HOUR),
      ]);
      const { byStepNumber, total } = computeApprovalTiming(wf, [1, 2, 3, 5]);

      expect(byStepNumber.get(2)).toEqual({ kind: 'done', ms: HOUR });
      expect(byStepNumber.get(3)).toEqual({ kind: 'done', ms: null });
      expect(byStepNumber.get(5)).toEqual({ kind: 'done', ms: 6 * HOUR });
      expect(total).toMatchObject({ endMs: T0 + 11 * HOUR, hiddenMs: 0, hiddenRoles: ['Deal Desk'] });
    });

    it('shows an unknown total when Deal Desk catches a re-stamped last step', () => {
      const wf = workflow('approved', [
        ...base,
        step(3, 'Legal Team', 'approved', T0 + 10 * HOUR),
        step(4, 'Deal Desk', 'notified', T0 + 5 * HOUR),
      ]);
      const { byStepNumber, total } = computeApprovalTiming(wf, VISIBLE);

      expect(byStepNumber.get(3)).toEqual({ kind: 'done', ms: null });
      expect(total.endMs).toBeNull();
    });

    it('drops a hidden step that is later than a later visible decision', () => {
      const wf = workflow('approved', [
        ...base,
        step(3, 'Legal Team', 'approved', T0 + 4 * HOUR),
        step(4, 'Deal Desk', 'notified', T0 + 9 * HOUR),
        step(5, 'Migration Manager', 'approved', T0 + 6 * HOUR),
      ]);
      const { byStepNumber, total } = computeApprovalTiming(wf, [1, 2, 3, 5]);

      expect(byStepNumber.get(3)).toEqual({ kind: 'done', ms: 2 * HOUR });
      expect(byStepNumber.get(5)).toEqual({ kind: 'done', ms: 2 * HOUR });
      expect(total.hiddenRoles).toEqual([]);
    });

    it('clears a hidden step re-stamped after a later hidden step', () => {
      const wf = workflow('approved', [
        ...base,
        step(3, 'Legal Team', 'approved', T0 + 4 * HOUR),
        step(4, 'Deal Desk', 'notified', T0 + 6 * HOUR),
        step(5, 'Finance', 'approved', T0 + 5 * HOUR),
        step(6, 'Migration Manager', 'approved', T0 + 7 * HOUR),
      ]);
      const { byStepNumber, total } = computeApprovalTiming(wf, [1, 2, 3, 6]);

      expect(byStepNumber.get(3)).toEqual({ kind: 'done', ms: 2 * HOUR });
      expect(byStepNumber.get(4)).toEqual({ kind: 'done', ms: null });
      expect(byStepNumber.get(5)).toEqual({ kind: 'done', ms: null });
      expect(byStepNumber.get(6)).toEqual({ kind: 'done', ms: 2 * HOUR });
      expect(total).toMatchObject({ hiddenMs: 0, hiddenRoles: ['Deal Desk', 'Finance'] });
    });
  });
});

describe('stepNumberOf', () => {
  it('reads numeric step numbers and numeric strings', () => {
    expect(stepNumberOf({ step: 3 })).toBe(3);
    expect(stepNumberOf({ step: '2' })).toBe(2);
  });

  it('rejects missing, blank, non-numeric and non-finite numbers', () => {
    expect(stepNumberOf(undefined)).toBeNull();
    expect(stepNumberOf({})).toBeNull();
    expect(stepNumberOf({ step: null })).toBeNull();
    expect(stepNumberOf({ step: '' })).toBeNull();
    expect(stepNumberOf({ step: 'two' })).toBeNull();
    expect(stepNumberOf({ step: Number.NaN })).toBeNull();
    expect(stepNumberOf({ step: true as unknown as number })).toBeNull();
  });
});

describe('timingForStep', () => {
  it('looks a step up by its number and ignores unnumbered steps', () => {
    const wf = workflow('approved', [step(1, 'Team Approval', 'approved', TEAM_MS)]);
    const timing = computeApprovalTiming(wf, [1]);

    expect(timingForStep(timing, { step: 1 })).toEqual({ kind: 'done', ms: TEAM_MS - T0 });
    expect(timingForStep(timing, { step: null })).toBeUndefined();
    expect(timingForStep(timing, undefined)).toBeUndefined();
  });
});

describe('stepTimingTooltip', () => {
  it('describes each kind of step time', () => {
    expect(stepTimingTooltip({ kind: 'done', ms: 2 * HOUR })).toBe('Took: 2h');
    expect(stepTimingTooltip({ kind: 'denied', ms: 3 * HOUR })).toBe('Rejected after: 3h');
    expect(stepTimingTooltip({ kind: 'unknown' })).toBe('Took: —');
    expect(stepTimingTooltip({ kind: 'waiting', sinceMs: TEAM_MS })).toBe(
      `Waiting since: ${new Date(TEAM_MS).toLocaleString()}`,
    );
    expect(stepTimingTooltip({ kind: 'waiting', sinceMs: null })).toBe('Waiting since: —');
    expect(stepTimingTooltip({ kind: 'none' })).toBeNull();
    expect(stepTimingTooltip(undefined)).toBeNull();
  });
});
