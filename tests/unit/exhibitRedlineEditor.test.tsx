// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../src/components/OnlyOfficeEditor', () => ({
  default: () => <div data-testid="onlyoffice-editor" />,
}));

import ExhibitRedlineEditor from '../../src/components/ExhibitRedlineEditor';

// Done must only report success after the server saved the edit, and a session the server
// refuses to open must show the reason instead of an empty editor.

const EXHIBIT = { _id: 'ex-1', name: 'ShareFile to OneDrive Basic Plan - Basic Include' };

const reply = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);

function mockFetch(routes: { start?: [number, unknown]; result?: unknown; persist?: [number, unknown] }) {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/start-session-from-exhibit/')) {
      const [status, body] = routes.start ?? [200, { success: true, sessionId: 's-1', editorUrl: 'http://oo', config: {} }];
      return reply(status, body);
    }
    if (url.includes('/force-save/')) return reply(200, { success: true });
    if (url.includes('/result/')) return reply(200, routes.result ?? { success: true, status: 'ready' });
    if (url.includes('/persist-to-exhibit/')) {
      const [status, body] = routes.persist ?? [200, { success: true, folderUpdated: true }];
      return reply(status, body);
    }
    return reply(404, {});
  }));
  return urls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ExhibitRedlineEditor', () => {
  it('saves the edit over the exhibit when Done is clicked', async () => {
    const urls = mockFetch({});
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<ExhibitRedlineEditor exhibit={EXHIBIT} onClose={onClose} onSaved={onSaved} />);

    await screen.findByTestId('onlyoffice-editor');
    expect(urls[0]).toContain('/api/onlyoffice/start-session-from-exhibit/ex-1');

    await userEvent.click(screen.getByRole('button', { name: /done/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Exhibit saved'));
    expect(onClose).toHaveBeenCalled();
    expect(urls.some(u => u.includes('/api/onlyoffice/persist-to-exhibit/s-1'))).toBe(true);
  });

  it('closes without saving when the editor reports no changes', async () => {
    const urls = mockFetch({ result: { success: true, status: 'no-changes' } });
    const onSaved = vi.fn();
    render(<ExhibitRedlineEditor exhibit={EXHIBIT} onClose={vi.fn()} onSaved={onSaved} />);

    await screen.findByTestId('onlyoffice-editor');
    await userEvent.click(screen.getByRole('button', { name: /done/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('No changes to save'));
    expect(urls.some(u => u.includes('/persist-to-exhibit/'))).toBe(false);
  });

  it('does not save when the editor reports an error', async () => {
    const urls = mockFetch({ result: { success: true, status: 'editor-error' } });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const onSaved = vi.fn();
    render(<ExhibitRedlineEditor exhibit={EXHIBIT} onClose={vi.fn()} onSaved={onSaved} />);

    await screen.findByTestId('onlyoffice-editor');
    await userEvent.click(screen.getByRole('button', { name: /done/i }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('could not save')));
    expect(onSaved).not.toHaveBeenCalled();
    expect(urls.some(u => u.includes('/persist-to-exhibit/'))).toBe(false);
  });

  it('keeps the editor open and shows the error when the save is refused', async () => {
    mockFetch({ persist: [403, { success: false, error: 'Only the admin who opened this editor can save it' }] });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<ExhibitRedlineEditor exhibit={EXHIBIT} onClose={onClose} onSaved={onSaved} />);

    await screen.findByTestId('onlyoffice-editor');
    await userEvent.click(screen.getByRole('button', { name: /done/i }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Only the admin who opened this editor can save it'));
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('frees the exhibit for other admins when the editor closes', async () => {
    const urls = mockFetch({});
    const { unmount } = render(<ExhibitRedlineEditor exhibit={EXHIBIT} onClose={vi.fn()} onSaved={vi.fn()} />);

    await screen.findByTestId('onlyoffice-editor');
    unmount();

    expect(urls.some(u => u.includes('/api/onlyoffice/exhibit-session/s-1/release'))).toBe(true);
  });

  it('tells the admin who is already editing the exhibit', async () => {
    mockFetch({ start: [409, { success: false, error: 'Anush Dasari is editing this exhibit. Try again later.' }] });
    render(<ExhibitRedlineEditor exhibit={EXHIBIT} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByText('Anush Dasari is editing this exhibit. Try again later.')).toBeTruthy();
    expect(screen.queryByTestId('onlyoffice-editor')).toBeNull();
  });

  it('shows why the editor could not open', async () => {
    mockFetch({ start: [403, { success: false, error: 'Only exhibit admins can add, edit, or delete exhibits' }] });
    render(<ExhibitRedlineEditor exhibit={EXHIBIT} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByText('Only exhibit admins can add, edit, or delete exhibits')).toBeTruthy();
    expect(screen.queryByTestId('onlyoffice-editor')).toBeNull();
    expect((screen.getByRole('button', { name: /done/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
