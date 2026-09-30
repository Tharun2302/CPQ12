// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ConfigurationForm from '../../src/components/ConfigurationForm';

const COMBINATIONS = [
  { value: 'mange+sprawl', label: 'mange+sprawl', migrationType: 'Manage' },
  { value: 'data-sprawl', label: 'data-sprawl', migrationType: 'Manage' },
];

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

function mockFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/combinations')) return json({ success: true, combinations: COMBINATIONS });
    if (url.includes('/api/exhibits')) return json({ success: true, exhibits: [] });
    return json({ success: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function openManageTab() {
  mockFetch();
  const user = userEvent.setup();
  const { container } = render(
    <ConfigurationForm
      onConfigurationChange={vi.fn()}
      onSubmit={vi.fn()}
      selectedExhibits={[]}
      onExhibitsChange={vi.fn()}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Manage' }));
  const card = await screen.findByTestId('manage-saas-pricing');
  const section = container.querySelector('[data-section="project-configuration"]') as HTMLElement;
  return { user, container, card, section };
}

const usersInput = () => screen.getByPlaceholderText('Enter number of users') as HTMLInputElement;

function discountInput(section: HTMLElement): HTMLInputElement {
  const label = within(section).getByText('Discount (%)');
  const input = label.closest('.group')?.querySelector('input');
  if (!input) throw new Error('Discount input not found in Project Configuration');
  return input as HTMLInputElement;
}

function manageTemplateSelect(container: HTMLElement): HTMLSelectElement {
  const match = Array.from(container.querySelectorAll('select')).find((el) =>
    Array.from(el.options).some((o) => o.value === 'data-sprawl'),
  );
  if (!match) throw new Error('Manage template <select> not found');
  return match as HTMLSelectElement;
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

describe('Manage SaaS pricing card (Manage tab, no template)', () => {
  it('appears under Project Configuration with Users and Discount fields', async () => {
    const { card, section } = await openManageTab();
    expect(within(section).getByText('Project Configuration')).toBeTruthy();
    expect(section.contains(card)).toBe(true);
    expect(usersInput()).toBeTruthy();
    expect(discountInput(section)).toBeTruthy();
    expect(within(card).getByText('CloudFuze Manage SaaS Application Management')).toBeTruthy();
    expect(within(card).getByText('$5.00/Month/user')).toBeTruthy();
  });

  it('shows $1,800.00 for 30 users', async () => {
    const { user, card } = await openManageTab();
    await user.type(usersInput(), '30');
    expect(within(card).getByText('30 Users')).toBeTruthy();
    expect(within(card).getByText('$1,800.00')).toBeTruthy();
    expect(within(card).getByText('30 users × $5.00 × 12 months')).toBeTruthy();
  });

  it('shows $0.00 for 0 users', async () => {
    const { user, card } = await openManageTab();
    await user.clear(usersInput());
    await user.type(usersInput(), '0');
    expect(within(card).getByText('0 Users')).toBeTruthy();
    expect(within(card).getByText('$0.00')).toBeTruthy();
  });

  it('has no discount line at 0% and shows $900.00 after 50% discount on 30 users', async () => {
    const { user, card, section } = await openManageTab();
    await user.type(usersInput(), '30');
    expect(within(card).queryByText(/Total after/)).toBeNull();

    await user.type(discountInput(section), '50');
    await waitFor(() => expect(within(card).getByText('Total after 50% discount:')).toBeTruthy());
    expect(within(card).getByText('$900.00')).toBeTruthy();
    expect(within(card).getByText('$1,800.00')).toBeTruthy();
  });

  it('hides the card once a Manage template is selected', async () => {
    const { user, container } = await openManageTab();
    const select = await waitFor(() => manageTemplateSelect(container));
    expect(select.options[0].textContent).toBe('Select Combination');
    await user.selectOptions(select, 'data-sprawl');
    await waitFor(() => expect(screen.queryByTestId('manage-saas-pricing')).toBeNull());
  });
});
