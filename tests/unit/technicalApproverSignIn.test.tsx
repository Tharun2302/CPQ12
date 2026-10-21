// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const loginWithMicrosoft = vi.fn();
vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ loginWithMicrosoft }),
}));

import TechnicalApproverSignIn from '../../src/components/approval/TechnicalApproverSignIn';

const STATUS_PATH = '/api/approval-workflows/technical-signin-status';
let fetchMock: ReturnType<typeof vi.fn>;

function respondWith(...bodies: object[]) {
  bodies.forEach((body) => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ success: true, ...body }), { status: 200 })),
    );
  });
}

function renderGate() {
  return render(
    <TechnicalApproverSignIn>
      <div>Technical portal content</div>
    </TechnicalApproverSignIn>,
  );
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  localStorage.setItem('cpq_token', 'header.payload.sig');
  loginWithMicrosoft.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('TechnicalApproverSignIn', () => {
  it('renders the portal and the signed-in identity when allowed', async () => {
    respondWith({ signedIn: true, verified: true, allowed: true, enforced: true, name: 'Ada', email: 'ada@cloudfuze.com' });
    renderGate();

    expect(await screen.findByText('Technical portal content')).toBeInTheDocument();
    expect(screen.getByText('Signed in as Ada (ada@cloudfuze.com)')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(STATUS_PATH);
    expect(init.headers).toEqual({ Authorization: 'Bearer header.payload.sig' });
  });

  it('renders the portal when enforcement is off, even if not signed in', async () => {
    respondWith({ signedIn: false, verified: false, allowed: false, enforced: false, reason: 'NOT_SIGNED_IN' });
    renderGate();

    expect(await screen.findByText('Technical portal content')).toBeInTheDocument();
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
  });

  it('explains NOT_ON_LIST and offers a different account', async () => {
    respondWith({ signedIn: true, verified: true, allowed: false, enforced: true, name: 'Bob', email: 'bob@cloudfuze.com', reason: 'NOT_ON_LIST' });
    renderGate();

    expect(await screen.findByText("You're signed in as Bob (bob@cloudfuze.com), but you're not on the Technical approver list.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use a different account/i })).toBeInTheDocument();
    expect(screen.queryByText('Technical portal content')).not.toBeInTheDocument();
  });

  it('signs in with Microsoft and re-checks status when not signed in', async () => {
    respondWith(
      { signedIn: false, verified: false, allowed: false, enforced: true, reason: 'NOT_SIGNED_IN' },
      { signedIn: true, verified: true, allowed: true, enforced: true, name: 'Ada', email: 'ada@cloudfuze.com' },
    );
    loginWithMicrosoft.mockResolvedValue(true);
    renderGate();

    fireEvent.click(await screen.findByRole('button', { name: /sign in with microsoft/i }));

    expect(loginWithMicrosoft).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Technical portal content')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the portal visible with a retry banner when the status check fails', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    respondWith({ signedIn: true, verified: true, allowed: true, enforced: true, email: 'ada@cloudfuze.com' });
    renderGate();

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't check your sign-in/i);
    expect(screen.getByText('Technical portal content')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.getByText('Signed in as ada@cloudfuze.com')).toBeInTheDocument());
  });

  it('keeps the portal visible when the status endpoint returns an HTTP error', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response('Not found', { status: 404 })));
    renderGate();

    expect(await screen.findByText('Technical portal content')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't check your sign-in/i);
  });

  it('shows only Try again when the server is not configured', async () => {
    respondWith({ signedIn: true, verified: true, allowed: false, enforced: true, email: 'ada@cloudfuze.com', reason: 'NOT_CONFIGURED' });
    renderGate();

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in with microsoft/i })).not.toBeInTheDocument();
  });
});
