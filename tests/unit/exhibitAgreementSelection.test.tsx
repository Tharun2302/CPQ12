// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { role: 'exhibit_admin' } }),
}));

import ExhibitManager from '../../src/components/ExhibitManager';

// Exercises the real "Agreement template" control end to end: what the dropdown offers, and
// what actually lands in the POST body. The slug is the whole contract — an exhibit tagged
// with the wrong string is invisible to its agreement and shows up in the wrong quote.

const COMBINATIONS = [
  { value: 'mange+sprawl', label: 'mange+sprawl', migrationType: 'Manage' },
  { value: 'multi-combination', label: 'Multi-Combination', migrationType: 'Multi combination' },
  { value: 'overage-agreement', label: 'Overage-Agreement', migrationType: 'Overage Agreement' },
  { value: 'data-sprawl', label: 'data-sprawl', migrationType: 'Manage' },
];

const exhibit = (over: Record<string, unknown>) => ({
  _id: 'e1', name: 'Box to OneDrive - Standard Include', description: '', fileName: 'box.docx',
  fileSize: 2048, category: 'content', combinations: ['box-to-onedrive'], planType: 'standard',
  includeType: 'included', displayOrder: 1, keywords: [], isRequired: false,
  createdAt: '2026-08-03T00:00:00.000Z', updatedAt: '2026-08-03T00:00:00.000Z', ...over,
});

const EXISTING = [
  exhibit({}),
  exhibit({ _id: 'e2', name: 'Data Sprawl - Standard Include', combinations: ['data-sprawl'] }),
  exhibit({ _id: 'e3', name: 'Mange Sprawl - Standard Include', combinations: ['mange+sprawl'] }),
];

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

let posted: FormData | null = null;

function mockFetch() {
  posted = null;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/settings/exhibit-admins')) return json({ success: true, emails: [] });
    if (url.includes('/api/combinations')) return json({ success: true, combinations: COMBINATIONS });
    if (url.includes('/api/exhibits') && init?.method === 'POST') {
      posted = init.body as FormData;
      return json({ success: true, exhibit: { _id: 'new' } });
    }
    if (url.includes('/api/exhibits')) return json({ success: true, exhibits: EXISTING });
    return json({ success: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Finds a <select> by the option values it offers; the legacy fields carry no label link. */
function selectOffering(container: HTMLElement, ...optionValues: string[]): HTMLSelectElement {
  const match = Array.from(container.querySelectorAll('select')).find((el) => {
    const values = Array.from(el.options).map((o) => o.value);
    return optionValues.every((v) => values.includes(v));
  });
  if (!match) throw new Error(`No <select> offering ${optionValues.join(', ')}`);
  return match as HTMLSelectElement;
}

async function openUploadModal() {
  mockFetch();
  const user = userEvent.setup();
  const { container } = render(<ExhibitManager />);
  await waitFor(() => expect(screen.getByRole('button', { name: /Upload Exhibit/ })).toBeTruthy());
  await user.click(screen.getAllByRole('button', { name: /Upload Exhibit/ })[0]);
  const dropdown = await screen.findByLabelText<HTMLSelectElement>('Agreement template');
  return { user, dropdown, container };
}

const combos = (formData: FormData) => JSON.parse(String(formData.get('combinations')));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// Picker-only choice for the pair route; must never reach the POST body.
const MULTI_PICK = '__multi-combination-pair__';

describe('Agreement template selection', () => {
  // Multi-Combination owns no exhibits; attaching to it detached exhibits from their pair.
  it('offers Multi-Combination plus every agreement that owns exhibits, defaulting to Multi-Combination', async () => {
    const { dropdown } = await openUploadModal();
    expect(dropdown.value).toBe(MULTI_PICK);
    const values = Array.from(dropdown.options).map((o) => o.value);
    expect(values).toEqual([MULTI_PICK, 'mange+sprawl', 'data-sprawl']);
  });

  it('labels the pair route with the Template Manager name for Multi-Combination', async () => {
    const { dropdown } = await openUploadModal();
    const option = Array.from(dropdown.options).find((o) => o.value === MULTI_PICK);
    expect(option?.textContent).toBe('Multi-Combination');
  });

  it('keeps the folder required when Multi-Combination is chosen', async () => {
    const { user, dropdown } = await openUploadModal();
    await user.selectOptions(dropdown, MULTI_PICK);
    expect(dropdown.value).toBe(MULTI_PICK);
    expect(screen.getByText('Folder *')).toBeTruthy();
  });

  it('stores the slug verbatim, so "+" survives into the payload', async () => {
    const { user, dropdown } = await openUploadModal();
    await user.selectOptions(dropdown, 'mange+sprawl');
    expect(dropdown.value).toBe('mange+sprawl');
  });

  // Selecting an agreement and a folder would describe two different combinations at once,
  // and only one of them can win in the payload.
  it('clears the folder fields when an agreement is chosen', async () => {
    const { user, dropdown } = await openUploadModal();
    const folder = screen.getByPlaceholderText('Search or select existing combination') as HTMLInputElement;
    await user.type(folder, 'Box to OneDrive');
    expect(folder.value).not.toBe('');

    await user.selectOptions(dropdown, 'data-sprawl');
    expect((screen.getByPlaceholderText('Search or select existing combination') as HTMLInputElement).value).toBe('');
  });

  it('drops the folder requirement once an agreement is chosen', async () => {
    const { user, dropdown } = await openUploadModal();
    expect(screen.getByText('Folder *')).toBeTruthy();
    await user.selectOptions(dropdown, 'data-sprawl');
    expect(screen.queryByText('Folder *')).toBeNull();
    expect(screen.getByText('Folder')).toBeTruthy();
  });

  it('posts combinations:["data-sprawl"] — the tag the whole feature hangs on', async () => {
    const { user, dropdown, container } = await openUploadModal();

    await user.selectOptions(dropdown, 'data-sprawl');
    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['x'], 'sprawl.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    );
    await user.selectOptions(selectOffering(container, 'basic', 'standard', 'advanced'), 'standard');
    await user.selectOptions(selectOffering(container, 'included', 'notincluded'), 'included');
    await user.click(screen.getAllByRole('button', { name: /^Upload Exhibit$/ }).pop()!);

    await waitFor(() => expect(posted).not.toBeNull());
    expect(combos(posted!)).toEqual(['data-sprawl']);
    expect(posted!.get('planType')).toBe('standard');
    expect(posted!.get('includeType')).toBe('included');
  });
});

// Regression: picking Multi-Combination here replaced the exhibit's pair slug, so Basic
// exhibits were stored as ['multi-combination'] and a Basic SOW pulled in Standard ones.
describe('Uploading a migration-pair exhibit', () => {
  async function uploadToFolder(plan: string, includeType: string, pickMulti = false) {
    const { user, dropdown, container } = await openUploadModal();
    expect(dropdown.value).toBe(MULTI_PICK);
    if (pickMulti) await user.selectOptions(dropdown, MULTI_PICK);
    await user.click(screen.getByPlaceholderText('Search or select existing combination'));
    await user.click(await screen.findByText('Box to OneDrive', { selector: 'li' }));
    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['x'], 'box-onedrive-basic.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    );
    await user.selectOptions(selectOffering(container, 'basic', 'standard', 'advanced'), plan);
    await user.selectOptions(selectOffering(container, 'included', 'notincluded'), includeType);
    await user.click(screen.getAllByRole('button', { name: /^Upload Exhibit$/ }).pop()!);
    await waitFor(() => expect(posted).not.toBeNull());
    return posted!;
  }

  it('stores a Basic Include exhibit under its pair, not multi-combination', async () => {
    const body = await uploadToFolder('basic', 'included');
    expect(combos(body)).toEqual(['box-to-onedrive']);
    expect(body.get('planType')).toBe('basic');
    expect(body.get('includeType')).toBe('included');
  });

  it('stores the pair, never the picker value or multi-combination, when Multi-Combination is chosen', async () => {
    const body = await uploadToFolder('standard', 'included', true);
    expect(combos(body)).toEqual(['box-to-onedrive']);
    expect(body.get('planType')).toBe('standard');
  });

  it('stores a Basic Not Include exhibit under the same pair', async () => {
    const body = await uploadToFolder('basic', 'notincluded');
    expect(combos(body)).toEqual(['box-to-onedrive']);
    expect(body.get('planType')).toBe('basic');
    expect(body.get('includeType')).toBe('notincluded');
  });
});

// "Where do I see just the data-sprawl exhibits?" — with 176 exhibits, scrolling to a folder
// is not an answer, so the list carries an agreement filter.
describe('Agreement filter on the exhibit list', () => {
  async function renderList() {
    mockFetch();
    const user = userEvent.setup();
    render(<ExhibitManager />);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Box to OneDrive/ })).toBeTruthy());
    return { user, filter: screen.getByLabelText<HTMLSelectElement>('Filter by agreement') };
  }

  const folder = (name: RegExp) => screen.queryByRole('button', { name });

  it('shows every folder by default', async () => {
    await renderList();
    expect(folder(/Box to OneDrive/)).toBeTruthy();
    expect(folder(/Data Sprawl/)).toBeTruthy();
    expect(folder(/Mange Sprawl/)).toBeTruthy();
  });

  it('narrows to a single agreement', async () => {
    const { user, filter } = await renderList();
    await user.selectOptions(filter, 'data-sprawl');
    expect(folder(/Data Sprawl/)).toBeTruthy();
    expect(folder(/Box to OneDrive/)).toBeNull();
    expect(folder(/Mange Sprawl/)).toBeNull();
  });

  // Multi combination quotes draw from every migration pair, so this must list them, not
  // show "No exhibits found" because nothing carries the literal multi-combination tag.
  it('shows the migration catalogue under Multi-Combination', async () => {
    const { user, filter } = await renderList();
    await user.selectOptions(filter, 'multi-combination');
    expect(folder(/Box to OneDrive/)).toBeTruthy();
    expect(folder(/Data Sprawl/)).toBeNull();
    expect(folder(/Mange Sprawl/)).toBeNull();
  });

  it('offers each agreement from Template Manager as an option', async () => {
    const { filter } = await renderList();
    const values = Array.from(filter.options).map((o) => o.value);
    // Overage Agreement is absent on purpose: its quotes never show exhibits.
    expect(values).toEqual(['', 'mange+sprawl', 'multi-combination', 'data-sprawl']);
  });
});
