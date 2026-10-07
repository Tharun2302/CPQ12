// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ConfigurationForm from '../../src/components/ConfigurationForm';
import type { ConfigurationData } from '../../src/types/pricing';
import { calculateAllTiers, isManageSaasConfig } from '../../src/utils/pricing';
import { isBuiltInManageStandalone } from '../../src/utils/manageStandaloneOption';
import { templateChoiceChanged } from '../../src/utils/templateSelection';

// Catalog with two rows labelled like the built-in option (different case/whitespace, one without a file).
const COMBINATIONS = [
  { value: 'multi-combination', label: 'Multi-Combination', migrationType: 'Multi combination' },
  { value: 'overage-agreement', label: 'Overage-Agreement', migrationType: 'Overage Agreement' },
  { value: 'manage-standalone', label: 'Manage Standalone', migrationType: 'Manage', hasFile: true },
  { value: 'manage-standalone-old', label: '  MANAGE standalone ', migrationType: 'Manage', hasFile: false },
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
  const onConfigurationChange = vi.fn();
  const utils = render(
    <ConfigurationForm
      onConfigurationChange={onConfigurationChange}
      onSubmit={vi.fn()}
      selectedExhibits={[]}
      onExhibitsChange={vi.fn()}
    />,
  );
  return { ...utils, onConfigurationChange, user: userEvent.setup() };
}

function selectWithOption(container: HTMLElement, value: string): HTMLSelectElement {
  const match = Array.from(container.querySelectorAll('select')).find((el) =>
    Array.from(el.options).some((o) => o.value === value),
  );
  if (!match) throw new Error(`No <select> offers ${value}`);
  return match as HTMLSelectElement;
}

const optionLabels = (select: HTMLSelectElement) => Array.from(select.options).map(o => (o.textContent || '').trim());
const lastConfig = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls[spy.mock.calls.length - 1][0] as ConfigurationData;

async function openManage() {
  const ctx = renderForm();
  await waitFor(() => selectWithOption(ctx.container, 'overage-agreement'));
  await ctx.user.click(screen.getByRole('button', { name: 'Manage' }));
  const manage = await waitFor(() => selectWithOption(ctx.container, 'mange+sprawl'));
  return { ...ctx, manage };
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

describe('Manage Standalone listed once with catalog rows of the same label', () => {
  it('Manage lists Manage Standalone once and keeps mange+sprawl, without Data-Sprawl', async () => {
    const { manage } = await openManage();
    expect(optionLabels(manage)).toEqual(['Select Combination', 'Manage Standalone', 'mange+sprawl']);
  });

  it('Migrate still lists Data-Sprawl and no Manage Standalone row', async () => {
    const { container } = renderForm();
    const migrate = await waitFor(() => selectWithOption(container, 'overage-agreement'));
    const labels = optionLabels(migrate);
    expect(labels).toContain('Data-Sprawl');
    expect(labels.filter(l => /manage standalone/i.test(l))).toEqual([]);
  });

  it('choosing it keeps SaaS pricing: 30 users = $1,800.00 in every tier', async () => {
    const { manage, user, onConfigurationChange } = await openManage();
    await user.selectOptions(manage, 'Manage Standalone');
    await screen.findByTestId('manage-saas-pricing');
    await user.type(screen.getByPlaceholderText('Enter number of users'), '30');
    const cfg = lastConfig(onConfigurationChange);
    expect(isBuiltInManageStandalone(cfg)).toBe(true);
    expect(isManageSaasConfig(cfg)).toBe(true);
    expect(cfg.manageUsers).toBe(30);
    for (const tier of calculateAllTiers(cfg)) {
      expect(tier.totalCost).toBe(1800);
      expect(tier.userCost).toBe(1800);
      expect(tier.dataCost).toBe(0);
    }
  });
});

describe('switching between agreements leaves no stale template key or pricing', () => {
  it('Standalone -> mange+sprawl -> Standalone returns to SaaS pricing', async () => {
    const { manage, user, onConfigurationChange } = await openManage();
    await user.selectOptions(manage, 'Manage Standalone');
    const standalone = lastConfig(onConfigurationChange);

    await user.selectOptions(manage, 'mange+sprawl');
    const sprawl = lastConfig(onConfigurationChange);
    expect(sprawl.migrationType).toBe('mange+sprawl');
    expect(isBuiltInManageStandalone(sprawl)).toBe(false);
    expect(isManageSaasConfig(sprawl)).toBe(false);
    expect(templateChoiceChanged(standalone, sprawl)).toBe(true);
    await waitFor(() => expect(screen.queryByTestId('manage-saas-pricing')).toBeNull());

    await user.selectOptions(manage, 'Manage Standalone');
    const back = lastConfig(onConfigurationChange);
    expect(isBuiltInManageStandalone(back)).toBe(true);
    expect(templateChoiceChanged(sprawl, back)).toBe(true);
    expect(back.manageSprawlTypes ?? []).toEqual([]);
    await screen.findByTestId('manage-saas-pricing');
  });

  it('Standalone -> Migrate and Bundle tabs leave the Manage agreement', async () => {
    const { manage, user, onConfigurationChange } = await openManage();
    await user.selectOptions(manage, 'Manage Standalone');
    const standalone = lastConfig(onConfigurationChange);

    await user.click(screen.getByRole('button', { name: 'Migrate' }));
    const migrate = lastConfig(onConfigurationChange);
    expect(migrate.servicePlan).toBe('Migrate');
    expect(isBuiltInManageStandalone(migrate)).toBe(false);
    expect(templateChoiceChanged(standalone, migrate)).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Manage' }));
    await user.selectOptions(await waitFor(() => selectWithOption(document.body, 'mange+sprawl')), 'Manage Standalone');
    const standalone2 = lastConfig(onConfigurationChange);
    await user.click(screen.getByRole('button', { name: 'Bundle' }));
    const bundle = lastConfig(onConfigurationChange);
    expect(bundle.servicePlan).toBe('Bundle');
    expect(isManageSaasConfig(bundle)).toBe(false);
    expect(templateChoiceChanged(standalone2, bundle)).toBe(true);
  });
});

describe('session saved before the fix with the catalog Manage Standalone row selected', () => {
  it('shows Manage Standalone with SaaS pricing instead of a blank dropdown and catalog pricing', async () => {
    sessionStorage.setItem('cpq_configuration_session', JSON.stringify({
      servicePlan: 'Manage', migrationType: 'manage-standalone', manageAgreementLabel: 'Manage Standalone',
      combination: 'manage-standalone', manageUsers: 30,
    }));
    const { container, onConfigurationChange } = renderForm();
    const manage = await waitFor(() => selectWithOption(container, 'mange+sprawl'));
    await waitFor(() => expect(onConfigurationChange).toHaveBeenCalled());
    expect(manage.selectedOptions[0]?.textContent).toBe('Manage Standalone');
    expect(calculateAllTiers(lastConfig(onConfigurationChange))[0].totalCost).toBe(1800);
  });

  it('clears legacy exhibits and does not create a navigation state', async () => {
    sessionStorage.setItem('cpq_configuration_session', JSON.stringify({
      servicePlan: 'Manage', migrationType: 'manage-standalone', manageAgreementLabel: 'Manage Standalone',
      combination: 'manage-standalone', manageUsers: 30, contentConfigs: [{ exhibitId: 'e1' }],
    }));
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/combinations')) return json({ success: true, combinations: COMBINATIONS });
      return json({ success: true, exhibits: [] });
    }));
    const onExhibitsChange = vi.fn();
    render(
      <ConfigurationForm
        onConfigurationChange={vi.fn()}
        onSubmit={vi.fn()}
        selectedExhibits={['e1']}
        onExhibitsChange={onExhibitsChange}
      />,
    );
    await waitFor(() => expect(onExhibitsChange).toHaveBeenCalledWith([]));
    const stored = JSON.parse(sessionStorage.getItem('cpq_configuration_session') || '{}');
    expect(stored.migrationType).toBe('');
    expect(stored.contentConfigs).toEqual([]);
    expect(sessionStorage.getItem('cpq_navigation_state')).toBeNull();
  });
});
