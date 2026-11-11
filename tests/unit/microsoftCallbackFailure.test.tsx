// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MicrosoftCallback from '../../src/pages/MicrosoftCallback';

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: new Headers(),
});

function mountCallback() {
  return render(
    <MemoryRouter initialEntries={['/auth/microsoft/callback?code=abc123&state=n%7Chttp%3A%2F%2Flocalhost%3A3000']}>
      <MicrosoftCallback />
    </MemoryRouter>,
  );
}

describe('MicrosoftCallback never fabricates an identity', () => {
  const fetchMock = vi.fn();
  const postMessage = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('msal_code_verifier', 'verifier');
    localStorage.setItem('msal_client_id', 'test-client-id');
    // An empty value means unset, so a developer's local .env cannot change the expected URL
    vi.stubEnv('VITE_MSAL_TENANT_ID', '');
    fetchMock.mockReset();
    postMessage.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('opener', { postMessage });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('posts MICROSOFT_AUTH_ERROR, not a fallback user, when the Graph profile fetch fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'real-token' }))
      .mockResolvedValueOnce(jsonResponse({ error: 'denied' }, 403));

    mountCallback();

    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    const [message] = postMessage.mock.calls[0];
    expect(message.type).toBe('MICROSOFT_AUTH_ERROR');
    expect(message.error).toBe('Microsoft sign-in failed, please try again');
    expect(JSON.stringify(postMessage.mock.calls)).not.toMatch(/fallback_token|user@cloudfuze\.com|MICROSOFT_AUTH_SUCCESS/);
    expect(await screen.findByRole('alert')).toHaveTextContent('Microsoft sign-in failed, please try again');
  });

  it('rejects a profile with no email instead of inventing one', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'real-token' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'abc', displayName: 'No Mail' }));

    mountCallback();

    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(postMessage.mock.calls[0][0].type).toBe('MICROSOFT_AUTH_ERROR');
  });

  it('still posts MICROSOFT_AUTH_SUCCESS with the real profile on the happy path', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'real-token' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'graph-id', displayName: 'Ada', mail: 'ada@cloudfuze.com' }));

    mountCallback();

    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    const [message] = postMessage.mock.calls[0];
    expect(message.type).toBe('MICROSOFT_AUTH_SUCCESS');
    expect(message.user).toMatchObject({ id: 'graph-id', email: 'ada@cloudfuze.com', accessToken: 'real-token' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token');
  });

  it('exchanges the code at the tenant-specific token endpoint when a tenant is configured', async () => {
    const tenant = '00000000-1111-2222-3333-444444444444';
    vi.stubEnv('VITE_MSAL_TENANT_ID', tenant);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 't' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'i', mail: 'a@cloudfuze.com' }));

    mountCallback();

    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`);
  });
});
