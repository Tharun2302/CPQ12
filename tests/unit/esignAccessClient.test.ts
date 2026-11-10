// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withEsignAccess, esignFetch, getApprovalPortalToken } from '../../src/utils/esignAccess';

const BASE = 'http://api.test/api/esign/documents/abc/file?inline=1';

function setLocation(path: string) {
  window.history.replaceState({}, '', path);
}

describe('withEsignAccess', () => {
  beforeEach(() => setLocation('/esign'));

  it('leaves the URL alone when the page holds no link token', () => {
    expect(withEsignAccess(BASE)).toBe(BASE);
  });

  it('appends the signing token, encoded', () => {
    expect(withEsignAccess(BASE, { signingToken: 'a b&c' })).toBe(`${BASE}&signing_token=a%20b%26c`);
  });

  it('starts a query string when the URL has none and keeps any #fragment last', () => {
    expect(withEsignAccess('http://api.test/x#page=2', { signingToken: 't' })).toBe('http://api.test/x?signing_token=t#page=2');
  });

  it('adds the approval-portal token when on an approval portal page', () => {
    setLocation('/approval/wf-1?role=legal&token=portal123');
    expect(getApprovalPortalToken()).toBe('portal123');
    expect(withEsignAccess(BASE)).toBe(`${BASE}&approval_token=portal123`);
  });

  it('ignores a ?token= on pages that are not approval portals', () => {
    setLocation('/esign-inbox?token=signer-inbox-token');
    expect(getApprovalPortalToken()).toBeNull();
    expect(withEsignAccess(BASE)).toBe(BASE);
  });
});

describe('esignFetch', () => {
  const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));

  beforeEach(() => {
    setLocation('/esign');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockClear();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the staff Bearer token when signed in', async () => {
    localStorage.setItem('cpq_token', 'jwt.value.here');
    await esignFetch('http://api.test/api/esign/documents', { method: 'GET' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer jwt.value.here');
  });

  it('keeps caller headers and does not override an explicit Authorization', async () => {
    localStorage.setItem('cpq_token', 'jwt.value.here');
    await esignFetch('http://api.test/x', { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer other' } });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer other');
  });

  it('sends no Authorization when signed out, but still carries the link token', async () => {
    await esignFetch(BASE, {}, { signingToken: 'tok' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}&signing_token=tok`);
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
  });
});
