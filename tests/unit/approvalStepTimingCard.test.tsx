// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { email: 'rep@cpq12.test' } }),
}));

// pdfjs-dist needs DOMMatrix, which jsdom lacks; the viewer only renders inside the preview modal
vi.mock('../../src/components/PdfCanvasViewer', () => ({ default: () => null }));

// Wrapped so the test can prove the minute tick does not re-render the whole dashboard
vi.mock('../../src/utils/approvalTiming', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/approvalTiming')>();
  return { ...actual, computeApprovalTiming: vi.fn(actual.computeApprovalTiming) };
});

import ApprovalDashboard from '../../src/components/ApprovalDashboard';
import { approvalWorkflowServiceMongoDB } from '../../src/services/approvalWorkflowServiceMongoDB';
import { computeApprovalTiming } from '../../src/utils/approvalTiming';
import type { ApprovalStep, ApprovalWorkflow } from '../../src/types/approval';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const CREATED_MS = Date.parse('2026-09-20T10:00:00.000Z');
const TEAM_MS = CREATED_MS + 2 * HOUR + 15 * MIN;
const TECH_MS = TEAM_MS + DAY + 4 * HOUR;
const NOW_MS = TECH_MS + 6 * HOUR + 10 * MIN;
const iso = (ms: number) => new Date(ms).toISOString();

const ROLES = ['Team Approval', 'Technical Team', 'Legal Team', 'Deal Desk'];
const WITH_MM = [...ROLES, 'Migration Manager'];

function makeWorkflow(
  status: ApprovalWorkflow['status'],
  steps: Partial<ApprovalStep>[],
  roles: string[] = ROLES,
): ApprovalWorkflow {
  return {
    id: 'wf-1',
    documentId: 'Acme_Corp_SOW_001',
    documentType: 'SOW',
    clientName: 'Acme Corp',
    amount: 1000,
    creatorEmail: 'rep@cpq12.test',
    creatorName: 'Sales Rep',
    status,
    currentStep: 3,
    totalSteps: roles.length,
    workflowSteps: roles.map((role, i) => ({
      step: i + 1,
      role,
      email: `step${i + 1}@cpq12.test`,
      status: 'pending',
      ...steps[i],
    })),
    createdAt: iso(CREATED_MS),
    updatedAt: iso(NOW_MS),
  };
}

const OPEN = makeWorkflow('in_progress', [
  { status: 'approved', timestamp: iso(TEAM_MS) },
  { status: 'approved', timestamp: iso(TECH_MS) },
]);

const LEGAL_MS = TECH_MS + 6 * HOUR;
const DEAL_DESK_MS = LEGAL_MS + 2 * HOUR;
const WITH_HIDDEN_DEAL_DESK = makeWorkflow(
  'approved',
  [
    { status: 'approved', timestamp: iso(TEAM_MS) },
    { status: 'approved', timestamp: iso(TECH_MS) },
    { status: 'approved', timestamp: iso(LEGAL_MS) },
    { status: 'notified', timestamp: iso(DEAL_DESK_MS) },
    { status: 'approved', timestamp: iso(DEAL_DESK_MS + HOUR) },
  ],
  WITH_MM,
);

async function renderWith(workflow: ApprovalWorkflow) {
  vi.spyOn(approvalWorkflowServiceMongoDB, 'getAllWorkflows').mockResolvedValue([workflow]);
  render(
    <MemoryRouter initialEntries={['/approval']}>
      <ApprovalDashboard />
    </MemoryRouter>,
  );
  await act(async () => {});
  expect(screen.getByText('Acme Corp')).toBeInTheDocument();
}

const stepperText = () => screen.getByText('Approvals').closest('div.rounded-lg')?.textContent ?? '';

let fetchGuard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  // GET /api/approval-workflows writes to the live DB, so any real request must fail loudly
  fetchGuard = vi.fn(() => Promise.reject(new Error('Network calls are not allowed in this test')));
  vi.stubGlobal('fetch', fetchGuard);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  const realFetchCalls = fetchGuard.mock.calls.length;
  // vitest.config.ts does not enable globals, so RTL's auto-cleanup never registers
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(computeApprovalTiming).mockClear();
  vi.unstubAllGlobals();
  expect(realFetchCalls).toBe(0);
});

describe('Approval card step timing', () => {
  it('shows each step time, the live wait and the total so far', async () => {
    await renderWith(OPEN);

    expect(screen.getByText('2h 15m')).toBeInTheDocument();
    expect(screen.getByText('1d 4h')).toBeInTheDocument();
    expect(screen.getByText('waiting 6h 10m')).toBeInTheDocument();
    expect(screen.getByText('Total so far: 1d 12h')).toBeInTheDocument();
  });

  it('updates only the live labels when a minute passes', async () => {
    await renderWith(OPEN);
    const dashboardRenders = vi.mocked(computeApprovalTiming).mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByText('waiting 6h 11m')).toBeInTheDocument();
    expect(screen.queryByText('waiting 6h 10m')).toBeNull();
    expect(screen.getByText('2h 15m')).toBeInTheDocument();
    expect(screen.getByText('Total so far: 1d 12h')).toBeInTheDocument();
    expect(vi.mocked(computeApprovalTiming).mock.calls.length).toBe(dashboardRenders);
  });

  it('shows the rejection time and a closed total for a denied workflow', async () => {
    await renderWith(
      makeWorkflow('denied', [
        { status: 'approved', timestamp: iso(TEAM_MS) },
        { status: 'denied', timestamp: iso(TEAM_MS + 3 * HOUR) },
      ]),
    );

    expect(screen.getByText('rejected after 3h')).toBeInTheDocument();
    expect(screen.getByText('Total: 5h 15m')).toBeInTheDocument();
    expect(screen.queryByText(/^waiting/)).toBeNull();
  });

  it('shows — and never NaN or a minus sign for an old record with no timestamps', async () => {
    await renderWith(
      makeWorkflow('approved', [{ status: 'approved' }, { status: 'approved' }, { status: 'approved' }]),
    );

    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('Total: —')).toBeInTheDocument();
    expect(stepperText()).not.toMatch(/NaN|-\d|−/);
  });

  it('shows the real decision time and step time in the step tooltip', async () => {
    await renderWith(OPEN);

    const teamTitle = screen.getByTitle(/^Team: approved/).getAttribute('title');
    expect(teamTitle).toContain(`Time: ${new Date(TEAM_MS).toLocaleString()}`);
    expect(teamTitle).toContain('Took: 2h 15m');
    const legalTitle = screen.getByTitle(/^Legal: pending/).getAttribute('title');
    expect(legalTitle).not.toContain('Time:');
    expect(legalTitle).toContain(`Waiting since: ${new Date(TECH_MS).toLocaleString()}`);
  });

  it('keeps the column tooltip when hovering the time label', async () => {
    await renderWith(OPEN);

    expect(screen.getByText('2h 15m')).not.toHaveAttribute('title');
    expect(screen.getByText('waiting 6h 10m')).not.toHaveAttribute('title');
  });

  it('shows "Total: —" for a workflow the requester cancelled', async () => {
    await renderWith(makeWorkflow('denied', [{ status: 'approved', timestamp: iso(TEAM_MS) }]));

    expect(screen.getByText('Total: —')).toBeInTheDocument();
    expect(screen.queryByText(/^waiting/)).toBeNull();
    expect(screen.queryByText(/^rejected after/)).toBeNull();
  });

  it('names hidden Deal Desk time in the total tooltip', async () => {
    await renderWith(WITH_HIDDEN_DEAL_DESK);

    const total = screen.getByText('Total: 1d 15h');
    expect(total).toHaveAttribute('title', 'Total: 1d 15h\nIncludes 2h on Deal Desk (not shown)');
    expect(screen.getByText('1h')).toBeInTheDocument();
  });

  it('leaves out the hidden-time note when the total is unknown', async () => {
    const steps = WITH_HIDDEN_DEAL_DESK.workflowSteps.map((step) =>
      step.role === 'Migration Manager' ? { ...step, timestamp: 'not-a-date' } : step,
    );
    await renderWith({ ...WITH_HIDDEN_DEAL_DESK, workflowSteps: steps });

    expect(screen.getByText('Total: —')).toHaveAttribute('title', 'Total: —');
  });
});
