// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';

const authState = vi.hoisted(() => ({
  value: { isAuthenticated: true, loading: false, user: { email: 'rep@example.com' } as { email: string } | null },
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => authState.value,
}));

import { DiscountPolicyProvider } from '../../src/contexts/DiscountPolicyContext';
import { useDiscountPolicy } from '../../src/hooks/useDiscountPolicy';

const jsonResponse = (status: number, body: unknown) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);

const policyResponse = (maxDiscountPercent: number, updatedBy: string | null = null) =>
  jsonResponse(200, { success: true, data: { maxDiscountPercent, updatedAt: null, updatedBy } });

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => impl(String(input), init));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DiscountPolicyProvider>{children}</DiscountPolicyProvider>
);

const renderPolicy = () => renderHook(() => useDiscountPolicy(), { wrapper });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('cpq_token', 'token');
  authState.value = { isAuthenticated: true, loading: false, user: { email: 'rep@example.com' } };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('DiscountPolicyContext', () => {
  it('returns the default 15% outside the provider', () => {
    const { result } = renderHook(() => useDiscountPolicy());
    expect(result.current.maxDiscountPercent).toBe(15);
    expect(result.current.isLoading).toBe(false);
  });

  it('loads the policy from the server with the bearer token and caches it', async () => {
    const fetchMock = stubFetch(() => policyResponse(25, 'admin@example.com'));
    const { result } = renderPolicy();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.maxDiscountPercent).toBe(25);
    expect(result.current.updatedBy).toBe('admin@example.com');
    expect(localStorage.getItem('cpq_discount_policy')).toBe('25');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/settings/discount-policy');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token');
  });

  it('falls back to 15 (never 100) when the fetch fails and nothing is cached', async () => {
    stubFetch(() => Promise.reject(new Error('network down')));
    const { result } = renderPolicy();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.maxDiscountPercent).toBe(15);
    expect(result.current.error).toBeTruthy();
  });

  it('falls back to the cached value when the server errors', async () => {
    localStorage.setItem('cpq_discount_policy', '22.5');
    stubFetch(() => jsonResponse(500, { success: false, error: 'Failed to load discount policy' }));
    const { result } = renderPolicy();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.maxDiscountPercent).toBe(22.5);
    expect(result.current.error).toBe('Failed to load discount policy');
  });

  it('ignores a corrupt cached value and uses 15', async () => {
    localStorage.setItem('cpq_discount_policy', '250');
    stubFetch(() => Promise.reject(new Error('offline')));
    const { result } = renderPolicy();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.maxDiscountPercent).toBe(15);
  });

  it('clamps in-progress discounts above the cap, fires discountUpdated and shows a notice', async () => {
    sessionStorage.setItem('cpq_discount_session', '30');
    localStorage.setItem('cpq_discount', '30');
    localStorage.setItem('cpq_quote_custom_line_items_discount', '40');
    const onUpdated = vi.fn();
    window.addEventListener('discountUpdated', onUpdated);
    stubFetch(() => policyResponse(20));

    render(<DiscountPolicyProvider><div /></DiscountPolicyProvider>);

    await waitFor(() => expect(sessionStorage.getItem('cpq_discount_session')).toBe('20'));
    expect(localStorage.getItem('cpq_discount')).toBe('20');
    expect(localStorage.getItem('cpq_quote_custom_line_items_discount')).toBe('20');
    expect(onUpdated).toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('maximum allowed (20%)');
    window.removeEventListener('discountUpdated', onUpdated);
  });

  it('leaves discounts within the cap untouched', async () => {
    sessionStorage.setItem('cpq_discount_session', '10');
    stubFetch(() => policyResponse(20));
    render(<DiscountPolicyProvider><div /></DiscountPolicyProvider>);

    await waitFor(() => expect(localStorage.getItem('cpq_discount_policy')).toBe('20'));
    expect(sessionStorage.getItem('cpq_discount_session')).toBe('10');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('updateMaxDiscount PUTs the new value and updates state on success', async () => {
    const fetchMock = stubFetch((_url, init) =>
      init?.method === 'PUT' ? policyResponse(30, 'admin@example.com') : policyResponse(15),
    );
    const { result } = renderPolicy();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let outcome: Awaited<ReturnType<typeof result.current.updateMaxDiscount>> | undefined;
    await act(async () => {
      outcome = await result.current.updateMaxDiscount(30);
    });

    expect(outcome?.success).toBe(true);
    expect(result.current.maxDiscountPercent).toBe(30);
    expect(localStorage.getItem('cpq_discount_policy')).toBe('30');
    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({ maxDiscountPercent: 30 });
  });

  it('updateMaxDiscount returns the server error and keeps the old value on failure', async () => {
    stubFetch((_url, init) =>
      init?.method === 'PUT'
        ? jsonResponse(403, { success: false, error: 'Only approval admins can do this' })
        : policyResponse(15),
    );
    const { result } = renderPolicy();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let outcome: Awaited<ReturnType<typeof result.current.updateMaxDiscount>> | undefined;
    await act(async () => {
      outcome = await result.current.updateMaxDiscount(50);
    });

    expect(outcome).toMatchObject({ success: false, error: 'Only approval admins can do this' });
    expect(result.current.maxDiscountPercent).toBe(15);
  });

  it('refetches when the window regains focus', async () => {
    let max = 15;
    stubFetch(() => policyResponse(max));
    const { result } = renderPolicy();
    await waitFor(() => expect(result.current.maxDiscountPercent).toBe(15));

    max = 12;
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(result.current.maxDiscountPercent).toBe(12));
  });

  it('picks up a change saved in another tab', async () => {
    stubFetch(() => policyResponse(15));
    const { result } = renderPolicy();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'cpq_discount_policy', newValue: '8' }));
    });
    expect(result.current.maxDiscountPercent).toBe(8);
  });

  it('does not call the API when signed out', async () => {
    authState.value = { isAuthenticated: false, loading: false, user: null };
    const fetchMock = stubFetch(() => policyResponse(40));
    const { result } = renderPolicy();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.maxDiscountPercent).toBe(15);
  });
});
