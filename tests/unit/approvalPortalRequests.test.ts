import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { approvalWorkflowServiceMongoDB } from '../../src/services/approvalWorkflowServiceMongoDB';
import { getApprovalPortalParams, withApprovalPortalQuery } from '../../src/utils/approvalPortalParams';

// Single-workflow routes need proof of access: the login JWT, or the emailed link's
// role/token. A request that drops either one locks that caller out of the approval.

const JWT = 'header.payload.signature';
const PORTAL = { pathname: '/approval/WF-1', search: '?role=legal&token=a%2Bb' };
const PORTAL_QUERY = 'workflowId=WF-1&role=legal&token=a%2Bb';

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

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body } as unknown as Response;
}

describe('withApprovalPortalQuery', () => {
  it('appends the link proof to a URL without a query string', () => {
    expect(withApprovalPortalQuery('/api/approval-workflows/WF-1', PORTAL)).toBe(`/api/approval-workflows/WF-1?${PORTAL_QUERY}`);
  });

  it('appends with & when the URL already has a query string', () => {
    expect(withApprovalPortalQuery('/api/documents/d1/file?inline=1', PORTAL)).toBe(`/api/documents/d1/file?inline=1&${PORTAL_QUERY}`);
  });

  it('leaves the URL alone when the page was not opened from a link', () => {
    expect(withApprovalPortalQuery('/api/approval-workflows/WF-1', { pathname: '/approval-tracking', search: '' }))
      .toBe('/api/approval-workflows/WF-1');
  });

  it('reads the client page link, whose workflow id is the "workflow" parameter', () => {
    const loc = { pathname: '/client-notification', search: '?workflow=WF-9&role=client&token=tok' };
    expect(getApprovalPortalParams(loc)).toEqual({ workflowId: 'WF-9', role: 'client', token: 'tok' });
    expect(getApprovalPortalParams({ pathname: '/client-notification', search: '?workflow=WF-9' })).toBeNull();
  });
});

describe('approvalWorkflowServiceMongoDB single-workflow calls — proof of access', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock = vi.fn().mockResolvedValue(okResponse({ success: true, workflow: { id: 'WF-1' } }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const lastCall = () => fetchMock.mock.calls[0] as [string, RequestInit | undefined];
  const headersOf = (init: RequestInit | undefined) => (init?.headers ?? {}) as Record<string, string>;

  it('getWorkflow sends the link parameters from an emailed portal link', async () => {
    mockLocalStorage(null);
    mockLocation(PORTAL.pathname, PORTAL.search);
    await approvalWorkflowServiceMongoDB.getWorkflow('WF-1');
    const [url, init] = lastCall();
    expect(url).toMatch(new RegExp(`/api/approval-workflows/WF-1\\?${PORTAL_QUERY.replace('+', '\\+')}$`));
    expect(headersOf(init).Authorization).toBeUndefined();
  });

  it('getWorkflow sends the Bearer token for a signed-in user', async () => {
    mockLocalStorage(JWT);
    mockLocation('/approval-tracking', '');
    await approvalWorkflowServiceMongoDB.getWorkflow('WF-1');
    const [url, init] = lastCall();
    expect(url).toMatch(/\/api\/approval-workflows\/WF-1$/);
    expect(headersOf(init).Authorization).toBe(`Bearer ${JWT}`);
  });

  it('updateWorkflowStep sends both the login and the link parameters when both exist', async () => {
    mockLocalStorage(JWT);
    mockLocation(PORTAL.pathname, PORTAL.search);
    await approvalWorkflowServiceMongoDB.updateWorkflowStep('WF-1', 3, { status: 'approved' });
    const [url, init] = lastCall();
    expect(url).toContain(`/api/approval-workflows/WF-1/step/3?${PORTAL_QUERY}`);
    expect(init?.method).toBe('PUT');
    expect(headersOf(init).Authorization).toBe(`Bearer ${JWT}`);
    expect(headersOf(init)['Content-Type']).toBe('application/json');
  });

  it('updateWorkflowStep works from the link alone', async () => {
    mockLocalStorage(null);
    mockLocation(PORTAL.pathname, PORTAL.search);
    await approvalWorkflowServiceMongoDB.updateWorkflowStep('WF-1', 3, { status: 'approved' });
    const [url, init] = lastCall();
    expect(url).toContain(`role=legal&token=a%2Bb`);
    expect(headersOf(init).Authorization).toBeUndefined();
  });

  it('updateWorkflow (staff only) sends the Bearer token', async () => {
    mockLocalStorage(JWT);
    mockLocation('/approval-tracking', '');
    await approvalWorkflowServiceMongoDB.updateWorkflow('WF-1', { status: 'denied' });
    const [, init] = lastCall();
    expect(init?.method).toBe('PUT');
    expect(headersOf(init).Authorization).toBe(`Bearer ${JWT}`);
  });
});

describe('direct approval calls in components carry proof of access', () => {
  const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

  const SINGLE_READS = [
    'src/components/TeamApprovalDashboard.tsx',
    'src/components/TechnicalTeamApprovalDashboard.tsx',
    'src/components/LegalTeamApprovalDashboard.tsx',
    'src/components/ClientNotification.tsx',
  ];

  it.each(SINGLE_READS)('%s reads one workflow with the login header and the link parameters', (file) => {
    const src = read(file);
    expect(src).toContain(
      'fetch(withApprovalPortalQuery(`${BACKEND_URL}/api/approval-workflows/${workflowId}`), { headers: getAuthHeaders() })',
    );
    expect(src).not.toContain('fetch(`${BACKEND_URL}/api/approval-workflows/${workflowId}`)');
  });

  it('ApprovalDashboard sends the login on portal-link and remind', () => {
    const src = read('src/components/ApprovalDashboard.tsx');
    expect(src).toMatch(/\/portal-link`, \{ headers: getAuthHeaders\(\) \}\)/);
    expect(src).toMatch(/\/remind`, \{\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application\/json', \.\.\.getAuthHeaders\(\) \}/);
  });

  it('workflow creation from the e-sign page sends the login', () => {
    const src = read('src/pages/EsignPlaceFieldsPage.tsx');
    expect(src).toMatch(/fetch\(`\$\{BACKEND_URL\}\/api\/approval-workflows`, \{\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application\/json', \.\.\.getAuthHeaders\(\) \}/);
  });
});
