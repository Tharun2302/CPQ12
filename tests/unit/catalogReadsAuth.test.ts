// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { cleanup, render, waitFor, act } from '@testing-library/react';

import { SIGNED_IN_USER, signIn } from './helpers/signedIn';

let authOverride: { isAuthenticated: boolean; user: { id: string } | null } | null = null;

// Only AuthSignalReporter's own test overrides useAuth; every other render uses the real provider
vi.mock('../../src/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../src/contexts/AuthContext')>('../../src/contexts/AuthContext');
  return { ...actual, useAuth: () => authOverride ?? actual.useAuth() };
});

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8').replace(/\r\n/g, '\n');

// From the fetch opening to the end of that call, so a neighbouring call cannot satisfy the check
function callWindows(src: string, opening: RegExp): string[] {
  const global = new RegExp(opening.source, 'g');
  const windows: string[] = [];
  for (const match of src.matchAll(global)) {
    const rest = src.slice(match.index);
    const ends = [rest.indexOf(');'), rest.indexOf('.then(')].filter((i) => i > 0);
    windows.push(rest.slice(0, Math.min(...ends)));
  }
  return windows;
}

interface Site {
  label: string;
  file: string;
  opening: RegExp;
  count: number;
}

const BACKEND = '`\\$\\{BACKEND_URL\\}';
const SITES: Site[] = [
  { label: 'GET /api/combinations (App catalog)', file: 'src/App.tsx', opening: new RegExp(`fetch\\(${BACKEND}/api/combinations\``), count: 1 },
  { label: 'GET /api/templates (App list)', file: 'src/App.tsx', opening: new RegExp(`fetch\\(${BACKEND}/api/templates\``), count: 1 },
  { label: 'GET /api/templates/:id/file (App loaders)', file: 'src/App.tsx', opening: new RegExp(`fetch\\(${BACKEND}/api/templates/\\$\\{[\\w.]+\\}/file\``), count: 4 },
  { label: 'GET /api/combinations/:id/file (App)', file: 'src/App.tsx', opening: new RegExp(`fetch\\(${BACKEND}/api/combinations/\\$\\{combo\\.id\\}/file\``), count: 1 },
  { label: 'GET /api/combinations (ConfigurationForm)', file: 'src/components/ConfigurationForm.tsx', opening: new RegExp(`fetch\\(${BACKEND}/api/combinations\``), count: 1 },
  { label: 'GET /api/exhibits (ConfigurationForm)', file: 'src/components/ConfigurationForm.tsx', opening: new RegExp(`fetch\\(${BACKEND}/api/exhibits\``), count: 3 },
  { label: 'GET /api/combinations (ExhibitSelector)', file: 'src/components/ExhibitSelector.tsx', opening: new RegExp(`fetch\\(${BACKEND}/api/combinations\``), count: 1 },
  { label: 'GET /api/exhibits (ExhibitSelector)', file: 'src/components/ExhibitSelector.tsx', opening: new RegExp(`fetch\\(\\s*${BACKEND}/api/exhibits\``), count: 1 },
  { label: 'GET /api/exhibits (PricingComparison)', file: 'src/components/PricingComparison.tsx', opening: new RegExp(`fetch\\(${BACKEND}/api/exhibits\``), count: 1 },
  { label: 'GET /api/exhibits (useSprawlGroups)', file: 'src/hooks/useSprawlGroups.ts', opening: new RegExp(`fetch\\(${BACKEND}/api/exhibits\``), count: 1 },
  { label: 'GET /api/exhibits + /file (manageExhibitMerge)', file: 'src/utils/manageExhibitMerge.ts', opening: /fetch\(`\$\{opts\.backendUrl\}\/api\/exhibits/, count: 2 },
  { label: 'GET /api/combinations (ExhibitManager)', file: 'src/components/ExhibitManager.tsx', opening: new RegExp(`fetch\\(${BACKEND}/api/combinations\``), count: 1 },
  { label: 'GET /api/exhibits (ExhibitManager list)', file: 'src/components/ExhibitManager.tsx', opening: new RegExp(`fetch\\(${BACKEND}/api/exhibits\``), count: 2 },
  { label: 'GET /api/exhibits/:id/file (ExhibitManager)', file: 'src/components/ExhibitManager.tsx', opening: /fetch\(\s*`\$\{BACKEND_URL\}\/api\/exhibits\/\$\{encodeURIComponent\(exhibitId\)\}\/file/, count: 1 },
  { label: 'GET /api/combinations/:id/file (CombinationManager preview + download)', file: 'src/components/CombinationManager.tsx', opening: new RegExp(`fetch\\(${BACKEND}/api/combinations/\\$\\{c\\.id\\}/file\``), count: 2 },
  { label: 'GET /api/combinations (CombinationManager list)', file: 'src/components/CombinationManager.tsx', opening: /fetch\(url,/, count: 1 },
  { label: 'GET /api/combinations + /file (QuoteGenerator)', file: 'src/components/QuoteGenerator.tsx', opening: new RegExp(`fetch\\(${BACKEND}/api/combinations`), count: 4 },
  { label: 'GET /api/templates/:id/file (QuoteGenerator)', file: 'src/components/QuoteGenerator.tsx', opening: new RegExp(`fetch\\(${BACKEND}/api/templates/\\$\\{selectedTemplate\\.id\\}/file`), count: 2 },
  { label: 'GET /api/exhibits + /file (QuoteGenerator)', file: 'src/components/QuoteGenerator.tsx', opening: new RegExp(`fetch\\(${BACKEND}/api/exhibits`), count: 6 },
  { label: 'GET /api/templates/:id/file (TemplateManager cache loader)', file: 'src/components/TemplateManager.tsx', opening: new RegExp(`fetch\\(${BACKEND}/api/templates/\\$\\{templateId\\}/file\``), count: 1 },
  { label: 'GET /api/templates/:id/file (EditDatesModal)', file: 'src/components/EditDatesModal.tsx', opening: new RegExp(`fetch\\(${BACKEND}/api/templates/\\$\\{context\\.templateId\\}/file\``), count: 1 },
  { label: 'GET /api/templates (templateService)', file: 'src/utils/templateService.ts', opening: /fetch\(`\$\{this\.baseUrl\}\/templates`/, count: 2 },
  { label: 'GET /api/templates/:id/file (templateService)', file: 'src/utils/templateService.ts', opening: /fetch\(`\$\{this\.baseUrl\}\/templates\/\$\{templateId\}\/file`/, count: 1 },
];

describe('catalog read calls send the saved login', () => {
  for (const site of SITES) {
    it(`${site.label} (${site.file})`, () => {
      const windows = callWindows(read(site.file), site.opening);
      expect(windows).toHaveLength(site.count);
      for (const win of windows) expect(win).toMatch(/getAuthHeaders\(\)/);
    });
  }

  it('no catalog file is exposed as a plain link that cannot send the login', () => {
    expect(read('src/components/CombinationManager.tsx')).not.toMatch(/href=\{`\$\{BACKEND_URL\}\/api\/combinations/);
  });

  it('every src call to the catalog routes is covered by a site above', () => {
    const covered = new Set(SITES.map((s) => s.file));
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.resolve(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(entry.name) && !covered.has(rel)) {
          if (/fetch\([^)]*\/(api\/)?(templates|combinations|exhibits)\b/.test(read(rel))) offenders.push(rel);
        }
      }
    };
    walk('src');
    expect(offenders).toEqual([]);
  });
});

describe('App-level catalog loads wait for login and re-run on it', () => {
  const app = read('src/App.tsx');

  it('relays sign-in state from inside AuthProvider', () => {
    expect(app).toMatch(/<AuthProvider>[\s\S]*<AuthSignalReporter onChange=\{setAuthSignal\} \/>/);
    expect(read('src/components/AuthSignalReporter.tsx')).toMatch(/useAuth\(\)/);
  });

  it('combinations effect is gated on the token and depends on the auth signal', () => {
    const effect = app.slice(app.indexOf('if (!authSignal) return;'), app.indexOf('}, [authSignal]);') + '}, [authSignal]);'.length);
    expect(effect).toContain('if (!authSignal) return;');
    expect(effect).toMatch(/if \(!hasUsableAuthToken\(\)\) return;[\s\S]*fetch\(`\$\{BACKEND_URL\}\/api\/combinations`, \{ headers: getAuthHeaders\(\) \}\)/);
    expect(effect).toMatch(/\}, \[authSignal\]\);$/);
  });

  it('templates effect only calls the API with a usable token and depends on the auth signal', () => {
    expect(app).toMatch(/hasUsableAuthToken\(\)\s*\? await fetch\(`\$\{BACKEND_URL\}\/api\/templates`, \{ headers: getAuthHeaders\(\) \}\)\s*: null;/);
    const start = app.indexOf("window.addEventListener('templatesUpdated', handleTemplateUpdate);");
    expect(app.slice(start, start + 220)).toMatch(/\}, \[authSignal\]\);/);
  });

  it('no App-level effect fetches the catalog without a token gate', () => {
    expect(app).not.toMatch(/fetch\(`\$\{BACKEND_URL\}\/api\/(combinations|templates)`\)/);
  });
});

describe('AuthSignalReporter', () => {
  afterEach(() => {
    authOverride = null;
    cleanup();
  });

  it('reports null while signed out and the user id after sign-in', async () => {
    const { default: AuthSignalReporter } = await import('../../src/components/AuthSignalReporter');
    const onChange = vi.fn();
    authOverride = { isAuthenticated: false, user: null };
    const view = render(React.createElement(AuthSignalReporter, { onChange }));
    expect(onChange).toHaveBeenLastCalledWith(null);

    authOverride = { isAuthenticated: true, user: { id: 'u1' } };
    view.rerender(React.createElement(AuthSignalReporter, { onChange }));
    expect(onChange).toHaveBeenLastCalledWith('u1');
  });
});

const CATALOG_URL = /\/api\/(combinations|templates|exhibits)/;

function stubFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.endsWith('/api/auth/me')
      ? { success: true, user: SIGNED_IN_USER }
      : url.endsWith('/api/combinations')
        ? { success: true, combinations: [] }
        : url.endsWith('/api/templates')
          ? { success: true, templates: [] }
          : { success: true };
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      blob: () => Promise.resolve(new Blob([])),
      text: () => Promise.resolve(''),
    } as unknown as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const catalogCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter((c) => CATALOG_URL.test(String(c[0])));
const settle = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

describe('App behaviour at runtime', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The approval pages pull in pdf.js, which expects a browser DOMMatrix at import time
    vi.stubGlobal('DOMMatrix', class {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
  });

  const PUBLIC_PAGES = [
    '/', '/signin', '/signup', '/sign/doc-1', '/esign-inbox', '/approval/wf-1',
    '/team-lead-approval', '/technical-approval', '/legal-approval', '/team-approval',
  ];

  it.each(PUBLIC_PAGES)('signed out on %s makes no catalog call', async (route) => {
    const fetchMock = stubFetch();
    window.history.pushState({}, '', route);
    const { default: App } = await import('../../src/App');
    render(React.createElement(App));
    await settle(500);
    expect(catalogCalls(fetchMock).map((c) => String(c[0]))).toEqual([]);
  });

  it('an expired token counts as signed out', async () => {
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 }));
    localStorage.setItem('cpq_token', `header.${payload}.signature`);
    localStorage.setItem('cpq_user', JSON.stringify(SIGNED_IN_USER));
    const fetchMock = stubFetch();
    const { default: App } = await import('../../src/App');
    render(React.createElement(App));
    await settle(500);
    expect(catalogCalls(fetchMock)).toEqual([]);
  });

  it('signed in, the catalog loads with the Bearer token', async () => {
    signIn();
    const fetchMock = stubFetch();
    const { default: App } = await import('../../src/App');
    render(React.createElement(App));
    await waitFor(() => {
      const urls = catalogCalls(fetchMock).map((c) => String(c[0]));
      expect(urls.some((u) => u.endsWith('/api/combinations'))).toBe(true);
      expect(urls.some((u) => u.endsWith('/api/templates'))).toBe(true);
    });
    for (const call of catalogCalls(fetchMock)) {
      const headers = (call[1] as RequestInit | undefined)?.headers as Record<string, string> | undefined;
      expect(headers?.Authorization).toMatch(/^Bearer header\./);
    }
  });
});
