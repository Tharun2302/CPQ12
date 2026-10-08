// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ConfigurationForm from '../../src/components/ConfigurationForm';
import {
  DEFAULT_DISCOUNT_POLICY_VALUE,
  DiscountPolicyContext,
  DiscountPolicyContextValue,
} from '../../src/contexts/DiscountPolicyContext';

const COMBINATIONS = [{ value: 'mange+sprawl', label: 'mange+sprawl', migrationType: 'Manage' }];

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/combinations')) return json({ success: true, combinations: COMBINATIONS });
      if (url.includes('/api/exhibits')) return json({ success: true, exhibits: [] });
      return json({ success: true });
    }),
  );
}

function policy(maxDiscountPercent: number, notifyDiscountClamped = vi.fn()): DiscountPolicyContextValue {
  return { ...DEFAULT_DISCOUNT_POLICY_VALUE, maxDiscountPercent, notifyDiscountClamped };
}

function form(value: DiscountPolicyContextValue) {
  return (
    <DiscountPolicyContext.Provider value={value}>
      <ConfigurationForm
        onConfigurationChange={vi.fn()}
        onSubmit={vi.fn()}
        selectedExhibits={[]}
        onExhibitsChange={vi.fn()}
      />
    </DiscountPolicyContext.Provider>
  );
}

function manageTemplateSelect(container: HTMLElement): HTMLSelectElement {
  const match = Array.from(container.querySelectorAll('select')).find((el) =>
    Array.from(el.options).some((o) => o.value === 'mange+sprawl'),
  );
  if (!match) throw new Error('Manage template <select> not found');
  return match as HTMLSelectElement;
}

async function openManageTab(value: DiscountPolicyContextValue) {
  mockFetch();
  const user = userEvent.setup();
  const utils = render(form(value));
  await user.click(screen.getByRole('button', { name: 'Manage' }));
  const select = await waitFor(() => manageTemplateSelect(utils.container));
  await user.selectOptions(select, 'Manage Standalone');
  await screen.findByTestId('manage-saas-pricing');
  const section = utils.container.querySelector('[data-section="project-configuration"]') as HTMLElement;
  const label = within(section).getByText('Discount (%)');
  const input = label.closest('.group')?.querySelector('input') as HTMLInputElement;
  return { user, section, input, rerender: utils.rerender };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ConfigurationForm discount follows the admin max', () => {
  it('allows values up to the admin max and caps anything above it', async () => {
    const { user, section, input } = await openManageTab(policy(25));

    expect(input).toHaveAttribute('max', '25');
    expect(within(section).getByText('Allowed: 0–25%')).toBeTruthy();

    await user.type(input, '20');
    expect(input.value).toBe('20');
    expect(within(section).queryByRole('alert')).toBeNull();

    await user.clear(input);
    await user.type(input, '30');
    expect(input.value).toBe('25');
    expect(sessionStorage.getItem('cpq_discount_session')).toBe('25');
    expect(within(section).getByRole('alert').textContent).toContain('The maximum discount is 25%');
  });

  it('clamps an entered discount when the admin lowers the max', async () => {
    const { user, input, rerender } = await openManageTab(policy(25));
    await user.type(input, '20');

    const notify = vi.fn();
    rerender(form(policy(10, notify)));

    await waitFor(() => expect(input.value).toBe('10'));
    expect(sessionStorage.getItem('cpq_discount_session')).toBe('10');
    expect(localStorage.getItem('cpq_discount')).toBe('10');
    expect(notify).toHaveBeenCalled();
  });

  it('shows the rule text with the admin max and no stale approval note', async () => {
    const { user, section } = await openManageTab(policy(25));
    await user.click(within(section).getByRole('button', { name: /Discount Rules/ }));

    expect(within(section).getByText(/Up to 25% \(set by admin\)/)).toBeTruthy();
    expect(within(section).queryByText(/require additional approval/)).toBeNull();
  });
});
