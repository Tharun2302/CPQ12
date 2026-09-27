// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { role: 'viewer' } }),
}));

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

// pdfjs-dist needs DOMMatrix, which jsdom lacks; only the Word conversion button uses it
vi.mock('../../src/utils/pdfToWordConverter', () => ({
  convertPdfToWord: vi.fn(),
  downloadWordFile: vi.fn(),
}));

import QuoteManager from '../../src/components/QuoteManager';
import { documentServiceMongoDB } from '../../src/services/documentServiceMongoDB';

type Filter = 'all' | 'in_workflow' | 'no_workflow';
type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function makeDoc(id: string, company: string) {
  return {
    id,
    fileName: `${company} Agreement.pdf`,
    fileSize: 1000,
    clientName: `${company} Contact`,
    clientEmail: `contact@${company.toLowerCase()}.test`,
    company,
    templateName: 'Content migration',
    generatedDate: '2026-09-20T00:00:00.000Z',
  };
}

const ACME = makeDoc('Acme_Contact_11111', 'Acme');
const BETA = makeDoc('Beta_Contact_22222', 'Beta');
const CONTOSO = makeDoc('Contoso_Contact_33333', 'Contoso');
const SERVER_LISTS: Record<Filter, ReturnType<typeof makeDoc>[]> = {
  all: [ACME, BETA, CONTOSO],
  in_workflow: [ACME],
  no_workflow: [BETA, CONTOSO],
};

const LIST_URL = /\/api\/documents\?/;

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

function mockFetch() {
  const fetchMock = vi.fn<FetchFn>((input) => {
    const url = String(input);
    if (LIST_URL.test(url)) {
      const params = new URL(url, 'http://test.local').searchParams;
      const filter = (params.get('approvalFilter') ?? 'all') as Filter;
      const documents = SERVER_LISTS[filter];
      return jsonResponse({
        success: true,
        documents,
        totalCount: documents.length,
        approvalFilter: filter,
      });
    }
    return jsonResponse({ success: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const listRequests = (fetchMock: ReturnType<typeof mockFetch>) => (
  fetchMock.mock.calls.filter(([url]) => LIST_URL.test(String(url)))
);

// New [] on every call, like App.tsx handing down quotes and templates as each loads
const page = () => <QuoteManager quotes={[]} templates={[]} />;

async function renderPage() {
  const fetchMock = mockFetch();
  const getAll = vi.spyOn(documentServiceMongoDB, 'getAllDocuments');
  const utils = render(page());
  await screen.findByRole('heading', { name: /Saved Documents \(3\)/ });
  return { fetchMock, getAll, ...utils };
}

beforeEach(() => {
  // The page and the document service log verbosely; keep test output readable
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  // vitest.config.ts does not enable globals, so RTL's auto-cleanup never registers
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('QuoteManager saved documents loading', () => {
  it('loads the list once, even when new quotes and templates arrays arrive', async () => {
    const { fetchMock, getAll, rerender } = await renderPage();

    rerender(page());
    rerender(page());
    await screen.findByRole('heading', { name: /Saved Documents \(3\)/ });

    expect(getAll).toHaveBeenCalledTimes(1);
    expect(getAll).toHaveBeenCalledWith('all');
    expect(listRequests(fetchMock)).toHaveLength(1);
    expect(screen.queryByText('Loading documents...')).toBeNull();
  });

  it('reloads with the new value when the approval filter changes', async () => {
    const { fetchMock, getAll, rerender } = await renderPage();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Approval workflow'), 'in_workflow');
    await screen.findByRole('heading', { name: /Saved Documents \(1\)/ });

    expect(getAll.mock.calls).toEqual([['all'], ['in_workflow']]);
    const [, filteredRequest] = listRequests(fetchMock);
    expect(String(filteredRequest[0])).toContain('approvalFilter=in_workflow');

    rerender(page());
    await screen.findByRole('heading', { name: /Saved Documents \(1\)/ });
    expect(getAll).toHaveBeenCalledTimes(2);
  });
});
