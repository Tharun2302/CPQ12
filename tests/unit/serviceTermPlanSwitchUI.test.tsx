// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ConfigurationForm from '../../src/components/ConfigurationForm';
import type { ConfigurationData } from '../../src/types/pricing';
import { serviceTermTokens } from '../../src/utils/serviceTerm';

const COMBINATIONS = [
  { value: 'overage-agreement', label: 'Overage-Agreement', migrationType: 'Overage Agreement' },
  { value: 'data-sprawl', label: 'Data Sprawl', migrationType: 'Manage' },
  { value: 'mange+sprawl', label: 'mange+sprawl', migrationType: 'Manage' },
];
const EXHIBITS = [
  { _id: 'dbx', name: 'Content Sprawl DropBox', category: 'content', combinations: ['data-sprawl'], isRequired: false, displayOrder: 1 },
];
const STANDALONE_TERM = 'manage-standalone-service-term';
const SPRAWL_TERM = 'data-sprawl-service-term';
const START = '2026-10-07';

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
  const props = {
    onConfigurationChange: vi.fn(),
    onSubmit: vi.fn(),
    onExhibitsChange: vi.fn(),
    dealData: { contactName: 'Jane Doe', contactEmail: 'jane@example.com', company: 'Acme' } as never,
  };
  const utils = render(<ConfigurationForm {...props} selectedExhibits={[]} />);
  const selectExhibits = (ids: string[]) => utils.rerender(<ConfigurationForm {...props} selectedExhibits={ids} />);
  return { ...utils, ...props, selectExhibits, user: userEvent.setup() };
}

type Ctx = ReturnType<typeof renderForm>;
const lastConfig = (ctx: Ctx) =>
  ctx.onConfigurationChange.mock.calls[ctx.onConfigurationChange.mock.calls.length - 1][0] as ConfigurationData;
const termInput = (id: string) => document.getElementById(id) as HTMLInputElement | null;
const tokens = (ctx: Ctx) => serviceTermTokens({ ...lastConfig(ctx), startDate: START } as ConfigurationData, 1);

async function chooseManage(ctx: Ctx, option: string) {
  await ctx.user.click(screen.getByRole('button', { name: 'Manage' }));
  const select = await waitFor(() => selectWithOption(ctx.container, 'mange+sprawl'));
  await ctx.user.selectOptions(select, option);
}

async function chooseDataSprawl(ctx: Ctx) {
  await ctx.user.click(screen.getByRole('button', { name: 'Migrate' }));
  const migrate = await waitFor(() => selectWithOption(ctx.container, 'data-sprawl'));
  await ctx.user.selectOptions(migrate, 'data-sprawl');
  ctx.selectExhibits(['dbx']);
  await waitFor(() => expect(termInput(SPRAWL_TERM)).not.toBeNull());
}

async function standaloneWith24(ctx: Ctx) {
  await chooseManage(ctx, 'Manage Standalone');
  await waitFor(() => expect(termInput(STANDALONE_TERM)).not.toBeNull());
  fireEvent.change(termInput(STANDALONE_TERM)!, { target: { value: '24' } });
  expect(lastConfig(ctx).serviceTermMonths).toBe(24);
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('serviceTermMonths does not leak between plans', () => {
  it('Manage Standalone 24 -> Data Sprawl starts with an empty term', async () => {
    const ctx = renderForm();
    await standaloneWith24(ctx);
    await chooseDataSprawl(ctx);
    expect(termInput(SPRAWL_TERM)!.value).toBe('');
    expect(lastConfig(ctx).serviceTermMonths).toBeUndefined();
    expect(tokens(ctx).label).toBe('3-Month Free Trial');
  }, 30000);

  it('Data Sprawl 6 -> Manage Standalone is prefilled with 12, not 6', async () => {
    const ctx = renderForm();
    await chooseDataSprawl(ctx);
    fireEvent.change(termInput(SPRAWL_TERM)!, { target: { value: '6' } });
    expect(lastConfig(ctx).serviceTermMonths).toBe(6);
    await chooseManage(ctx, 'Manage Standalone');
    await waitFor(() => expect(termInput(STANDALONE_TERM)?.value).toBe('12'));
    expect(lastConfig(ctx).serviceTermMonths).toBe(12);
    expect(tokens(ctx)).toEqual({ endDate: '2027-10-06', label: '12-Months' });
  }, 30000);

  it('Manage Standalone 24 -> mange+sprawl prints the free trial, and returning restarts at 12', async () => {
    const ctx = renderForm();
    await standaloneWith24(ctx);
    await ctx.user.selectOptions(selectWithOption(ctx.container, 'mange+sprawl'), 'mange+sprawl');
    expect(lastConfig(ctx).serviceTermMonths).toBeUndefined();
    expect(tokens(ctx)).toEqual({ endDate: '2027-01-06', label: '3-Month Free Trial' });

    await ctx.user.selectOptions(selectWithOption(ctx.container, 'mange+sprawl'), 'Manage Standalone');
    await waitFor(() => expect(termInput(STANDALONE_TERM)?.value).toBe('12'));
  }, 30000);

  it('Manage Standalone 24 -> Migrate tab clears the term', async () => {
    const ctx = renderForm();
    await standaloneWith24(ctx);
    await ctx.user.click(screen.getByRole('button', { name: 'Migrate' }));
    expect(lastConfig(ctx).servicePlan).toBe('Migrate');
    expect(lastConfig(ctx).serviceTermMonths).toBeUndefined();
  }, 30000);
});

describe('a chosen Manage Standalone term survives a session reload', () => {
  it('restores 24, not the default 12', async () => {
    sessionStorage.setItem('cpq_configuration_session', JSON.stringify({
      servicePlan: 'Manage', migrationType: '', manageAgreementLabel: 'Manage Standalone',
      combination: 'manage-standalone', manageUsers: 30, serviceTermMonths: 24, startDate: START,
    }));
    const ctx = renderForm();
    await waitFor(() => expect(termInput(STANDALONE_TERM)?.value).toBe('24'));
    await waitFor(() => expect(lastConfig(ctx).serviceTermMonths).toBe(24));
    expect(tokens(ctx)).toEqual({ endDate: '2028-10-06', label: '24-Months' });
  }, 30000);
});
