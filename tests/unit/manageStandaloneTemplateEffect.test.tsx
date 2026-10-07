// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, waitFor, act } from '@testing-library/react';

import App from '../../src/App';

const STANDALONE_CONFIG = {
  servicePlan: 'Manage',
  migrationType: '',
  combination: 'manage-standalone',
  manageAgreementLabel: 'Manage Standalone',
  manageUsers: 30,
  numberOfUsers: 30,
};

const COMBINATIONS = [
  { id: 'row-sprawl', value: 'mange+sprawl', label: 'mange+sprawl', migrationType: 'Manage', hasFile: true, fileName: 'sprawl.docx' },
  { id: 'row-standalone', value: 'manage-standalone-row', label: 'Manage Standalone', migrationType: 'Manage', hasFile: true, fileName: 'standalone.docx' },
];

const DB_TEMPLATE = { id: 't1', name: 'Some DB template', combination: 'slack-to-teams', planType: 'standard', fileName: 'a.docx' };

const ok = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob(['docx-bytes'])),
  } as unknown as Response);

function mockFetch(templates: unknown[], combinations: unknown[] = COMBINATIONS, failCatalogTimes = 0) {
  let catalogCalls = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (/\/api\/combinations\/[^/]+\/file/.test(url)) return ok({});
    if (url.includes('/api/combinations')) {
      catalogCalls += 1;
      if (catalogCalls <= failCatalogTimes) return failed();
      return ok({ success: true, combinations });
    }
    if (url.endsWith('/api/templates')) return ok({ success: true, templates });
    return ok({ success: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const failed = () =>
  Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({ success: false }) } as unknown as Response);

const catalogFetches = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter(c => String(c[0]).endsWith('/api/combinations'));

const fileFetches = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(c => String(c[0])).filter(u => /\/api\/combinations\/[^/]+\/file/.test(u));

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  sessionStorage.setItem('cpq_configuration_session', JSON.stringify(STANDALONE_CONFIG));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('App combination-file effect for the built-in Manage Standalone option', () => {
  it('loads the template from the catalog row labelled Manage Standalone', async () => {
    const fetchMock = mockFetch([]);
    render(<App />);
    await waitFor(() => expect(fileFetches(fetchMock).some(u => u.includes('/api/combinations/row-standalone/file'))).toBe(true));
    expect(fileFetches(fetchMock).some(u => u.includes('row-sprawl'))).toBe(false);
  });

  it('fetches the catalog file once even when DB templates are loaded', async () => {
    const fetchMock = mockFetch([DB_TEMPLATE]);
    render(<App />);
    await waitFor(() => expect(fileFetches(fetchMock).length).toBeGreaterThan(0));
    await new Promise(r => setTimeout(r, 1000));
    expect(fileFetches(fetchMock)).toHaveLength(1);
  }, 15000);

  it('fetches a catalog agreement file once when DB templates are loaded (control: mange+sprawl)', async () => {
    sessionStorage.setItem('cpq_configuration_session', JSON.stringify({
      ...STANDALONE_CONFIG, migrationType: 'mange+sprawl', manageAgreementLabel: 'mange+sprawl',
    }));
    const fetchMock = mockFetch([DB_TEMPLATE]);
    render(<App />);
    await waitFor(() => expect(fileFetches(fetchMock).length).toBeGreaterThan(0));
    await new Promise(r => setTimeout(r, 1000));
    expect(fileFetches(fetchMock)).toEqual([expect.stringContaining('/api/combinations/row-sprawl/file')]);
  }, 15000);

  it('fetches no file when no catalog row is labelled Manage Standalone', async () => {
    const fetchMock = mockFetch([], COMBINATIONS.slice(0, 1));
    render(<App />);
    await waitFor(() => expect(fetchMock.mock.calls.some(c => String(c[0]).endsWith('/api/combinations'))).toBe(true));
    await new Promise(r => setTimeout(r, 300));
    expect(fileFetches(fetchMock)).toEqual([]);
  }, 15000);

  it('fetches no file when the Manage Standalone row has no attachment', async () => {
    const fetchMock = mockFetch([], [COMBINATIONS[0], { ...COMBINATIONS[1], hasFile: false }]);
    render(<App />);
    await waitFor(() => expect(fetchMock.mock.calls.some(c => String(c[0]).endsWith('/api/combinations'))).toBe(true));
    await new Promise(r => setTimeout(r, 300));
    expect(fileFetches(fetchMock)).toEqual([]);
  }, 15000);

  it('keeps a hand-picked DB template instead of loading the catalog file', async () => {
    localStorage.setItem('cpq_selected_template', JSON.stringify(DB_TEMPLATE));
    const fetchMock = mockFetch([DB_TEMPLATE]);
    render(<App />);
    await waitFor(() => expect(fetchMock.mock.calls.some(c => String(c[0]).endsWith('/api/combinations'))).toBe(true));
    await new Promise(r => setTimeout(r, 1000));
    expect(fileFetches(fetchMock)).toEqual([]);
    expect(JSON.parse(localStorage.getItem('cpq_selected_template') || '{}').id).toBe('t1');
  }, 15000);

  it('fetches the catalog list once rather than per template change', async () => {
    const fetchMock = mockFetch([DB_TEMPLATE]);
    render(<App />);
    await waitFor(() => expect(fileFetches(fetchMock).length).toBeGreaterThan(0));
    await new Promise(r => setTimeout(r, 500));
    expect(fetchMock.mock.calls.filter(c => String(c[0]).endsWith('/api/combinations'))).toHaveLength(1);
  }, 15000);

  it('retries the catalog after a failed load and then loads the template', async () => {
    const fetchMock = mockFetch([], COMBINATIONS, 2);
    render(<App />);
    await waitFor(
      () => expect(fileFetches(fetchMock)).toEqual([expect.stringContaining('/api/combinations/row-standalone/file')]),
      { timeout: 5000 },
    );
    expect(catalogFetches(fetchMock)).toHaveLength(3);
  }, 15000);

  it('stops retrying the catalog after a bounded number of attempts', async () => {
    const fetchMock = mockFetch([], COMBINATIONS, Infinity);
    render(<App />);
    await new Promise(r => setTimeout(r, 5000));
    expect(catalogFetches(fetchMock)).toHaveLength(4);
    expect(fileFetches(fetchMock)).toEqual([]);
  }, 15000);
});

describe('App maps a legacy Manage Standalone session without ConfigurationForm', () => {
  it('rewrites the stored config to the built-in option and loads its template', async () => {
    sessionStorage.setItem('cpq_configuration_session', JSON.stringify({
      ...STANDALONE_CONFIG, migrationType: 'manage-standalone-row', contentConfigs: [{ exhibitId: 'e1' }],
    }));
    sessionStorage.setItem('cpq_selected_exhibits', JSON.stringify(['e1']));
    const fetchMock = mockFetch([]);
    render(<App />);
    await waitFor(() => {
      const stored = JSON.parse(sessionStorage.getItem('cpq_configuration_session') || '{}');
      expect(stored.migrationType).toBe('');
      expect(stored.manageAgreementLabel).toBe('Manage Standalone');
      expect(stored.contentConfigs).toEqual([]);
    });
    expect(sessionStorage.getItem('cpq_selected_exhibits')).toBeNull();
    await waitFor(() => expect(fileFetches(fetchMock).some(u => u.includes('row-standalone'))).toBe(true));
  }, 15000);

  it('leaves a catalog agreement session untouched', async () => {
    const agreement = { ...STANDALONE_CONFIG, migrationType: 'mange+sprawl', manageAgreementLabel: 'mange+sprawl' };
    sessionStorage.setItem('cpq_configuration_session', JSON.stringify(agreement));
    const fetchMock = mockFetch([]);
    render(<App />);
    await waitFor(() => expect(catalogFetches(fetchMock).length).toBeGreaterThan(0));
    await new Promise(r => setTimeout(r, 300));
    const stored = JSON.parse(sessionStorage.getItem('cpq_configuration_session') || '{}');
    expect(stored.migrationType).toBe('mange+sprawl');
  }, 15000);
});
