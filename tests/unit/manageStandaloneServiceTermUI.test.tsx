// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ConfigurationForm from '../../src/components/ConfigurationForm';
import type { ConfigurationData } from '../../src/types/pricing';
import { calculateAllTiers } from '../../src/utils/pricing';
import { resolveServiceTerm } from '../../src/utils/serviceTerm';

const COMBINATIONS = [
  { value: 'data-sprawl', label: 'Data Sprawl', migrationType: 'Manage' },
  { value: 'mange+sprawl', label: 'mange+sprawl', migrationType: 'Manage' },
];
const TERM_ID = 'manage-standalone-service-term';
const TERM_ISSUE = 'Please enter the Duration (Months) for Manage Standalone';

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

function selectWithOption(container: HTMLElement, value: string): HTMLSelectElement {
  const match = Array.from(container.querySelectorAll('select')).find((el) =>
    Array.from(el.options).some((o) => o.value === value),
  );
  if (!match) throw new Error(`No <select> offers ${value}`);
  return match as HTMLSelectElement;
}

function renderForm() {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/combinations')) return json({ success: true, combinations: COMBINATIONS });
    if (url.includes('/api/exhibits')) return json({ success: true, exhibits: [] });
    return json({ success: true });
  }));
  const props = {
    onConfigurationChange: vi.fn(),
    onSubmit: vi.fn(),
    onExhibitsChange: vi.fn(),
    dealData: { contactName: 'Jane Doe', contactEmail: 'jane@example.com', company: 'Acme' } as never,
  };
  const utils = render(<ConfigurationForm {...props} selectedExhibits={[]} />);
  return { ...utils, ...props, user: userEvent.setup() };
}

const lastConfig = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls[spy.mock.calls.length - 1][0] as ConfigurationData;
const termInput = () => document.getElementById(TERM_ID) as HTMLInputElement | null;
const submit = (container: HTMLElement) => fireEvent.submit(container.querySelector('form')!);

async function chooseOnManageTab(ctx: ReturnType<typeof renderForm>, option: string) {
  await ctx.user.click(screen.getByRole('button', { name: 'Manage' }));
  const select = await waitFor(() => selectWithOption(ctx.container, 'mange+sprawl'));
  await ctx.user.selectOptions(select, option);
}

async function openStandalone() {
  const ctx = renderForm();
  await chooseOnManageTab(ctx, 'Manage Standalone');
  const card = await screen.findByTestId('manage-saas-pricing');
  return { ...ctx, card };
}

let alertSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Manage Standalone — Duration (Months)', () => {
  it('is shown next to Number of Users and prefilled with 12', async () => {
    const ctx = await openStandalone();
    const input = termInput()!;
    expect(input).not.toBeNull();
    expect(screen.getByLabelText('Duration (Months)')).toBe(input);
    expect(input.value).toBe('12');
    expect(input.min).toBe('1');
    expect(input.max).toBe('60');
    expect(lastConfig(ctx.onConfigurationChange).serviceTermMonths).toBe(12);
  });

  it('changing it to 24 changes only the term, not the price', async () => {
    const ctx = await openStandalone();
    await ctx.user.type(screen.getByPlaceholderText('Enter number of users'), '30');
    await ctx.user.clear(termInput()!);
    await ctx.user.type(termInput()!, '24');

    const config = lastConfig(ctx.onConfigurationChange);
    expect(config.serviceTermMonths).toBe(24);
    expect(resolveServiceTerm(config, 1)).toEqual({ months: 24, label: '24-Months' });
    expect(within(ctx.card).getByText('$1,800.00')).toBeTruthy();
    expect(within(ctx.card).getByText('30 users × $5.00 × 12 months')).toBeTruthy();
    for (const tier of calculateAllTiers(config)) expect(tier.totalCost).toBe(1800);
  });

  it('blocks submit for a missing, decimal or out-of-range duration', async () => {
    const ctx = await openStandalone();
    await ctx.user.type(screen.getByPlaceholderText('Enter number of users'), '30');

    for (const bad of ['', '2.5', '0', '61']) {
      alertSpy.mockClear();
      fireEvent.change(termInput()!, { target: { value: bad } });
      submit(ctx.container);
      expect(alertSpy).toHaveBeenCalledWith(TERM_ISSUE);
    }
    expect(ctx.onSubmit).not.toHaveBeenCalled();

    alertSpy.mockClear();
    fireEvent.change(termInput()!, { target: { value: '24' } });
    submit(ctx.container);
    expect(alertSpy).not.toHaveBeenCalledWith(TERM_ISSUE);
    expect(ctx.onSubmit).toHaveBeenCalled();
  });

  it('defaults a session saved before the field existed to 12', async () => {
    sessionStorage.setItem('cpq_configuration_session', JSON.stringify({
      servicePlan: 'Manage', migrationType: '', manageAgreementLabel: 'Manage Standalone',
      combination: 'manage-standalone', manageUsers: 30,
    }));
    renderForm();
    await waitFor(() => expect(termInput()?.value).toBe('12'));
  });

  it('is not shown for mange+sprawl, which keeps the free trial', async () => {
    const ctx = await openStandalone();
    await ctx.user.selectOptions(selectWithOption(ctx.container, 'mange+sprawl'), 'mange+sprawl');
    await waitFor(() => expect(screen.queryByTestId('manage-saas-pricing')).toBeNull());
    expect(termInput()).toBeNull();
    expect(screen.queryByLabelText('Duration (Months)')).toBeNull();
    const config = lastConfig(ctx.onConfigurationChange);
    expect(config.serviceTermMonths).toBeUndefined();
    expect(resolveServiceTerm(config, 1).label).toBe('3-Month Free Trial');
  });
});
