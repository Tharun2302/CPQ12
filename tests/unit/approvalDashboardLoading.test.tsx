// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { email: 'rep@cpq12.test' } }),
}));

// pdfjs-dist needs DOMMatrix, which jsdom lacks; the viewer only renders inside the preview modal
vi.mock('../../src/components/PdfCanvasViewer', () => ({ default: () => null }));

import ApprovalDashboard from '../../src/components/ApprovalDashboard';
import { useApprovalWorkflows } from '../../src/hooks/useApprovalWorkflows';
import { approvalWorkflowServiceMongoDB } from '../../src/services/approvalWorkflowServiceMongoDB';
import type { ApprovalWorkflow } from '../../src/types/approval';

function makeWorkflow(id: string, clientName: string, status: ApprovalWorkflow['status']): ApprovalWorkflow {
  return {
    id,
    documentId: `${clientName.replace(/\s+/g, '_')}_${id}`,
    documentType: 'SOW',
    clientName,
    amount: 1000,
    creatorEmail: 'rep@cpq12.test',
    creatorName: 'Sales Rep',
    status,
    currentStep: 1,
    totalSteps: 1,
    workflowSteps: [{ step: 1, role: 'Team Approval', email: 'lead@cpq12.test', status: 'pending' }],
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-20T10:00:00.000Z',
  };
}

const WORKFLOWS = [
  makeWorkflow('wf-1', 'Acme Corp', 'pending'),
  makeWorkflow('wf-2', 'Beta Labs', 'approved'),
];

const STAT_CARDS = [/^All approvals:/, /^Approved:/, /^Pending approvals:/, /^Show rejected workflows$/];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function mockLoads(...loads: Promise<ApprovalWorkflow[]>[]) {
  const spy = vi.spyOn(approvalWorkflowServiceMongoDB, 'getAllWorkflows');
  for (const load of loads) spy.mockReturnValueOnce(load);
  return spy;
}

const renderDashboard = () => render(
  <MemoryRouter initialEntries={['/approval']}>
    <ApprovalDashboard />
  </MemoryRouter>,
);

const showingText = (count: number) => (_: string, el: Element | null) => el?.textContent === `Showing ${count} items`;

let fetchGuard: ReturnType<typeof vi.fn>;

beforeEach(() => {
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(realFetchCalls).toBe(0);
});

describe('ApprovalDashboard initial loading state', () => {
  it('shows a loading indicator instead of an empty result while the first load is pending', async () => {
    const firstLoad = deferred<ApprovalWorkflow[]>();
    mockLoads(firstLoad.promise);
    renderDashboard();

    expect(screen.getByRole('status')).toHaveTextContent('Loading approvals…');
    expect(screen.queryByText(/No items found/)).toBeNull();
    expect(screen.queryByText(showingText(0))).toBeNull();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    for (const name of STAT_CARDS) {
      expect(within(screen.getByRole('button', { name })).queryByText('0')).toBeNull();
    }
    expect(screen.getByRole('button', { name: /^All approvals: loading\./ })).toBeInTheDocument();
    expect(document.querySelectorAll('svg.invisible')).toHaveLength(STAT_CARDS.length);

    await act(async () => firstLoad.resolve([]));
    expect(document.querySelectorAll('svg.invisible')).toHaveLength(0);
  });

  it('clears the loading indicator when the first load fails', async () => {
    const firstLoad = deferred<ApprovalWorkflow[]>();
    mockLoads(firstLoad.promise);
    renderDashboard();

    await act(async () => firstLoad.reject(new Error('Network down')));

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(screen.getByText(/No items found/)).toBeInTheDocument();
  });

  it('shows "No items found" and zero counts once the first load resolves empty', async () => {
    const firstLoad = deferred<ApprovalWorkflow[]>();
    mockLoads(firstLoad.promise);
    renderDashboard();

    await act(async () => firstLoad.resolve([]));

    expect(screen.getByText(/No items found/)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText(showingText(0))).toBeInTheDocument();
    for (const name of STAT_CARDS) {
      expect(within(screen.getByRole('button', { name })).getByText('0')).toBeInTheDocument();
    }
  });

  it('keeps the loaded list on screen during a focus-triggered refresh', async () => {
    const firstLoad = deferred<ApprovalWorkflow[]>();
    const refresh = deferred<ApprovalWorkflow[]>();
    const getAll = mockLoads(firstLoad.promise, refresh.promise);
    renderDashboard();

    await act(async () => firstLoad.resolve(WORKFLOWS));
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();

    fireEvent.focus(window);

    expect(getAll).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Loading approvals…')).toBeNull();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Beta Labs')).toBeInTheDocument();
    expect(screen.getByText(showingText(2))).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /^All approvals: 2 items/ })).getByText('2')).toBeInTheDocument();

    await act(async () => refresh.resolve(WORKFLOWS));
  });

  it('keeps an empty result on screen during a focus-triggered refresh', async () => {
    const firstLoad = deferred<ApprovalWorkflow[]>();
    const refresh = deferred<ApprovalWorkflow[]>();
    const getAll = mockLoads(firstLoad.promise, refresh.promise);
    renderDashboard();

    await act(async () => firstLoad.resolve([]));
    fireEvent.focus(window);

    expect(getAll).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText(/No items found/)).toBeInTheDocument();

    await act(async () => refresh.resolve([]));
  });
});

describe('useApprovalWorkflows', () => {
  it('reports isLoading from the very first render, before the mount effect runs', async () => {
    const firstLoad = deferred<ApprovalWorkflow[]>();
    mockLoads(firstLoad.promise);
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useApprovalWorkflows().isLoading);
      return null;
    }
    render(<Probe />);

    expect(seen[0]).toBe(true);

    await act(async () => firstLoad.resolve([]));
    expect(seen[seen.length - 1]).toBe(false);
  });
});
