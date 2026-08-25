import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deleteEsignDocument } from '../../src/services/esignDocumentService';

// Deleting an agreement is creator-only and authorized server-side against the JWT's
// identity. If this request ever stops carrying the Bearer token the endpoint replies
// 401 and Delete silently breaks for everyone — so pin the header explicitly.

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
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('deleteEsignDocument — creator-only authorization', () => {
  beforeEach(() => {
    mockLocalStorage(TOKEN);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends DELETE with the Bearer token so the backend can identify the caller', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteEsignDocument(DOC_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/api/esign/documents/${DOC_ID}`);
    expect(init.method).toBe('DELETE');
    expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });

  it('never sends the caller identity in the body, which a client could forge', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteEsignDocument(DOC_ID);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBeUndefined();
  });

  it('omits the header when no token is stored, so the backend rejects it as unauthenticated', async () => {
    mockLocalStorage(null);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'Authentication required' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteEsignDocument(DOC_ID)).rejects.toThrow('Authentication required');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toEqual({});
  });

  it("surfaces the backend's 403 message when the caller is not the creator", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(403, { error: 'Only the document creator can delete this document' })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteEsignDocument(DOC_ID)).rejects.toThrow(
      'Only the document creator can delete this document'
    );
  });

  it('rejects on 404 by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { error: 'Document not found' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteEsignDocument(DOC_ID)).rejects.toThrow('Document not found');
  });

  it('treats 404 as success when the caller opted in, since the document is already gone', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { error: 'Document not found' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteEsignDocument(DOC_ID, { treat404AsSuccess: true })).resolves.toBeUndefined();
  });

  it('falls back to a status-bearing message when the error body is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '',
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteEsignDocument(DOC_ID)).rejects.toThrow('HTTP 500');
  });
});
