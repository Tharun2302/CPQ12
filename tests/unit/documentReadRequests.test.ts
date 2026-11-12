import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fetchDocumentFileObjectUrl, getDocumentFileInlineUrl } from '../../src/utils/documentPreviewUrl';

// Stored documents need proof of access: the login JWT, or the emailed link's parameters.
// A call that drops both shows the caller a broken preview instead of the agreement.

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8').replace(/\r\n/g, '\n');

const JWT = 'header.payload.signature';
const PORTAL_QUERY = 'workflowId=WF-1&role=legal&token=tok-1';

function mockPage(pathname: string, search: string, token: string | null): void {
  vi.stubGlobal('window', { location: { pathname, search } });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k === 'cpq_token' ? token : null),
    setItem: () => {},
    removeItem: () => {},
  });
}

describe('document file URLs', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('carries the link parameters on a page opened from an emailed approval link', () => {
    mockPage('/approval/WF-1', '?role=legal&token=tok-1', null);
    expect(getDocumentFileInlineUrl('Acme_John_1')).toMatch(new RegExp(`/api/documents/Acme_John_1/file\\?inline=1&${PORTAL_QUERY}$`));
  });

  it('carries the client link parameters on the customer page', () => {
    mockPage('/client-notification', '?workflow=WF-9&role=client&token=tok-9', null);
    expect(getDocumentFileInlineUrl('D 1')).toMatch(/\/api\/documents\/D%201\/file\?inline=1&workflowId=WF-9&role=client&token=tok-9$/);
  });

  it('stays a plain URL on a staff page', () => {
    mockPage('/approval-tracking', '', JWT);
    expect(getDocumentFileInlineUrl('D1')).toMatch(/\/api\/documents\/D1\/file\?inline=1$/);
  });
});

describe('fetchDocumentFileObjectUrl', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['%PDF']) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:doc', revokeObjectURL: () => {} });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  const lastCall = () => fetchMock.mock.calls[0] as [string, RequestInit];

  it('sends the saved login on a staff page', async () => {
    mockPage('/approval-tracking', '', JWT);
    await expect(fetchDocumentFileObjectUrl('D1')).resolves.toBe('blob:doc');
    const [url, init] = lastCall();
    expect(url).toMatch(/\/api\/documents\/D1\/file\?inline=1$/);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${JWT}`);
  });

  it('sends the link parameters when there is no login', async () => {
    mockPage('/approval/WF-1', '?role=legal&token=tok-1', null);
    await fetchDocumentFileObjectUrl('D1', false);
    const [url, init] = lastCall();
    expect(url).toMatch(new RegExp(`/api/documents/D1/file\\?${PORTAL_QUERY}$`));
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('reports the server message when the document is refused', async () => {
    mockPage('/approval-tracking', '', null);
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ success: false, error: 'Authentication required' }) });
    await expect(fetchDocumentFileObjectUrl('D1')).rejects.toThrow('Authentication required');
  });
});

describe('every stored-document request carries proof of access', () => {
  const LINK_PAGES = [
    'src/components/TeamApprovalDashboard.tsx',
    'src/components/TechnicalTeamApprovalDashboard.tsx',
    'src/components/LegalTeamApprovalDashboard.tsx',
    'src/components/ClientNotification.tsx',
  ];
  const STAFF_PAGES = [
    'src/components/ApprovalDashboard.tsx',
    'src/components/InfrateamDashboard.tsx',
    'src/components/MigrationMonitoringDashboard.tsx',
    'src/components/EsignPrepareModal.tsx',
    'src/components/EditDatesModal.tsx',
    'src/services/documentServiceMongoDB.ts',
  ];
  const DOCUMENT_URL = /\/api\/documents\/\$\{|\$\{this\.apiUrl\}\/\$\{id\}|getDocumentFileInlineUrl\(/;

  // Calls spread over several lines are covered by authHeadersOnProtectedCalls.test.ts.
  const MULTI_LINE_CALL = /\{\s*$/;

  const fetchLines = (file: string) => read(file).split('\n')
    .filter((line) => /\bfetch\(/.test(line) && DOCUMENT_URL.test(line) && !MULTI_LINE_CALL.test(line));

  it.each(LINK_PAGES)('%s sends the login and the link parameters on each document fetch', (file) => {
    const lines = fetchLines(file);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line, line.trim()).toMatch(/fetch\(withApprovalPortalQuery\(/);
      expect(line, line.trim()).toMatch(/headers: getAuthHeaders\(\)/);
    }
  });

  it.each(STAFF_PAGES)('%s sends the login on each document fetch', (file) => {
    for (const line of fetchLines(file)) {
      expect(line, line.trim()).toMatch(/getAuthHeaders\(\)/);
    }
  });

  it('the pages still make the document fetches these checks are about', () => {
    expect(fetchLines('src/components/TeamApprovalDashboard.tsx')).toHaveLength(4);
    expect(fetchLines('src/components/TechnicalTeamApprovalDashboard.tsx')).toHaveLength(3);
    expect(fetchLines('src/components/LegalTeamApprovalDashboard.tsx')).toHaveLength(3);
    expect(fetchLines('src/components/ClientNotification.tsx')).toHaveLength(1);
    expect(fetchLines('src/components/ApprovalDashboard.tsx')).toHaveLength(3);
    expect(fetchLines('src/components/InfrateamDashboard.tsx')).toHaveLength(1);
    expect(fetchLines('src/components/MigrationMonitoringDashboard.tsx')).toHaveLength(2);
    expect(fetchLines('src/services/documentServiceMongoDB.ts')).toHaveLength(1);
  });

  it('no link, iframe or new window points straight at a stored document', () => {
    for (const file of [...LINK_PAGES, ...STAFF_PAGES]) {
      const src = read(file);
      expect(src, file).not.toMatch(/(href|src)=\{\s*`\$\{BACKEND_URL\}\/api\/documents\//);
      expect(src, file).not.toMatch(/window\.open\(\s*`\$\{BACKEND_URL\}\/api\/documents\//);
      expect(src, file).not.toMatch(/officeapps\.live\.com\/op\/embed\.aspx\?src=/);
    }
    expect(read('src/components/EsignPrepareModal.tsx')).not.toContain('/api/documents/');
  });

  it('downloads and the PDF viewer use the authenticated helpers', () => {
    expect(read('src/components/ClientNotification.tsx')).toContain('await downloadDocumentFile(workflow.documentId, `${workflow.documentId}.pdf`, false);');
    expect(read('src/components/MigrationMonitoringDashboard.tsx').match(/handleDownloadStoredDocument\(/g)).toHaveLength(3);
    expect(read('src/components/EsignPrepareModal.tsx')).toContain('fetchDocumentFileObjectUrl(workflowDocumentId)');
    expect(read('src/components/PdfCanvasViewer.tsx')).toContain("fetch(src, { mode: 'cors', credentials: 'include', headers: getAuthHeaders() })");
    const helper = read('src/utils/documentPreviewUrl.ts');
    expect(helper).toContain('return withApprovalPortalQuery(url);');
    expect(helper).toContain('fetch(documentFileUrl(documentId, inline), { headers: getAuthHeaders() })');
  });
});
