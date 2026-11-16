// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const authState = vi.hoisted(() => ({
  value: { user: { email: 'other@cpq12.test' } as Record<string, unknown> },
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => authState.value,
}));

// pdfjs-dist needs DOMMatrix, which jsdom lacks; the viewer only renders inside the preview modal
vi.mock('../../src/components/PdfCanvasViewer', () => ({ default: () => null }));

import ApprovalDashboard from '../../src/components/ApprovalDashboard';
import { approvalWorkflowServiceMongoDB } from '../../src/services/approvalWorkflowServiceMongoDB';
import type { ApprovalWorkflow } from '../../src/types/approval';

const WORKFLOW: ApprovalWorkflow = {
  id: 'wf-1',
  documentId: 'Acme_Corp_11111',
  documentType: 'SOW',
  clientName: 'Acme Corp',
  amount: 1000,
  creatorEmail: 'rep@cpq12.test',
  creatorName: 'Sales Rep',
  status: 'pending',
  currentStep: 1,
  totalSteps: 1,
  workflowSteps: [{ step: 1, role: 'Team Approval', email: 'lead@cpq12.test', status: 'pending' }],
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

let fetchMock: ReturnType<typeof vi.fn>;
let alertMock: ReturnType<typeof vi.fn>;

async function openMenu() {
  vi.spyOn(approvalWorkflowServiceMongoDB, 'getAllWorkflows').mockResolvedValue([WORKFLOW]);
  render(
    <MemoryRouter initialEntries={['/approval']}>
      <ApprovalDashboard />
    </MemoryRouter>,
  );
  await screen.findByText('Acme Corp');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'More actions' }));
  return { user, item: screen.getByRole('button', { name: /Edit for RedLine/ }) };
}

const redlineStartCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('start-session-from-document'));

beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve({
    ok: false,
    status: 404,
    json: () => Promise.resolve({ success: false, error: 'Document not found' }),
  } as Response));
  vi.stubGlobal('fetch', fetchMock);
  alertMock = vi.fn();
  vi.stubGlobal('alert', alertMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  // vitest.config.ts does not enable globals, so RTL's auto-cleanup never registers
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ApprovalDashboard Edit for RedLine access', () => {
  it('is enabled for any signed-in user, not just the requester', async () => {
    authState.value = { user: { email: 'other@cpq12.test' } };
    const { user, item } = await openMenu();

    expect(item).toHaveAttribute('aria-disabled', 'false');
    expect(item).toHaveAttribute('title', 'Open the Word editor to redline this document');

    await act(async () => { await user.click(item); });
    expect(redlineStartCalls()).toHaveLength(1);
  });

  it('is enabled for the requester', async () => {
    authState.value = { user: { email: 'rep@cpq12.test' } };
    const { item } = await openMenu();
    expect(item).toHaveAttribute('aria-disabled', 'false');
  });

  it('is locked when nobody is signed in, and asks them to sign in', async () => {
    authState.value = { user: {} };
    const { user, item } = await openMenu();

    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAttribute('title', 'Sign in to edit this document');
    await user.click(item);
    expect(alertMock).toHaveBeenCalledWith('Sign in to edit this document.');
    expect(redlineStartCalls()).toHaveLength(0);
  });

  it("shows the server's reason when the editor cannot be opened", async () => {
    authState.value = { user: { email: 'other@cpq12.test' } };
    const { user, item } = await openMenu();

    await act(async () => { await user.click(item); });

    expect(alertMock).toHaveBeenCalledWith('Document not found');
  });
});
