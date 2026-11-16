// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const authState = vi.hoisted(() => ({
  value: {
    user: { email: 'admin@example.com', isApprovalAdmin: true } as { email: string; isApprovalAdmin?: boolean } | null,
    loading: false,
  },
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => authState.value,
}));

// The sidebar pulls in chat widgets and modals that are irrelevant here
vi.mock('../../src/components/Navigation', () => ({
  default: () => <nav data-testid="sidebar" />,
}));

import AdminEmailListSettings, { validateAdminEmailInput } from '../../src/components/admin/AdminEmailListSettings';
import AdminSettingsPage from '../../src/pages/AdminSettingsPage';

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function respond(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function listBody(emails: string[], envEmails: string[] = []) {
  return {
    success: true,
    data: { emails, envEmails, updatedAt: '2026-11-01T10:00:00.000Z', updatedBy: 'boss@example.com' },
  };
}

let fetchMock: ReturnType<typeof vi.fn<FetchFn>>;

function stubFetch(handler: FetchFn) {
  fetchMock = vi.fn<FetchFn>(handler);
  vi.stubGlobal('fetch', fetchMock);
}

const isMethod = (init: RequestInit | undefined, method: string) => init?.method === method;

const renderList = () => render(
  <AdminEmailListSettings kind="exhibit-admins" title="Exhibit Admins" description="Can add, edit, delete and redline exhibits." />,
);

const emailInput = () => screen.getByLabelText('Add email') as HTMLInputElement;

beforeEach(() => {
  authState.value = { user: { email: 'admin@example.com', isApprovalAdmin: true }, loading: false };
  localStorage.setItem('cpq_token', 'test-token');
});

afterEach(() => {
  // vitest.config.ts does not enable globals, so RTL's auto-cleanup never registers
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('validateAdminEmailInput', () => {
  it('accepts a normal email and rejects blanks and malformed input', () => {
    expect(validateAdminEmailInput(' a@b.com ')).toBeNull();
    expect(validateAdminEmailInput('')).toMatch(/Enter an email/);
    expect(validateAdminEmailInput('not-an-email')).toMatch(/valid email/);
    expect(validateAdminEmailInput('a@b.com,c@d.com')).toMatch(/valid email/);
    expect(validateAdminEmailInput(`${'x'.repeat(250)}@b.com`)).toMatch(/valid email/);
  });
});

describe('AdminEmailListSettings', () => {
  it('loads the list with the bearer token and marks env emails without a Remove button', async () => {
    stubFetch(() => respond(200, listBody(['env@example.com', 'ui@example.com'], ['env@example.com'])));
    renderList();

    const list = await screen.findByRole('list', { name: 'Exhibit Admins list' });
    const [envRow, uiRow] = within(list).getAllByRole('listitem');
    expect(envRow).toHaveTextContent('env@example.com');
    expect(within(envRow).getByText('Set in server config')).toBeInTheDocument();
    expect(within(envRow).queryByRole('button')).toBeNull();
    expect(within(uiRow).getByRole('button', { name: 'Remove ui@example.com' })).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/settings\/exhibit-admins$/);
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    expect(screen.getByText(/Last updated by boss@example.com/)).toBeInTheDocument();
  });

  it('shows an empty state when nobody is on the list', async () => {
    stubFetch(() => respond(200, listBody([])));
    renderList();
    expect(await screen.findByText('No one has been added yet.')).toBeInTheDocument();
  });

  it('adds an email and shows the server message', async () => {
    stubFetch((_input, init) => (
      isMethod(init, 'POST')
        ? respond(200, { ...listBody(['new@example.com']), message: 'Email added' })
        : respond(200, listBody([]))
    ));
    const user = userEvent.setup();
    renderList();
    await screen.findByText('No one has been added yet.');

    await user.type(emailInput(), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect((await screen.findByRole('status')).textContent).toBe('Email added');
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
    expect(emailInput().value).toBe('');
    const post = fetchMock.mock.calls.find(([, init]) => isMethod(init, 'POST'));
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ email: 'new@example.com' });
  });

  it('blocks an invalid email without calling the API', async () => {
    stubFetch(() => respond(200, listBody([])));
    const user = userEvent.setup();
    renderList();
    await screen.findByText('No one has been added yet.');

    await user.type(emailInput(), 'bad-email');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('alert').textContent).toMatch(/valid email/);
    expect(emailInput()).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock.mock.calls.some(([, init]) => isMethod(init, 'POST'))).toBe(false);
  });

  it('shows the server error text when adding fails', async () => {
    stubFetch((_input, init) => (
      isMethod(init, 'POST')
        ? respond(400, { success: false, error: 'The list is full', code: 'LIST_FULL' })
        : respond(200, listBody([]))
    ));
    const user = userEvent.setup();
    renderList();
    await screen.findByText('No one has been added yet.');

    await user.type(emailInput(), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect((await screen.findByRole('alert')).textContent).toBe('The list is full');
    expect(emailInput().value).toBe('new@example.com');
  });

  it('asks first, and sends nothing when the remove is cancelled', async () => {
    stubFetch(() => respond(200, listBody(['a+b@example.com'])));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderList();

    await user.click(await screen.findByRole('button', { name: 'Remove a+b@example.com' }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('a+b@example.com'));
    expect(fetchMock.mock.calls.some(([, init]) => isMethod(init, 'DELETE'))).toBe(false);
    expect(screen.getByText('a+b@example.com')).toBeInTheDocument();
  });

  it('removes an email with an encoded DELETE', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubFetch((_input, init) => (
      isMethod(init, 'DELETE') ? respond(200, listBody([])) : respond(200, listBody(['a+b@example.com']))
    ));
    const user = userEvent.setup();
    renderList();

    await user.click(await screen.findByRole('button', { name: 'Remove a+b@example.com' }));

    expect(await screen.findByText('No one has been added yet.')).toBeInTheDocument();
    const del = fetchMock.mock.calls.find(([, init]) => isMethod(init, 'DELETE'));
    expect(String(del?.[0])).toMatch(/\/api\/settings\/exhibit-admins\/a%2Bb%40example\.com$/);
  });

  it('shows the server error when a remove is refused', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubFetch((_input, init) => (
      isMethod(init, 'DELETE')
        ? respond(409, { success: false, error: 'This email is set in server config', code: 'ENV_MANAGED' })
        : respond(200, listBody(['ui@example.com']))
    ));
    const user = userEvent.setup();
    renderList();

    await user.click(await screen.findByRole('button', { name: 'Remove ui@example.com' }));

    expect((await screen.findByRole('alert')).textContent).toBe('This email is set in server config');
    expect(screen.getByText('ui@example.com')).toBeInTheDocument();
  });

  it('shows a load error such as 403', async () => {
    stubFetch(() => respond(403, { success: false, error: 'Only approval admins can manage exhibit admins' }));
    renderList();

    expect((await screen.findByRole('alert')).textContent).toContain('Only approval admins can manage exhibit admins');
  });
});

describe('AdminSettingsPage admin lists', () => {
  it('shows the Exhibit and Document admin sections to approval admins', async () => {
    stubFetch(() => respond(200, listBody([])));
    render(<AdminSettingsPage />);

    expect(screen.getByRole('heading', { name: 'Discount Policy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Exhibit Admins' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Document Admins' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('No one has been added yet.')).toHaveLength(2));
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((u) => u.endsWith('/api/settings/exhibit-admins'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/api/settings/document-admins'))).toBe(true);
  });

  it('does not load the lists for non-admins', () => {
    stubFetch(() => respond(200, listBody([])));
    authState.value = { user: { email: 'rep@example.com', isApprovalAdmin: false }, loading: false };
    render(<AdminSettingsPage />);

    expect(screen.getByRole('alert').textContent).toContain('Access denied');
    expect(screen.queryByRole('heading', { name: 'Exhibit Admins' })).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('-admins'))).toBe(false);
  });
});
