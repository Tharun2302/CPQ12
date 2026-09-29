// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';

let mockRole = 'user';

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { role: mockRole } }),
}));

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

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

const ALL_ZIP_PATHS = [
  'Box to OneDrive/1 - box-onedrive-include.docx',
  'Box to OneDrive/2 - box-onedrive-notinclude.docx',
  'Slack to Teams/1 - slack-teams.docx',
];

const ZIP_HEADER = 'PK\u0003\u0004';

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type FileResponder = (id: string) => Promise<Response>;
type ListResponder = (call: number) => Promise<Response>;

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
}

function fileResponse(id: string) {
  const body = new TextEncoder().encode(`${ZIP_HEADER}docx-${id}`).buffer;
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/octet-stream' }),
    arrayBuffer: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob([body])),
  } as unknown as Response);
}

function serverError() {
  return Promise.resolve({
    ok: false,
    status: 500,
    json: () => Promise.resolve({
      success: false,
      error: 'Failed',
      details: 'MongoServerError at /srv/secret',
    }),
  } as unknown as Response);
}

type MockOptions = {
  exhibits?: unknown[];
  respondFile?: FileResponder;
  respondList?: ListResponder;
};

function mockFetch(options: MockOptions = {}) {
  const { exhibits = EXHIBITS, respondFile = fileResponse, respondList } = options;
  let listCalls = 0;
  const fetchMock = vi.fn<FetchFn>((input, init) => {
    const url = String(input);
    const fileMatch = url.match(/\/api\/exhibits\/([^/?]+)\/file/);
    if (fileMatch) {
      return respondFile(decodeURIComponent(fileMatch[1]));
    }
    if (init?.method === 'DELETE') {
      return jsonResponse({ success: true });
    }
    if (url.includes('/api/settings/exhibit-admins')) {
      return jsonResponse({ success: true, emails: [] });
    }
    if (url.endsWith('/api/exhibits')) {
      listCalls += 1;
      return respondList ? respondList(listCalls) : jsonResponse({ success: true, exhibits });
    }
    return jsonResponse({ success: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderManager(options: MockOptions = {}) {
  const fetchMock = mockFetch(options);
  const utils = render(<ExhibitManager />);
  await screen.findAllByRole('button', { name: /\(\d+ files?\)/ });
  return { fetchMock, ...utils };
}

const EXPECTED_FILE_INIT = { cache: 'no-store', headers: { Authorization: 'Bearer test-token' } };

const fileIdOf = (url: unknown) => String(url).match(/exhibits\/([^/]+)\/file/)?.[1];

function fileFetchCalls(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes('/file'));
}

function deferredFiles() {
  const pending: Array<() => void> = [];
  const respondFile: FileResponder = (id) => new Promise((resolve) => {
    pending.push(() => resolve(fileResponse(id)));
  });
  return { pending, respondFile };
}

async function savedZip(): Promise<{ zip: PizZip; name: string; blob: Blob }> {
  const [blob, name] = vi.mocked(saveAs).mock.calls[0] as [Blob, string];
  return { zip: new PizZip(await blob.arrayBuffer()), name, blob };
}

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  mockRole = 'user';
});

afterEach(() => {
  // vitest.config.ts does not enable globals, so RTL's auto-cleanup never registers
  cleanup();
  localStorage.clear();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ExhibitManager Download All', () => {
  it('zips every exhibit, ignoring the active search, for a non-admin', async () => {
    localStorage.setItem('cpq_token', 'test-token');
    const { pending, respondFile } = deferredFiles();
    const { fetchMock } = await renderManager({ respondFile });
    const user = userEvent.setup();

    expect(screen.getByText(/You can view exhibits only/)).toBeTruthy();
    await user.type(screen.getByPlaceholderText('Search exhibits...'), 'Slack');
    expect(screen.queryByRole('button', { name: /Box to OneDrive/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Download All (3)' }));

    const busyButton = await screen.findByRole('button', { name: 'Downloading 0 / 3' });
    expect(busyButton).toBeDisabled();
    expect(busyButton).toHaveAttribute('aria-busy', 'true');

    await waitFor(() => expect(pending).toHaveLength(3));
    pending[0]();
    await screen.findByRole('button', { name: 'Downloading 1 / 3' });
    pending[1]();
    pending[2]();

    await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(1));

    const calls = fileFetchCalls(fetchMock);
    const fetchedIds = calls.map(([url]) => fileIdOf(url)).sort();
    expect(fetchedIds).toEqual(['e1', 'e2', 'e3']);
    calls.forEach(([url, init]) => {
      expect(String(url)).toMatch(/\/file\?t=\d+$/);
      expect(init).toMatchObject(EXPECTED_FILE_INIT);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    const { zip, name, blob } = await savedZip();
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toMatch(/^exhibits-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(Object.keys(zip.files).sort()).toEqual(ALL_ZIP_PATHS);
    expect(zip.file('Slack to Teams/1 - slack-teams.docx')?.asText()).toBe(`${ZIP_HEADER}docx-e3`);

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('Downloaded 3 exhibits in 2 combinations.');
    expect(screen.getByRole('button', { name: 'Download All (3)' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Dismiss download message' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('still saves the ZIP and shows an amber banner when one file fails', async () => {
    await renderManager({ respondFile: (id) => (id === 'e2' ? serverError() : fileResponse(id)) });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Download All (3)' }));

    await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(1));
    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent(
      'Downloaded 2 of 3. 1 failed — see _download-errors.txt in the ZIP.',
    );
    expect(banner.className).toContain('bg-amber-50');
    expect(banner.textContent).not.toContain('MongoServerError');

    const { zip } = await savedZip();
    expect(zip.file('Box to OneDrive/2 - box-onedrive-notinclude.docx')).toBeNull();
    const report = zip.file('_download-errors.txt')?.asText() ?? '';
    expect(report.trim()).toBe(
      'Box to OneDrive/2 - box-onedrive-notinclude.docx - Failed to download file (500)',
    );
  });

  it('shows a red banner and saves nothing when every file fails', async () => {
    await renderManager({ respondFile: () => serverError() });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Download All (3)' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('none of the 3 exhibits could be fetched');
    expect(alert.className).toContain('bg-red-50');
    expect(saveAs).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Download All (3)' })).toBeEnabled();
  });

  it('numbers files newest first, as the folder lists them, whatever the API order', async () => {
    await renderManager({ exhibits: [...EXHIBITS].reverse() });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Box to OneDrive/ }));
    const cardTitles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(cardTitles).toEqual([
      'Box to OneDrive - Standard Include',
      'Box to OneDrive - Standard Not Include',
    ]);

    await user.click(screen.getByRole('button', { name: 'Download All (3)' }));
    await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(1));

    const { zip } = await savedZip();
    expect(zip.file('Box to OneDrive/1 - box-onedrive-include.docx')?.asText())
      .toBe(`${ZIP_HEADER}docx-e1`);
    expect(zip.file('Box to OneDrive/2 - box-onedrive-notinclude.docx')?.asText())
      .toBe(`${ZIP_HEADER}docx-e2`);
  });

  it('runs only one download when two clicks land before React re-renders', async () => {
    const { fetchMock } = await renderManager();
    const button = screen.getByRole('button', { name: 'Download All (3)' });

    // Both clicks inside one act() means the disabled state has not rendered yet
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(1));
    const ids = fileFetchCalls(fetchMock).map(([url]) => fileIdOf(url));
    expect(ids.sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('aborts in-flight requests and never saves when the page unmounts mid-download', async () => {
    const { pending, respondFile } = deferredFiles();
    const { fetchMock, unmount } = await renderManager({ respondFile });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Download All (3)' }));
    await waitFor(() => expect(pending).toHaveLength(3));

    unmount();

    const signals = fileFetchCalls(fetchMock).map(([, init]) => init?.signal);
    expect(signals).toHaveLength(3);
    signals.forEach((signal) => expect(signal?.aborted).toBe(true));

    pending.forEach((release) => release());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(saveAs).not.toHaveBeenCalled();
  });

  it('places the button before Exhibit Admins for an exhibit admin', async () => {
    mockRole = 'exhibit_admin';
    await renderManager();

    const downloadAll = screen.getByRole('button', { name: 'Download All (3)' });
    const admins = screen.getByRole('button', { name: /Exhibit Admins/ });
    const order = downloadAll.compareDocumentPosition(admins);
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/You can view exhibits only/)).toBeNull();
  });

  it('stays disabled while the list reloads, even with exhibits already on screen', async () => {
    mockRole = 'exhibit_admin';
    vi.stubGlobal('confirm', () => true);
    let releaseReload: (() => void) | undefined;
    const respondList: ListResponder = (call) => (call === 1
      ? jsonResponse({ success: true, exhibits: EXHIBITS })
      : new Promise((resolve) => {
        releaseReload = () => resolve(jsonResponse({ success: true, exhibits: EXHIBITS }));
      }));
    await renderManager({ respondList });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Slack to Teams/ }));
    const panel = document.getElementById('folder-Slack-to-Teams-panel') as HTMLElement;
    await user.click(within(panel).getByRole('button', { name: /^Delete$/ }));

    await waitFor(() => expect(releaseReload).toBeDefined());
    expect(screen.getByRole('button', { name: 'Download All (3)' })).toBeDisabled();

    releaseReload?.();
    const downloadAll = () => screen.getByRole('button', { name: 'Download All (3)' });
    await waitFor(() => expect(downloadAll()).toBeEnabled());
  });

  it('is disabled when there are no exhibits', async () => {
    mockFetch({ exhibits: [] });
    render(<ExhibitManager />);

    await waitFor(() => expect(screen.getByText('No exhibits found')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Download All (0)' })).toBeDisabled();
  });
});

type Fixture = { _id: string; name: string; fileName?: string; category: string; combinations: string[]; createdAt?: string };

function numberingExhibit(
  _id: string,
  name: string,
  fileName: string | undefined,
  combinations: string[],
  createdAt: string | undefined,
  category = 'content',
): Fixture {
  return {
    _id,
    name,
    fileName,
    category,
    combinations,
    createdAt,
    description: '',
    fileSize: 1024,
    displayOrder: 0,
    keywords: [],
    isRequired: false,
    updatedAt: createdAt,
  } as Fixture;
}

// n2 and n3 share a createdAt; n4 and n8 have none, so they sort as oldest
const NUMBERING_EXHIBITS: Fixture[] = [
  numberingExhibit('n1', 'Box to OneDrive - Standard Include', 'b-include.docx', ['box-to-onedrive-standard-included'], '2026-08-01T00:00:00.000Z'),
  numberingExhibit('n2', 'Box to OneDrive - Standard Not Include', 'b-notinclude.docx', ['box-to-onedrive-standard-notincluded'], '2026-08-05T00:00:00.000Z'),
  numberingExhibit('n3', 'Box to OneDrive - Basic Include', 'b-basic.docx', ['box-to-onedrive-basic-included'], '2026-08-05T00:00:00.000Z'),
  numberingExhibit('n4', 'Box to OneDrive - Basic Not Include', 'b-basic-not.docx', ['box-to-onedrive-basic-notincluded'], undefined),
  numberingExhibit('n5', 'Slack to Teams - Basic Scope', 'slack.docx', ['slack-to-teams'], '2026-07-01T00:00:00.000Z', 'messaging'),
  numberingExhibit('n6', 'Loose Terms', 'loose.docx', [], '2026-06-01T00:00:00.000Z'),
  numberingExhibit('n7', 'Global Appendix', undefined, ['all'], '2026-09-01T00:00:00.000Z'),
  numberingExhibit('n8', 'Undated Loose', 'undated.docx', [], undefined),
];

const NUMBERED_PATHS = [
  'Box to OneDrive/1 - b-notinclude.docx',
  'Box to OneDrive/2 - b-basic.docx',
  'Box to OneDrive/3 - b-include.docx',
  'Box to OneDrive/4 - b-basic-not.docx',
  'Slack to Teams/1 - slack.docx',
  'Ungrouped/1 - Global Appendix.docx',
  'Ungrouped/2 - loose.docx',
  'Ungrouped/3 - undated.docx',
];

type FolderOrder = Record<string, string[]>;

const folderToggles = () => screen.getAllByRole('button', { name: /\(\d+ files?\)/ });

async function expandEveryFolder(user: ReturnType<typeof userEvent.setup>) {
  for (const toggle of folderToggles()) {
    if (toggle.getAttribute('aria-expanded') !== 'true') await user.click(toggle);
  }
}

function renderedCardOrder(fixtures: Fixture[]): FolderOrder {
  const idByTitle = new Map(fixtures.map((f) => [f.name, f._id]));
  const order: FolderOrder = {};
  folderToggles().forEach((toggle) => {
    const folderName = (toggle.textContent ?? '')
      .replace(/^\d+/, '')
      .replace(/\(\d+ files?\)$/, '')
      .trim();
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    if (!panel) return;
    order[folderName] = within(panel)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => idByTitle.get(heading.textContent ?? '') ?? `unknown:${heading.textContent}`);
  });
  return order;
}

function zipNumberedOrder(zip: PizZip): FolderOrder {
  const order: FolderOrder = {};
  const numbered = Object.keys(zip.files)
    .filter((path) => path.includes('/'))
    .map((path) => {
      const [folder, file] = path.split('/');
      const number = Number(file.match(/^(\d+) - /)?.[1]);
      const id = (zip.file(path)?.asText() ?? '').slice(`${ZIP_HEADER}docx-`.length);
      return { folder, number, id };
    })
    .sort((a, b) => a.number - b.number);
  numbered.forEach(({ folder, number, id }) => {
    order[folder] = order[folder] ?? [];
    expect(number).toBe(order[folder].length + 1);
    order[folder].push(id);
  });
  return order;
}

describe('ExhibitManager Download All numbering', () => {
  it.each([
    ['in list order', NUMBERING_EXHIBITS],
    ['in reverse list order', [...NUMBERING_EXHIBITS].reverse()],
  ])('numbers each folder, Ungrouped included, exactly as its cards render (API %s)', async (_label, apiOrder) => {
    await renderManager({ exhibits: apiOrder });
    const user = userEvent.setup();

    await expandEveryFolder(user);
    const onScreen = renderedCardOrder(NUMBERING_EXHIBITS);
    await user.click(screen.getByRole('button', { name: 'Download All (8)' }));
    await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(1));

    const { zip } = await savedZip();
    expect(zipNumberedOrder(zip)).toEqual(onScreen);
    expect(Object.keys(onScreen)).toEqual(['Box to OneDrive', 'Slack to Teams', 'Ungrouped']);
    // Tied createdAt keeps the API order; a missing createdAt sorts last
    const tieFirst = apiOrder.findIndex((f) => f._id === 'n2') < apiOrder.findIndex((f) => f._id === 'n3');
    expect(onScreen['Box to OneDrive']).toEqual(tieFirst ? ['n2', 'n3', 'n1', 'n4'] : ['n3', 'n2', 'n1', 'n4']);
    expect(onScreen.Ungrouped).toEqual(['n7', 'n6', 'n8']);
    expect(await screen.findByRole('status')).toHaveTextContent('Downloaded 8 exhibits in 2 combinations.');
  });

  it('sorts an unparseable createdAt as oldest, the same on screen and in the ZIP', async () => {
    const fixtures = [
      numberingExhibit('d1', 'Box to OneDrive - Feb', 'feb.docx', ['box-to-onedrive'], '2026-02-01'),
      numberingExhibit('d2', 'Box to OneDrive - Bad', 'bad.docx', ['box-to-onedrive'], 'not-a-date'),
      numberingExhibit('d3', 'Box to OneDrive - Mar', 'mar.docx', ['box-to-onedrive'], '2026-03-01'),
    ];
    await renderManager({ exhibits: fixtures });
    const user = userEvent.setup();

    await expandEveryFolder(user);
    const onScreen = renderedCardOrder(fixtures);
    await user.click(screen.getByRole('button', { name: 'Download All (3)' }));
    await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(1));

    const { zip } = await savedZip();
    expect(onScreen).toEqual({ 'Box to OneDrive': ['d3', 'd1', 'd2'] });
    expect(zipNumberedOrder(zip)).toEqual(onScreen);
  });

  it('shows total combinations without Ungrouped, and totals that ignore the search', async () => {
    await renderManager({ exhibits: NUMBERING_EXHIBITS });
    const user = userEvent.setup();
    const totals = () => [
      screen.getByText(/Total combinations:/).textContent,
      screen.getByText(/Total exhibits:/).textContent,
    ];

    expect(totals()).toEqual(['Total combinations: 2', 'Total exhibits: 8']);
    await user.type(screen.getByPlaceholderText('Search exhibits...'), 'Slack');
    expect(totals()).toEqual(['Total combinations: 2', 'Total exhibits: 8']);
  });

  it('writes the numbered paths, and the same paths again on a second download', async () => {
    await renderManager({ exhibits: NUMBERING_EXHIBITS });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Download All (8)' }));
    await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download All (8)' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Download All (8)' }));
    await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(2));

    const paths = await Promise.all(vi.mocked(saveAs).mock.calls.map(async ([blob]) => {
      const zip = new PizZip(await (blob as Blob).arrayBuffer());
      return Object.keys(zip.files);
    }));
    expect(paths[0]).toEqual(NUMBERED_PATHS);
    expect(paths[1]).toEqual(NUMBERED_PATHS);
  });

  it('numbers by the full folder, not the filtered view, when search and category are active', async () => {
    await renderManager({ exhibits: NUMBERING_EXHIBITS });
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('Search exhibits...'), 'Not Include');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by category' }), 'content');
    await expandEveryFolder(user);
    expect(renderedCardOrder(NUMBERING_EXHIBITS)).toEqual({ 'Box to OneDrive': ['n2', 'n4'] });

    await user.click(screen.getByRole('button', { name: 'Download All (8)' }));
    await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(1));

    const { zip } = await savedZip();
    expect(Object.keys(zip.files)).toEqual(NUMBERED_PATHS);
    expect(zip.file('Box to OneDrive/4 - b-basic-not.docx')?.asText()).toBe(`${ZIP_HEADER}docx-n4`);
  });

  it('keeps the full, unchanged numbering when the search changes mid-download', async () => {
    const { pending, respondFile } = deferredFiles();
    await renderManager({ exhibits: NUMBERING_EXHIBITS, respondFile });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Download All (8)' }));
    await waitFor(() => expect(pending).toHaveLength(4));
    await user.type(screen.getByPlaceholderText('Search exhibits...'), 'Slack');
    expect(folderToggles()).toHaveLength(1);

    while (vi.mocked(saveAs).mock.calls.length === 0) {
      pending.splice(0).forEach((release) => release());
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const { zip } = await savedZip();
    expect(Object.keys(zip.files)).toEqual(NUMBERED_PATHS);
  });

  it('keeps every other number when the first file of a folder fails, and reports its numbered path', async () => {
    await renderManager({
      exhibits: NUMBERING_EXHIBITS,
      respondFile: (id) => (id === 'n2' ? serverError() : fileResponse(id)),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Download All (8)' }));
    await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(1));

    const { zip } = await savedZip();
    expect(Object.keys(zip.files)).toEqual([
      ...NUMBERED_PATHS.filter((path) => path !== 'Box to OneDrive/1 - b-notinclude.docx'),
      '_download-errors.txt',
    ]);
    expect(zip.file('Box to OneDrive/2 - b-basic.docx')?.asText()).toBe(`${ZIP_HEADER}docx-n3`);
    expect(zip.file('_download-errors.txt')?.asText())
      .toBe('Box to OneDrive/1 - b-notinclude.docx - Failed to download file (500)\r\n');
    expect(await screen.findByRole('status'))
      .toHaveTextContent('Downloaded 7 of 8. 1 failed — see _download-errors.txt in the ZIP.');
  });
});

describe('ExhibitManager single-file Download', () => {
  it('fetches one card file with an encoded id, the auth header and no-store', async () => {
    localStorage.setItem('cpq_token', 'test-token');
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    const clicked: { download: string; href: string }[] = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    clickSpy.mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ download: this.download, href: this.href });
    });
    const oddId = { ...EXHIBITS[2], _id: 'id with/slash' };
    const { fetchMock } = await renderManager({ exhibits: [oddId] });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Slack to Teams/ }));
    await user.click(screen.getByRole('button', { name: /^Download$/ }));

    await waitFor(() => expect(clicked).toHaveLength(1));
    const calls = fileFetchCalls(fetchMock);
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(String(url)).toMatch(/\/api\/exhibits\/id%20with%2Fslash\/file\?t=\d+$/);
    expect(init).toMatchObject(EXPECTED_FILE_INIT);
    expect(clicked[0]).toEqual({ download: 'slack-teams.docx', href: 'blob:mock-url' });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(saveAs).not.toHaveBeenCalled();
  });
});

describe('ExhibitManager View', () => {
  it('requests the file the same way as Download and shows only the HTTP status on failure', async () => {
    localStorage.setItem('cpq_token', 'test-token');
    const { fetchMock } = await renderManager({ respondFile: () => serverError() });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Slack to Teams/ }));
    await user.click(screen.getByRole('button', { name: /^View$/ }));

    expect(await screen.findByText('Failed to download file (500)')).toBeTruthy();
    expect(screen.queryByText(/MongoServerError/)).toBeNull();
    const [url, init] = fileFetchCalls(fetchMock)[0];
    expect(String(url)).toMatch(/\/api\/exhibits\/e3\/file\?t=\d+$/);
    expect(init).toMatchObject(EXPECTED_FILE_INIT);
  });
});
