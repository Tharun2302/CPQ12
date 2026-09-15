import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getZohoSignStatus,
  refreshZohoDocument,
  sendDocumentForSignature,
  sendWithZohoSign,
} from '../../src/services/esignDocumentService';

// The Zoho routes verify a JWT and check the caller is the document creator, unlike most
// /api/esign/* routes — so the Bearer header is pinned here the same way the delete test pins it.
// The CPQ branch is pinned just as hard in the opposite direction: it must stay the exact call
// the prepare pages made before the picker existed.

const TOKEN = 'header.payload.signature';
const DOC_ID = '6a8dc7e188f43f837939c157';

function mockLocalStorage(token: string | null): void {
  const store: Record<string, string> = token ? { cpq_token: token } : {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: () => null,
    length: 0,
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('getZohoSignStatus — fails closed to the in-house flow', () => {
  beforeEach(() => mockLocalStorage(TOKEN));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports enabled only when the backend says so', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, enabled: true, configured: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getZohoSignStatus()).resolves.toEqual({ enabled: true, configured: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/zoho-sign/status');
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('treats a disabled install as disabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { success: true, enabled: false, configured: false })));
    await expect(getZohoSignStatus()).resolves.toEqual({ enabled: false, configured: false });
  });

  it('treats an unauthenticated or erroring backend as disabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { success: false, error: 'Authentication required' })));
    await expect(getZohoSignStatus()).resolves.toEqual({ enabled: false, configured: false });
  });

  it('treats a network failure as disabled rather than throwing at a mount effect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(getZohoSignStatus()).resolves.toEqual({ enabled: false, configured: false });
  });

  it('treats an unparseable body as disabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('not json'); },
    } as unknown as Response));
    await expect(getZohoSignStatus()).resolves.toEqual({ enabled: false, configured: false });
  });
});

describe('sendDocumentForSignature — one call per provider, and no crossover', () => {
  beforeEach(() => mockLocalStorage(TOKEN));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the in-house request byte-identically to the pre-Zoho call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await sendDocumentForSignature(DOC_ID, 'cpq', { expiration_days: 15, is_sequential: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/api/esign/documents/${DOC_ID}/send-for-signature`);
    expect(String(url)).not.toContain('zoho');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    // The in-house route authorizes differently; adding a header here would be a silent change.
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('sends the Zoho request to the Zoho route with the Bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, document: { provider: 'zoho' } }));
    vi.stubGlobal('fetch', fetchMock);

    await sendDocumentForSignature(DOC_ID, 'zoho', { is_sequential: true, email_reminders: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/api/zoho-sign/documents/${DOC_ID}/send`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body)).toEqual({ is_sequential: true, email_reminders: true });
  });

  it('returns the backend error body rather than throwing when Zoho is off', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(503, { success: false, error: 'Zoho Sign is not enabled.' })));
    await expect(sendWithZohoSign(DOC_ID)).resolves.toEqual({ success: false, error: 'Zoho Sign is not enabled.' });
  });
});

describe('refreshZohoDocument', () => {
  beforeEach(() => mockLocalStorage(TOKEN));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads the Zoho document route with auth, and asks for a forced refresh only when told to', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await refreshZohoDocument(DOC_ID);
    await refreshZohoDocument(DOC_ID, { force: true });

    expect(String(fetchMock.mock.calls[0][0])).toContain(`/api/zoho-sign/documents/${DOC_ID}`);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('force=1');
    expect(String(fetchMock.mock.calls[1][0])).toContain('force=1');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });
});
