// @vitest-environment jsdom
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import exhibitRedline from '../../exhibit-redline.cjs';

let mockUser: Record<string, unknown> = {};

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

import ExhibitManager from '../../src/components/ExhibitManager';

const { exhibitEditorAccess } = exhibitRedline as {
  exhibitEditorAccess: (args: Record<string, unknown>) => { ok: boolean; via?: string; httpStatus?: number };
};
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

async function renderExpanded() {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const body = String(input).includes('/api/exhibits') ? { success: true, exhibits: [EXHIBIT] } : { success: true, emails: [] };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
  }));
  render(<ExhibitManager />);
  await waitFor(() => expect(screen.queryByRole('button', { name: /Box to OneDrive/ })).toBeTruthy());
  await userEvent.setup().click(screen.getByRole('button', { name: /Box to OneDrive/ }));
}

beforeEach(() => { mockUser = {}; });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ExhibitManager exhibit buttons', () => {
  it('a redline admin gets Upload, Edit, Edit for RedLine and Delete, but not Exhibit Admins', async () => {
    mockUser = { role: 'viewer', isRedlineAdmin: true };
    await renderExpanded();
    expect(screen.getByRole('button', { name: /Upload Exhibit/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Edit for RedLine/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Edit$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Delete$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Exhibit Admins/ })).toBeNull();
    expect(screen.queryByText(/You can view exhibits only/)).toBeNull();
    expect(screen.queryByText(/Only exhibit admins can add, edit, or delete/)).toBeNull();
  });

  it('an exhibit admin keeps everything, including Exhibit Admins', async () => {
    mockUser = { role: 'exhibit_admin' };
    await renderExpanded();
    for (const name of [/Upload Exhibit/, /Edit for RedLine/, /^Edit$/, /^Delete$/, /Exhibit Admins/]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('a regular user sees none of them and the view-only note', async () => {
    mockUser = { role: 'viewer', isRedlineAdmin: false };
    await renderExpanded();
    for (const name of [/Upload Exhibit/, /Edit for RedLine/, /^Edit$/, /^Delete$/, /Exhibit Admins/]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.getByText('You can view exhibits only. Only exhibit admins can add, edit, or delete.')).toBeTruthy();
  });
});

describe('exhibitEditorAccess', () => {
  it('allows exhibit admins and redline admins, saying which list granted it', () => {
    expect(exhibitEditorAccess({ isExhibitAdmin: true, isRedlineAdmin: true })).toEqual({ ok: true, via: 'exhibit_admin' });
    expect(exhibitEditorAccess({ isRedlineAdmin: true })).toEqual({ ok: true, via: 'redline_admin' });
    expect(exhibitEditorAccess({})).toMatchObject({ ok: false, httpStatus: 403 });
    expect(exhibitEditorAccess({ isRedlineAdmin: 'true' }).ok).toBe(false);
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
  const EDITOR_ROUTES = [
    "app.post('/api/exhibits', upload.single('file')",
    "app.put('/api/exhibits/:id', upload.single('file')",
    "app.delete('/api/exhibits/:id'",
    "app.post('/api/onlyoffice/start-session-from-exhibit/:id'",
    "app.post('/api/onlyoffice/persist-to-exhibit/:sessionId'",
  ];
  const ADMIN_LIST_ROUTES = [
    "app.get('/api/settings/exhibit-admins'",
    "app.post('/api/settings/exhibit-admins'",
    "app.delete('/api/settings/exhibit-admins/:email'",
  ];

  it.each(EDITOR_ROUTES)('%s: exhibit admins or redline admins, checked live before input or database', (opening) => {
    const src = handler(opening);
    const authAt = src.indexOf('await getExhibitEditorUser(req, res)');
    expect(authAt).toBeGreaterThan(-1);
    expect(src).not.toContain('getExhibitAdminUser');
    const input = /\breq\.(params|body|file)\b/.exec(src);
    if (input) expect(authAt).toBeLessThan(input.index);
    const write = src.search(/db\.collection|saveRedlineOverExhibit\(/);
    if (write > -1) expect(authAt).toBeLessThan(write);
    expect(src).toMatch(/if \((editor|access)\.via === 'redline_admin'\) logExhibitEditViaRedlineList\(/);
  });

  it.each(ADMIN_LIST_ROUTES)('%s stays exhibit-admin only', (opening) => {
    const src = handler(opening);
    expect(src).toContain('await getExhibitAdminUser(req, res)');
    expect(src).not.toMatch(/getExhibitEditorUser|hasRedlineAdminAccess/);
  });

  it('heartbeat and release use the same live check', () => {
    const helper = fnSource('async function getOwnExhibitSession');
    expect(helper).toContain('await getExhibitEditorUser(req, res)');
  });

  it('keeps the redline session bound to whoever opened it', () => {
    expect(handler("app.post('/api/onlyoffice/start-session-from-exhibit/:id'")).toContain('actorEmail,');
    expect(handler("app.post('/api/onlyoffice/persist-to-exhibit/:sessionId'")).toMatch(/normalizeEmail\(authUser\.email\) !== s\.actorEmail/);
  });

  describe('getExhibitEditorUser / getExhibitAdminUser behaviour', () => {
    const editorSrc = fnSource('async function getExhibitEditorUser');
    const adminSrc = fnSource('async function getExhibitAdminUser');
    const USERS: Record<string, { email: string }> = {
      exhibit: { email: 'ex@test.example' }, redline: { email: 'rl@test.example' }, plain: { email: 'p@test.example' },
    };

    function load() {
      return new Function(
        'getAuthenticatedUser', 'hasExhibitAdminAccess', 'hasRedlineAdminAccess', 'exhibitEditorAccess',
        `${editorSrc}\n${adminSrc}\nreturn { getExhibitEditorUser, getExhibitAdminUser };`,
      )(
        async (req: any) => USERS[req.who],
        async (u: any) => u === USERS.exhibit,
        async (u: any) => u === USERS.redline,
        exhibitEditorAccess,
      );
    }
    const res = () => {
      const r = { statusCode: 200, status(c: number) { r.statusCode = c; return r; }, json() { return r; } };
      return r;
    };

    it('editor routes: exhibit admin and redline admin pass, others get 403', async () => {
      const { getExhibitEditorUser } = load();
      expect(await getExhibitEditorUser({ who: 'exhibit' }, res())).toEqual({ user: USERS.exhibit, via: 'exhibit_admin' });
      expect(await getExhibitEditorUser({ who: 'redline' }, res())).toEqual({ user: USERS.redline, via: 'redline_admin' });
      const r = res();
      expect(await getExhibitEditorUser({ who: 'plain' }, r)).toBeNull();
      expect(r.statusCode).toBe(403);
    });

    it('exhibit-admin list routes: a redline admin still gets 403', async () => {
      const { getExhibitAdminUser } = load();
      const r = res();
      expect(await getExhibitAdminUser({ who: 'redline' }, r)).toBeNull();
      expect(r.statusCode).toBe(403);
      expect(await getExhibitAdminUser({ who: 'exhibit' }, res())).toBe(USERS.exhibit);
    });
  });
});
