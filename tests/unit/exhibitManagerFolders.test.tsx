// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let mockRole = 'exhibit_admin';

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { role: mockRole } }),
}));

import ExhibitManager from '../../src/components/ExhibitManager';

// 'New Exhibit' is deliberately absent: loadExhibits fires a background PUT to rename it
const EXHIBITS = [
  {
    _id: 'e1',
    name: 'Box to OneDrive - Standard Include',
    description: 'Box migration scope, include',
    fileName: 'box-onedrive-include.docx',
    fileSize: 2048,
    category: 'content',
    combinations: ['box-to-onedrive-standard-included'],
    displayOrder: 1,
    keywords: [],
    isRequired: false,
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
  },
  {
    _id: 'e2',
    name: 'Box to OneDrive - Standard Not Include',
    description: 'Box migration scope, not include',
    fileName: 'box-onedrive-notinclude.docx',
    fileSize: 3072,
    category: 'content',
    combinations: ['box-to-onedrive-standard-notincluded'],
    displayOrder: 2,
    keywords: [],
    isRequired: false,
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  },
  {
    _id: 'e3',
    name: 'Slack to Teams - Basic Scope',
    description: 'Messaging migration scope',
    fileName: 'slack-teams.docx',
    fileSize: 1024,
    category: 'messaging',
    combinations: ['slack-to-teams'],
    displayOrder: 3,
    keywords: [],
    isRequired: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
];

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
}

function mockFetch(exhibits: unknown[] = EXHIBITS) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/settings/exhibit-admins')) {
      return jsonResponse({ success: true, emails: [] });
    }
    if (url.includes('/api/exhibits')) {
      return jsonResponse({ success: true, exhibits });
    }
    return jsonResponse({ success: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderManager(exhibits: unknown[] = EXHIBITS) {
  mockFetch(exhibits);
  const utils = render(<ExhibitManager />);
  await waitFor(() => expect(screen.queryByRole('button', { name: /Box to OneDrive/ })).toBeTruthy());
  return utils;
}

function folderHeader(name: RegExp) {
  return screen.getByRole('button', { name });
}

beforeEach(() => {
  mockRole = 'exhibit_admin';
});

afterEach(() => {
  // vitest.config.ts does not enable globals, so RTL's auto-cleanup never registers
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ExhibitManager folder grouping', () => {
  it('renders folders collapsed by default with a post-filter file count', async () => {
    await renderManager();

    const header = folderHeader(/Box to OneDrive/);
    expect(header.textContent).toContain('(2 files)');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Box to OneDrive - Standard Include')).toBeNull();
    expect(screen.queryByText('Box to OneDrive - Standard Not Include')).toBeNull();
  });

  it('expands on click and collapses on a second click', async () => {
    const user = userEvent.setup();
    await renderManager();

    await user.click(folderHeader(/Box to OneDrive/));

    expect(folderHeader(/Box to OneDrive/).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Box to OneDrive - Standard Include')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^View$/ }).length).toBe(2);
    expect(screen.getAllByRole('button', { name: /^Download$/ }).length).toBe(2);

    await user.click(folderHeader(/Box to OneDrive/));

    expect(folderHeader(/Box to OneDrive/).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Box to OneDrive - Standard Include')).toBeNull();
  });

  it('uses the singular "file" for a folder holding one exhibit', async () => {
    await renderManager();

    expect(folderHeader(/Slack to Teams/).textContent).toContain('(1 file)');
  });

  it('auto-expands matching folders while a search is active', async () => {
    const user = userEvent.setup();
    await renderManager();

    await user.type(screen.getByPlaceholderText('Search exhibits...'), 'Slack');

    expect(screen.getByText('Slack to Teams - Basic Scope')).toBeTruthy();
    expect(folderHeader(/Slack to Teams/).getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByRole('button', { name: /Box to OneDrive/ })).toBeNull();
  });

  it('re-collapses folders when the search is cleared', async () => {
    const user = userEvent.setup();
    await renderManager();

    const searchBox = screen.getByPlaceholderText('Search exhibits...');
    await user.type(searchBox, 'Slack');
    expect(screen.getByText('Slack to Teams - Basic Scope')).toBeTruthy();

    await user.clear(searchBox);

    expect(folderHeader(/Slack to Teams/).getAttribute('aria-expanded')).toBe('false');
    expect(folderHeader(/Box to OneDrive/).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Slack to Teams - Basic Scope')).toBeNull();
  });

  it('narrows the folder rows when a category filter is applied', async () => {
    const user = userEvent.setup();
    await renderManager();

    await user.selectOptions(screen.getByRole('combobox'), 'messaging');

    expect(screen.getByRole('button', { name: /Slack to Teams/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Box to OneDrive/ })).toBeNull();
  });

  it('shows admin controls inside folders and in the header for an exhibit admin', async () => {
    const user = userEvent.setup();
    await renderManager();

    expect(screen.getByRole('button', { name: /Upload Exhibit/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Exhibit Admins/ })).toBeTruthy();

    await user.click(folderHeader(/Slack to Teams/));

    const panel = document.getElementById('folder-Slack-to-Teams-panel') as HTMLElement;
    expect(within(panel).getByRole('button', { name: /^Edit$/ })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: /^Delete$/ })).toBeTruthy();
  });

  it('hides admin controls in both places for a non-admin', async () => {
    mockRole = 'user';
    const user = userEvent.setup();
    await renderManager();

    expect(screen.queryByRole('button', { name: /Upload Exhibit/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Exhibit Admins/ })).toBeNull();
    expect(screen.getByText(/You can view exhibits only/)).toBeTruthy();

    await user.click(folderHeader(/Slack to Teams/));

    expect(screen.getByText('Slack to Teams - Basic Scope')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Edit$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Delete$/ })).toBeNull();
  });

  it('keeps the existing empty state when there are no exhibits', async () => {
    mockFetch([]);
    render(<ExhibitManager />);

    await waitFor(() => expect(screen.getByText('No exhibits found')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /\(\d+ files?\)/ })).toBeNull();
  });
});
