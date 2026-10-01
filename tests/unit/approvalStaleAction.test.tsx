// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// pdfjs-dist needs DOMMatrix, which jsdom lacks; both viewers only render inside the preview modal
vi.mock('../../src/components/PdfCanvasViewer', () => ({ default: () => null }));
vi.mock('../../src/components/EsignPdfPageView', () => ({ default: () => null }));

import TeamApprovalDashboard from '../../src/components/TeamApprovalDashboard';
import TechnicalTeamApprovalDashboard from '../../src/components/TechnicalTeamApprovalDashboard';
import LegalTeamApprovalDashboard from '../../src/components/LegalTeamApprovalDashboard';
import type { ApprovalWorkflow } from '../../src/types/approval';

const ROLES = ['Team Approval', 'Technical Team', 'Legal Team', 'Deal Desk'];
const LIST = '/api/approval-workflows';
const LINK = '/api/approval-workflows/wf-1';
const PREVIEW = '/api/documents/Acme_Corp_SOW_001/preview';
// Midday UTC stays on Sep 28 in every zone the test machines use
const ACTED_AT = '2026-09-28T12:00:00.000Z';
const SUCCESS_TOAST = /approved successfully|approval recorded/i;

function makeWorkflow(currentStep: number): ApprovalWorkflow {
  return {
    id: 'wf-1',
    documentId: 'Acme_Corp_SOW_001',
    documentType: 'SOW',
    clientName: 'Acme Corp',
    amount: 5000,
    creatorEmail: 'rep@cpq12.test',
    creatorName: 'Sales Rep',
    status: currentStep === 1 ? 'pending' : 'in_progress',
    currentStep,
    totalSteps: 4,
    workflowSteps: ROLES.map((role, i) => ({
      step: i + 1,
      role,
      email: `${role.split(' ')[0].toLowerCase()}@cpq12.test`,
      status: i + 1 < currentStep ? 'approved' : 'pending',
    })),
    createdAt: '2026-09-28T08:00:00.000Z',
    updatedAt: '2026-09-28T08:00:00.000Z',
  };
}

function deniedAt(step: number): ApprovalWorkflow {
  const wf = makeWorkflow(step);
  wf.status = 'denied';
  wf.workflowSteps[step - 1].status = 'denied';
  return wf;
}

type StepReply = (stepNumber: number) => { status: number; body: unknown };

const ok: StepReply = () => ({ status: 200, body: { success: true, message: 'Workflow step updated successfully' } });
const serverError: StepReply = () => ({ status: 500, body: { success: false, error: 'Database not available' } });
const conflict = (error: string, code = 'STEP_ALREADY_HANDLED'): StepReply => () => ({
  status: 409,
  body: { success: false, code, error },
});

let requests: Array<{ method: string; path: string; body?: Record<string, unknown> }>;
let unexpected: string[];
let alertSpy: ReturnType<typeof vi.spyOn>;

function jsonResponse(status: number, body: unknown): Response {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => JSON.parse(text),
  } as unknown as Response;
}

// Every request is answered here, so nothing can reach a real backend (the local .env points at production)
function stubBackend({ lists, stepReply = ok, links = [], linkMissing = false }: { lists: ApprovalWorkflow[][]; stepReply?: StepReply; links?: ApprovalWorkflow[]; linkMissing?: boolean }) {
  let listCalls = 0;
  let linkCalls = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, '');
    const method = (init?.method || 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ method, path, body });

    if (method === 'GET' && path === LIST) {
      const list = lists[Math.min(listCalls++, lists.length - 1)];
      return jsonResponse(200, { success: true, workflows: list });
    }
    if (method === 'GET' && path === LINK && linkMissing) {
      return jsonResponse(404, { success: false, error: 'Workflow not found' });
    }
    if (method === 'GET' && path === LINK && links.length > 0) {
      return jsonResponse(200, { success: true, workflow: links[Math.min(linkCalls++, links.length - 1)] });
    }
    const stepMatch = method === 'PUT' ? path.match(/^\/api\/approval-workflows\/wf-1\/step\/(\d+)$/) : null;
    if (stepMatch) {
      const reply = stepReply(Number(stepMatch[1]));
      return jsonResponse(reply.status, reply.body);
    }
    if (method === 'POST' && path.startsWith('/api/send-')) return jsonResponse(200, { success: true });
    if (method === 'GET' && /^\/api\/documents\/[^/]+\/preview$/.test(path)) return jsonResponse(404, { success: false });

    unexpected.push(`${method} ${path}`);
    throw new Error(`Unexpected request in test: ${method} ${path}`);
  }));
}

const count = (method: string, path: string) => requests.filter(r => r.method === method && r.path === path).length;
const stepPuts = () => requests.filter(r => r.method === 'PUT');

async function renderAndOpen(Component: React.ComponentType) {
  render(<Component />);
  fireEvent.click(await screen.findByRole('button', { name: 'View Document' }));
  return screen.findByRole('button', { name: 'Approve' });
}

const CASES = [
  {
    team: 'Team Lead',
    Component: TeamApprovalDashboard,
    step: 1,
    nextTeamEmail: '/api/send-manager-email',
    approveFailed: '❌ Failed to approve. Please try again.',
    readOnlyText: 'Viewing from Workflow Status',
  },
  {
    team: 'Technical Team',
    Component: TechnicalTeamApprovalDashboard,
    step: 2,
    nextTeamEmail: '/api/send-ceo-email',
    approveFailed: '❌ Failed to approve workflow. Please try again.',
    readOnlyText: 'Read-only view from Workflow Status',
  },
  {
    team: 'Legal Team',
    Component: LegalTeamApprovalDashboard,
    step: 3,
    nextTeamEmail: '/api/send-deal-desk-email',
    approveFailed: '❌ Failed to approve workflow. Please try again.',
    readOnlyText: 'Read-only view from Workflow Status',
  },
];

beforeEach(() => {
  requests = [];
  unexpected = [];
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  // vitest.config.ts does not enable globals, so RTL's auto-cleanup never registers
  cleanup();
  // Success toasts are appended straight to <body> and outlive the rendered tree
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(unexpected).toEqual([]);
});

describe.each(CASES)('$team dashboard — action after a teammate already acted', ({ team, Component, step, nextTeamEmail, approveFailed }) => {
  const alreadyApproved = `This document is already approved by the ${team}.`;
  const alreadyDenied = `This document was already denied by the ${team}.`;
  const stepPath = `/api/approval-workflows/wf-1/step/${step}`;

  it('shows the teammate message on Approve, skips the next-team email and reloads the real status', async () => {
    stubBackend({ lists: [[makeWorkflow(step)], [makeWorkflow(step + 1)]], stepReply: conflict(alreadyApproved) });
    const approve = await renderAndOpen(Component);
    expect(alertSpy).not.toHaveBeenCalled();

    fireEvent.click(approve);

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(alreadyApproved));
    await waitFor(() => expect(count('GET', LIST)).toBe(2));
    expect(await screen.findByText('No items in your approval queue.')).toBeInTheDocument();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(count('POST', nextTeamEmail)).toBe(0);
    expect(stepPuts().map(r => r.path)).toEqual([stepPath]);
    expect(document.body.textContent).not.toMatch(SUCCESS_TOAST);
  });

  it('keeps this workflow\'s buttons hidden after a 409 even if the reloaded list still shows it pending', async () => {
    stubBackend({ lists: [[makeWorkflow(step)]], stepReply: conflict(alreadyApproved) });
    fireEvent.click(await renderAndOpen(Component));
    await waitFor(() => expect(count('GET', LIST)).toBe(2));

    fireEvent.click(await screen.findByRole('button', { name: 'View Document' }));

    expect(await screen.findByText('This workflow is no longer awaiting your approval')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Deny' })).toBeNull();
  });

  it('shows the teammate message on Deny and closes the reason and document modals', async () => {
    stubBackend({ lists: [[makeWorkflow(step)], [deniedAt(step)]], stepReply: conflict(alreadyDenied, 'WORKFLOW_CLOSED') });
    await renderAndOpen(Component);

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(alertSpy).toHaveBeenCalledWith('⚠️ Please provide a reason for denial before proceeding.');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Pricing is wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & Deny' }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(alreadyDenied));
    await waitFor(() => expect(count('GET', LIST)).toBe(2));
    expect(alertSpy).not.toHaveBeenCalledWith(expect.stringMatching(/denied successfully|Team denied the request/));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Deny' })).toBeNull();
    expect(stepPuts()).toEqual([{ method: 'PUT', path: stepPath, body: { status: 'denied', comments: 'Pricing is wrong' } }]);
  });

  it('shows the teammate message when saving a comment instead of a false success', async () => {
    stubBackend({ lists: [[makeWorkflow(step)], [makeWorkflow(step + 1)]], stepReply: conflict(alreadyApproved) });
    await renderAndOpen(Component);

    fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Please check the SOW dates' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Comment' }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(alreadyApproved));
    await waitFor(() => expect(count('GET', LIST)).toBe(2));
    expect(alertSpy).not.toHaveBeenCalledWith('✅ Comment added successfully!');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    const [put] = stepPuts();
    expect(put.path).toBe(stepPath);
    expect(put.body).toMatchObject({ comments: 'Please check the SOW dates' });
    expect(put.body).not.toHaveProperty('status');
  });

  it('still notifies the next team and shows the success toast on a normal approve', async () => {
    stubBackend({ lists: [[makeWorkflow(step)]], stepReply: ok });
    fireEvent.click(await renderAndOpen(Component));

    await waitFor(() => expect(count('POST', nextTeamEmail)).toBe(1));
    await waitFor(() => expect(document.body.textContent).toMatch(SUCCESS_TOAST));
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(count('GET', LIST)).toBe(1);
  });

  it('keeps the old failure alert and re-enables Approve on a non-409 error', async () => {
    stubBackend({ lists: [[makeWorkflow(step)]], stepReply: serverError });
    fireEvent.click(await renderAndOpen(Component));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(approveFailed));
    expect(alertSpy).not.toHaveBeenCalledWith('Database not available');
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(count('POST', nextTeamEmail)).toBe(0);
    expect(count('GET', LIST)).toBe(1);
  });

  it('lets the approver retry after a CONFLICT because the step is still open', async () => {
    const busy = 'Someone else just updated this document. Please refresh and try again.';
    stubBackend({ lists: [[makeWorkflow(step)]], stepReply: conflict(busy, 'CONFLICT') });
    fireEvent.click(await renderAndOpen(Component));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(approveFailed));
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(count('POST', nextTeamEmail)).toBe(0);
    expect(count('GET', LIST)).toBe(1);
  });

  it('keeps the old failure alert when a comment save fails for another reason', async () => {
    stubBackend({ lists: [[makeWorkflow(step)]], stepReply: serverError });
    await renderAndOpen(Component);

    fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Please check the SOW dates' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Comment' }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('❌ Failed to add comment. Please try again.'));
    expect(alertSpy).not.toHaveBeenCalledWith('✅ Comment added successfully!');
    expect(screen.getByRole('textbox')).toHaveValue('Please check the SOW dates');
    expect(count('GET', LIST)).toBe(1);
  });
});

function approvedBy(step: number): ApprovalWorkflow {
  const wf = makeWorkflow(step + 1);
  wf.workflowSteps[step - 1].timestamp = ACTED_AT;
  return wf;
}

// The requester's Cancel Approval marks only the workflow denied, never a step
function cancelledByRequester(step: number): ApprovalWorkflow {
  const wf = makeWorkflow(step);
  wf.status = 'denied';
  return wf;
}

function deniedBy(step: number): ApprovalWorkflow {
  const wf = deniedAt(step);
  wf.workflowSteps[step - 1].timestamp = ACTED_AT;
  return wf;
}

// Gives the list load, the link fetch and any reopen attempt time to land
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));

function renderFromEmailLink(Component: React.ComponentType<{ initialWorkflowId?: string }>) {
  return render(<Component initialWorkflowId="wf-1" />);
}

describe.each(CASES)('$team dashboard — opening the approval email link', ({ team, Component, step, nextTeamEmail, readOnlyText }) => {
  const approvedText = new RegExp(`^This document is already approved by the ${team} on Sep 28, 2026, .+\\.$`);
  const deniedText = new RegExp(`^This document was already denied by the ${team} on Sep 28, 2026, .+\\.$`);

  it('shows "already approved" in the banner and the read-only document when this team already approved', async () => {
    stubBackend({ lists: [[approvedBy(step)]], links: [approvedBy(step)] });
    renderFromEmailLink(Component);

    expect(await screen.findByRole('heading', { name: 'Document Preview' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(approvedText)).toHaveLength(2));
    await settle();

    expect(within(screen.getByRole('status')).getByText(approvedText)).toBeInTheDocument();
    expect(screen.getAllByText(approvedText)[0].closest('div')).toHaveClass('bg-green-50');
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Deny' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add Comment' })).toBeNull();
    expect(screen.queryByText(readOnlyText)).toBeNull();
    expect(screen.queryByText('This workflow is no longer awaiting your approval')).toBeNull();
    expect(count('GET', PREVIEW)).toBe(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('shows "already denied" when this team denied it', async () => {
    stubBackend({ lists: [[deniedBy(step)]], links: [deniedBy(step)] });
    renderFromEmailLink(Component);

    await waitFor(() => expect(screen.getAllByText(deniedText)).toHaveLength(2));
    await settle();

    expect(screen.getAllByText(deniedText)[0].closest('div')).toHaveClass('bg-red-50');
    expect(screen.getByRole('heading', { name: 'Document Preview' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Deny' })).toBeNull();
    expect(count('GET', PREVIEW)).toBe(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('shows "cancelled by the requester" when the requester cancelled it', async () => {
    stubBackend({ lists: [[cancelledByRequester(step)]], links: [cancelledByRequester(step)] });
    renderFromEmailLink(Component);

    await waitFor(() => expect(screen.getAllByText('This approval was cancelled by the requester.')).toHaveLength(2));
    await settle();

    expect(screen.getByRole('heading', { name: 'Document Preview' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Deny' })).toBeNull();
    expect(screen.queryByText(/denied/)).toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('shows "deleted by the requester" when the approval was deleted, and does not keep retrying', async () => {
    stubBackend({ lists: [[]], linkMissing: true });
    renderFromEmailLink(Component);

    const notice = await within(await screen.findByRole('status')).findByText('This approval request was deleted by the requester.');
    await waitFor(() => expect(count('GET', LIST)).toBe(1));
    await settle();

    expect(notice.closest('div')).toHaveClass('bg-red-50');
    expect(screen.queryByRole('heading', { name: 'Document Preview' })).toBeNull();
    expect(count('GET', LINK)).toBe(1);
    expect(count('GET', PREVIEW)).toBe(0);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('dismissing the banner clears the notice', async () => {
    stubBackend({ lists: [[approvedBy(step)]], links: [approvedBy(step)] });
    renderFromEmailLink(Component);
    await waitFor(() => expect(screen.getAllByText(approvedText)).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }));

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(approvedText)).toBeNull();
    expect(screen.getByText(readOnlyText)).toBeInTheDocument();
  });

  it('still opens with Approve and Deny, and no notice, when the link is awaiting this team', async () => {
    stubBackend({ lists: [[makeWorkflow(step)]], links: [makeWorkflow(step)] });
    renderFromEmailLink(Component);

    expect(await screen.findByRole('button', { name: 'Approve' })).toBeEnabled();
    await settle();

    expect(screen.getByRole('button', { name: 'Deny' })).toBeEnabled();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dismiss notice' })).toBeNull();
    expect(screen.queryByText(/already approved|already denied/)).toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('requests the document preview exactly once while the link and the list both load', async () => {
    stubBackend({ lists: [[makeWorkflow(step)]], links: [makeWorkflow(step)] });
    renderFromEmailLink(Component);

    await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(count('GET', LIST)).toBe(1));
    await settle();

    expect(count('GET', LINK)).toBe(1);
    expect(count('GET', PREVIEW)).toBe(1);
  });

  it('does not reopen the document or show a notice after approving from the link', async () => {
    stubBackend({ lists: [[makeWorkflow(step)]], links: [makeWorkflow(step), approvedBy(step)] });
    renderFromEmailLink(Component);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(count('POST', nextTeamEmail)).toBe(1));
    await waitFor(() => expect(document.body.textContent).toMatch(SUCCESS_TOAST));
    await settle();

    expect(screen.queryByRole('heading', { name: 'Document Preview' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/already approved|already denied/)).toBeNull();
    expect(count('GET', LINK)).toBe(1);
    expect(count('GET', PREVIEW)).toBe(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('does not reopen the document or show a notice after a teammate\'s 409 on the link', async () => {
    const alreadyApproved = `This document is already approved by the ${team}.`;
    stubBackend({ lists: [[makeWorkflow(step)], [approvedBy(step)]], links: [makeWorkflow(step), approvedBy(step)], stepReply: conflict(alreadyApproved) });
    renderFromEmailLink(Component);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(alreadyApproved));
    await waitFor(() => expect(count('GET', LIST)).toBe(2));
    await settle();

    expect(screen.queryByRole('heading', { name: 'Document Preview' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(count('GET', LINK)).toBe(1);
    expect(count('GET', PREVIEW)).toBe(1);
  });
});
