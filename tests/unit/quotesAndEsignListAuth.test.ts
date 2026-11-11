// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { cleanup, render, waitFor, act, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

import { SIGNED_IN_USER, signIn } from './helpers/signedIn';

vi.mock('../../src/components/auth/SignInForm', () => ({
  default: ({ onSuccess }: { onSuccess?: () => void }) =>
    React.createElement('button', { onClick: () => onSuccess?.() }, 'finish sign in'),
}));

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8').replace(/\r\n/g, '\n');

// From the fetch opening to the end of that call, so a neighbouring call cannot satisfy the check
function callWindows(src: string, opening: RegExp): string[] {
  const global = new RegExp(opening.source, 'g');
  const windows: string[] = [];
  for (const match of src.matchAll(global)) {
    const rest = src.slice(match.index);
    const end = rest.search(/(?<!getAuthHeaders\()\),\n|\}\);|\}\),|body:/);
    windows.push(rest.slice(0, end));
  }
  return windows;
}

interface Site {
  label: string;
  file: string;
  opening: RegExp;
  count: number;
}

const B = '`\\$\\{BACKEND_URL\\}';
const SITES: Site[] = [
  { label: 'GET /api/team-approval-settings (ApprovalWorkflow)', file: 'src/components/ApprovalWorkflow.tsx', opening: new RegExp(`fetch\\(${B}/api/team-approval-settings\``), count: 2 },
  { label: 'GET /api/team-approval-settings (QuoteGenerator)', file: 'src/components/QuoteGenerator.tsx', opening: new RegExp(`fetch\\(${B}/api/team-approval-settings\``), count: 2 },
  { label: 'GET /api/esign/agreement-status (documents page)', file: 'src/pages/EsignDocumentsPage.tsx', opening: new RegExp(`fetch\\(${B}/api/esign/agreement-status\``), count: 1 },
  { label: 'GET /api/esign/agreement-status (status dashboard)', file: 'src/components/EsignAgreementStatusDashboard.tsx', opening: new RegExp(`fetch\\(${B}/api/esign/agreement-status\``), count: 1 },
  { label: 'every /api/esign fetch (EsignDocumentsPage)', file: 'src/pages/EsignDocumentsPage.tsx', opening: new RegExp(`fetch\\(${B}/api/esign/`), count: 8 },
  { label: 'every /api/esign fetch (EsignTrackingPage)', file: 'src/pages/EsignTrackingPage.tsx', opening: new RegExp(`fetch\\(${B}/api/esign/`), count: 4 },
  { label: 'HEAD file pre-flight (EsignTrackingPage)', file: 'src/pages/EsignTrackingPage.tsx', opening: /fetch\(fileUrl,/, count: 1 },
  { label: 'every /api/esign fetch (EsignSendPage)', file: 'src/pages/EsignSendPage.tsx', opening: new RegExp(`fetch\\(${B}/api/esign/`), count: 3 },
  { label: 'every /api/esign fetch (EsignPlaceFieldsPage)', file: 'src/pages/EsignPlaceFieldsPage.tsx', opening: new RegExp(`fetch\\(${B}/api/esign/`), count: 8 },
  { label: 'every /api/esign fetch (status dashboard)', file: 'src/components/EsignAgreementStatusDashboard.tsx', opening: new RegExp(`fetch\\(${B}/api/esign/`), count: 10 },
  { label: 'POST send-for-signature (esignDocumentService)', file: 'src/services/esignDocumentService.ts', opening: new RegExp(`fetch\\(${B}/api/esign/documents/\\$\\{documentId\\}/send-for-signature\``), count: 1 },
  { label: 'GET edit-context (EditDatesModal)', file: 'src/components/EditDatesModal.tsx', opening: /fetch\(`\$\{endpointBase\}\/edit-context`/, count: 1 },
];

describe('login-only calls on the quotes, team settings and e-sign sender pages send the saved login', () => {
  for (const site of SITES) {
    it(`${site.label} (${site.file})`, () => {
      const windows = callWindows(read(site.file), site.opening);
      expect(windows).toHaveLength(site.count);
      for (const win of windows) expect(win).toMatch(/getAuthHeaders\(\)|authHeaders\(\)/);
    });
  }

  it('the upload keeps FormData free of a hand-set Content-Type', () => {
    const [win] = callWindows(read('src/pages/EsignDocumentsPage.tsx'), new RegExp(`fetch\\(${B}/api/esign/documents/upload\``));
    expect(win).toMatch(/headers: getAuthHeaders\(\)/);
    expect(win).not.toMatch(/Content-Type/);
  });

  it('signer-token pages are left exactly as they were', () => {
    expect(read('src/pages/EsignSignPage.tsx')).not.toMatch(/getAuthHeaders/);
    expect(read('src/pages/EsignInboxByToken.tsx')).not.toMatch(/getAuthHeaders/);
  });

  it('both e-sign list pages show the expired-login message on a 401', () => {
    expect(read('src/pages/EsignDocumentsPage.tsx')).toMatch(/authAwareError\(res\.status, data\.error,/);
    expect(read('src/components/EsignAgreementStatusDashboard.tsx')).toMatch(/authAwareError\(res\.status,/);
  });
});

describe('App-level quotes load waits for login and re-runs on it', () => {
  const app = read('src/App.tsx');
  const start = app.indexOf('// The quotes route needs a login');
  const effect = app.slice(start, app.indexOf('}, [authSignal]);', start) + '}, [authSignal]);'.length);

  it('is gated on the auth signal and a usable token, and sends the Bearer header', () => {
    expect(start).toBeGreaterThan(-1);
    expect(effect).toMatch(/if \(authSignal && hasUsableAuthToken\(\)\)/);
    expect(effect).toMatch(/fetch\(`\$\{BACKEND_URL\}\/api\/quotes`, \{ headers: getAuthHeaders\(\) \}\)/);
    expect(effect).toMatch(/\}, \[authSignal\]\);$/);
  });

  it('keeps the localStorage fallback', () => {
    expect(effect).toContain("localStorage.getItem('cpq_quotes')");
  });

  it('no GET /api/quotes call is left without the header', () => {
    expect(app.match(/fetch\(`\$\{BACKEND_URL\}\/api\/quotes`\)/g)).toBeNull();
  });
});

describe('e-sign sender routes sit behind ProtectedRoute, signer routes do not', () => {
  const app = read('src/App.tsx');
  const routeOf = (needle: string) => {
    const at = app.indexOf(needle);
    expect(at).toBeGreaterThan(-1);
    return app.slice(at, app.indexOf('/>', at) + 2);
  };

  it('wraps /esign (and so its place-fields, send and status children) and /esign-tracking', () => {
    expect(app).toMatch(/<Route path="\/esign" element=\{<ProtectedRoute><EsignLayout \/><\/ProtectedRoute>\}>/);
    expect(app).toMatch(/<Route path="\/esign-tracking" element=\{\s*<ProtectedRoute>\s*<EsignAgreementStatusDashboard \/>\s*<\/ProtectedRoute>\s*\}/);
    const from = app.indexOf('<Route path="/esign" element');
    const group = app.slice(from, app.indexOf('</Route>', from));
    for (const child of ['place-fields', 'send', 'status']) expect(group).toContain(`:documentId/${child}`);
  });

  it('never wraps /sign/:documentId or /esign-inbox', () => {
    expect(routeOf('<Route path="/sign/:documentId"')).not.toContain('ProtectedRoute');
    expect(routeOf('<Route path="/esign-inbox"')).not.toContain('ProtectedRoute');
  });
});

describe('returning to the page a signed-out visitor came from', () => {
  afterEach(() => cleanup());

  function Where() {
    const loc = useLocation();
    return React.createElement('div', { 'data-testid': 'where' }, `${loc.pathname}${loc.search}`);
  }

  async function signInFrom(state: unknown) {
    const { default: SignInPage } = await import('../../src/pages/SignInPage');
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: [{ pathname: '/signin', state }] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: '/signin', element: React.createElement(SignInPage) }),
          React.createElement(Route, { path: '*', element: React.createElement(Where) })
        )
      )
    );
    fireEvent.click(screen.getByText('finish sign in'));
  }

  it('sends an emailed /esign/<id>/status link back to that page after sign-in', async () => {
    await signInFrom({ from: { pathname: '/esign/doc-9/status', search: '?x=1', hash: '' } });
    expect((await screen.findByTestId('where')).textContent).toBe('/esign/doc-9/status?x=1');
  });

  it('falls back to /deal without a saved page and ignores non-local paths', async () => {
    await signInFrom(undefined);
    expect((await screen.findByTestId('where')).textContent).toBe('/deal');
    cleanup();
    await signInFrom({ from: { pathname: '//evil.example/x' } });
    expect((await screen.findByTestId('where')).textContent).toBe('/deal');
  });

  it('the landing page passes the wanted page on to Sign In', () => {
    expect(read('src/pages/LandingPage.tsx')).toMatch(/to="\/signin"\s+state=\{from \? \{ from \} : undefined\}/);
  });
});

const QUOTES_URL = /\/api\/quotes/;

function stubFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.endsWith('/api/auth/me')
      ? { success: true, user: SIGNED_IN_USER }
      : url.endsWith('/api/quotes')
        ? { success: true, quotes: [] }
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

const quoteCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter((c) => QUOTES_URL.test(String(c[0])));
const settle = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

describe('GET /api/quotes at runtime', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
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
    '/team-lead-approval', '/technical-approval', '/legal-approval', '/team-approval', '/client-notification',
  ];

  it.each(PUBLIC_PAGES)('signed out on %s makes no quotes call', async (route) => {
    const fetchMock = stubFetch();
    window.history.pushState({}, '', route);
    const { default: App } = await import('../../src/App');
    render(React.createElement(App));
    await settle(500);
    expect(quoteCalls(fetchMock).map((c) => String(c[0]))).toEqual([]);
  });

  it('signed out on a sender-only e-sign link makes no quotes call and no e-sign call', async () => {
    const fetchMock = stubFetch();
    window.history.pushState({}, '', '/esign/doc-1/status');
    const { default: App } = await import('../../src/App');
    render(React.createElement(App));
    await settle(500);
    expect(quoteCalls(fetchMock)).toEqual([]);
    expect(fetchMock.mock.calls.filter((c) => /\/api\/esign\//.test(String(c[0])))).toEqual([]);
  });

  it('signed in, quotes load with the Bearer token', async () => {
    signIn();
    const fetchMock = stubFetch();
    const { default: App } = await import('../../src/App');
    render(React.createElement(App));
    await waitFor(() => expect(quoteCalls(fetchMock).length).toBeGreaterThan(0));
    for (const call of quoteCalls(fetchMock)) {
      const headers = (call[1] as RequestInit | undefined)?.headers as Record<string, string> | undefined;
      expect(headers?.Authorization).toMatch(/^Bearer header\./);
    }
  });
});
