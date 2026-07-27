import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { approvalWorkflowServiceMongoDB } from '../../src/services/approvalWorkflowServiceMongoDB';

// Deleting an approval is creator-only and authorized server-side against the JWT's
// identity. If this request ever stops carrying the Bearer token the endpoint replies
// 401 and Delete silently breaks for everyone — so pin the header explicitly.

const TOKEN = 'header.payload.signature';

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

describe('approvalWorkflowServiceMongoDB.deleteWorkflow — creator-only authorization', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends DELETE with the Bearer token so the backend can identify the caller', async () => {
    mockLocalStorage(TOKEN);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await approvalWorkflowServiceMongoDB.deleteWorkflow('wf-123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/approval-workflows/wf-123');
    expect(init.method).toBe('DELETE');
    expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });

  it('surfaces the 403 message when the caller is not the creator', async () => {
    mockLocalStorage(TOKEN);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(403, { success: false, error: 'Only the requester who created this approval can delete it' })
    ));

    await expect(approvalWorkflowServiceMongoDB.deleteWorkflow('wf-123')).rejects.toThrow(
      'Only the requester who created this approval can delete it'
    );
  });

  it('surfaces the 401 message when no valid session exists', async () => {
    mockLocalStorage(null);
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, { success: false, error: 'Authentication required' })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(approvalWorkflowServiceMongoDB.deleteWorkflow('wf-123')).rejects.toThrow(
      'Authentication required'
    );
    // No token in storage → no Authorization header sent (backend then rejects it)
    expect(fetchMock.mock.calls[0][1].headers).toEqual({});
  });

  it('does not swallow a 404 for an already-deleted workflow', async () => {
    mockLocalStorage(TOKEN);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(404, { success: false, error: 'Workflow not found' })
    ));

    await expect(approvalWorkflowServiceMongoDB.deleteWorkflow('gone')).rejects.toThrow('Workflow not found');
  });

  it('falls back to a readable error when the body is empty', async () => {
    mockLocalStorage(TOKEN);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '',
    } as unknown as Response));

    await expect(approvalWorkflowServiceMongoDB.deleteWorkflow('wf-123')).rejects.toThrow(
      'Failed to delete workflow (HTTP 500)'
    );
  });

  it('url-encodes nothing unexpected for ids and hits the exact record', async () => {
    mockLocalStorage(TOKEN);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await approvalWorkflowServiceMongoDB.deleteWorkflow('wf-abc-999');

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/approval-workflows\/wf-abc-999$/);
  });
});
