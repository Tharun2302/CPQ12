// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true }) }));
vi.mock('../../src/components/Navigation', () => ({ default: () => null }));

import EsignAgreementStatusDashboard from '../../src/components/EsignAgreementStatusDashboard';

const AGREEMENT = {
  id: '6a8dc7e188f43f837939c157',
  file_name: 'Revolution_Group.pdf',
  uploaded_by: 'owner@cpq12.test',
  creator_email: 'owner@cpq12.test',
  created_at: '2026-11-19T10:00:00.000Z',
  sent_at: '2026-11-19T10:05:00.000Z',
  status: 'sent',
  recipients: [{ id: 'r1', name: 'Vince', email: 'vince@client.test', role: 'signer', status: 'pending', order: 1 }],
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes('/api/esign/agreement-status')
      ? { success: true, agreements: [AGREEMENT] }
      : { success: true };
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify(body),
      json: async () => body,
    } as unknown as Response;
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openMenu() {
  render(<MemoryRouter><EsignAgreementStatusDashboard /></MemoryRouter>);
  await screen.findByText('Revolution_Group.pdf');
  const menuButtons = screen.getAllByRole('button').filter((b) => /actions|more/i.test(b.getAttribute('aria-label') || b.getAttribute('title') || ''));
  fireEvent.click(menuButtons[0]);
  return screen.findByRole('button', { name: /Send Reminder/ });
}

const MANAGED = [/Send Reminder/, /Extend expiry/, /Cancel Signing/, /^Delete/];

describe('e-sign status actions menu', () => {
  it('an approval admin gets every action unlocked on someone else\'s agreement', async () => {
    auth.user = { email: 'boss@cpq12.test', isApprovalAdmin: true };
    await openMenu();
    for (const name of MANAGED) {
      const btn = screen.getByRole('button', { name });
      expect(btn.getAttribute('title') || '').not.toMatch(/Only the agreement creator/);
      expect(btn.className).not.toMatch(/cursor-not-allowed/);
    }
    const copy = screen.getByRole('button', { name: 'Copy signing link' });
    expect(copy.getAttribute('title')).toBe('Copy signing link');
  });

  it('a regular user who did not create it still sees every action locked', async () => {
    auth.user = { email: 'other@cpq12.test', isApprovalAdmin: false };
    await openMenu();
    for (const name of MANAGED) {
      expect(screen.getByRole('button', { name }).className).toMatch(/cursor-not-allowed/);
    }
    expect(screen.getByRole('button', { name: 'Copy signing link' }).getAttribute('title'))
      .toMatch(/creator or an approval admin/);
  });

  it('the creator keeps every action', async () => {
    auth.user = { email: 'OWNER@cpq12.test', isApprovalAdmin: false };
    await openMenu();
    for (const name of MANAGED) {
      expect(screen.getByRole('button', { name }).className).not.toMatch(/cursor-not-allowed/);
    }
  });
});
