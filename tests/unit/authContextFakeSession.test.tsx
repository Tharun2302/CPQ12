// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/analytics/clarity', () => ({ track: vi.fn(), identify: vi.fn() }));
vi.mock('../../src/analytics/hotjar', () => ({ identifyHotjarUser: vi.fn() }));

import { AuthProvider, useAuth } from '../../src/contexts/AuthContext';

let latestAuth: ReturnType<typeof useAuth>;

function Probe() {
  latestAuth = useAuth();
  if (latestAuth.loading) return <div>loading</div>;
  return <div>{latestAuth.isAuthenticated ? 'signed-in' : 'signed-out'}</div>;
}

function mountApp() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>
  );
}

const FAKE_USER = JSON.stringify({ id: '1', name: 'Fake', email: 'a@b.com', role: 'admin' });
const JWT_SHAPED_FAKE = 'a.b.c';

describe('AuthContext rejects fake sessions', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('clears a non-JWT token without asking the server and stays signed out', async () => {
    localStorage.setItem('cpq_token', 'x');
    localStorage.setItem('cpq_user', FAKE_USER);
    mountApp();
    await screen.findByText('signed-out');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('cpq_token')).toBeNull();
    expect(localStorage.getItem('cpq_user')).toBeNull();
  });

  it('stays signed out when the server is unreachable and the token is only JWT-shaped', async () => {
    localStorage.setItem('cpq_token', JWT_SHAPED_FAKE);
    localStorage.setItem('cpq_user', FAKE_USER);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    mountApp();
    await screen.findByText('signed-out');
  });

  it('clears the session when the server rejects the token', async () => {
    localStorage.setItem('cpq_token', JWT_SHAPED_FAKE);
    localStorage.setItem('cpq_user', FAKE_USER);
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ success: false }) });
    mountApp();
    await screen.findByText('signed-out');
    expect(localStorage.getItem('cpq_token')).toBeNull();
  });

  it('signs in when the server verifies the token', async () => {
    localStorage.setItem('cpq_token', JWT_SHAPED_FAKE);
    localStorage.setItem('cpq_user', FAKE_USER);
    const serverUser = { id: 'u1', name: 'Real', email: 'real@cloudfuze.com', role: 'viewer' };
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, user: serverUser }) });
    mountApp();
    await screen.findByText('signed-in');
  });
});

describe('AuthContext offers Microsoft sign-in only', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('exposes no password login or sign-up', async () => {
    mountApp();
    await screen.findByText('signed-out');
    expect(latestAuth).not.toHaveProperty('login');
    expect(latestAuth).not.toHaveProperty('signup');
    expect(latestAuth).not.toHaveProperty('signupWithMicrosoft');
    expect(typeof latestAuth.loginWithMicrosoft).toBe('function');
  });
});
