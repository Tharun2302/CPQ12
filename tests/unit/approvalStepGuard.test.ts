import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import stepGuard from '../../approval-step-guard.cjs';

type Step = {
  step: number | string;
  role: string;
  status: string;
  email?: string;
  comments?: string;
  timestamp?: string;
};

type Workflow = {
  id: string;
  status: string;
  currentStep: number | string;
  totalSteps: number;
  workflowSteps: Step[];
};

type GuardResult = {
  allowed: boolean;
  step?: Step;
  httpStatus?: number;
  code?: string;
  error?: string;
  stepRole?: string | null;
  stepStatus?: string | null;
  actedAt?: string | null;
};

type SanitizeResult =
  | { ok: true; updates: { status?: string; comments?: string } }
  | { ok: false; httpStatus: number; code: string; error: string };

type StepUpdates = { status?: string; comments?: string };

type WritePlan = {
  filter: Record<string, unknown>;
  update: { $set: Record<string, unknown> };
  options: { arrayFilters: Array<Record<string, unknown>> };
  nextStatus: string;
};

type Outcome = GuardResult & { nextStatus?: string; lostRace?: boolean };

type FakeCollection = {
  updateOne: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
};

const {
  APPROVAL_ROLES,
  MAX_COMMENT_LENGTH,
  approverLabel,
  parseStepNumber,
  sanitizeStepUpdates,
  areAllApprovalStepsComplete,
  checkStepUpdateAllowed,
  planStepWrite,
  applyStepUpdate,
} = stepGuard as {
  APPROVAL_ROLES: string[];
  MAX_COMMENT_LENGTH: number;
  approverLabel: (role: unknown) => string;
  parseStepNumber: (raw: unknown) => number;
  sanitizeStepUpdates: (body: unknown) => SanitizeResult;
  areAllApprovalStepsComplete: (steps: unknown) => boolean;
  checkStepUpdateAllowed: (workflow: unknown, stepNumber: unknown, updates?: StepUpdates) => GuardResult;
  planStepWrite: (workflow: Workflow, target: Step, stepNum: number, updates: StepUpdates, now: Date) => WritePlan;
  applyStepUpdate: (
    collection: FakeCollection,
    workflow: Workflow,
    stepNum: number,
    updates: StepUpdates,
    now?: Date,
  ) => Promise<Outcome>;
};

const ACTED_AT = '2026-09-28T09:15:00.000Z';

// Quote workflows are Team Lead (1) -> Technical (2) -> Legal (3) -> Deal Desk (4).
function quoteWorkflow(
  statuses: [string, string, string, string],
  over: Partial<Workflow> = {},
): Workflow {
  const roles = ['Team Approval', 'Technical Team', 'Legal Team', 'Deal Desk'];
  return {
    id: 'wf-1',
    status: 'pending',
    currentStep: 1,
    totalSteps: 4,
    workflowSteps: roles.map((role, i) => ({
      step: i + 1,
      role,
      status: statuses[i],
      email: `${role.toLowerCase().replace(/\s+/g, '.')}@cpq12.test`,
      ...(statuses[i] === 'pending' ? {} : { timestamp: ACTED_AT }),
    })),
    ...over,
  };
}

// Older manual workflows have only Technical (1) -> Legal (2).
function manualWorkflow(statuses: [string, string], over: Partial<Workflow> = {}): Workflow {
  return {
    id: 'wf-manual',
    status: 'pending',
    currentStep: 1,
    totalSteps: 2,
    workflowSteps: [
      { step: 1, role: 'Technical Team', status: statuses[0] },
      { step: 2, role: 'Legal Team', status: statuses[1] },
    ],
    ...over,
  };
}

describe('APPROVAL_ROLES', () => {
  it('lists only the roles whose decision gates the deal', () => {
    expect(APPROVAL_ROLES).toEqual(['Team Approval', 'Technical Team', 'Legal Team']);
  });
});

describe('approverLabel', () => {
  it('calls the Team Approval role the Team Lead', () => {
    expect(approverLabel('Team Approval')).toBe('Team Lead');
  });

  it('returns other roles unchanged', () => {
    expect(approverLabel('Technical Team')).toBe('Technical Team');
    expect(approverLabel('Legal Team')).toBe('Legal Team');
    expect(approverLabel('Deal Desk')).toBe('Deal Desk');
  });

  it('falls back to "approver" when the role is missing', () => {
    expect(approverLabel(undefined)).toBe('approver');
    expect(approverLabel(null)).toBe('approver');
    expect(approverLabel('')).toBe('approver');
  });
});

describe('sanitizeStepUpdates', () => {
  it('keeps an approved or denied status', () => {
    expect(sanitizeStepUpdates({ status: 'approved' })).toEqual({ ok: true, updates: { status: 'approved' } });
    expect(sanitizeStepUpdates({ status: 'denied' })).toEqual({ ok: true, updates: { status: 'denied' } });
  });

  it('drops role, email, step, timestamp and any other key', () => {
    const result = sanitizeStepUpdates({
      status: 'approved',
      role: 'Legal Team',
      email: 'attacker@example.com',
      step: 3,
      timestamp: '2020-01-01T00:00:00.000Z',
      group: 'sales',
    });
    expect(result).toEqual({ ok: true, updates: { status: 'approved' } });
  });

  it('rejects a status that would reopen the step', () => {
    expect(sanitizeStepUpdates({ status: 'pending' })).toEqual({
      ok: false,
      httpStatus: 400,
      code: 'INVALID_STEP_STATUS',
      error: 'Invalid step status.',
    });
  });

  it('rejects any other status value, including null and wrong case', () => {
    for (const status of ['in_progress', 'APPROVED', '', null, 1]) {
      const result = sanitizeStepUpdates({ status });
      expect(result.ok, `status ${String(status)}`).toBe(false);
    }
  });

  it('trims comments', () => {
    expect(sanitizeStepUpdates({ status: 'denied', comments: '  Price too low  ' })).toEqual({
      ok: true,
      updates: { status: 'denied', comments: 'Price too low' },
    });
  });

  it('rejects comments that are not text instead of crashing on them', () => {
    for (const comments of [42, null, { toString: 1 }, ['a']]) {
      expect(sanitizeStepUpdates({ status: 'approved', comments })).toEqual({
        ok: false,
        httpStatus: 400,
        code: 'INVALID_COMMENTS',
        error: 'Comments must be text.',
      });
    }
  });

  it('caps comment length so one save cannot bloat the workflow document', () => {
    expect(sanitizeStepUpdates({ comments: 'x'.repeat(MAX_COMMENT_LENGTH) }).ok).toBe(true);
    expect(sanitizeStepUpdates({ comments: 'x'.repeat(MAX_COMMENT_LENGTH + 1) })).toMatchObject({
      ok: false,
      httpStatus: 400,
      code: 'COMMENTS_TOO_LONG',
    });
  });

  it('leaves status out of a comment-only update', () => {
    const result = sanitizeStepUpdates({ comments: 'Checking scope', timestamp: ACTED_AT });
    expect(result).toEqual({ ok: true, updates: { comments: 'Checking scope' } });
  });

  it('rejects a request that changes nothing', () => {
    for (const body of [undefined, null, 'approved', {}, [], { role: 'Legal Team' }]) {
      expect(sanitizeStepUpdates(body)).toEqual({
        ok: false,
        httpStatus: 400,
        code: 'NO_CHANGES',
        error: 'Nothing to update.',
      });
    }
  });
});

describe('parseStepNumber', () => {
  it('reads plain step numbers', () => {
    expect(parseStepNumber('1')).toBe(1);
    expect(parseStepNumber('4')).toBe(4);
    expect(parseStepNumber('02')).toBe(2);
  });

  it('refuses anything parseInt would silently truncate', () => {
    for (const raw of ['1e3', '2abc', ' 2', '2.9', '-1', '', 'abc', '1234', undefined]) {
      expect(parseStepNumber(raw), `raw ${String(raw)}`).toBeNaN();
    }
  });
});

describe('areAllApprovalStepsComplete', () => {
  it('needs Team Lead, Technical and Legal when the workflow has a Team step', () => {
    expect(areAllApprovalStepsComplete(quoteWorkflow(['approved', 'approved', 'approved', 'pending']).workflowSteps))
      .toBe(true);
    expect(areAllApprovalStepsComplete(quoteWorkflow(['pending', 'approved', 'approved', 'pending']).workflowSteps))
      .toBe(false);
  });

  it('needs only Technical and Legal on a legacy manual workflow', () => {
    expect(areAllApprovalStepsComplete(manualWorkflow(['approved', 'approved']).workflowSteps)).toBe(true);
    expect(areAllApprovalStepsComplete(manualWorkflow(['approved', 'pending']).workflowSteps)).toBe(false);
  });

  it('is false for a missing step list', () => {
    expect(areAllApprovalStepsComplete(undefined)).toBe(false);
  });
});

describe('checkStepUpdateAllowed — step lookup', () => {
  const wf = quoteWorkflow(['pending', 'pending', 'pending', 'pending']);

  it.each([
    ['a step number past the end', 99],
    ['NaN from parsing "abc"', Number.parseInt('abc', 10)],
    ['the raw string "abc"', 'abc'],
    ['step 0', 0],
    ['a fractional step', 1.5],
  ])('returns STEP_NOT_FOUND for %s', (_label, stepNumber) => {
    expect(checkStepUpdateAllowed(wf, stepNumber)).toEqual({
      allowed: false,
      httpStatus: 404,
      code: 'STEP_NOT_FOUND',
      error: 'This approval step does not exist.',
      stepRole: null,
      stepStatus: null,
      actedAt: null,
    });
  });

  it('returns STEP_NOT_FOUND instead of throwing when the workflow is gone', () => {
    expect(checkStepUpdateAllowed(null, 1)).toMatchObject({ allowed: false, code: 'STEP_NOT_FOUND' });
  });

  it('finds a step whose number is stored as a string', () => {
    const stored = quoteWorkflow(['approved', 'pending', 'pending', 'pending'], { status: 'in_progress', currentStep: 2 });
    stored.workflowSteps[1].step = '2';
    const result = checkStepUpdateAllowed(stored, 2);
    expect(result.allowed).toBe(true);
    expect(result.step).toBe(stored.workflowSteps[1]);
  });
});

describe('checkStepUpdateAllowed — step already acted on', () => {
  it('blocks a second Technical decision with the exact message', () => {
    const wf = quoteWorkflow(['approved', 'approved', 'pending', 'pending'], { status: 'in_progress', currentStep: 3 });
    expect(checkStepUpdateAllowed(wf, 2)).toEqual({
      allowed: false,
      httpStatus: 409,
      code: 'STEP_ALREADY_HANDLED',
      error: 'This document is already approved by the Technical Team.',
      stepRole: 'Technical Team',
      stepStatus: 'approved',
      actedAt: ACTED_AT,
    });
  });

  it('blocks a late Approve after Legal denied', () => {
    const wf = quoteWorkflow(['approved', 'approved', 'denied', 'pending'], { status: 'denied', currentStep: 3 });
    expect(checkStepUpdateAllowed(wf, 3)).toMatchObject({
      allowed: false,
      httpStatus: 409,
      code: 'STEP_ALREADY_HANDLED',
      error: 'This document is already denied by the Legal Team.',
      stepRole: 'Legal Team',
      stepStatus: 'denied',
    });
  });

  it('names the Team Approval step as the Team Lead', () => {
    const wf = quoteWorkflow(['approved', 'pending', 'pending', 'pending'], { status: 'in_progress', currentStep: 2 });
    expect(checkStepUpdateAllowed(wf, 1).error).toBe('This document is already approved by the Team Lead.');
  });

  it('uses a generic message for other closed statuses', () => {
    const wf = quoteWorkflow(['approved', 'skipped', 'pending', 'pending'], { status: 'in_progress', currentStep: 3 });
    expect(checkStepUpdateAllowed(wf, 2).error).toBe('This step was already completed by the Technical Team.');
  });

  it('reports actedAt as null when the step has no timestamp', () => {
    const wf = manualWorkflow(['approved', 'pending'], { status: 'in_progress', currentStep: 2 });
    expect(checkStepUpdateAllowed(wf, 1)).toMatchObject({ code: 'STEP_ALREADY_HANDLED', actedAt: null });
  });

  it('stops currentStep moving backwards when a stale Team Lead page approves again', () => {
    const wf = quoteWorkflow(['approved', 'approved', 'pending', 'pending'], { status: 'in_progress', currentStep: 3 });
    expect(checkStepUpdateAllowed(wf, 1)).toMatchObject({ allowed: false, code: 'STEP_ALREADY_HANDLED' });
  });
});

describe('checkStepUpdateAllowed — workflow already closed', () => {
  it('blocks later steps once another approver denied, naming who denied', () => {
    const wf = quoteWorkflow(['denied', 'pending', 'pending', 'pending'], { status: 'denied', currentStep: 1 });
    expect(checkStepUpdateAllowed(wf, 2)).toEqual({
      allowed: false,
      httpStatus: 409,
      code: 'WORKFLOW_CLOSED',
      error: 'This document was already denied by the Team Lead.',
      stepRole: 'Team Approval',
      stepStatus: 'denied',
      actedAt: ACTED_AT,
    });
  });

  it('uses a generic denied message when no step records the denial', () => {
    const wf = quoteWorkflow(['pending', 'pending', 'pending', 'pending'], { status: 'denied' });
    expect(checkStepUpdateAllowed(wf, 1)).toMatchObject({
      code: 'WORKFLOW_CLOSED',
      error: 'This document was already denied.',
      stepRole: null,
      stepStatus: null,
      actedAt: null,
    });
  });

  it('blocks an approval-role step once the deal is approved', () => {
    const wf = quoteWorkflow(['approved', 'approved', 'pending', 'pending'], { status: 'approved', currentStep: 3 });
    expect(checkStepUpdateAllowed(wf, 3)).toMatchObject({
      allowed: false,
      httpStatus: 409,
      code: 'WORKFLOW_CLOSED',
      error: 'This document is already approved.',
      stepRole: 'Legal Team',
    });
  });

  it('still lets Legal mark the Deal Desk step as notified after approval', () => {
    const wf = quoteWorkflow(['approved', 'approved', 'approved', 'pending'], { status: 'approved', currentStep: 4 });
    const result = checkStepUpdateAllowed(wf, 4, { status: 'approved', comments: 'Notified' });
    expect(result.allowed).toBe(true);
    expect(result.step?.role).toBe('Deal Desk');
  });

  it('does not let the Deal Desk step deny a deal that is already approved', () => {
    const wf = quoteWorkflow(['approved', 'approved', 'approved', 'pending'], { status: 'approved', currentStep: 4 });
    expect(checkStepUpdateAllowed(wf, 4, { status: 'denied' })).toMatchObject({
      allowed: false,
      httpStatus: 409,
      code: 'WORKFLOW_CLOSED',
      error: 'This document is already approved.',
      stepRole: 'Deal Desk',
    });
  });
});

describe('checkStepUpdateAllowed — approval order', () => {
  it('blocks Legal while the Technical Team has not decided yet', () => {
    const wf = quoteWorkflow(['approved', 'pending', 'pending', 'pending'], { status: 'in_progress', currentStep: 2 });
    expect(checkStepUpdateAllowed(wf, 3)).toEqual({
      allowed: false,
      httpStatus: 409,
      code: 'NOT_CURRENT_STEP',
      error: 'This document is waiting on the Technical Team first.',
      stepRole: 'Legal Team',
      stepStatus: 'pending',
      actedAt: null,
    });
  });

  it('names the Team Lead when step 1 is still open', () => {
    const wf = quoteWorkflow(['pending', 'pending', 'pending', 'pending']);
    expect(checkStepUpdateAllowed(wf, 2).error).toBe('This document is waiting on the Team Lead first.');
  });

  it('uses a generic message when currentStep points at no step', () => {
    const wf = quoteWorkflow(['approved', 'pending', 'pending', 'pending'], { status: 'in_progress', currentStep: 7 });
    expect(checkStepUpdateAllowed(wf, 2)).toMatchObject({
      code: 'NOT_CURRENT_STEP',
      error: 'This step is not open for approval yet.',
    });
  });

  it('allows the Team Lead on a fresh workflow', () => {
    const wf = quoteWorkflow(['pending', 'pending', 'pending', 'pending']);
    expect(checkStepUpdateAllowed(wf, 1)).toEqual({ allowed: true, step: wf.workflowSteps[0] });
  });

  it('allows the overage skip of the Technical step right after the Team Lead approves', () => {
    const wf = quoteWorkflow(['approved', 'pending', 'pending', 'pending'], { status: 'in_progress', currentStep: 2 });
    expect(checkStepUpdateAllowed(wf, 2).allowed).toBe(true);
  });

  it('treats an in_progress step as still open', () => {
    const wf = quoteWorkflow(['approved', 'in_progress', 'pending', 'pending'], { status: 'in_progress', currentStep: 2 });
    expect(checkStepUpdateAllowed(wf, 2).allowed).toBe(true);
  });

  it('accepts currentStep stored as a string', () => {
    const wf = quoteWorkflow(['approved', 'pending', 'pending', 'pending'], { status: 'in_progress', currentStep: '2' });
    expect(checkStepUpdateAllowed(wf, 2).allowed).toBe(true);
  });

  it('walks a legacy two-step manual workflow in order', () => {
    const fresh = manualWorkflow(['pending', 'pending']);
    expect(checkStepUpdateAllowed(fresh, 1).allowed).toBe(true);
    expect(checkStepUpdateAllowed(fresh, 2)).toMatchObject({
      code: 'NOT_CURRENT_STEP',
      error: 'This document is waiting on the Technical Team first.',
    });

    const techDone = manualWorkflow(['approved', 'pending'], { status: 'in_progress', currentStep: 2 });
    expect(checkStepUpdateAllowed(techDone, 2).allowed).toBe(true);
    expect(checkStepUpdateAllowed(techDone, 1).code).toBe('STEP_ALREADY_HANDLED');
  });
});

describe('server.cjs wiring — PUT /api/approval-workflows/:id/step/:stepNumber', () => {
  const serverPath = fileURLToPath(new URL('../../server.cjs', import.meta.url));
  const serverSrc = fs.readFileSync(serverPath, 'utf8');
  const start = serverSrc.search(/app\.put\(\s*['"]\/api\/approval-workflows\/:id\/step\/:stepNumber['"]/);
  const end = serverSrc.indexOf('\napp.', start + 1);
  const route = serverSrc.slice(start, end === -1 ? undefined : end);

  it('loads the shared guard module', () => {
    expect(start).toBeGreaterThan(-1);
    expect(serverSrc).toMatch(/require\(['"]\.\/approval-step-guard\.cjs['"]\)/);
  });

  it('validates the body before touching the database', () => {
    expect(route).toContain('sanitizeStepUpdates(req.body)');
    expect(route).not.toMatch(/stepUpdates\s*=\s*req\.body/);
    expect(route.indexOf('sanitizeStepUpdates(')).toBeLessThan(route.indexOf('.findOne('));
  });

  it('writes only through the guarded helper with a strictly parsed step number', () => {
    expect(route).toContain('applyStepUpdate(workflows, workflow, parseStepNumber(stepNumber), stepUpdates)');
    expect(route).not.toContain('.updateOne(');
  });

  it('emails the creator about a denial only after the guarded write succeeded', () => {
    const write = route.indexOf('applyStepUpdate(');
    const rejected = route.indexOf('if (!outcome.allowed)');
    expect(write).toBeGreaterThan(-1);
    expect(rejected).toBeGreaterThan(write);
    expect(route.indexOf('notifyCreatorOfDenial(')).toBeGreaterThan(rejected);
  });

  it('shares the completion rule with the workflow list instead of keeping a second copy', () => {
    expect(serverSrc).not.toMatch(/function areAllApprovalStepsComplete\(/);
    expect(serverSrc).toContain('areAllApprovalStepsComplete(workflow.workflowSteps)');
  });
});

const NOW = new Date('2026-09-29T08:00:00.000Z');

describe('planStepWrite', () => {
  it('moves an in-progress quote to the next step on approval', () => {
    const wf = quoteWorkflow(['approved', 'pending', 'pending', 'pending'], { status: 'in_progress', currentStep: 2 });
    const plan = planStepWrite(wf, wf.workflowSteps[1], 2, { status: 'approved' }, NOW);

    expect(plan.nextStatus).toBe('in_progress');
    expect(plan.update.$set).toEqual({
      currentStep: 3,
      status: 'in_progress',
      updatedAt: NOW.toISOString(),
      'workflowSteps.$[target].status': 'approved',
      'workflowSteps.$[target].timestamp': NOW.toISOString(),
    });
  });

  it('matches the exact state it validated so a teammate who acted first wins', () => {
    const wf = quoteWorkflow(['approved', 'pending', 'pending', 'pending'], { status: 'in_progress', currentStep: 2 });
    const plan = planStepWrite(wf, wf.workflowSteps[1], 2, { status: 'approved' }, NOW);

    expect(plan.filter).toEqual({
      id: 'wf-1',
      status: 'in_progress',
      currentStep: 2,
      workflowSteps: { $elemMatch: { step: 2, status: 'pending' } },
    });
    expect(plan.options).toEqual({ arrayFilters: [{ 'target.step': 2, 'target.status': 'pending' }] });
  });

  it('never rewrites the whole step list, so a concurrent comment on the step survives', () => {
    const wf = quoteWorkflow(['approved', 'pending', 'pending', 'pending'], { status: 'in_progress', currentStep: 2 });
    const plan = planStepWrite(wf, wf.workflowSteps[1], 2, { status: 'approved' }, NOW);

    expect(plan.update.$set).not.toHaveProperty('workflowSteps');
    expect(plan.update.$set).not.toHaveProperty('workflowSteps.$[target].comments');
  });

  it('keeps the workflow state on a comment-only save', () => {
    const wf = quoteWorkflow(['approved', 'pending', 'pending', 'pending'], { status: 'in_progress', currentStep: 2 });
    const plan = planStepWrite(wf, wf.workflowSteps[1], 2, { comments: 'Checking scope' }, NOW);

    expect(plan.update.$set).toMatchObject({
      currentStep: 2,
      status: 'in_progress',
      'workflowSteps.$[target].comments': 'Checking scope',
    });
    expect(plan.update.$set).not.toHaveProperty('workflowSteps.$[target].status');
  });

  it('approves the deal when Legal signs off the last approval step of a quote', () => {
    const wf = quoteWorkflow(['approved', 'approved', 'pending', 'pending'], { status: 'in_progress', currentStep: 3 });
    const plan = planStepWrite(wf, wf.workflowSteps[2], 3, { status: 'approved' }, NOW);

    expect(plan.nextStatus).toBe('approved');
    expect(plan.update.$set).toMatchObject({ currentStep: 4, status: 'approved' });
  });

  it('denies the deal and leaves currentStep where the denial happened', () => {
    const wf = quoteWorkflow(['approved', 'pending', 'pending', 'pending'], { status: 'in_progress', currentStep: 2 });
    const plan = planStepWrite(wf, wf.workflowSteps[1], 2, { status: 'denied', comments: 'Scope unclear' }, NOW);

    expect(plan.nextStatus).toBe('denied');
    expect(plan.update.$set).toMatchObject({
      currentStep: 2,
      status: 'denied',
      'workflowSteps.$[target].status': 'denied',
      'workflowSteps.$[target].comments': 'Scope unclear',
    });
  });

  it('does not approve the whole deal on step 1 of an old record without totalSteps', () => {
    const wf = quoteWorkflow(['pending', 'pending', 'pending', 'pending'], { totalSteps: undefined as unknown as number });
    const plan = planStepWrite(wf, wf.workflowSteps[0], 1, { status: 'approved' }, NOW);

    expect(plan.nextStatus).toBe('in_progress');
    expect(plan.update.$set.currentStep).toBe(2);
  });

  it('reuses the stored step value so string-numbered steps still match', () => {
    const wf = quoteWorkflow(['approved', 'pending', 'pending', 'pending'], { status: 'in_progress', currentStep: 2 });
    wf.workflowSteps[1].step = '2';
    const plan = planStepWrite(wf, wf.workflowSteps[1], 2, { status: 'approved' }, NOW);

    expect(plan.filter.workflowSteps).toEqual({ $elemMatch: { step: '2', status: 'pending' } });
    expect(plan.options.arrayFilters[0]['target.step']).toBe('2');
  });
});

function fakeCollection(matchedCount: number, latest: Workflow | null = null): FakeCollection {
  return {
    updateOne: vi.fn().mockResolvedValue({ matchedCount }),
    findOne: vi.fn().mockResolvedValue(latest),
  };
}

describe('applyStepUpdate', () => {
  const techTurn = () =>
    quoteWorkflow(['approved', 'pending', 'pending', 'pending'], { status: 'in_progress', currentStep: 2 });

  it('writes once and reports success when the step is still open', async () => {
    const wf = techTurn();
    const collection = fakeCollection(1);

    const outcome = await applyStepUpdate(collection, wf, 2, { status: 'approved' }, NOW);

    expect(outcome).toEqual({ allowed: true, step: wf.workflowSteps[1], nextStatus: 'in_progress' });
    expect(collection.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, options] = collection.updateOne.mock.calls[0];
    expect(filter).toMatchObject({ id: 'wf-1', workflowSteps: { $elemMatch: { step: 2, status: 'pending' } } });
    expect(update.$set['workflowSteps.$[target].status']).toBe('approved');
    expect(options.arrayFilters).toEqual([{ 'target.step': 2, 'target.status': 'pending' }]);
    expect(collection.findOne).not.toHaveBeenCalled();
  });

  it('does not write at all when the stale page is already out of date', async () => {
    const wf = quoteWorkflow(['approved', 'approved', 'pending', 'pending'], { status: 'in_progress', currentStep: 3 });
    const collection = fakeCollection(1);

    const outcome = await applyStepUpdate(collection, wf, 2, { status: 'denied' }, NOW);

    expect(outcome).toMatchObject({ allowed: false, httpStatus: 409, code: 'STEP_ALREADY_HANDLED' });
    expect(collection.updateOne).not.toHaveBeenCalled();
  });

  it('tells the losing click what the teammate did when both passed the first check', async () => {
    const teammateApproved = quoteWorkflow(['approved', 'approved', 'pending', 'pending'], {
      status: 'in_progress',
      currentStep: 3,
    });
    const collection = fakeCollection(0, teammateApproved);

    const outcome = await applyStepUpdate(collection, techTurn(), 2, { status: 'denied' }, NOW);

    expect(outcome).toMatchObject({
      allowed: false,
      httpStatus: 409,
      code: 'STEP_ALREADY_HANDLED',
      error: 'This document is already approved by the Technical Team.',
      lostRace: true,
    });
    expect(collection.findOne).toHaveBeenCalledWith({ id: 'wf-1' });
  });

  it('returns a retryable CONFLICT when the write missed but the step is still open', async () => {
    const collection = fakeCollection(0, techTurn());

    const outcome = await applyStepUpdate(collection, techTurn(), 2, { status: 'approved' }, NOW);

    expect(outcome).toMatchObject({
      allowed: false,
      httpStatus: 409,
      code: 'CONFLICT',
      error: 'Someone else just updated this document. Please refresh and try again.',
      lostRace: true,
    });
  });

  it('reports STEP_NOT_FOUND when the workflow was deleted mid-request', async () => {
    const collection = fakeCollection(0, null);

    const outcome = await applyStepUpdate(collection, techTurn(), 2, { status: 'approved' }, NOW);

    expect(outcome).toMatchObject({ allowed: false, httpStatus: 404, code: 'STEP_NOT_FOUND', lostRace: true });
  });
});
