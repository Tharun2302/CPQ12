// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const hookState = vi.hoisted(() => ({ workflows: [] as any[] }));

vi.mock('../../src/hooks/useApprovalWorkflows', () => ({
  useApprovalWorkflows: () => ({
    workflows: hookState.workflows,
    updateWorkflowStep: vi.fn(),
    updateWorkflow: vi.fn(),
  }),
}));

// pdfjs-dist needs DOMMatrix, which jsdom lacks; the viewer only renders inside the preview modal
vi.mock('../../src/components/PdfCanvasViewer', () => ({ default: () => null }));

import ClientNotification from '../../src/components/ClientNotification';

function makeWorkflow(id: string, clientName: string) {
  return {
    id,
    documentType: 'SOW',
    clientName,
    amount: 1000,
    creatorEmail: 'rep@cpq12.test',
    creatorName: 'Sales Rep',
    status: 'pending',
    currentStep: 3,
    totalSteps: 3,
    workflowSteps: [{ step: 3, role: 'Client', email: 'client@cpq12.test', status: 'pending' }],
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-20T10:00:00.000Z',
  };
}

const OWN_WORKFLOW = makeWorkflow('WF-OWN', 'Own Client Inc');
const EMAILED_WORKFLOW = makeWorkflow('WF-X', 'Emailed Client LLC');

function respondWith(workflow: unknown) {
  return vi.fn(() => Promise.resolve(
    workflow
      ? { ok: true, status: 200, json: () => Promise.resolve({ success: true, workflow }), text: () => Promise.resolve('') }
      : { ok: false, status: 404, json: () => Promise.resolve({ success: false }), text: () => Promise.resolve('not found') },
  ));
}

function openLink(id: string) {
  window.history.replaceState({}, '', `/client-notification?workflow=${id}`);
}

const specificWorkflowCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/approval-workflows/'));

beforeEach(() => {
  hookState.workflows = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  // vitest.config.ts does not enable globals, so RTL's auto-cleanup never registers
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('ClientNotification workflow lookup', () => {
  it('uses the workflow from the loaded list without calling the fallback', async () => {
    const fetchMock = respondWith(null);
    vi.stubGlobal('fetch', fetchMock);
    hookState.workflows = [OWN_WORKFLOW, EMAILED_WORKFLOW];
    openLink('WF-X');

    render(<ClientNotification />);

    expect(await screen.findByText('Client: Emailed Client LLC')).toBeInTheDocument();
    expect(specificWorkflowCalls(fetchMock)).toHaveLength(0);
    expect(screen.queryByText('Workflow Not Found')).toBeNull();
  });

  it('falls back to the single-workflow lookup when the id is missing from a non-empty list', async () => {
    const fetchMock = respondWith(EMAILED_WORKFLOW);
    vi.stubGlobal('fetch', fetchMock);
    hookState.workflows = [OWN_WORKFLOW];
    openLink('WF-X');

    render(<ClientNotification />);

    expect(await screen.findByText('Client: Emailed Client LLC')).toBeInTheDocument();
    expect(specificWorkflowCalls(fetchMock)).toHaveLength(1);
    expect(String(specificWorkflowCalls(fetchMock)[0][0])).toMatch(/\/api\/approval-workflows\/WF-X$/);
    expect(screen.queryByText('Workflow Not Found')).toBeNull();
  });

  it('falls back to the single-workflow lookup when the list is empty', async () => {
    const fetchMock = respondWith(EMAILED_WORKFLOW);
    vi.stubGlobal('fetch', fetchMock);
    openLink('WF-X');

    render(<ClientNotification />);

    expect(await screen.findByText('Client: Emailed Client LLC')).toBeInTheDocument();
    expect(specificWorkflowCalls(fetchMock)).toHaveLength(1);
  });

  it('shows not-found only when the list and the fallback both miss', async () => {
    const fetchMock = respondWith(null);
    vi.stubGlobal('fetch', fetchMock);
    hookState.workflows = [OWN_WORKFLOW];
    openLink('WF-GONE');

    render(<ClientNotification />);

    expect(await screen.findByText('Workflow Not Found')).toBeInTheDocument();
    expect(specificWorkflowCalls(fetchMock)).toHaveLength(1);
  });

  it('does not repeat the fallback request when the list changes while it is in flight', async () => {
    const fetchMock = respondWith(EMAILED_WORKFLOW);
    vi.stubGlobal('fetch', fetchMock);
    openLink('WF-X');

    const { rerender } = render(<ClientNotification />);
    hookState.workflows = [OWN_WORKFLOW];
    rerender(<ClientNotification />);

    await waitFor(() => expect(screen.getByText('Client: Emailed Client LLC')).toBeInTheDocument());
    expect(specificWorkflowCalls(fetchMock)).toHaveLength(1);
  });
});
