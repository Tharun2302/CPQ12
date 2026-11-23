// @vitest-environment jsdom
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import access from '../../document-access.cjs';

vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: { role: 'viewer' } }) }));
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));
// pdfjs-dist needs DOMMatrix, which jsdom lacks
vi.mock('../../src/utils/pdfToWordConverter', () => ({ convertPdfToWord: vi.fn(), downloadWordFile: vi.fn() }));

import QuoteManager from '../../src/components/QuoteManager';

// Document admins get a Delete button on the Documents page; the server refuses everyone else.

const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');
function routeSource(method: string, routePath: string): string {
  const start = serverSrc.indexOf(`\napp.${method}('${routePath}'`);
  expect(start, `${method} ${routePath}`).toBeGreaterThan(-1);
  return serverSrc.slice(start + 1, serverSrc.indexOf('\napp.', start + 2));
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: any) { res.body = payload; return res; },
    set() { return res; },
  };
  return res;
}

describe('GET /api/documents/:id/links', () => {
  const USERS: Record<string, { id: string; email: string }> = {
    admin: { id: 'admin', email: 'docs@test.example' },
    creator: { id: 'creator', email: 'creator@test.example' },
  };
  const DOC_ID = 'Acme_Jane_12345';

  const helperSrc = serverSrc.slice(
    serverSrc.indexOf('// Admin check before the lookup'),
    serverSrc.indexOf('// Delete PDF document by ID'),
  );

  function setup() {
    const counted: Array<[string, unknown]> = [];
    const lookups: string[] = [];
    const db = {
      collection: (name: string) => ({
        findOne: async ({ id }: { id: string }) => {
          lookups.push(id);
          return name === 'documents' && id === DOC_ID ? { id } : null;
        },
        countDocuments: async (filter: unknown) => { counted.push([name, filter]); return name === 'approval_workflows' ? 2 : 1; },
      }),
    };
    let handler: (req: unknown, res: unknown) => Promise<void> = async () => {};
    const deps: Record<string, unknown> = {
      app: { get: (_p: string, h: typeof handler) => { handler = h; } },
      db,
      getAuthenticatedUser: async (req: any, res: any) => {
        const u = USERS[req.headers.user];
        if (!u) res.status(401).json({ success: false });
        return u ?? null;
      },
      mayDeleteDocument: (access as any).mayDeleteDocument,
      parseDocumentIdInput: (access as any).parseDocumentIdInput,
      hasDocumentAdminAccess: async (u: { id: string }) => u.id === 'admin',
      logger: { error: () => {} },
    };
    new Function(...Object.keys(deps), `${helperSrc}\n${routeSource('get', '/api/documents/:id/links')}`)(...Object.values(deps));
    const call = async (who: string, id = DOC_ID) => {
      const res = makeRes();
      await handler({ headers: { user: who }, params: { id } }, res);
      return res;
    };
    return { call, counted, lookups };
  }

  it('checks admin access before looking the document up', async () => {
    const { call, lookups } = setup();
    await call('creator');
    expect(lookups).toEqual([]);
  });

  it('answers 404 for an over-long id without querying', async () => {
    const { call, lookups } = setup();
    expect((await call('admin', 'x'.repeat(201))).statusCode).toBe(404);
    expect(lookups).toEqual([]);
  });

  it('tells a document admin how many approvals and e-sign agreements point at the document', async () => {
    const { call, counted } = setup();
    const res = await call('admin');
    expect(res.statusCode).toBe(200);
    expect(res.body.links).toEqual({ approvals: 2, esign: 1 });
    expect(counted).toEqual([
      ['approval_workflows', { documentId: DOC_ID }],
      ['esign_documents', { source_document_id: DOC_ID }],
    ]);
  });

  it('gives a non-admin (even the creator) the same 404 as a missing document, without counting', async () => {
    const { call, counted } = setup();
    const creator = await call('creator');
    const missing = await call('admin', 'Nope_Nope_00000');
    expect(creator.statusCode).toBe(404);
    expect(creator.body).toEqual(missing.body);
    expect(counted).toEqual([]);
  });

  it('refuses a signed-out caller with 401', async () => {
    const { call } = setup();
    expect((await call('nobody')).statusCode).toBe(401);
  });
});

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const DOCS = [
  { id: 'Acme_Contact_11111', fileName: 'Acme.pdf', fileSize: 1, clientName: 'A', company: 'Acme', generatedDate: '2026-09-20T00:00:00.000Z' },
  { id: 'Beta_Contact_22222', fileName: 'Beta.pdf', fileSize: 1, clientName: 'B', company: 'Beta', generatedDate: '2026-09-20T00:00:00.000Z' },
];

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

function mockFetch(scope: 'all' | 'own', opts: { links?: unknown; deleteStatus?: number } = {}) {
  const fetchMock = vi.fn<FetchFn>((input, init) => {
    const url = String(input);
    if (/\/api\/documents\?/.test(url)) {
      return jsonResponse({ success: true, documents: DOCS, totalCount: DOCS.length, scope });
    }
    if (url.endsWith('/links')) {
      return opts.links === 'error'
        ? jsonResponse({ success: false, error: 'boom' }, 500)
        : jsonResponse({ success: true, links: opts.links ?? { approvals: 0, esign: 0 } });
    }
    if (init?.method === 'DELETE') {
      const status = opts.deleteStatus ?? 200;
      return jsonResponse(status === 200 ? { success: true } : { success: false, error: 'Document not found' }, status);
    }
    return jsonResponse({ success: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderPage(scope: 'all' | 'own', opts?: Parameters<typeof mockFetch>[1]) {
  const fetchMock = mockFetch(scope, opts);
  render(<QuoteManager quotes={[]} templates={[]} />);
  await screen.findByRole('heading', { name: /Saved Documents \(2\)/ });
  return fetchMock;
}

const deleteCalls = (fetchMock: ReturnType<typeof mockFetch>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Documents page Delete button', () => {
  it('is not shown to regular users', async () => {
    await renderPage('own');
    expect(screen.queryByRole('button', { name: /^Delete$/ })).toBeNull();
  });

  it('is shown to document admins on every card', async () => {
    await renderPage('all');
    expect(screen.getAllByRole('button', { name: /^Delete$/ })).toHaveLength(2);
  });

  it('confirms, deletes the right document, and removes it from the list', async () => {
    const fetchMock = await renderPage('all');
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: /^Delete$/ })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Acme');
    expect(deleteCalls(fetchMock)).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await screen.findByRole('heading', { name: /Saved Documents \(1\)/ });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Acme')).toBeNull();
    expect(String(deleteCalls(fetchMock)[0][0])).toMatch(/\/api\/documents\/Acme_Contact_11111$/);
  });

  it('Cancel closes the dialog without deleting', async () => {
    const fetchMock = await renderPage('all');
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: /^Delete$/ })[1]);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(deleteCalls(fetchMock)).toHaveLength(0);
    expect(screen.getByRole('heading', { name: /Saved Documents \(2\)/ })).toBeTruthy();
  });

  it('warns when the document is linked to approvals and e-sign agreements', async () => {
    await renderPage('all', { links: { approvals: 2, esign: 1 } });
    await userEvent.setup().click(screen.getAllByRole('button', { name: /^Delete$/ })[0]);
    expect(await screen.findByText(/linked to 2 approval workflows and 1 e-sign agreement/)).toBeTruthy();
  });

  it('still lets the admin delete when the link check fails, and says so', async () => {
    const fetchMock = await renderPage('all', { links: 'error' });
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: /^Delete$/ })[0]);
    expect(await screen.findByText(/Couldn't check whether this document is linked/)).toBeTruthy();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await screen.findByRole('heading', { name: /Saved Documents \(1\)/ });
    expect(deleteCalls(fetchMock)).toHaveLength(1);
  });

  it('keeps the document and shows an error when the server refuses', async () => {
    await renderPage('all', { deleteStatus: 404 });
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: /^Delete$/ })[0]);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Could not delete this document. Please try again.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Saved Documents \(2\)/ })).toBeTruthy();
  });
});
