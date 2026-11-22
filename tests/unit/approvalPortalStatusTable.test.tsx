// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../../src/components/PdfCanvasViewer', () => ({ default: () => null }));
vi.mock('../../src/components/EsignPdfPageView', () => ({ default: () => null }));

const auth = vi.hoisted(() => ({ value: undefined as undefined | { user: { email: string } } }));
vi.mock('../../src/contexts/AuthContext', async (importActual) => ({
  ...(await importActual<typeof import('../../src/contexts/AuthContext')>()),
  useOptionalAuth: () => auth.value,
}));

import TeamApprovalDashboard from '../../src/components/TeamApprovalDashboard';
import TechnicalTeamApprovalDashboard from '../../src/components/TechnicalTeamApprovalDashboard';
import LegalTeamApprovalDashboard from '../../src/components/LegalTeamApprovalDashboard';

const WORKFLOW = {
  id: 'wf-1',
  documentId: 'Acme_Corp_SOW_001',
  documentType: 'SOW',
  clientName: 'Acme Corp',
  amount: 5000,
  creatorEmail: 'rep@cpq12.test',
  creatorName: 'Sales Rep',
  status: 'approved',
  currentStep: 4,
  totalSteps: 4,
  workflowSteps: [
    { step: 1, role: 'Team Approval', email: 'lead@cpq12.test', status: 'approved' },
    { step: 2, role: 'Technical Team', email: 'tech@cpq12.test', status: 'approved' },
    { step: 3, role: 'Legal Team', email: 'legal@cpq12.test', status: 'approved' },
    { step: 4, role: 'Deal Desk', email: 'desk@cpq12.test', status: 'approved', comments: 'Notified' },
  ],
  createdAt: '2026-09-28T08:00:00.000Z',
  updatedAt: '2026-09-28T08:00:00.000Z',
};

const PORTALS = [
  ['Team Lead', TeamApprovalDashboard],
  ['Technical', TechnicalTeamApprovalDashboard],
  ['Legal', LegalTeamApprovalDashboard],
] as const;

beforeEach(() => {
  auth.value = undefined;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, '');
    if (path === '/api/approval-workflows') {
      return { ok: true, status: 200, json: async () => ({ success: true, workflows: [WORKFLOW] }) } as Response;
    }
    throw new Error(`Unexpected request in test: ${path}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openStatusTable(Portal: React.ComponentType) {
  render(<Portal />);
  fireEvent.click(await screen.findByRole('button', { name: /Workflow Status/ }));
  return screen.findByRole('table');
}

describe.each(PORTALS)('%s portal Workflow Status table', (_name, Portal) => {
  it('has one cell per heading, with the requester under "Requested by"', async () => {
    const table = await openStatusTable(Portal);
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent?.trim());
    const row = within(table).getAllByRole('row')[1];
    const cells = within(row).getAllByRole('cell');

    expect(cells).toHaveLength(headers.length);
    expect(cells[headers.indexOf('Requested by')].textContent).toBe('Sales Rep');
    expect(cells[headers.indexOf('Client')].textContent).toBe('Acme Corp');
  });

  it('no longer shows the retired Deal Desk column', async () => {
    const table = await openStatusTable(Portal);
    expect(within(table).queryByText('Deal Desk Status')).toBeNull();
    expect(within(table).queryByText('Notified')).toBeNull();
  });
});

describe.each(PORTALS.slice(1))('%s portal header', (_name, Portal) => {
  it('shows no placeholder email when nobody is signed in', async () => {
    render(<Portal />);
    await screen.findByRole('button', { name: /Workflow Status/ });
    expect(screen.queryByText(/company\.com/)).toBeNull();
    expect(screen.queryByText(/Signed in as|Logged in as/)).toBeNull();
  });

  it('shows the real signed-in email', async () => {
    auth.value = { user: { email: 'approver@cpq12.test' } };
    render(<Portal />);
    expect(await screen.findByText('approver@cpq12.test')).toBeTruthy();
    expect(screen.getByText(/Signed in as/)).toBeTruthy();
  });
});
