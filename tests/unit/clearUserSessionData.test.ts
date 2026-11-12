// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('../../src/analytics/clarity', () => ({ track: vi.fn(), identify: vi.fn() }));
vi.mock('../../src/analytics/hotjar', () => ({ identifyHotjarUser: vi.fn() }));

import { AuthProvider, useAuth } from '../../src/contexts/AuthContext';
import {
  clearUserSessionData,
  clearDataIfDifferentUser,
  USER_SESSION_STORAGE_KEYS,
} from '../../src/utils/authUtils';

const KEPT_LOCAL = {
  cpq_esign_tour_landing_v1: '1',
  cpq_esign_tour_place_fields_v1: '1',
  exhibitUploadGuideHidden: 'true',
  cpq_selected_exhibits_cleanup_v1: '1',
  cpq_discount_policy: '100',
  _hjSessionUser_123: 'abc',
  _clck: 'xyz',
};
const KEPT_SESSION = { _hjSession_123: 'abc', _clsk: 'xyz' };

function seed(store: Storage, keys: readonly string[]) {
  keys.forEach((key) => store.setItem(key, `value-for-${key}`));
}

function seedEverything() {
  seed(localStorage, USER_SESSION_STORAGE_KEYS);
  seed(sessionStorage, USER_SESSION_STORAGE_KEYS);
  localStorage.setItem('cpq_app_data_clientDetails', '{"name":"Acme"}');
  Object.entries(KEPT_LOCAL).forEach(([k, v]) => localStorage.setItem(k, v));
  Object.entries(KEPT_SESSION).forEach(([k, v]) => sessionStorage.setItem(k, v));
}

function expectUserDataGone() {
  USER_SESSION_STORAGE_KEYS.forEach((key) => {
    expect(localStorage.getItem(key), `localStorage ${key}`).toBeNull();
    expect(sessionStorage.getItem(key), `sessionStorage ${key}`).toBeNull();
  });
  expect(localStorage.getItem('cpq_app_data_clientDetails')).toBeNull();
}

function expectHarmlessKeysKept() {
  Object.entries(KEPT_LOCAL).forEach(([k, v]) => expect(localStorage.getItem(k)).toBe(v));
  Object.entries(KEPT_SESSION).forEach(([k, v]) => expect(sessionStorage.getItem(k)).toBe(v));
}

describe('clearUserSessionData', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes every user, client and auth key from both storages', () => {
    seedEverything();
    clearUserSessionData();
    expectUserDataGone();
  });

  it('keeps tour flags, guide flags, the discount policy cache and third-party keys', () => {
    seedEverything();
    clearUserSessionData();
    expectHarmlessKeysKept();
  });

  it('covers the keys named in the privacy report', () => {
    ['cpq_quotes', 'cpq_client_info', 'cpq_quote_client_info', 'cpq_hubspot_data',
      'cpq_team_approval_settings', 'companyInfo', 'dealInfo', 'hubspotState', 'cpq_templates_cache_v2',
      'cpq_user', 'cpq_token', 'msal_code_verifier'].forEach((key) => {
      expect(USER_SESSION_STORAGE_KEYS).toContain(key);
    });
  });

  it('does not throw when storage throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = () => { throw new Error('SecurityError'); };
    vi.spyOn(Storage.prototype, 'key').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);
    expect(() => clearUserSessionData()).not.toThrow();
  });

  it('still clears sessionStorage when localStorage throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sessionStorage.setItem('cpq_quotes', 'secret');
    const original = Storage.prototype.key;
    vi.spyOn(Storage.prototype, 'key').mockImplementation(function (this: Storage, index: number) {
      if (this === localStorage) throw new Error('SecurityError');
      return original.call(this, index);
    });
    expect(() => clearUserSessionData()).not.toThrow();
    expect(sessionStorage.getItem('cpq_quotes')).toBeNull();
  });
});

describe('clearDataIfDifferentUser', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps data for the same id', () => {
    localStorage.setItem('cpq_user', JSON.stringify({ id: 'u1', email: 'a@cloudfuze.com' }));
    localStorage.setItem('cpq_quotes', '[1]');
    clearDataIfDifferentUser({ id: 'u1', email: 'renamed@cloudfuze.com' });
    expect(localStorage.getItem('cpq_quotes')).toBe('[1]');
  });

  it('keeps data for the same email in a different case', () => {
    localStorage.setItem('cpq_user', JSON.stringify({ email: 'A@cloudfuze.com' }));
    localStorage.setItem('cpq_quotes', '[1]');
    clearDataIfDifferentUser({ id: 'u9', email: 'a@CLOUDFUZE.com' });
    expect(localStorage.getItem('cpq_quotes')).toBe('[1]');
  });

  it('clears data for a different user', () => {
    localStorage.setItem('cpq_user', JSON.stringify({ id: 'u1', email: 'a@cloudfuze.com' }));
    localStorage.setItem('cpq_quotes', '[1]');
    clearDataIfDifferentUser({ id: 'u2', email: 'b@cloudfuze.com' });
    expect(localStorage.getItem('cpq_quotes')).toBeNull();
  });

  it('clears when the stored user cannot be read', () => {
    localStorage.setItem('cpq_user', '{not json');
    localStorage.setItem('cpq_quotes', '[1]');
    clearDataIfDifferentUser({ id: 'u2', email: 'b@cloudfuze.com' });
    expect(localStorage.getItem('cpq_quotes')).toBeNull();
  });

  it('leaves everything alone when nobody was stored', () => {
    localStorage.setItem('cpq_quotes', '[1]');
    clearDataIfDifferentUser({ id: 'u2', email: 'b@cloudfuze.com' });
    expect(localStorage.getItem('cpq_quotes')).toBe('[1]');
  });
});

let latestAuth: ReturnType<typeof useAuth>;

function Probe() {
  latestAuth = useAuth();
  if (latestAuth.loading) return React.createElement('div', null, 'loading');
  return React.createElement('div', null, latestAuth.isAuthenticated ? 'signed-in' : 'signed-out');
}

function mountApp() {
  return render(
    React.createElement(MemoryRouter, null, React.createElement(AuthProvider, null, React.createElement(Probe))),
  );
}

const USER_A = { id: 'u1', name: 'Ada', email: 'ada@cloudfuze.com', role: 'admin' };
const USER_B = { id: 'u2', name: 'Bob', email: 'bob@cloudfuze.com', role: 'viewer' };
const JWT_SHAPED = 'a.b.c';

describe('AuthContext clears client data', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function signedInStorage() {
    seedEverything();
    localStorage.setItem('cpq_token', JWT_SHAPED);
    localStorage.setItem('cpq_user', JSON.stringify(USER_A));
  }

  it('logout clears quotes, client info and HubSpot data but keeps harmless keys', async () => {
    signedInStorage();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, user: USER_A }) });
    mountApp();
    await screen.findByText('signed-in');
    expect(localStorage.getItem('cpq_quotes')).not.toBeNull();

    act(() => { latestAuth.logout(); });

    await screen.findByText('signed-out');
    expectUserDataGone();
    expectHarmlessKeysKept();
  });

  it('an invalid-token /api/auth/me response clears client data', async () => {
    signedInStorage();
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ success: false }) });
    mountApp();
    await screen.findByText('signed-out');
    expectUserDataGone();
    expectHarmlessKeysKept();
  });

  it('a success:false /api/auth/me response clears client data', async () => {
    signedInStorage();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: false }) });
    mountApp();
    await screen.findByText('signed-out');
    expectUserDataGone();
  });

  it('a non-JWT stored token clears client data without asking the server', async () => {
    signedInStorage();
    localStorage.setItem('cpq_token', 'x');
    mountApp();
    await screen.findByText('signed-out');
    expect(fetchMock).not.toHaveBeenCalled();
    expectUserDataGone();
  });

  it('an unreachable server does not wipe the saved work', async () => {
    signedInStorage();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    mountApp();
    await screen.findByText('signed-out');
    expect(localStorage.getItem('cpq_quotes')).not.toBeNull();
  });

  describe('Microsoft login', () => {
    const popup = { closed: false, close: vi.fn() };

    async function microsoftLoginAs(serverUser: typeof USER_A) {
      fetchMock.mockImplementation(async (url: string) => {
        if (String(url).includes('/api/auth/microsoft')) {
          return { ok: true, status: 200, json: async () => ({ success: true, user: serverUser, token: 'm.s.t' }) };
        }
        return { ok: false, status: 401, json: async () => ({ success: false }) };
      });
      vi.stubEnv('VITE_MSAL_CLIENT_ID', 'test-client-id');
      vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
      mountApp();
      await screen.findByText('signed-out');
      localStorage.setItem('cpq_user', JSON.stringify(USER_A));
      localStorage.setItem('cpq_quotes', '[{"clientName":"Acme"}]');
      const pending = latestAuth.loginWithMicrosoft();
      await waitFor(() => expect(window.open).toHaveBeenCalled());
      await act(async () => {
        window.dispatchEvent(new MessageEvent('message', {
          origin: window.location.origin,
          data: {
            type: 'MICROSOFT_AUTH_SUCCESS',
            user: { id: 'ms1', name: serverUser.name, email: serverUser.email, accessToken: 'ms-token' },
          },
        }));
      });
      await pending;
    }

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('a different user clears the previous user data', async () => {
      await microsoftLoginAs(USER_B);
      expect(localStorage.getItem('cpq_quotes')).toBeNull();
      expect(localStorage.getItem('cpq_token')).toBe('m.s.t');
    });

    it('the same user keeps their data', async () => {
      await microsoftLoginAs(USER_A);
      expect(localStorage.getItem('cpq_quotes')).toBe('[{"clientName":"Acme"}]');
      expect(localStorage.getItem('cpq_token')).toBe('m.s.t');
    });
  });
});
