// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ConfigurationForm from '../../src/components/ConfigurationForm';
import { sharedMigrateDuration, overageAddOnCost } from '../../src/utils/pricing';
import { overageLineItem } from '../../src/utils/migrateSelection';
import { getEffectiveDurationMonths } from '../../src/utils/configDuration';
import { SERVICE_TERM_MAX_MONTHS } from '../../src/utils/serviceTerm';
import type { ConfigurationData } from '../../src/types/pricing';
import { toggleMigrateOption } from './helpers/migratePicker';

const COMBINATIONS = [
  { value: 'multi-combination', label: 'Multi-Combination', migrationType: 'Multi combination' },
  { value: 'overage-agreement', label: 'Overage-Agreement', migrationType: 'Overage Agreement' },
  { value: 'data-sprawl', label: 'Data Sprawl', migrationType: 'Manage' },
];

const EXHIBITS = [
  { _id: 'dbx', name: 'Content Sprawl DropBox', category: 'content', combinations: ['data-sprawl'], isRequired: false, displayOrder: 1 },
  { _id: 'pair', name: 'Box to SharePoint Standard Plan Included', category: 'content', combinations: ['box-to-sharepoint'], isRequired: false, displayOrder: 5 },
  { _id: 'pair2', name: 'Dropbox to OneDrive Standard Plan Included', category: 'content', combinations: ['dropbox-to-onedrive'], isRequired: false, displayOrder: 6 },
  { _id: 'pair3', name: 'Gmail to Outlook Standard Plan Included', category: 'email', combinations: ['gmail-to-outlook'], isRequired: false, displayOrder: 7 },
];

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

const lastConfig = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls[spy.mock.calls.length - 1][0] as ConfigurationData;

const DEAL = { contactName: 'QA Person', contactEmail: 'qa@example.com', company: 'QA Co' } as any;

function renderForm(selectedExhibits: string[]) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/combinations')) return json({ success: true, combinations: COMBINATIONS });
    if (url.includes('/api/exhibits')) return json({ success: true, exhibits: EXHIBITS });
    return json({ success: true });
  }));
  const onConfigurationChange = vi.fn();
  const onSubmit = vi.fn();
  const props = { onConfigurationChange, onSubmit, onExhibitsChange: vi.fn(), dealData: DEAL };
  const utils = render(<ConfigurationForm {...props} selectedExhibits={selectedExhibits} />);
  const rerenderWith = (ids: string[]) => utils.rerender(<ConfigurationForm {...props} selectedExhibits={ids} />);
  return { ...utils, rerenderWith, onConfigurationChange, onSubmit, user: userEvent.setup() };
}

const durationInputs = () => screen.getAllByText('Duration (Months)')
  .map(label => label.closest('.group')?.querySelector('input') as HTMLInputElement)
  .filter(Boolean);

async function setDuration(user: ReturnType<typeof userEvent.setup>, input: HTMLInputElement, months: string) {
  await user.clear(input);
  if (months) await user.type(input, months);
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  window.scrollTo = vi.fn() as any;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function setupMultiOverage(ids = ['pair', 'pair2']) {
  const r = renderForm(ids);
  await toggleMigrateOption(r.user, 'multi-combination');
  await toggleMigrateOption(r.user, 'overage-agreement');
  await waitFor(() => expect((lastConfig(r.onConfigurationChange).contentConfigs || []).length).toBe(ids.filter(i => i !== 'pair3').length));
  await r.user.type(await screen.findByLabelText('Number of Instances'), '2');
  return r;
}

describe('QA: per-combination Duration on Multi + add-ons', () => {
  it('lowering the longest row drops Overage months to the new longest', async () => {
    const { user, onConfigurationChange } = await setupMultiOverage();
    const [a, b] = durationInputs();
    await setDuration(user, a, '3');
    await setDuration(user, b, '6');
    await waitFor(() => expect(screen.getByTestId('overage-add-on-duration').textContent).toContain('Valid for 6 Months'));
    await setDuration(user, b, '2');
    await waitFor(() => expect(screen.getByTestId('overage-add-on-duration').textContent).toContain('Valid for 3 Months'));
    await waitFor(() => expect(lastConfig(onConfigurationChange).duration).toBe(3));
  });

  it('clearing every row Duration does not leave a stale month count on Overage', async () => {
    const { user, onConfigurationChange } = await setupMultiOverage();
    const [a, b] = durationInputs();
    await setDuration(user, a, '3');
    await setDuration(user, b, '6');
    await waitFor(() => expect(screen.getByTestId('overage-add-on-duration').textContent).toContain('Valid for 6 Months'));
    await setDuration(user, a, '');
    await setDuration(user, b, '');
    await waitFor(() => expect(lastConfig(onConfigurationChange).contentConfigs?.map(c => c.duration)).toEqual([0, 0]));
    const cfg = lastConfig(onConfigurationChange);
    expect(sharedMigrateDuration(cfg)).toBe(0);
    expect(screen.getByTestId('overage-add-on-duration').textContent).not.toMatch(/Valid for \d+ Month/);
  });

  it('submit is blocked when one row Duration is empty while another is set', async () => {
    const { user, onSubmit, container } = await setupMultiOverage();
    const [a, b] = durationInputs();
    await setDuration(user, a, '');
    await setDuration(user, b, '6');
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/duration for Content configuration/i));
  });

  it('submit passes when every row has a Duration', async () => {
    const { user, onSubmit, container } = await setupMultiOverage();
    const [a, b] = durationInputs();
    await setDuration(user, a, '3');
    await setDuration(user, b, '6');
    fireEvent.submit(container.querySelector('form')!);
    expect(window.alert).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalled();
  });

  it('a combination added after durations are set starts at the longest Duration', async () => {
    const { user, onConfigurationChange, rerenderWith } = await setupMultiOverage();
    const [a, b] = durationInputs();
    await setDuration(user, a, '3');
    await setDuration(user, b, '9');
    await waitFor(() => expect(lastConfig(onConfigurationChange).contentConfigs?.map(c => c.duration)).toEqual([3, 9]));
    rerenderWith(['pair', 'pair2', 'pair3']);
    await waitFor(() => expect((lastConfig(onConfigurationChange).emailConfigs || []).length).toBe(1));
    const cfg = lastConfig(onConfigurationChange);
    expect(cfg.contentConfigs?.map(c => c.duration)).toEqual([3, 9]);
    expect(cfg.emailConfigs?.[0].duration).toBe(9);
    expect(durationInputs()).toHaveLength(3);
  });

  it('removing the longest combination drops the shared Duration to the remaining row', async () => {
    const { user, onConfigurationChange, rerenderWith } = await setupMultiOverage();
    const [a, b] = durationInputs();
    await setDuration(user, a, '3');
    await setDuration(user, b, '9');
    await waitFor(() => expect(lastConfig(onConfigurationChange).contentConfigs?.map(c => c.duration)).toEqual([3, 9]));
    rerenderWith(['pair']);
    await waitFor(() => expect((lastConfig(onConfigurationChange).contentConfigs || []).length).toBe(1));
    await waitFor(() => expect(sharedMigrateDuration(lastConfig(onConfigurationChange))).toBe(3));
    expect(screen.getByTestId('overage-add-on-duration').textContent).toContain('Valid for 3 Months');
    await waitFor(() => expect(lastConfig(onConfigurationChange).duration).toBe(3));
  });

  it('untick and re-tick Overage keeps per-row durations', async () => {
    const { user, onConfigurationChange } = await setupMultiOverage();
    const [a, b] = durationInputs();
    await setDuration(user, a, '3');
    await setDuration(user, b, '6');
    await toggleMigrateOption(user, 'overage-agreement');
    await waitFor(() => expect(lastConfig(onConfigurationChange).overageAddOn).toBeUndefined());
    await toggleMigrateOption(user, 'overage-agreement');
    await waitFor(() => expect(lastConfig(onConfigurationChange).overageAddOn).toBeTruthy());
    expect(lastConfig(onConfigurationChange).contentConfigs?.map(c => c.duration)).toEqual([3, 6]);
    expect(durationInputs().map(i => i.value)).toEqual(['3', '6']);
  });

  it('untick and re-tick Data Sprawl keeps per-row durations', async () => {
    const r = renderForm(['pair', 'pair2']);
    await toggleMigrateOption(r.user, 'multi-combination');
    await toggleMigrateOption(r.user, 'data-sprawl');
    await waitFor(() => expect((lastConfig(r.onConfigurationChange).contentConfigs || []).length).toBe(2));
    const [a, b] = durationInputs();
    await setDuration(r.user, a, '4');
    await setDuration(r.user, b, '7');
    await toggleMigrateOption(r.user, 'data-sprawl');
    await waitFor(() => expect(lastConfig(r.onConfigurationChange).includeDataSprawl).toBeFalsy());
    await toggleMigrateOption(r.user, 'data-sprawl');
    await waitFor(() => expect(lastConfig(r.onConfigurationChange).includeDataSprawl).toBe(true));
    expect(lastConfig(r.onConfigurationChange).contentConfigs?.map(c => c.duration)).toEqual([4, 7]);
  });

  it('plain Multi (no add-ons) keeps independent per-row durations and new rows start at 1', async () => {
    const r = renderForm(['pair']);
    await toggleMigrateOption(r.user, 'multi-combination');
    await waitFor(() => expect((lastConfig(r.onConfigurationChange).contentConfigs || []).length).toBe(1));
    await setDuration(r.user, durationInputs()[0], '8');
    await waitFor(() => expect(lastConfig(r.onConfigurationChange).contentConfigs?.[0].duration).toBe(8));
    r.rerenderWith(['pair', 'pair2']);
    await waitFor(() => expect((lastConfig(r.onConfigurationChange).contentConfigs || []).length).toBe(2));
    expect(lastConfig(r.onConfigurationChange).contentConfigs?.map(c => c.duration)).toEqual([8, 1]);
    expect(screen.queryByTestId('common-duration')).toBeNull();
  });

  it('a negative row Duration is stored as 0 and one above the maximum as the maximum', async () => {
    const { onConfigurationChange } = await setupMultiOverage();
    const [a, b] = durationInputs();
    expect(a.getAttribute('max')).toBe(String(SERVICE_TERM_MAX_MONTHS));
    fireEvent.change(a, { target: { value: '-5' } });
    fireEvent.change(b, { target: { value: '100000' } });
    await waitFor(() => expect(lastConfig(onConfigurationChange).contentConfigs?.map(c => c.duration)).toEqual([0, SERVICE_TERM_MAX_MONTHS]));
    expect(lastConfig(onConfigurationChange).duration).toBe(SERVICE_TERM_MAX_MONTHS);
    expect(overageAddOnCost(lastConfig(onConfigurationChange))).toBe(500 * SERVICE_TERM_MAX_MONTHS * 2);
  });
});

describe('QA: quote outputs read the longest row (pure)', () => {
  const base = {
    numberOfUsers: 1, instanceType: 'Small', numberOfInstances: 1, duration: 12, dataSizeGB: 0,
    migrationType: 'Multi combination', combination: 'multi-combination', servicePlan: 'Migrate', customerLocation: '1',
    messagingConfigs: [{ exhibitId: 'm', exhibitName: 'Slack to Teams', numberOfUsers: 10, instanceType: 'Small', numberOfInstances: 1, duration: 2, messages: 10 }],
    contentConfigs: [{ exhibitId: 'c', exhibitName: 'Box to SharePoint', numberOfUsers: 10, instanceType: 'Small', numberOfInstances: 1, duration: 5, dataSizeGB: 10 }],
    emailConfigs: [{ exhibitId: 'e', exhibitName: 'Gmail to Outlook', numberOfUsers: 10, instanceType: 'Small', numberOfInstances: 1, duration: 4, messages: 1 }],
    overageAddOn: { instanceType: 'Small', numberOfInstances: 2 },
  } as unknown as ConfigurationData;

  it('mixed messaging+content+email uses the max (5), ignoring a stale top-level duration', () => {
    expect(getEffectiveDurationMonths(base)).toBe(5);
    expect(sharedMigrateDuration(base)).toBe(5);
    expect(overageAddOnCost(base)).toBe(500 * 5 * 2);
    expect(overageLineItem(base)?.description).toBe('2 Small Instance in a High-End Enterprise Server 5 Months');
  });

  it('all rows 0 falls back to the stale top-level duration (documents the fallback)', () => {
    const cfg = { ...base,
      messagingConfigs: base.messagingConfigs!.map(c => ({ ...c, duration: 0 })),
      contentConfigs: base.contentConfigs!.map(c => ({ ...c, duration: 0 })),
      emailConfigs: base.emailConfigs!.map(c => ({ ...c, duration: 0 })) } as ConfigurationData;
    expect(sharedMigrateDuration(cfg)).toBe(12);
  });
});
