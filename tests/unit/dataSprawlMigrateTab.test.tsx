// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ConfigurationForm from '../../src/components/ConfigurationForm';
import type { ConfigurationData } from '../../src/types/pricing';
import { isDataSprawlOption, displayedServicePlan } from '../../src/utils/dataSprawlOption';

// The real catalogue shape: Data-Sprawl is still a Manage row in the Combination Manager.
const COMBINATIONS = [
  { value: 'multi-combination', label: 'Multi-Combination', migrationType: 'Multi combination' },
  { value: 'overage-agreement', label: 'Overage-Agreement', migrationType: 'Overage Agreement' },
  { value: 'mange+sprawl', label: 'mange+sprawl', migrationType: 'Manage' },
  { value: 'data-sprawl', label: 'Data-Sprawl', migrationType: 'Manage' },
];

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

function renderForm() {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/combinations')) return json({ success: true, combinations: COMBINATIONS });
    if (url.includes('/api/exhibits')) return json({ success: true, exhibits: [] });
    return json({ success: true });
  }));
  const onExhibitsChange = vi.fn();
  const onConfigurationChange = vi.fn();
  const utils = render(
    <ConfigurationForm
      onConfigurationChange={onConfigurationChange}
      onSubmit={vi.fn()}
      selectedExhibits={['exhibit-dsprawl-std']}
      onExhibitsChange={onExhibitsChange}
    />,
  );
  return { ...utils, onExhibitsChange, onConfigurationChange, user: userEvent.setup() };
}

function selectWithOption(container: HTMLElement, value: string): HTMLSelectElement {
  const match = Array.from(container.querySelectorAll('select')).find((el) =>
    Array.from(el.options).some((o) => o.value === value),
  );
  if (!match) throw new Error(`No <select> offers ${value}`);
  return match as HTMLSelectElement;
}

const optionLabels = (select: HTMLSelectElement) => Array.from(select.options).map(o => o.textContent);
const lastConfig = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls[spy.mock.calls.length - 1][0] as ConfigurationData;
const isActiveTab = (name: string) =>
  screen.getByRole('button', { name }).className.includes('shadow-md');

async function chooseDataSprawlOnMigrate() {
  const ctx = renderForm();
  const migrate = await waitFor(() => selectWithOption(ctx.container, 'overage-agreement'));
  await ctx.user.selectOptions(migrate, 'data-sprawl');
  return ctx;
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

describe('Data-Sprawl is listed under Migrate only', () => {
  it('Migrate lists the existing options followed by Data-Sprawl', async () => {
    const { container } = renderForm();
    const migrate = await waitFor(() => selectWithOption(container, 'overage-agreement'));
    expect(optionLabels(migrate)).toEqual(['Select Combination', 'Multi-Combination', 'Overage-Agreement', 'Data-Sprawl']);
  });

  it('Manage keeps Select Combination, Manage Standalone and mange+sprawl, without Data-Sprawl', async () => {
    const { container, user } = renderForm();
    await user.click(await screen.findByRole('button', { name: 'Manage' }));
    const manage = await waitFor(() => selectWithOption(container, 'mange+sprawl'));
    expect(optionLabels(manage)).toEqual(['Select Combination', 'Manage Standalone', 'mange+sprawl']);
  });
});

describe('Choosing Data-Sprawl from Migrate', () => {
  it('saves the same Manage agreement state as before the move', async () => {
    const { onConfigurationChange, onExhibitsChange } = await chooseDataSprawlOnMigrate();
    const config = lastConfig(onConfigurationChange);
    expect(config.servicePlan).toBe('Manage');
    expect(config.migrationType).toBe('data-sprawl');
    expect(config.combination).toBe('manage-standalone');
    expect(config.manageAgreementLabel).toBe('Data-Sprawl');
    expect(onExhibitsChange).toHaveBeenCalledWith([]);
  });

  it('keeps the Migrate tab active with Data-Sprawl selected, waiting for an exhibit before configuring', async () => {
    const { container } = await chooseDataSprawlOnMigrate();
    await waitFor(() => expect(selectWithOption(container, 'data-sprawl').value).toBe('data-sprawl'));
    expect(isActiveTab('Migrate')).toBe(true);
    expect(isActiveTab('Manage')).toBe(false);
    expect(container.querySelector('[data-section="project-configuration"]')).toBeNull();
  });

  it('switching to another Migrate option returns to the plain Migrate plan', async () => {
    const { container, user, onConfigurationChange, onExhibitsChange } = await chooseDataSprawlOnMigrate();
    onExhibitsChange.mockClear();
    await user.selectOptions(selectWithOption(container, 'data-sprawl'), 'overage-agreement');

    const config = lastConfig(onConfigurationChange);
    expect(config.servicePlan).toBe('Migrate');
    expect(config.combination).toBe('overage-agreement');
    expect(config.migrationType).toBe('Overage Agreement');
    expect(config.manageAgreementLabel).toBe('');
    expect(onExhibitsChange).toHaveBeenCalledWith([]);
  });

  it('re-choosing "Select Combination" in Migrate leaves Data-Sprawl', async () => {
    const { container, user, onConfigurationChange } = await chooseDataSprawlOnMigrate();
    await user.selectOptions(selectWithOption(container, 'data-sprawl'), 'Select Combination');

    const config = lastConfig(onConfigurationChange);
    expect(config.servicePlan).toBe('Migrate');
    expect(config.migrationType).toBe('');
    expect(config.combination).toBe('');
    expect(container.querySelector('[data-section="project-configuration"]')).toBeNull();
  });

  it('clicking Manage starts Manage fresh on "Select Combination"', async () => {
    const { container, user, onConfigurationChange } = await chooseDataSprawlOnMigrate();
    await user.click(screen.getByRole('button', { name: 'Manage' }));

    const config = lastConfig(onConfigurationChange);
    expect(config.servicePlan).toBe('Manage');
    expect(config.migrationType).toBe('');
    expect(isActiveTab('Manage')).toBe(true);
    expect(selectWithOption(container, 'mange+sprawl').value).toBe('');
  });

  it('a saved Data-Sprawl session opens on the Migrate tab', async () => {
    sessionStorage.setItem('cpq_configuration_session', JSON.stringify({
      servicePlan: 'Manage', migrationType: 'data-sprawl', combination: 'manage-standalone', manageAgreementLabel: 'Data-Sprawl',
    }));
    const { container } = renderForm();
    const migrate = await waitFor(() => selectWithOption(container, 'overage-agreement'));
    await waitFor(() => expect(migrate.value).toBe('data-sprawl'));
    expect(isActiveTab('Migrate')).toBe(true);
  });
});

describe('dataSprawlOption helpers', () => {
  it('recognises Data-Sprawl by the same rule pricing uses, not mange+sprawl or Migrate rows', () => {
    expect(isDataSprawlOption({ value: 'data-sprawl', label: 'Data-Sprawl', migrationType: 'Manage' })).toBe(true);
    expect(isDataSprawlOption({ value: 'mange+sprawl', label: 'mange+sprawl', migrationType: 'Manage' })).toBe(false);
    expect(isDataSprawlOption({ value: 'data-sprawl', label: 'Data-Sprawl', migrationType: 'Multi combination' })).toBe(false);
  });

  it('shows Manage for every other Manage agreement and Migrate/Bundle as chosen', () => {
    expect(displayedServicePlan({ servicePlan: 'Manage', migrationType: 'mange+sprawl' } as ConfigurationData)).toBe('Manage');
    expect(displayedServicePlan({ servicePlan: 'Manage', migrationType: '' } as ConfigurationData)).toBe('Manage');
    expect(displayedServicePlan({ servicePlan: 'Bundle' } as ConfigurationData)).toBe('Bundle');
    expect(displayedServicePlan({} as ConfigurationData)).toBe('Migrate');
  });
});
