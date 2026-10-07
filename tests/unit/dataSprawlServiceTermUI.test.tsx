// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ConfigurationForm from '../../src/components/ConfigurationForm';
import type { ConfigurationData } from '../../src/types/pricing';

const COMBINATIONS = [
  { value: 'overage-agreement', label: 'Overage-Agreement', migrationType: 'Overage Agreement' },
  { value: 'data-sprawl', label: 'Data Sprawl', migrationType: 'Manage' },
  { value: 'mange+sprawl', label: 'MANAGE + Sprawl', migrationType: 'Manage' },
];

const EXHIBITS = [
  { _id: 'dbx', name: 'Content Sprawl DropBox', category: 'content', combinations: ['data-sprawl'], isRequired: false, displayOrder: 1 },
];

const DEAL = { contactName: 'Jane Doe', contactEmail: 'jane@example.com', company: 'Acme' };
const TERM_LABEL = 'Duration (Months)';
const TERM_ISSUE = 'Please enter the Duration (Months) for Data Sprawl';

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
    if (url.includes('/api/exhibits')) return json({ success: true, exhibits: EXHIBITS });
    return json({ success: true });
  }));
  const user = userEvent.setup();
  const props = {
    onConfigurationChange: vi.fn(),
    onSubmit: vi.fn(),
    onExhibitsChange: vi.fn(),
    dealData: DEAL as never,
  };
  const utils = render(<ConfigurationForm {...props} selectedExhibits={[]} />);
  const selectExhibits = (ids: string[]) => utils.rerender(<ConfigurationForm {...props} selectedExhibits={ids} />);
  return { ...utils, ...props, user, selectExhibits };
}

const lastConfig = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls[spy.mock.calls.length - 1][0] as ConfigurationData;
const termInput = () => screen.queryByLabelText(TERM_LABEL) as HTMLInputElement | null;
const section = (container: HTMLElement) =>
  container.querySelector('[data-section="project-configuration"]') as HTMLElement | null;

async function openDataSprawlWithExhibit() {
  const ctx = renderForm();
  const migrate = await waitFor(() => selectWithOption(ctx.container, 'data-sprawl'));
  await ctx.user.selectOptions(migrate, 'data-sprawl');
  ctx.selectExhibits(['dbx']);
  await waitFor(() => expect(screen.queryAllByTestId('sprawl-group')).toHaveLength(1));
  return ctx;
}

async function chooseOnManageTab(ctx: ReturnType<typeof renderForm>, option: string) {
  await ctx.user.click(screen.getByRole('button', { name: 'Manage' }));
  const select = await waitFor(() => selectWithOption(ctx.container, 'mange+sprawl'));
  await ctx.user.selectOptions(select, option);
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

describe('Data Sprawl — Duration (Months)', () => {
  it('appears only once an exhibit is ticked, between the cards and Discount', async () => {
    const ctx = renderForm();
    const migrate = await waitFor(() => selectWithOption(ctx.container, 'data-sprawl'));
    await ctx.user.selectOptions(migrate, 'data-sprawl');
    expect(termInput()).toBeNull();

    ctx.selectExhibits(['dbx']);
    await waitFor(() => expect(termInput()).not.toBeNull());
    const input = termInput()!;
    expect(section(ctx.container)!.contains(input)).toBe(true);
    expect(input.min).toBe('1');
    expect(input.max).toBe('60');
    expect(input.step).toBe('1');

    const card = screen.getByTestId('sprawl-group');
    const discount = within(section(ctx.container)!).getByText('Discount (%)');
    expect(card.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(input.compareDocumentPosition(discount) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('typing 12 sets serviceTermMonths and leaves duration untouched', async () => {
    const ctx = await openDataSprawlWithExhibit();
    const before = lastConfig(ctx.onConfigurationChange);
    await ctx.user.type(termInput()!, '12');

    const config = lastConfig(ctx.onConfigurationChange);
    expect(config.serviceTermMonths).toBe(12);
    expect(config.duration).toBe(before.duration);
    expect(config.endDate).toBe(before.endDate);
    expect(termInput()!.value).toBe('12');

    await ctx.user.clear(termInput()!);
    expect(lastConfig(ctx.onConfigurationChange).serviceTermMonths).toBeUndefined();
  });

  it('is absent for mange+sprawl (Manage Standalone has its own, see manageStandaloneServiceTermUI)', async () => {
    const ctx = renderForm();
    await chooseOnManageTab(ctx, 'Manage Standalone');
    await screen.findByTestId('manage-saas-pricing');
    expect(termInput()!.id).toBe('manage-standalone-service-term');

    await ctx.user.selectOptions(selectWithOption(ctx.container, 'mange+sprawl'), 'mange+sprawl');
    await waitFor(() => expect(section(ctx.container)).not.toBeNull());
    expect(termInput()).toBeNull();
  });

  it('switching agreement clears the term', async () => {
    const ctx = await openDataSprawlWithExhibit();
    await ctx.user.type(termInput()!, '12');
    await chooseOnManageTab(ctx, 'mange+sprawl');
    expect(lastConfig(ctx.onConfigurationChange).serviceTermMonths).toBeUndefined();
  });

  it('switching to another Migrate option clears the term', async () => {
    const ctx = await openDataSprawlWithExhibit();
    await ctx.user.type(termInput()!, '12');
    await ctx.user.selectOptions(selectWithOption(ctx.container, 'data-sprawl'), 'overage-agreement');
    const config = lastConfig(ctx.onConfigurationChange);
    expect(config.servicePlan).toBe('Migrate');
    expect(config.serviceTermMonths).toBeUndefined();
  });

  it('blocks submit until a valid duration is entered', async () => {
    const ctx = await openDataSprawlWithExhibit();
    const card = screen.getByTestId('sprawl-group');
    await ctx.user.type(within(card).getByLabelText('Number of Users'), '5');
    await ctx.user.type(within(card).getByLabelText('Content data size in GB'), '10');

    fireEvent.submit(ctx.container.querySelector('form')!);
    expect(alertSpy).toHaveBeenCalledWith(TERM_ISSUE);
    expect(ctx.onSubmit).not.toHaveBeenCalled();

    alertSpy.mockClear();
    for (const bad of ['2.5', '1e2']) {
      alertSpy.mockClear();
      fireEvent.change(termInput()!, { target: { value: bad } });
      fireEvent.submit(ctx.container.querySelector('form')!);
      expect(alertSpy).toHaveBeenCalledWith(TERM_ISSUE);
    }
    expect(ctx.onSubmit).not.toHaveBeenCalled();

    alertSpy.mockClear();
    fireEvent.change(termInput()!, { target: { value: '12' } });
    fireEvent.submit(ctx.container.querySelector('form')!);
    expect(alertSpy).not.toHaveBeenCalledWith(TERM_ISSUE);
    expect(ctx.onSubmit).toHaveBeenCalled();
  });
});
