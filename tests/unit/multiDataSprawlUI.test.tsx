// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ConfigurationForm from '../../src/components/ConfigurationForm';
import PricingComparison from '../../src/components/PricingComparison';
import { PRICING_TIERS, calculateAllTiers, multiSprawlTotal, formatCurrency } from '../../src/utils/pricing';
import type { ConfigurationData } from '../../src/types/pricing';
import { chooseMigrateOnly, migrateSelectedValues, toggleMigrateOption } from './helpers/migratePicker';

const COMBINATIONS = [
  { value: 'multi-combination', label: 'Multi-Combination', migrationType: 'Multi combination' },
  { value: 'overage-agreement', label: 'Overage-Agreement', migrationType: 'Overage Agreement' },
  { value: 'data-sprawl', label: 'Data Sprawl', migrationType: 'Manage' },
];

const EXHIBITS = [
  { _id: 'dbx', name: 'Content Sprawl DropBox', category: 'content', combinations: ['data-sprawl'], isRequired: false, displayOrder: 1 },
];

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

function mockFetch() {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/combinations')) return json({ success: true, combinations: COMBINATIONS });
    if (url.includes('/api/exhibits')) return json({ success: true, exhibits: EXHIBITS });
    return json({ success: true });
  }));
}

const lastConfig = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls[spy.mock.calls.length - 1][0] as ConfigurationData;

function renderForm(selectedExhibits: string[] = []) {
  mockFetch();
  const onConfigurationChange = vi.fn();
  const onExhibitsChange = vi.fn();
  const utils = render(
    <ConfigurationForm
      onConfigurationChange={onConfigurationChange}
      onSubmit={vi.fn()}
      selectedExhibits={selectedExhibits}
      onExhibitsChange={onExhibitsChange}
    />,
  );
  return { ...utils, onConfigurationChange, onExhibitsChange, user: userEvent.setup() };
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

describe('Migrate list: tick several options', () => {
  it('Multi-Combination + Data Sprawl keeps the Migrate plan and shows the Data Sprawl section', async () => {
    const { container, user, onConfigurationChange } = renderForm();
    await toggleMigrateOption(user, 'multi-combination');
    await toggleMigrateOption(user, 'data-sprawl');

    await waitFor(() => expect(lastConfig(onConfigurationChange).includeDataSprawl).toBe(true));
    const config = lastConfig(onConfigurationChange);
    expect(config.servicePlan).toBe('Migrate');
    expect(config.migrationType).toBe('Multi combination');
    expect(config.dataSprawlCombination).toBe('data-sprawl');
    expect(container.querySelector('[data-section="multi-data-sprawl"]')).not.toBeNull();
    expect(await migrateSelectedValues(user)).toEqual(['multi-combination', 'data-sprawl']);
    expect(screen.getByRole('button', { name: 'Migrate options' }).textContent).toContain('Multi-Combination + Data Sprawl');
  });

  it('all three: Overage rides on the Multi-Combination quote with empty inputs', async () => {
    const { container, user, onConfigurationChange } = renderForm();
    await toggleMigrateOption(user, 'multi-combination');
    await toggleMigrateOption(user, 'data-sprawl');
    await toggleMigrateOption(user, 'overage-agreement');

    await waitFor(() => expect(lastConfig(onConfigurationChange).overageAddOn).toBeTruthy());
    const config = lastConfig(onConfigurationChange);
    expect(config.migrationType).toBe('Multi combination');
    expect(config.includeDataSprawl).toBe(true);
    expect(config.overageAddOn).toEqual({ instanceType: 'Small', numberOfInstances: 0 });
    expect(container.querySelector('[data-section="overage-add-on"]')).not.toBeNull();
    expect(await migrateSelectedValues(user)).toEqual(['multi-combination', 'overage-agreement', 'data-sprawl']);
  });

  it('Data Sprawl + Overage builds on the Data Sprawl agreement', async () => {
    const { container, user, onConfigurationChange } = renderForm();
    await toggleMigrateOption(user, 'data-sprawl');
    await toggleMigrateOption(user, 'overage-agreement');

    await waitFor(() => expect(lastConfig(onConfigurationChange).overageAddOn).toBeTruthy());
    const config = lastConfig(onConfigurationChange);
    expect(config.servicePlan).toBe('Manage');
    expect(config.migrationType).toBe('data-sprawl');
    expect(container.querySelector('[data-section="overage-add-on"]')).not.toBeNull();
  });

  it('the Overage section carries Customer Location and Discount when nothing else shows them', async () => {
    const { container, user, onConfigurationChange } = renderForm();
    await toggleMigrateOption(user, 'data-sprawl');
    await toggleMigrateOption(user, 'overage-agreement');

    const section = await waitFor(() => {
      const el = container.querySelector('[data-section="overage-add-on"]') as HTMLElement | null;
      if (!el) throw new Error('Overage section not shown');
      return el;
    });
    const location = within(section).getByLabelText('Customer Location') as HTMLSelectElement;
    expect(screen.getAllByLabelText('Customer Location')).toHaveLength(1);
    expect(within(section).getByPlaceholderText('Enter discount percentage')).toBeTruthy();
    expect(screen.getAllByPlaceholderText('Enter discount percentage')).toHaveLength(1);

    await user.selectOptions(location, '0.8');
    await waitFor(() => expect(lastConfig(onConfigurationChange).customerLocation).toBe('0.8'));
  });

  it('Data Sprawl + Overage: one Duration field, which prices Overage and sets the Data Sprawl term', async () => {
    const { user, onConfigurationChange } = renderForm();
    await toggleMigrateOption(user, 'data-sprawl');
    await toggleMigrateOption(user, 'overage-agreement');
    await user.type(await screen.findByLabelText('Number of Instances'), '2');
    await user.selectOptions(screen.getByLabelText('Instance Type'), 'Standard');
    expect(screen.getAllByLabelText('Duration (Months)')).toHaveLength(1);
    await user.type(screen.getByLabelText('Duration (Months)'), '3');

    await waitFor(() => expect(lastConfig(onConfigurationChange).serviceTermMonths).toBe(3));
    expect(lastConfig(onConfigurationChange).overageAddOn).toEqual({ instanceType: 'Standard', numberOfInstances: 2 });
    expect(screen.getByTestId('overage-add-on-total').textContent).toBe(formatCurrency(6000));

    await user.clear(screen.getByLabelText('Duration (Months)'));
    await user.type(screen.getByLabelText('Duration (Months)'), '12');
    await waitFor(() => expect(screen.getByTestId('overage-add-on-total').textContent).toBe(formatCurrency(24000)));
  });

  it('Data Sprawl with an exhibit + Overage: the Duration stays in the Data Sprawl section only', async () => {
    sessionStorage.setItem('cpq_configuration_session', JSON.stringify({
      servicePlan: 'Manage', migrationType: 'data-sprawl', combination: 'manage-standalone', manageAgreementLabel: 'Data Sprawl',
      serviceTermMonths: 6, overageAddOn: { instanceType: 'Small', numberOfInstances: 1 },
    }));
    const { container } = renderForm(['dbx']);
    await waitFor(() => expect(screen.getAllByTestId('sprawl-group')).toHaveLength(1));
    const section = container.querySelector('[data-section="overage-add-on"]') as HTMLElement;
    expect(within(section).queryByLabelText('Duration (Months)')).toBeNull();
    expect(within(section).getByTestId('overage-add-on-duration').textContent).toContain('Valid for 6 Months');
    expect(screen.getAllByLabelText('Duration (Months)')).toHaveLength(1);
    expect(screen.getByTestId('overage-add-on-total').textContent).toBe(formatCurrency(500 * 6));
  });

  it('Multi-Combination + Overage: Overage has no Duration field and follows the migration Duration', async () => {
    const { container, user } = renderForm();
    await toggleMigrateOption(user, 'multi-combination');
    await toggleMigrateOption(user, 'overage-agreement');
    const section = await waitFor(() => {
      const el = container.querySelector('[data-section="overage-add-on"]') as HTMLElement | null;
      if (!el) throw new Error('Overage section not shown');
      return el;
    });
    expect(within(section).queryByLabelText('Duration (Months)')).toBeNull();
    expect(within(section).getByTestId('overage-add-on-duration').textContent).toMatch(/Duration \(Months\) entered above/);
  });

  it('a combined quote shows one common Duration card, not one per combination panel', async () => {
    EXHIBITS.push({ _id: 'pair', name: 'Box to SharePoint Standard Plan Included', category: 'content', combinations: ['box-to-sharepoint'], isRequired: false, displayOrder: 5 });
    try {
      const { user, onConfigurationChange } = renderForm(['pair']);
      await toggleMigrateOption(user, 'multi-combination');
      await waitFor(() => expect((lastConfig(onConfigurationChange).contentConfigs || []).length).toBe(1));
      expect(screen.queryByTestId('common-duration')).toBeNull();
      expect(screen.getAllByText('Duration (Months)')).toHaveLength(1);
      const columnOf = (label: string) => screen.getByText(label).closest('.space-y-6') as HTMLElement;
      expect(within(columnOf('Data Size (GB)')).getByText('Number of Users')).toBeTruthy();

      await toggleMigrateOption(user, 'overage-agreement');
      const card = await screen.findByTestId('common-duration');
      expect(screen.getAllByText('Duration (Months)')).toHaveLength(1);
      expect(within(card).getByText('Duration (Months)')).toBeTruthy();
      // Data Size takes the right-hand slot the panel Duration left empty.
      expect(within(columnOf('Data Size (GB)')).getByText('Instance Type')).toBeTruthy();

      const input = within(card).getByLabelText('Duration (Months)');
      await user.clear(input);
      await user.type(input, '4');
      await waitFor(() => expect(lastConfig(onConfigurationChange).contentConfigs?.[0].duration).toBe(4));
      expect(lastConfig(onConfigurationChange).duration).toBe(4);
      expect(screen.getByTestId('overage-add-on-duration').textContent).toContain('Valid for 4 Months');

      await toggleMigrateOption(user, 'overage-agreement');
      await waitFor(() => expect(screen.queryByTestId('common-duration')).toBeNull());
      expect(screen.getAllByText('Duration (Months)')).toHaveLength(1);
    } finally {
      EXHIBITS.pop();
    }
  });

  it('the Duration typed for Data Sprawl carries over when Multi-Combination is ticked', async () => {
    const { user, onConfigurationChange } = renderForm();
    await toggleMigrateOption(user, 'data-sprawl');
    await toggleMigrateOption(user, 'overage-agreement');
    await user.type(await screen.findByLabelText('Duration (Months)'), '5');
    await waitFor(() => expect(lastConfig(onConfigurationChange).serviceTermMonths).toBe(5));
    await toggleMigrateOption(user, 'multi-combination');

    await waitFor(() => expect(lastConfig(onConfigurationChange).migrationType).toBe('Multi combination'));
    expect(lastConfig(onConfigurationChange).duration).toBe(5);
  });

  it('unticking Multi-Combination moves the Data Sprawl exhibits, and the migration Duration becomes its term', async () => {
    sessionStorage.setItem('cpq_configuration_session', JSON.stringify({
      migrationType: 'Multi combination',
      combination: 'multi-combination',
      servicePlan: 'Migrate',
      duration: 6,
      includeDataSprawl: true,
      dataSprawlCombination: 'data-sprawl',
      dataSprawlExhibitIds: ['dbx'],
    }));
    const { user, onConfigurationChange, onExhibitsChange } = renderForm();
    await waitFor(() => expect(screen.getAllByTestId('sprawl-group')).toHaveLength(1));
    await toggleMigrateOption(user, 'multi-combination');

    await waitFor(() => expect(lastConfig(onConfigurationChange).servicePlan).toBe('Manage'));
    const config = lastConfig(onConfigurationChange);
    expect(config.migrationType).toBe('data-sprawl');
    expect(config.serviceTermMonths).toBe(6);
    expect(config.includeDataSprawl).toBe(false);
    expect(onExhibitsChange).toHaveBeenLastCalledWith(['dbx']);
  });

  it('ticking Multi-Combination after Data Sprawl keeps the sprawl exhibits on the combined quote', async () => {
    const { user, onConfigurationChange } = renderForm(['dbx']);
    await toggleMigrateOption(user, 'data-sprawl');
    await toggleMigrateOption(user, 'multi-combination');

    await waitFor(() => expect(lastConfig(onConfigurationChange).migrationType).toBe('Multi combination'));
    const config = lastConfig(onConfigurationChange);
    expect(config.includeDataSprawl).toBe(true);
    expect(config.dataSprawlExhibitIds).toEqual(['dbx']);
  });

  it('shows a card for a restored sprawl exhibit, with no Duration field of its own', async () => {
    sessionStorage.setItem('cpq_configuration_session', JSON.stringify({
      migrationType: 'Multi combination',
      combination: 'multi-combination',
      servicePlan: 'Migrate',
      includeDataSprawl: true,
      dataSprawlCombination: 'data-sprawl',
      dataSprawlExhibitIds: ['dbx'],
    }));
    renderForm();
    await waitFor(() => expect(screen.getAllByTestId('sprawl-group')).toHaveLength(1));
    expect(screen.getByTestId('sprawl-group').getAttribute('aria-label')).toBe('Data Sprawl – DropBox');
    const section = document.querySelector('[data-section="multi-data-sprawl"]') as HTMLElement;
    expect(within(section).queryByLabelText('Duration (Months)')).toBeNull();
  });

  it('leaving only Overage drops the Data Sprawl part and keeps the typed Overage inputs', async () => {
    const { user, onConfigurationChange } = renderForm();
    await toggleMigrateOption(user, 'multi-combination');
    await toggleMigrateOption(user, 'data-sprawl');
    await toggleMigrateOption(user, 'overage-agreement');
    await user.type(await screen.findByLabelText('Number of Instances'), '4');
    await chooseMigrateOnly(user, 'overage-agreement');

    const config = lastConfig(onConfigurationChange);
    expect(config.migrationType).toBe('Overage Agreement');
    expect(config.numberOfInstances).toBe(4);
    expect(config.includeDataSprawl).toBe(false);
    expect(config.manageSprawlConfigs).toEqual([]);
    expect(config.overageAddOn).toBeUndefined();
  });
});

describe('PricingComparison: Multi-Combination with Data Sprawl and Overage', () => {
  const configuration = {
    numberOfUsers: 1, instanceType: 'Small', numberOfInstances: 1, duration: 1, dataSizeGB: 0,
    migrationType: 'Multi combination', combination: 'multi-combination', servicePlan: 'Migrate', customerLocation: '1',
    contentConfigs: [{ exhibitId: 'pair', exhibitName: 'Box to SharePoint', numberOfUsers: 100, instanceType: 'Small', numberOfInstances: 1, duration: 3, dataSizeGB: 500 }],
    includeDataSprawl: true, dataSprawlCombination: 'data-sprawl', dataSprawlExhibitIds: ['dbx'],
    manageSprawlConfigs: [{ exhibitId: 'dbx', exhibitIds: ['dbx'], exhibitName: 'Content Sprawl DropBox', type: 'Content', users: 10, quantity: 1000 }],
    // 500 (Small) x 3 months (the migration Duration) x 2 instances
    overageAddOn: { instanceType: 'Small', numberOfInstances: 2 },
  } as ConfigurationData;

  it('lists the Data Sprawl and Overage rows in every plan card', () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ success: true })));
    render(
      <PricingComparison
        calculations={calculateAllTiers(configuration, PRICING_TIERS)}
        onSelectTier={vi.fn()}
        configuration={configuration}
        selectedTier={null as any}
      />,
    );
    const sprawl = screen.getAllByTestId('multi-sprawl-breakdown');
    expect(sprawl.length).toBeGreaterThan(0);
    expect(within(sprawl[0]).getAllByText(formatCurrency(multiSprawlTotal(configuration))).length).toBeGreaterThan(0);
    const overage = screen.getAllByTestId('overage-add-on-breakdown');
    expect(overage.length).toBe(sprawl.length);
    expect(within(overage[0]).getByText(formatCurrency(3000))).toBeTruthy();
  });
});
