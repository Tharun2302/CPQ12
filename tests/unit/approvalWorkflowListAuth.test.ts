import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { approvalWorkflowServiceMongoDB } from '../../src/services/approvalWorkflowServiceMongoDB';
import { getApprovalPortalParams, getApprovalPortalQuery } from '../../src/utils/approvalPortalParams';

// GET /api/approval-workflows needs proof of access: the login JWT, or the emailed
// portal link's workflowId/role/token. If the list request stops carrying either,
// every dashboard silently shows an empty list.

const JWT = 'header.payload.signature';

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

function mockLocation(pathname: string, search: string): void {
  vi.stubGlobal('window', { location: { pathname, search } });
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

describe('getApprovalPortalParams', () => {
  it('reads the workflow id from the path and role/token from the query of the emailed link', () => {
    expect(getApprovalPortalParams({ pathname: '/approval/wf-1', search: '?role=legal&token=abc%2Bdef' }))
      .toEqual({ workflowId: 'wf-1', role: 'legal', token: 'abc+def' });
  });

  it('accepts workflowId as a query param too', () => {
    expect(getApprovalPortalParams({ pathname: '/anything', search: '?workflowId=wf-2&role=technical&token=t' }))
      .toEqual({ workflowId: 'wf-2', role: 'technical', token: 't' });
  });

  it('returns null unless all three values are present', () => {
    expect(getApprovalPortalParams({ pathname: '/approval/wf-1', search: '?role=legal' })).toBeNull();
    expect(getApprovalPortalParams({ pathname: '/approval/wf-1', search: '?token=t' })).toBeNull();
    expect(getApprovalPortalParams({ pathname: '/approval-tracking', search: '?role=legal&token=t' })).toBeNull();
    expect(getApprovalPortalParams({ pathname: '/', search: '' })).toBeNull();
  });

  it('returns null when there is no window', () => {
    expect(getApprovalPortalParams(undefined)).toBeNull();
  });

  it('encodes the values into a query string', () => {
    expect(getApprovalPortalQuery({ pathname: '/approval/wf 1', search: '?role=teamlead&token=a%2Bb' }))
      .toBe('?workflowId=wf+1&role=teamlead&token=a%2Bb');
  });
});

describe('approvalWorkflowServiceMongoDB.getAllWorkflows — proof of access', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the Bearer token when a login exists', async () => {
    mockLocalStorage(JWT);
    mockLocation('/approval-tracking', '');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, workflows: [{ id: 'a' }], count: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await approvalWorkflowServiceMongoDB.getAllWorkflows();

    expect(result).toEqual([{ id: 'a' }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/approval-workflows$/);
    expect(init.headers).toEqual({ Authorization: `Bearer ${JWT}` });
  });

  it('appends workflowId, role and token when opened from an approval link', async () => {
    mockLocalStorage(null);
    mockLocation('/approval/wf-9', '?role=legal&token=tok123');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, workflows: [{ id: 'wf-9' }], count: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await approvalWorkflowServiceMongoDB.getAllWorkflows();

    expect(result).toEqual([{ id: 'wf-9' }]);
    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe('/api/approval-workflows');
    expect(parsed.searchParams.get('workflowId')).toBe('wf-9');
    expect(parsed.searchParams.get('role')).toBe('legal');
    expect(parsed.searchParams.get('token')).toBe('tok123');
    expect(init.headers).toEqual({});
  });

  it('sends neither a header nor query params when there is no login and no link', async () => {
    mockLocalStorage(null);
    mockLocation('/approval-tracking', '');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, workflows: [], count: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    await approvalWorkflowServiceMongoDB.getAllWorkflows();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain('?');
    expect(init.headers).toEqual({});
  });

  it('returns [] on a 401 without retrying or throwing', async () => {
    mockLocalStorage(null);
    mockLocation('/approval-tracking', '');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { success: false, error: 'Authentication required' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(approvalWorkflowServiceMongoDB.getAllWorkflows()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
