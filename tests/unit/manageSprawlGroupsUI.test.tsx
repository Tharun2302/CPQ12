// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ConfigurationForm from '../../src/components/ConfigurationForm';
import PricingComparison from '../../src/components/PricingComparison';
import ExhibitSelector from '../../src/components/ExhibitSelector';
import { PRICING_TIERS, calculatePricing, withSprawlConfigs } from '../../src/utils/pricing';
import type { ConfigurationData } from '../../src/types/pricing';

const COMBINATIONS = [
  { value: 'data-sprawl', label: 'Data Sprawl', migrationType: 'Manage' },
  { value: 'mange+sprawl', label: 'MANAGE + Sprawl', migrationType: 'Manage' },
];

const EXHIBITS = [
  { _id: 'dbx', name: 'Content Sprawl DropBox', category: 'content', combinations: ['data-sprawl'], isRequired: false, displayOrder: 1 },
  { _id: 'egn-in', name: 'Content Sprawl Egnyte', category: 'content', combinations: ['data-sprawl'], isRequired: false, displayOrder: 2 },
  { _id: 'egn-out', name: 'Content Sprawl Egnyte - Not Included', category: 'content', combinations: ['data-sprawl'], isRequired: false, displayOrder: 3 },
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

async function openDataSprawl() {
  mockFetch();
  const user = userEvent.setup();
  const onConfigurationChange = vi.fn();
  const props = {
    onConfigurationChange,
    onSubmit: vi.fn(),
    onExhibitsChange: vi.fn(),
  };
  const { container, rerender } = render(<ConfigurationForm {...props} selectedExhibits={[]} />);
  // Data-Sprawl is listed under the Migrate tab, which is open by default.
  const select = await waitFor(() => {
    const match = Array.from(container.querySelectorAll('select')).find(el =>
      Array.from(el.options).some(o => o.value === 'data-sprawl'));
    if (!match) throw new Error('Migrate <select> with Data-Sprawl not found');
    return match as HTMLSelectElement;
  });
  await user.selectOptions(select, 'data-sprawl');
  const selectExhibits = (ids: string[]) => rerender(<ConfigurationForm {...props} selectedExhibits={ids} />);
  return { user, onConfigurationChange, selectExhibits };
}

const groups = () => screen.queryAllByTestId('sprawl-group');

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ConfigurationForm — Data Sprawl groups per selected exhibit', () => {
  it('hides Project Configuration and shows no sprawl type checkboxes before any exhibit is picked', async () => {
    await openDataSprawl();
    expect(document.querySelector('[data-section="project-configuration"]')).toBeNull();
    expect(screen.queryByText('Data Sprawl Types')).toBeNull();
    for (const type of ['Content', 'Message', 'Email']) {
      expect(screen.queryByRole('checkbox', { name: type })).toBeNull();
    }
    expect(groups()).toHaveLength(0);
  });

  it('renders one card per exhibit folder, keeping Included + Not Included together', async () => {
    const { selectExhibits } = await openDataSprawl();
    selectExhibits(['dbx', 'egn-in', 'egn-out']);
    await waitFor(() => expect(groups()).toHaveLength(2));
    expect(groups().map(g => g.getAttribute('aria-label'))).toEqual(['Data Sprawl – DropBox', 'Data Sprawl – Egnyte']);
    expect(within(groups()[1]).getByText('Content Sprawl Egnyte')).toBeTruthy();
    expect(document.querySelector('[data-section="project-configuration"]')).not.toBeNull();
  });

  it('hides Project Configuration again when every exhibit is unticked', async () => {
    const { selectExhibits } = await openDataSprawl();
    selectExhibits(['dbx']);
    await waitFor(() => expect(groups()).toHaveLength(1));
    selectExhibits([]);
    await waitFor(() => expect(document.querySelector('[data-section="project-configuration"]')).toBeNull());
  });

  it('brings back the typed users when an exhibit is re-ticked after hiding the section', async () => {
    const { user, selectExhibits } = await openDataSprawl();
    selectExhibits(['dbx']);
    await waitFor(() => expect(groups()).toHaveLength(1));
    await user.type(within(groups()[0]).getByLabelText('Number of Users'), '7');

    selectExhibits([]);
    await waitFor(() => expect(document.querySelector('[data-section="project-configuration"]')).toBeNull());
    selectExhibits(['dbx']);
    await waitFor(() => expect(groups()).toHaveLength(1));
    expect((within(groups()[0]).getByLabelText('Number of Users') as HTMLInputElement).value).toBe('7');
  });

  it('typing in one card does not change the other, and each group is priced on its own', async () => {
    const { user, selectExhibits, onConfigurationChange } = await openDataSprawl();
    selectExhibits(['dbx', 'egn-in']);
    await waitFor(() => expect(groups()).toHaveLength(2));
    const [dropbox, egnyte] = groups();

    await user.type(within(dropbox).getByLabelText('Number of Users'), '12');
    await user.type(within(dropbox).getByLabelText('Content data size in GB'), '345');
    await user.type(within(egnyte).getByLabelText('Content data size in GB'), '1200');

    expect((within(dropbox).getByLabelText('Number of Users') as HTMLInputElement).value).toBe('12');
    expect((within(egnyte).getByLabelText('Number of Users') as HTMLInputElement).value).toBe('');
    expect((within(egnyte).getByLabelText('Content data size in GB') as HTMLInputElement).value).toBe('1200');

    const latest = onConfigurationChange.mock.calls.at(-1)![0] as ConfigurationData;
    expect(latest.manageSprawlConfigs?.map(c => [c.exhibitId, c.users, c.quantity]))
      .toEqual([['dbx', 12, 345], ['egn-in', 0, 1200]]);
    expect(latest.manageUsers).toBe(12);
    expect(latest.manageDataGB).toBe(1545);
    const calc = calculatePricing(latest, PRICING_TIERS[0]);
    expect(calc.sprawlLines?.map(l => l.cost)).toEqual([55, 156]);
  });

  it('removes a card when its exhibit is deselected and restores its values on reselect', async () => {
    const { user, selectExhibits } = await openDataSprawl();
    selectExhibits(['dbx', 'egn-in']);
    await waitFor(() => expect(groups()).toHaveLength(2));
    await user.type(within(groups()[0]).getByLabelText('Number of Users'), '7');

    selectExhibits(['egn-in']);
    await waitFor(() => expect(groups()).toHaveLength(1));
    expect(groups()[0].getAttribute('aria-label')).toBe('Data Sprawl – Egnyte');

    selectExhibits(['dbx', 'egn-in']);
    await waitFor(() => expect(groups()).toHaveLength(2));
    expect((within(groups()[0]).getByLabelText('Number of Users') as HTMLInputElement).value).toBe('7');
  });
});

describe('Data Sprawl — agreement switch starts clean', () => {
  it('switching agreement drops the groups and the remembered values', async () => {
    const { user, selectExhibits } = await openDataSprawl();
    selectExhibits(['dbx']);
    await waitFor(() => expect(groups()).toHaveLength(1));
    await user.type(within(groups()[0]).getByLabelText('Number of Users'), '7');

    await user.click(screen.getByRole('button', { name: 'Manage' }));
    const select = screen.getAllByRole('combobox').find(el =>
      Array.from((el as HTMLSelectElement).options).some(o => o.value === 'mange+sprawl')) as HTMLSelectElement;
    await user.selectOptions(select, 'mange+sprawl');
    selectExhibits([]);
    await waitFor(() => expect(document.querySelector('[data-section="project-configuration"]')).toBeNull());

    selectExhibits(['dbx']);
    await waitFor(() => expect(groups()).toHaveLength(1));
    expect((within(groups()[0]).getByLabelText('Number of Users') as HTMLInputElement).value).toBe('');
  });
});

describe('ExhibitSelector — sprawl folders match the priced cards', () => {
  const VARIANTS = [
    { _id: 'v1', name: 'Content Sprawl Egnyte' },
    { _id: 'v2', name: 'Content Sprawl Egnyte - Not Included' },
    { _id: 'v3', name: 'Not Included Egnyte Content Sprawl' },
    { _id: 'v4', name: 'Egnyte Content Sprawl' },
    { _id: 'v5', name: 'Content Sprawl DropBox' },
  ].map((e, i) => ({ ...e, description: '', fileName: `${e._id}.docx`, category: 'content', combinations: ['data-sprawl'], isRequired: false, displayOrder: i + 1 }));

  it('shows one Egnyte folder for every naming variant', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/combinations')) return json({ success: true, combinations: COMBINATIONS });
      if (url.includes('/api/exhibits')) return json({ success: true, exhibits: VARIANTS });
      return json({ success: true });
    }));
    render(
      <ExhibitSelector combination="data-sprawl" restrictToCombination sprawlGrouping selectedExhibits={[]} onExhibitsChange={() => {}} />
    );
    await waitFor(() => expect(screen.getAllByText(/^Content Sprawl Egnyte$/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/^Content Sprawl Egnyte$/i)).toHaveLength(1);
    expect(screen.queryByText(/^Egnyte Content Sprawl$/i)).toBeNull();
    expect(screen.getAllByText(/^Content Sprawl DropBox$/i)).toHaveLength(1);
  });

  it('keeps only the hand-picked exhibits when the page is reopened', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/combinations')) return json({ success: true, combinations: COMBINATIONS });
      if (url.includes('/api/exhibits')) return json({ success: true, exhibits: VARIANTS });
      return json({ success: true });
    }));
    const onExhibitsChange = vi.fn();
    render(
      <ExhibitSelector combination="data-sprawl" restrictToCombination sprawlGrouping selectedExhibits={['v5']} onExhibitsChange={onExhibitsChange} />
    );
    await waitFor(() => expect(screen.getAllByText(/^Content Sprawl DropBox$/i).length).toBeGreaterThan(0));
    const widened = onExhibitsChange.mock.calls.some(([ids]) => (ids as string[]).some(id => id !== 'v5'));
    expect(widened).toBe(false);
  });
});

describe('PricingComparison — two same-type sprawl lines', () => {
  it('renders both lines without a duplicate-key warning', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const configuration = withSprawlConfigs({
      numberOfUsers: 0,
      instanceType: 'Small',
      numberOfInstances: 1,
      duration: 1,
      migrationType: 'data-sprawl' as never,
      dataSizeGB: 0,
      servicePlan: 'Manage',
      customerLocation: '1',
      manageAgreementLabel: 'Data Sprawl',
      combination: 'manage-standalone',
    }, [
      { exhibitId: 'dbx', exhibitIds: ['dbx'], exhibitName: 'Content Sprawl DropBox', type: 'Content', users: 10, quantity: 345 },
      { exhibitId: 'egn', exhibitIds: ['egn'], exhibitName: 'Content Sprawl Egnyte', type: 'Content', users: 20, quantity: 1200 },
    ]);
    const calc = calculatePricing(configuration, PRICING_TIERS[0]);
    render(
      <PricingComparison
        calculations={[calc]}
        recommendedTier={calc}
        onSelectTier={vi.fn()}
        configuration={configuration}
        selectedTier={null}
      />
    );
    expect(screen.getByText('Standalone sprawl cost (Data Sprawl – DropBox + Data Sprawl – Egnyte)')).toBeTruthy();
    expect(screen.getByText(/Data Sprawl – DropBox \(\$0\.16\/GB × 345\)/)).toBeTruthy();
    expect(screen.getByText(/Data Sprawl – Egnyte \(\$0\.13\/GB × 1200\)/)).toBeTruthy();
    const keyWarnings = errors.mock.calls.filter(args => String(args[0]).includes('same key'));
    expect(keyWarnings).toHaveLength(0);
    errors.mockRestore();
  });
});
