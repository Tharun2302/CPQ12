// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

// The sidebar pulls in chat widgets and modals that are irrelevant to the access check
vi.mock('../../src/components/Navigation', () => ({
  default: () => <nav data-testid="sidebar" />,
}));

import DiscountPolicySettings, { validateMaxDiscountInput } from '../../src/components/admin/DiscountPolicySettings';
import AdminSettingsPage from '../../src/pages/AdminSettingsPage';
import {
  DEFAULT_DISCOUNT_POLICY_VALUE,
  DiscountPolicyContext,
  DiscountPolicyContextValue,
} from '../../src/contexts/DiscountPolicyContext';

function renderWithPolicy(ui: React.ReactElement, overrides: Partial<DiscountPolicyContextValue> = {}) {
  const value: DiscountPolicyContextValue = {
    ...DEFAULT_DISCOUNT_POLICY_VALUE,
    updatedAt: '2026-10-01T10:00:00.000Z',
    updatedBy: 'boss@example.com',
    updateMaxDiscount: vi.fn(async (max: number) => ({
      success: true,
      data: { maxDiscountPercent: max, updatedAt: '2026-10-08T10:00:00.000Z', updatedBy: 'admin@example.com' },
    })),
    ...overrides,
  };
  render(<DiscountPolicyContext.Provider value={value}>{ui}</DiscountPolicyContext.Provider>);
  return value;
}

const maxInput = () => screen.getByLabelText('Maximum Discount (%)') as HTMLInputElement;

beforeEach(() => {
  authState.value = { user: { email: 'admin@example.com', isApprovalAdmin: true }, loading: false };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('validateMaxDiscountInput', () => {
  it('accepts 0..100 with up to 2 decimals', () => {
    expect(validateMaxDiscountInput('0')).toBeNull();
    expect(validateMaxDiscountInput('15')).toBeNull();
    expect(validateMaxDiscountInput('12.75')).toBeNull();
    expect(validateMaxDiscountInput('100')).toBeNull();
  });

  it('rejects empty, out-of-range, negative and over-precise values', () => {
    expect(validateMaxDiscountInput('')).toMatch(/Enter/);
    expect(validateMaxDiscountInput('100.01')).toMatch(/between 0 and 100/);
    expect(validateMaxDiscountInput('-1')).toMatch(/2 decimal/);
    expect(validateMaxDiscountInput('12.345')).toMatch(/2 decimal/);
    expect(validateMaxDiscountInput('abc')).toMatch(/2 decimal/);
  });
});

describe('DiscountPolicySettings', () => {
  it('shows the current max and who last changed it', () => {
    renderWithPolicy(<DiscountPolicySettings />);
    expect(maxInput().value).toBe('15');
    expect(screen.getByText(/Last updated by boss@example.com at/)).toBeTruthy();
  });

  it('blocks saving an invalid value and does not call the API', async () => {
    const user = userEvent.setup();
    const policy = renderWithPolicy(<DiscountPolicySettings />);

    await user.clear(maxInput());
    await user.type(maxInput(), '150');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert').textContent).toMatch(/between 0 and 100/);
    expect(maxInput()).toHaveAttribute('aria-invalid', 'true');
    expect(policy.updateMaxDiscount).not.toHaveBeenCalled();
  });

  it('saves a valid value and shows a success message', async () => {
    const user = userEvent.setup();
    const policy = renderWithPolicy(<DiscountPolicySettings />);

    await user.clear(maxInput());
    await user.type(maxInput(), '22.5');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(policy.updateMaxDiscount).toHaveBeenCalledWith(22.5));
    expect((await screen.findByRole('status')).textContent).toContain('saved as 22.5%');
  });

  it('shows the server error when saving fails', async () => {
    const user = userEvent.setup();
    renderWithPolicy(<DiscountPolicySettings />, {
      updateMaxDiscount: vi.fn(async () => ({ success: false, error: 'Approval admin access required' })),
    });

    await user.clear(maxInput());
    await user.type(maxInput(), '20');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Approval admin access required');
  });

  it('Reset to default only fills the field with 15; Save persists it', async () => {
    const user = userEvent.setup();
    const policy = renderWithPolicy(<DiscountPolicySettings />, { maxDiscountPercent: 40 });
    expect(maxInput().value).toBe('40');

    await user.click(screen.getByRole('button', { name: /Reset to default/ }));

    expect(maxInput().value).toBe('15');
    expect(policy.updateMaxDiscount).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(policy.updateMaxDiscount).toHaveBeenCalledWith(15));
    expect((await screen.findByRole('status')).textContent).toContain('saved as 15%');
  });

  it('keeps the typed value and shows the error when saving fails', async () => {
    const user = userEvent.setup();
    renderWithPolicy(<DiscountPolicySettings />, {
      updateMaxDiscount: vi.fn(async () => ({ success: false, error: 'Network down' })),
    });

    await user.clear(maxInput());
    await user.type(maxInput(), '18');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Network down');
    expect(maxInput().value).toBe('18');
  });
});

describe('AdminSettingsPage', () => {
  it('shows the discount policy form to approval admins', () => {
    renderWithPolicy(<AdminSettingsPage />);
    expect(screen.getByLabelText('Maximum Discount (%)')).toBeTruthy();
  });

  it('shows a loader instead of "Access denied" while auth is still loading', () => {
    authState.value = { user: null, loading: true };
    renderWithPolicy(<AdminSettingsPage />);

    expect(screen.getByRole('status').textContent).toContain('Loading');
    expect(screen.queryByText('Access denied')).toBeNull();
    expect(screen.queryByLabelText('Maximum Discount (%)')).toBeNull();
  });

  it('denies access to non-admins', () => {
    authState.value = { user: { email: 'rep@example.com', isApprovalAdmin: false }, loading: false };
    renderWithPolicy(<AdminSettingsPage />);

    expect(screen.getByRole('alert').textContent).toContain('Access denied');
    expect(screen.queryByLabelText('Maximum Discount (%)')).toBeNull();
  });
});
