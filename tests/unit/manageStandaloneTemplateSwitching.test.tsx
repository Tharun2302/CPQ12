// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, waitFor, act } from '@testing-library/react';

import App from '../../src/App';
import { effectiveTemplateKey, templateChoiceChanged } from '../../src/utils/templateSelection';

const STANDALONE = { servicePlan: 'Manage', migrationType: '', combination: 'manage-standalone', manageAgreementLabel: 'Manage Standalone', manageUsers: 30 };
const SELECT_COMBINATION = { ...STANDALONE, manageAgreementLabel: '' };
const SPRAWL = { ...STANDALONE, migrationType: 'mange+sprawl', manageAgreementLabel: 'mange+sprawl' };
const MULTI = { servicePlan: 'Migrate', migrationType: 'Multi combination', combination: 'multi-combination', numberOfUsers: 10 };
const MIGRATE = { servicePlan: 'Migrate', migrationType: 'Messaging', combination: 'slack-to-teams', numberOfUsers: 10 };
const BUNDLE = { servicePlan: 'Bundle', migrationType: 'Messaging', combination: 'slack-to-teams', numberOfUsers: 10 };

const BASE_CATALOG = [
  { id: 'row-sprawl', value: 'mange+sprawl', label: 'mange+sprawl', migrationType: 'Manage', hasFile: true },
  { id: 'row-standalone', value: 'manage-standalone-row', label: 'Manage Standalone', migrationType: 'Manage', hasFile: true },
  { id: 'row-multi', value: 'multi-combination', label: 'Multi-Combination', migrationType: 'Multi combination', hasFile: true },
];
const DB_TEMPLATE = { id: 't1', name: 'Slack to Teams', combination: 'slack-to-teams', planType: 'standard', fileName: 'a.docx' };
const STALE_STANDALONE_TEMPLATE = { id: 'combo-row-standalone', name: 'Manage Standalone template', combination: 'manage-standalone-row' };

let catalog: any[] = BASE_CATALOG;

const res = (body: unknown, ok = true) =>
  Promise.resolve({
    ok,
    status: ok ? 200 : 404,
    json: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob(['docx-bytes'])),
  } as unknown as Response);

function mockFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const file = url.match(/\/api\/combinations\/([^/?]+)\/file/);
    if (file) return res({}, catalog.some(c => c.id === file[1] && c.hasFile));
    if (url.includes('/api/combinations')) return res({ success: true, combinations: catalog });
    if (url.endsWith('/api/templates')) return res({ success: true, templates: [DB_TEMPLATE] });
    return res({ success: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const fileFetches = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(c => String(c[0])).filter(u => /\/api\/combinations\/[^/]+\/file/.test(u));
const storedTemplateId = () => JSON.parse(localStorage.getItem('cpq_selected_template') || 'null')?.id ?? null;
const settle = (ms = 800) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

function start(config: object, staleTemplate?: object) {
  sessionStorage.setItem('cpq_configuration_session', JSON.stringify(config));
  if (staleTemplate) localStorage.setItem('cpq_selected_template', JSON.stringify(staleTemplate));
  const fetchMock = mockFetch();
  render(<App />);
  return fetchMock;
}

beforeEach(() => {
  catalog = BASE_CATALOG;
  sessionStorage.clear();
  localStorage.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('App picks the right template per agreement with DB templates loaded', () => {
  it('Manage Standalone loads its catalog file once and keeps it', async () => {
    const fetchMock = start(STANDALONE);
    await settle();
    expect(fileFetches(fetchMock)).toEqual([expect.stringContaining('/row-standalone/file')]);
    expect(storedTemplateId()).toBe('combo-row-standalone');
  }, 15000);

  it('"Select Combination" drops a stale Manage Standalone template and fetches nothing', async () => {
    const fetchMock = start(SELECT_COMBINATION, STALE_STANDALONE_TEMPLATE);
    await settle();
    expect(storedTemplateId()).toBeNull();
    expect(fileFetches(fetchMock)).toEqual([]);
  }, 15000);

  it.each([
    ['mange+sprawl', SPRAWL, 'combo-row-sprawl'],
    ['Multi combination', MULTI, 'combo-row-multi'],
  ])('%s replaces a stale Manage Standalone template with its own', async (_name, config, expected) => {
    const fetchMock = start(config, STALE_STANDALONE_TEMPLATE);
    await settle();
    expect(storedTemplateId()).toBe(expected);
    expect(fileFetches(fetchMock).length).toBeLessThanOrEqual(2);
  }, 15000);

  it.each([
    ['Migrate', MIGRATE],
    ['Bundle', BUNDLE],
  ])('%s drops a stale Manage Standalone template', async (_name, config) => {
    const fetchMock = start(config, STALE_STANDALONE_TEMPLATE);
    await settle();
    expect(storedTemplateId()).not.toBe('combo-row-standalone');
    expect(fileFetches(fetchMock)).toEqual([]);
  }, 15000);

  it('Manage Standalone replaces a stale mange+sprawl template', async () => {
    const fetchMock = start(STANDALONE, { id: 'combo-row-sprawl', name: 'x', combination: 'mange+sprawl' });
    await settle();
    expect(storedTemplateId()).toBe('combo-row-standalone');
    expect(fileFetches(fetchMock).length).toBeLessThanOrEqual(2);
  }, 15000);
});

describe('Combination Manager update (combinationsUpdated)', () => {
  it('reloads the catalog and switches to the replacement Manage Standalone row', async () => {
    const fetchMock = start(STANDALONE);
    await waitFor(() => expect(storedTemplateId()).toBe('combo-row-standalone'));
    const listCalls = () => fetchMock.mock.calls.filter(c => String(c[0]).endsWith('/api/combinations')).length;
    const before = listCalls();

    catalog = [BASE_CATALOG[0], { ...BASE_CATALOG[1], id: 'row-standalone-v2' }];
    await act(async () => { window.dispatchEvent(new CustomEvent('combinationsUpdated')); });
    await settle();

    expect(listCalls()).toBeGreaterThan(before);
    expect(storedTemplateId()).toBe('combo-row-standalone-v2');
    expect(fileFetches(fetchMock).length).toBeLessThanOrEqual(4);
  }, 15000);

  it('picks up a file newly attached to the Manage Standalone row', async () => {
    catalog = [BASE_CATALOG[0], { ...BASE_CATALOG[1], hasFile: false }];
    const fetchMock = start(STANDALONE);
    await settle(400);
    expect(fileFetches(fetchMock)).toEqual([]);

    catalog = BASE_CATALOG;
    await act(async () => { window.dispatchEvent(new CustomEvent('combinationsUpdated')); });
    await settle();
    expect(storedTemplateId()).toBe('combo-row-standalone');
  }, 15000);
});

describe('template key transitions', () => {
  const plans: Record<string, any> = { STANDALONE, SELECT_COMBINATION, SPRAWL, MULTI, MIGRATE, BUNDLE };
  const names = Object.keys(plans);
  // MIGRATE and BUNDLE share a combination but not a plan, so every distinct pair is a change.
  for (const a of names) {
    for (const b of names) {
      it(`${a} -> ${b} ${a === b ? 'keeps' : 'changes'} the template choice`, () => {
        expect(templateChoiceChanged(plans[a], plans[b])).toBe(a !== b);
      });
    }
  }

  it('effectiveTemplateKey resolves each plan to the catalog value it loads', () => {
    expect(effectiveTemplateKey(STANDALONE as any, BASE_CATALOG)).toBe('manage-standalone-row');
    expect(effectiveTemplateKey(SELECT_COMBINATION as any, BASE_CATALOG)).toBe('');
    expect(effectiveTemplateKey(SPRAWL as any, BASE_CATALOG)).toBe('mange+sprawl');
    expect(effectiveTemplateKey(MULTI as any, BASE_CATALOG)).toBe('multi-combination');
    expect(effectiveTemplateKey(MIGRATE as any, BASE_CATALOG)).toBe('slack-to-teams');
    expect(effectiveTemplateKey(STANDALONE as any, [])).toBe('');
  });
});
