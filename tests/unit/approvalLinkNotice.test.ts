import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApprovalLinkNotice } from '../../src/utils/approvalLinkNotice';
import type { ApprovalStep, ApprovalWorkflow } from '../../src/types/approval';

const ACTED_AT = '2026-09-28T09:05:00.000Z';

// Newer ICU puts a narrow no-break space before AM/PM, so compare with plain spaces
const plain = (text: string | undefined) => text?.replace(/\s/g, ' ');

function step(n: number, role: string, status: ApprovalStep['status'], timestamp?: string): ApprovalStep {
  return { step: n, role, email: `${role.split(' ')[0].toLowerCase()}@cpq12.test`, status, ...(timestamp ? { timestamp } : {}) };
}

function workflow(status: ApprovalWorkflow['status'], steps: ApprovalStep[]): Pick<ApprovalWorkflow, 'status' | 'workflowSteps'> {
  return { status, workflowSteps: steps };
}

const quoteSteps = (team: ApprovalStep['status'], tech: ApprovalStep['status'], legal: ApprovalStep['status'], timestamp?: string) => [
  step(1, 'Team Approval', team, team === 'pending' ? undefined : timestamp),
  step(2, 'Technical Team', tech, tech === 'pending' ? undefined : timestamp),
  step(3, 'Legal Team', legal, legal === 'pending' ? undefined : timestamp),
  step(4, 'Deal Desk', 'pending'),
];

const originalTz = process.env.TZ;

beforeAll(() => {
  // Pin the zone so the formatted date is the same on every machine
  process.env.TZ = 'UTC';
});

afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe('getApprovalLinkNotice', () => {
  it('a. own step approved: names the team and when it happened', () => {
    const notice = getApprovalLinkNotice(workflow('in_progress', quoteSteps('approved', 'approved', 'pending', ACTED_AT)), 'Technical Team');

    expect(notice?.tone).toBe('approved');
    expect(plain(notice?.message)).toBe('This document is already approved by the Technical Team on Sep 28, 2026, 9:05 AM.');
  });

  it('a. labels the Team Approval step as the Team Lead', () => {
    const notice = getApprovalLinkNotice(workflow('in_progress', quoteSteps('approved', 'pending', 'pending', ACTED_AT)), 'Team Approval');

    expect(plain(notice?.message)).toBe('This document is already approved by the Team Lead on Sep 28, 2026, 9:05 AM.');
  });

  it('a. wins over a later denial by another team', () => {
    const notice = getApprovalLinkNotice(workflow('denied', quoteSteps('approved', 'approved', 'denied', ACTED_AT)), 'Technical Team');

    expect(notice?.tone).toBe('approved');
    expect(plain(notice?.message)).toBe('This document is already approved by the Technical Team on Sep 28, 2026, 9:05 AM.');
  });

  it('b. own step denied', () => {
    const notice = getApprovalLinkNotice(workflow('denied', quoteSteps('approved', 'approved', 'denied', ACTED_AT)), 'Legal Team');

    expect(notice?.tone).toBe('denied');
    expect(plain(notice?.message)).toBe('This document was already denied by the Legal Team on Sep 28, 2026, 9:05 AM.');
  });

  it('c. another team denied it: names that team and its date', () => {
    const notice = getApprovalLinkNotice(workflow('denied', quoteSteps('denied', 'pending', 'pending', ACTED_AT)), 'Legal Team');

    expect(notice?.tone).toBe('denied');
    expect(plain(notice?.message)).toBe('This document was denied by the Team Lead on Sep 28, 2026, 9:05 AM.');
  });

  it('c. falls back to a plain denial message when no step is marked denied', () => {
    const notice = getApprovalLinkNotice(workflow('denied', quoteSteps('approved', 'pending', 'pending', ACTED_AT)), 'Technical Team');

    expect(notice).toEqual({ tone: 'denied', message: 'This document was denied.' });
  });

  it('d. workflow approved while this step never recorded a decision', () => {
    const notice = getApprovalLinkNotice(workflow('approved', quoteSteps('approved', 'approved', 'pending', ACTED_AT)), 'Legal Team');

    expect(notice).toEqual({ tone: 'approved', message: 'This document is already approved.' });
  });

  it('e. own step pending and current: no notice, so Approve/Deny still show', () => {
    expect(getApprovalLinkNotice(workflow('in_progress', quoteSteps('approved', 'pending', 'pending', ACTED_AT)), 'Technical Team')).toBeNull();
  });

  it('e. own step pending but not yet current: no notice', () => {
    expect(getApprovalLinkNotice(workflow('pending', quoteSteps('pending', 'pending', 'pending')), 'Legal Team')).toBeNull();
  });

  it('omits the date when the step has no timestamp', () => {
    const notice = getApprovalLinkNotice(workflow('in_progress', quoteSteps('approved', 'approved', 'pending')), 'Technical Team');

    expect(notice?.message).toBe('This document is already approved by the Technical Team.');
  });

  it('omits the date when the timestamp is not a valid date', () => {
    const notice = getApprovalLinkNotice(workflow('denied', [step(1, 'Team Approval', 'denied', 'not-a-date')]), 'Team Approval');

    expect(notice?.message).toBe('This document was already denied by the Team Lead.');
  });

  it('finds the step by role in a legacy manual 2-step workflow', () => {
    const manual = workflow('in_progress', [step(1, 'Technical Team', 'approved', ACTED_AT), step(2, 'Legal Team', 'pending')]);

    expect(plain(getApprovalLinkNotice(manual, 'Technical Team')?.message)).toBe('This document is already approved by the Technical Team on Sep 28, 2026, 9:05 AM.');
    expect(getApprovalLinkNotice(manual, 'Legal Team')).toBeNull();
  });

  it('returns null when the workflow or its steps are missing', () => {
    expect(getApprovalLinkNotice(null, 'Technical Team')).toBeNull();
    expect(getApprovalLinkNotice(undefined, 'Technical Team')).toBeNull();
    expect(getApprovalLinkNotice({ status: 'denied' } as unknown as ApprovalWorkflow, 'Legal Team')).toBeNull();
    expect(getApprovalLinkNotice({ status: 'approved', workflowSteps: null } as unknown as ApprovalWorkflow, 'Legal Team')).toBeNull();
  });
});
