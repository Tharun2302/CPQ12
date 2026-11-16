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

const { exhibitRedlineAccess } = exhibitRedline as {
  exhibitRedlineAccess: (args: Record<string, unknown>) => { ok: boolean; via?: string; httpStatus?: number };
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

describe('ExhibitManager Edit for RedLine button', () => {
  it('a redline admin sees Edit for RedLine but no other exhibit-admin buttons', async () => {
    mockUser = { role: 'viewer', isRedlineAdmin: true };
    await renderExpanded();
    expect(screen.getByRole('button', { name: /Edit for RedLine/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Edit$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Delete$/ })).toBeNull();
    expect(screen.getByText('You can redline exhibits. Only exhibit admins can add, edit, or delete.')).toBeTruthy();
  });

  it('an exhibit admin keeps Edit, Edit for RedLine and Delete', async () => {
    mockUser = { role: 'exhibit_admin' };
    await renderExpanded();
    expect(screen.getByRole('button', { name: /Edit for RedLine/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Edit$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Delete$/ })).toBeTruthy();
  });

  it('a regular user sees none of them', async () => {
    mockUser = { role: 'viewer', isRedlineAdmin: false };
    await renderExpanded();
    expect(screen.queryByRole('button', { name: /Edit for RedLine/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Edit$/ })).toBeNull();
    expect(screen.getByText('You can view exhibits only. Only exhibit admins can add, edit, or delete.')).toBeTruthy();
  });
});

describe('exhibitRedlineAccess', () => {
  it('allows exhibit admins and redline admins, saying which list granted it', () => {
    expect(exhibitRedlineAccess({ isExhibitAdmin: true, isRedlineAdmin: true })).toEqual({ ok: true, via: 'exhibit_admin' });
    expect(exhibitRedlineAccess({ isRedlineAdmin: true })).toEqual({ ok: true, via: 'redline_admin' });
    expect(exhibitRedlineAccess({})).toMatchObject({ ok: false, httpStatus: 403 });
    expect(exhibitRedlineAccess({ isRedlineAdmin: 'true' }).ok).toBe(false);
  });
});

describe('exhibit redline routes in server.cjs', () => {
  const route = (opening: string) => {
    const start = serverSrc.indexOf(opening);
    expect(start, opening).toBeGreaterThan(-1);
    return serverSrc.slice(start, serverSrc.indexOf('\napp.', start + 1));
  };
  const start = route("app.post('/api/onlyoffice/start-session-from-exhibit/:id'");
  const persist = route("app.post('/api/onlyoffice/persist-to-exhibit/:sessionId'");
  const helper = serverSrc.slice(
    serverSrc.indexOf('async function getExhibitRedlineUser'),
    serverSrc.indexOf("app.post('/api/onlyoffice/start-session-from-exhibit/:id'"),
  );

  it('start and save re-check both lists live before reading input or the database', () => {
    for (const src of [start, persist]) {
      const authAt = src.indexOf('await getExhibitRedlineUser(req, res)');
      expect(authAt).toBeGreaterThan(-1);
      expect(authAt).toBeLessThan(src.indexOf('req.params'));
      expect(authAt).toBeLessThan(src.search(/db\.collection|saveRedlineOverExhibit\(/));
      expect(src).toContain("if (access.via === 'redline_admin') logExhibitRedlineViaRedlineList(");
    }
    expect(helper).toContain('await hasExhibitAdminAccess(user)');
    expect(helper).toContain('await hasRedlineAdminAccess(user)');
  });

  it('keeps the session bound to whoever opened it', () => {
    expect(start).toContain('actorEmail,');
    expect(persist).toMatch(/normalizeEmail\(authUser\.email\) !== s\.actorEmail/);
  });

  it('redline admins gain no other exhibit-admin power', () => {
    const uses = [...serverSrc.matchAll(/await getExhibitRedlineUser\(req, res\)/g)].length;
    expect(uses).toBe(3);
    const exhibitRoutes = [...serverSrc.matchAll(/\napp\.(post|put|delete)\('\/api\/(exhibits|settings\/exhibit-admins)[^']*'/g)];
    expect(exhibitRoutes.length).toBeGreaterThan(0);
    for (const m of exhibitRoutes) {
      // Cut at the handler's closing line so helpers declared after it are not counted
      const src = serverSrc.slice(m.index! + 1, serverSrc.indexOf('\n});', m.index! + 2));
      expect(src, m[0]).not.toContain('getExhibitRedlineUser');
      expect(src, m[0]).not.toContain('hasRedlineAdminAccess');
    }
  });
});
