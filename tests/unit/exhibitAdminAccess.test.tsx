// @vitest-environment jsdom
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let mockUser: Record<string, unknown> = {};

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

import ExhibitManager from '../../src/components/ExhibitManager';

const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

const EXHIBIT = {
  _id: 'e1',
  name: 'Box to OneDrive - Standard Include',
  description: 'Box migration scope',
  fileName: 'box-onedrive.docx',
  fileSize: 2048,
  category: 'content',
  combinations: ['box-to-onedrive-standard-included'],
  displayOrder: 1,
  keywords: [],
  isRequired: false,
  createdAt: '2026-08-03T00:00:00.000Z',
  updatedAt: '2026-08-03T00:00:00.000Z',
};

let fetchMock: ReturnType<typeof vi.fn>;

async function renderExpanded() {
  fetchMock = vi.fn((input: RequestInfo | URL) => {
    const body = String(input).includes('/api/exhibits') ? { success: true, exhibits: [EXHIBIT] } : { success: true };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<ExhibitManager />);
  await waitFor(() => expect(screen.queryByRole('button', { name: /Box to OneDrive/ })).toBeTruthy());
  await userEvent.setup().click(screen.getByRole('button', { name: /Box to OneDrive/ }));
}

const ADMIN_BUTTONS = [/Upload Exhibit/, /Edit for RedLine/, /^Edit$/, /^Delete$/];

beforeEach(() => { mockUser = {}; });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ExhibitManager buttons', () => {
  it('an exhibit admin gets Upload, Edit, Edit for RedLine and Delete; the list is managed on Admin Settings', async () => {
    mockUser = { role: 'exhibit_admin' };
    await renderExpanded();
    for (const name of ADMIN_BUTTONS) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Exhibit Admins/ })).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/settings/exhibit-admins'))).toBe(false);
  });

  it('anyone else sees none of them and the view-only note', async () => {
    mockUser = { role: 'viewer', isApprovalAdmin: true };
    await renderExpanded();
    for (const name of ADMIN_BUTTONS) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.getByText('You can view exhibits only. Only exhibit admins can add, edit, or delete.')).toBeTruthy();
  });
});

describe('exhibit routes in server.cjs', () => {
  const handler = (opening: string) => {
    const start = serverSrc.indexOf(opening);
    expect(start, opening).toBeGreaterThan(-1);
    // Cut at the handler's closing line so helpers declared after it are not counted
    return serverSrc.slice(start, serverSrc.indexOf('\n});', start + 1));
  };
  const fnSource = (opening: string) => {
    const start = serverSrc.indexOf(opening);
    expect(start, opening).toBeGreaterThan(-1);
    const end = serverSrc.slice(start).search(/\n\}\r?\n/);
    return serverSrc.slice(start, start + end + 2);
  };
  const EXHIBIT_ADMIN_ROUTES = [
    "app.post('/api/exhibits', upload.single('file')",
    "app.put('/api/exhibits/:id', upload.single('file')",
    "app.delete('/api/exhibits/:id'",
    "app.post('/api/onlyoffice/start-session-from-exhibit/:id'",
    "app.post('/api/onlyoffice/persist-to-exhibit/:sessionId'",
  ];
  const LIST_ROUTES = [
    "app.get('/api/settings/exhibit-admins'",
    "app.post('/api/settings/exhibit-admins'",
    "app.delete('/api/settings/exhibit-admins/:email'",
  ];

  it.each(EXHIBIT_ADMIN_ROUTES)('%s: exhibit admins only, checked before input or database', (opening) => {
    const src = handler(opening);
    const authAt = src.indexOf('await getExhibitAdminUser(req, res)');
    expect(authAt).toBeGreaterThan(-1);
    const input = /\breq\.(params|body|file)\b/.exec(src);
    if (input) expect(authAt).toBeLessThan(input.index);
    const write = src.search(/db\.collection|saveRedlineOverExhibit\(/);
    if (write > -1) expect(authAt).toBeLessThan(write);
    expect(src).not.toMatch(/getExhibitEditorUser|Redline admin override/);
  });

  it.each(LIST_ROUTES)('%s is managed by approval admins', (opening) => {
    const src = handler(opening);
    expect(src).toMatch(/await getApprovalAdminUser\(req, res, EXHIBIT_ADMINS_FORBIDDEN\);\s*if \(!authUser\) return;/);
    expect(src).not.toContain('getExhibitAdminUser');
  });

  it('heartbeat and release use the same exhibit-admin check', () => {
    expect(fnSource('async function getOwnExhibitSession')).toContain('await getExhibitAdminUser(req, res)');
  });

  it('keeps the redline session bound to whoever opened it', () => {
    expect(handler("app.post('/api/onlyoffice/start-session-from-exhibit/:id'")).toContain('actorEmail,');
    expect(handler("app.post('/api/onlyoffice/persist-to-exhibit/:sessionId'")).toMatch(/normalizeEmail\(authUser\.email\) !== s\.actorEmail/);
  });

  describe('getExhibitAdminUser behaviour', () => {
    const helperSrc = `${fnSource('async function hasExhibitAdminAccess')}\n${fnSource('async function getExhibitAdminUser')}`;
    const USERS: Record<string, Record<string, string>> = {
      role: { email: 'r@test.example', role: 'exhibit_admin' },
      listed: { email: 'Listed@Test.example' },
      plain: { email: 'p@test.example' },
    };

    function load() {
      const EXHIBIT_ADMINS = { hasAccess: async (_db: unknown, u: { email: string }) => u.email.toLowerCase() === 'listed@test.example' };
      return new Function('getAuthenticatedUser', 'EXHIBIT_ADMINS', 'db', `${helperSrc}\nreturn getExhibitAdminUser;`)(
        async (req: any) => USERS[req.who], EXHIBIT_ADMINS, {},
      );
    }
    const res = () => {
      const r = { statusCode: 200, status(c: number) { r.statusCode = c; return r; }, json() { return r; } };
      return r;
    };

    it('allows the exhibit_admin DB role and listed members; others get 403', async () => {
      const getExhibitAdminUser = load();
      expect(await getExhibitAdminUser({ who: 'role' }, res())).toBe(USERS.role);
      expect(await getExhibitAdminUser({ who: 'listed' }, res())).toBe(USERS.listed);
      const r = res();
      expect(await getExhibitAdminUser({ who: 'plain' }, r)).toBeNull();
      expect(r.statusCode).toBe(403);
    });
  });
});
