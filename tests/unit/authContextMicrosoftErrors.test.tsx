// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/analytics/clarity', () => ({ track: vi.fn(), identify: vi.fn() }));
vi.mock('../../src/analytics/hotjar', () => ({ identifyHotjarUser: vi.fn() }));

import { AuthProvider, useAuth } from '../../src/contexts/AuthContext';

let latestAuth: ReturnType<typeof useAuth>;

function Probe() {
  latestAuth = useAuth();
  return null;
}

const jsonResponse = (body: unknown, status: number) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('loginWithMicrosoft surfaces backend errors', () => {
  const fetchMock = vi.fn();
  const popup = { closed: false, close: vi.fn() };

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse({}, 401));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_MSAL_CLIENT_ID', 'test-client-id');
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function signInWithPopupUser(email = 'ada@cloudfuze.com') {
    const pending = latestAuth.loginWithMicrosoft();
    const outcome = pending.then(
      (value) => ({ value, error: null as unknown }),
      (error) => ({ value: null, error }),
    );
    await waitFor(() => expect(window.open).toHaveBeenCalled());
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: 'MICROSOFT_AUTH_SUCCESS', user: { id: 'u1', name: 'Ada', email, accessToken: 'ms-token' } },
      }));
    });
    return outcome;
  }

  it('rejects with the server 503 message and does not retry', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/api/auth/microsoft')
        ? jsonResponse({ success: false, error: 'Microsoft sign-in is temporarily unavailable' }, 503)
        : jsonResponse({}, 401));

    const { error } = await signInWithPopupUser();

    expect((error as Error).message).toBe('Microsoft sign-in is temporarily unavailable');
    expect((error as { code?: string }).code).toBe('MICROSOFT_SERVER_ERROR');
    const msCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/auth/microsoft'));
    expect(msCalls).toHaveLength(1);
    expect(localStorage.getItem('cpq_token')).toBeNull();
  });

  it('keeps the request body shape unchanged', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ success: false }, 400));

    await signInWithPopupUser();

    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/auth/microsoft'));
    expect(JSON.parse(call![1].body)).toEqual({ id: 'u1', name: 'Ada', email: 'ada@cloudfuze.com', accessToken: 'ms-token' });
  });

  it('maps 403 to a user-readable message', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ success: false }, 403));

    const { error } = await signInWithPopupUser();

    expect((error as Error).message).toMatch(/not authorized/);
  });

  it('resolves false (generic failure) for an unexpected 500', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ success: false, error: 'stack trace' }, 500));

    const { value, error } = await signInWithPopupUser();

    expect(error).toBeNull();
    expect(value).toBe(false);
  });
});
