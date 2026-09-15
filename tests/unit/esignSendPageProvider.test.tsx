// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EsignSendPage from '../../src/pages/EsignSendPage';
import { resetZohoSignStatusCache } from '../../src/hooks/useZohoSignStatus';

// The send screen is the route that silently picks a provider on the user's behalf, so the two
// things pinned here are: with Zoho off the page is the in-house page it has always been, and
// with Zoho on the choice actually reaches a different endpoint.

const TOKEN = 'header.payload.signature';
const DOC_ID = '6a8dc7e188f43f837939c157';

function mockLocalStorage(): void {
  const store: Record<string, string> = { cpq_token: TOKEN };
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: () => null,
    length: 0,
  });
}

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

/** Routes every request the page makes; `zohoStatus` is what GET /api/zoho-sign/status answers. */
function mockBackend(zohoStatus: { ok: boolean; body?: unknown }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/zoho-sign/status')) {
      if (!zohoStatus.ok) return { ok: false, status: 503, json: async () => ({}) } as unknown as Response;
      return ok(zohoStatus.body);
    }
    if (url.includes('/signature-fields/')) return ok({ success: true, fields: [] });
    if (url.includes('/recipients')) return ok({ success: true, recipients: [] });
    if (url.includes('/send-for-signature')) return ok({ success: true, message: 'Successfully sent email to recipient(s).' });
    if (url.includes('/api/zoho-sign/documents/')) return ok({ success: true, document: { id: DOC_ID, provider: 'zoho', status: 'sent' } });
    return ok({ success: true, document: { file_name: 'Order Form.pdf' } });
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/esign/${DOC_ID}/send`]}>
      <Routes>
        <Route path="/esign/:documentId/send" element={<EsignSendPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const PICKER = 'esign-provider-picker';

// Vitest runs without globals here, so React Testing Library's auto-cleanup never registers.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  mockLocalStorage();
  resetZohoSignStatusCache();
});

describe('EsignSendPage — Zoho off', () => {
  it('shows no picker and sends through the in-house route, exactly as before', async () => {
    const user = userEvent.setup();
    const fetchMock = mockBackend({ ok: true, body: { success: true, enabled: false, configured: false } });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await screen.findByText('Order Form.pdf');
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/api/zoho-sign/status'))).toBe(true));

    expect(screen.queryByTestId(PICKER)).not.toBeInTheDocument();
    expect(screen.queryByText(/Signing method/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Send for Signature/i }));

    await waitFor(() => {
      const sendCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/send-for-signature'));
      expect(sendCall).toBeDefined();
    });
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/api/zoho-sign/documents/'))).toBe(false);
  });

  it('stays on the in-house route when the status endpoint itself fails', async () => {
    const user = userEvent.setup();
    const fetchMock = mockBackend({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await screen.findByText('Order Form.pdf');

    expect(screen.queryByTestId(PICKER)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Send for Signature/i }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/send-for-signature'))).toBe(true)
    );
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/api/zoho-sign/documents/'))).toBe(false);
  });
});

describe('EsignSendPage — Zoho on', () => {
  it('offers the picker with CPQ pre-selected and still sends in-house if nothing is touched', async () => {
    const user = userEvent.setup();
    const fetchMock = mockBackend({ ok: true, body: { success: true, enabled: true, configured: true } });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await screen.findByTestId(PICKER);

    expect((screen.getByRole('radio', { name: /CPQ e-signature/i }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: /Zoho Sign/i }) as HTMLInputElement).checked).toBe(false);

    await user.click(screen.getByRole('button', { name: /Send for Signature/i }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/send-for-signature'))).toBe(true)
    );
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/api/zoho-sign/documents/'))).toBe(false);
  });

  it('remembers an enabled answer for the session instead of asking on every mount', async () => {
    const fetchMock = mockBackend({ ok: true, body: { success: true, enabled: true, configured: true } });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await screen.findByTestId(PICKER);
    cleanup();
    renderPage();
    await screen.findByTestId(PICKER);

    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/api/zoho-sign/status'))).toHaveLength(1);
  });

  it('sends to the Zoho route with the Bearer token once Zoho is selected', async () => {
    const user = userEvent.setup();
    const fetchMock = mockBackend({ ok: true, body: { success: true, enabled: true, configured: true } });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await screen.findByTestId(PICKER);

    await user.click(screen.getByRole('radio', { name: /Zoho Sign/i }));
    await user.click(screen.getByRole('button', { name: /Send for Signature/i }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes(`/api/zoho-sign/documents/${DOC_ID}/send`))).toBe(true)
    );

    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes(`/api/zoho-sign/documents/${DOC_ID}/send`)) as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/send-for-signature'))).toBe(false);
    expect(await screen.findByText(/Sent via Zoho Sign\. Signers will receive an email from Zoho\./i)).toBeInTheDocument();
  });
});
