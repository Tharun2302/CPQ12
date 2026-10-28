// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PricingComparison from '../../src/components/PricingComparison';
import { PRICING_TIERS } from '../../src/utils/pricing';
import { ConfigurationData, PricingCalculation } from '../../src/types/pricing';

// Box to Microsoft(OneDrive&SharePointOnline) has only a Standard Include exhibit, so a Basic
// agreement for it would carry no exhibits. The plan page must say so instead of moving on.
const BOX_MS = 'Box to Microsoft(OneDrive&SharePointOnline)';
const CATALOGUE = [
  { _id: 'bm-std-in', name: `${BOX_MS} Standard Plan - Standard Include`, planType: 'standard', includeType: 'included', combinations: ['box-to-microsoft-onedriveandsharepointonline'] },
];

const configuration: ConfigurationData = {
  numberOfUsers: 0,
  instanceType: 'Standard',
  numberOfInstances: 0,
  duration: 0,
  migrationType: 'Multi combination',
  dataSizeGB: 0,
  servicePlan: 'Migrate',
  customerLocation: '1',
  contentConfigs: [
    { exhibitId: 'bm-std-in', exhibitName: BOX_MS, numberOfUsers: 1, dataSizeGB: 1, instanceType: 'Standard', numberOfInstances: 1, duration: 1 },
  ],
};

const calcFor = (name: string): PricingCalculation => ({
  userCost: 30, dataCost: 1, migrationCost: 300, instanceCost: 500, totalCost: 831,
  tier: PRICING_TIERS.find((t) => t.name === name)!,
});

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

let fetchMock: ReturnType<typeof vi.fn>;
let alertMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear();
  fetchMock = vi.fn((input: RequestInfo | URL) =>
    String(input).includes('/api/exhibits') ? json({ success: true, exhibits: CATALOGUE }) : json({ success: true }));
  alertMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('alert', alertMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderPlans() {
  const onSelectTier = vi.fn();
  const calculations = [calcFor('Basic'), calcFor('Standard')];
  render(
    <PricingComparison
      calculations={calculations}
      recommendedTier={calculations[0]}
      onSelectTier={onSelectTier}
      configuration={configuration}
      selectedTier={null}
    />,
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  return onSelectTier;
}

describe('plan page: plan without exhibits', () => {
  it('shows a popup and stays on the page when Basic has no exhibits for a combination', async () => {
    const user = userEvent.setup();
    const onSelectTier = await renderPlans();

    await waitFor(async () => {
      await user.click(screen.getByRole('button', { name: 'Select Basic' }));
      expect(alertMock).toHaveBeenCalled();
    });

    expect(alertMock.mock.calls[0][0]).toContain(`There are no Basic plan exhibits for:\n- ${BOX_MS}`);
    expect(onSelectTier).not.toHaveBeenCalled();
  });

  it('lets Standard through', async () => {
    const user = userEvent.setup();
    const onSelectTier = await renderPlans();

    await user.click(screen.getByRole('button', { name: 'Select Standard' }));

    expect(alertMock).not.toHaveBeenCalled();
    expect(onSelectTier).toHaveBeenCalledTimes(1);
  });

  // The page saves a Standard exhibit plan for every combination on load; a plan card must not
  // carry those, or the agreement would use Standard exhibits for a Basic card.
  it('a plan card sends no per-combination exhibit plans', async () => {
    const user = userEvent.setup();
    const onSelectTier = await renderPlans();

    await user.click(screen.getByRole('button', { name: 'Select Standard' }));

    expect((onSelectTier.mock.calls[0][0] as PricingCalculation).exhibitPlans).toBeUndefined();
  });

  it('the custom plan sends its exhibit plan for every combination', async () => {
    const user = userEvent.setup();
    const onSelectTier = await renderPlans();

    await user.click(screen.getByRole('button', { name: /Proceed with Custom Plan Selection/ }));

    expect((onSelectTier.mock.calls[0][0] as PricingCalculation).exhibitPlans).toEqual({ [BOX_MS]: 'Standard' });
  });

  it('refuses the custom plan when a combination\'s exhibit plan has no exhibits', async () => {
    sessionStorage.setItem('cpq_selected_tiers_per_combination', JSON.stringify({ [BOX_MS]: 'Basic' }));
    const user = userEvent.setup();
    const onSelectTier = await renderPlans();

    await waitFor(async () => {
      await user.click(screen.getByRole('button', { name: /Proceed with Custom Plan Selection/ }));
      expect(alertMock).toHaveBeenCalled();
    });
    expect(onSelectTier).not.toHaveBeenCalled();
  });
});
