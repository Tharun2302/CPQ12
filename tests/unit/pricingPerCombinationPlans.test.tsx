// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PricingComparison from '../../src/components/PricingComparison';
import { PRICING_TIERS, calculateCombinationPricing } from '../../src/utils/pricing';
import { ConfigurationData, PricingCalculation } from '../../src/types/pricing';

const BOX = 'Box To Onedrive';
const EGNYTE = 'Egnyte To Google Mydrive';

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
    { exhibitId: '1', exhibitName: BOX, numberOfUsers: 100, dataSizeGB: 500, instanceType: 'Standard', numberOfInstances: 1, duration: 1 },
    { exhibitId: '2', exhibitName: EGNYTE, numberOfUsers: 250, dataSizeGB: 2000, instanceType: 'Standard', numberOfInstances: 1, duration: 1 },
  ],
};

const tier = (name: string) => PRICING_TIERS.find(t => t.name === name)!;

const priceOf = (name: string, plan: string) =>
  calculateCombinationPricing(name, 'content', configuration, tier(plan)).totalCost;

// Production passes calculateAllTiers(...)[0], which is the BASIC tier — so the incoming
// breakdowns are Basic-priced. The fixture mirrors that; anything the panel emits at another
// plan has to be rebuilt by the panel itself.
const breakdownFor = (name: string) => {
  const p = calculateCombinationPricing(name, 'content', configuration, tier('Basic'));
  return { combinationName: name, numberOfUsers: p.numberOfUsers, userCost: p.userCost, dataCost: p.dataCost, migrationCost: p.migrationCost, instanceCost: p.instanceCost, totalCost: p.totalCost };
};

const calculation: PricingCalculation = {
  userCost: 0,
  dataCost: 0,
  migrationCost: 0,
  instanceCost: 0,
  totalCost: 0,
  tier: tier('Basic'),
  contentCombinationBreakdowns: [breakdownFor(BOX), breakdownFor(EGNYTE)],
};

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

function renderPanel(onSelectTier = vi.fn()) {
  render(
    <PricingComparison
      calculations={[calculation]}
      recommendedTier={calculation}
      onSelectTier={onSelectTier}
      configuration={configuration}
      selectedTier={null}
    />
  );
  return onSelectTier;
}

const selectNamed = (name: string) =>
  screen.getByRole('combobox', { name }) as HTMLSelectElement;

const pricingSelect = () => selectNamed('Pricing plan for this combination');
const exhibitSelect = () => selectNamed('Exhibit plan for this combination');
const combinationSelect = () => selectNamed('Combination');

const totalRow = () => screen.getByText('Custom Combined Total:').parentElement as HTMLElement;
const readTotal = () => within(totalRow()).getByText(/^\$/).textContent;

// vitest runs without `globals`, so RTL's auto-cleanup never registers — unmount by hand or
// each render stacks on the last and the queries find duplicates.
beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('per-combination pricing plans', () => {
  it('has no global/default pricing plan dropdown any more', () => {
    renderPanel();
    expect(screen.queryByText('Default Pricing Plan')).not.toBeInTheDocument();
    expect(screen.queryByText('Pricing Plan (applies to all)')).not.toBeInTheDocument();
  });

  it('defaults every combination to Standard, exactly like the exhibit plan', () => {
    renderPanel();
    expect(pricingSelect().value).toBe('Standard');
    expect(exhibitSelect().value).toBe('Standard');

    const expected = priceOf(BOX, 'Standard') + priceOf(EGNYTE, 'Standard');
    expect(readTotal()).toBe(money(expected));
  });

  it('changing one combination pricing plan moves only that combination', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.selectOptions(pricingSelect(), 'Basic');

    expect(screen.getByText('Priced at Basic Plan:')).toBeInTheDocument();

    const expected = priceOf(BOX, 'Basic') + priceOf(EGNYTE, 'Standard');
    expect(readTotal()).toBe(money(expected));
    expect(expected).toBeLessThan(priceOf(BOX, 'Standard') + priceOf(EGNYTE, 'Standard'));
  });

  it('keeps each combination pricing plan independent', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.selectOptions(pricingSelect(), 'Basic');
    await user.selectOptions(combinationSelect(), EGNYTE);
    expect(pricingSelect().value).toBe('Standard');

    await user.selectOptions(combinationSelect(), BOX);
    expect(pricingSelect().value).toBe('Basic');
  });

  it('exhibit plan never changes the price', async () => {
    const user = userEvent.setup();
    renderPanel();
    const before = readTotal();

    await user.selectOptions(exhibitSelect(), 'Basic');

    expect(readTotal()).toBe(before);
    expect(screen.getByText('Priced at Standard Plan:')).toBeInTheDocument();
    expect(screen.getByText(/Box To Onedrive — Basic Plan \(In-scope/)).toBeInTheDocument();
  });

  it('persists the pricing plans under their own sessionStorage key', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.selectOptions(pricingSelect(), 'Basic');

    const saved = JSON.parse(sessionStorage.getItem('cpq_pricing_plan_per_combination') || '{}');
    expect(saved[BOX]).toBe('Basic');
    expect(saved[EGNYTE]).toBe('Standard');

    const exhibits = JSON.parse(sessionStorage.getItem('cpq_selected_tiers_per_combination') || '{}');
    expect(exhibits[BOX]).toBe('Standard');
  });

  it('hands the mixed total and a headline tier to onSelectTier', async () => {
    const user = userEvent.setup();
    const onSelectTier = renderPanel();

    await user.selectOptions(pricingSelect(), 'Basic');
    await user.click(screen.getByRole('button', { name: /Proceed with Custom Plan Selection/ }));

    expect(onSelectTier).toHaveBeenCalledTimes(1);
    const arg = onSelectTier.mock.calls[0][0] as PricingCalculation;

    const expected = priceOf(BOX, 'Basic') + priceOf(EGNYTE, 'Standard');
    expect(arg.totalCost).toBeCloseTo(expected, 6);
    expect(arg.userCost + arg.dataCost + arg.migrationCost + arg.instanceCost).toBeCloseTo(expected, 6);

    // Plans are mixed, so the headline falls back to Standard.
    expect(arg.tier.name).toBe('Standard');
  });

  // QuoteGenerator.getEffectiveTotalCost sums the per-combination breakdowns for Multi
  // combination and ignores totalCost — this is the number that lands on {{total price}}.
  const documentTotal = (calc: PricingCalculation) =>
    [calc.messagingCombinationBreakdowns, calc.contentCombinationBreakdowns, calc.emailCombinationBreakdowns]
      .reduce((acc, arr) => acc + (arr || []).reduce((a, b) => a + (Number(b?.totalCost) || 0), 0), 0);

  it('puts the chosen plans on the document total, not the Basic tier', async () => {
    const user = userEvent.setup();
    const onSelectTier = renderPanel();

    await user.selectOptions(pricingSelect(), 'Basic');
    await user.click(screen.getByRole('button', { name: /Proceed with Custom Plan Selection/ }));

    const arg = onSelectTier.mock.calls[0][0] as PricingCalculation;
    const expected = priceOf(BOX, 'Basic') + priceOf(EGNYTE, 'Standard');

    expect(documentTotal(arg)).toBeCloseTo(expected, 6);
    // The all-Basic total is what the old pass-through produced; guard against regressing to it.
    expect(documentTotal(arg)).not.toBeCloseTo(priceOf(BOX, 'Basic') + priceOf(EGNYTE, 'Basic'), 6);
  });

  it('document total matches the on-screen total when no plan is changed', async () => {
    const user = userEvent.setup();
    const onSelectTier = renderPanel();

    await user.click(screen.getByRole('button', { name: /Proceed with Custom Plan Selection/ }));

    const arg = onSelectTier.mock.calls[0][0] as PricingCalculation;
    expect(documentTotal(arg)).toBeCloseTo(priceOf(BOX, 'Standard') + priceOf(EGNYTE, 'Standard'), 6);
  });

  it('uses the shared plan as the headline when every combination agrees', async () => {
    const user = userEvent.setup();
    const onSelectTier = renderPanel();

    await user.selectOptions(pricingSelect(), 'Basic');
    await user.selectOptions(combinationSelect(), EGNYTE);
    await user.selectOptions(pricingSelect(), 'Basic');
    await user.click(screen.getByRole('button', { name: /Proceed with Custom Plan Selection/ }));

    const arg = onSelectTier.mock.calls[0][0] as PricingCalculation;
    expect(arg.tier.name).toBe('Basic');
    expect(arg.totalCost).toBeCloseTo(priceOf(BOX, 'Basic') + priceOf(EGNYTE, 'Basic'), 6);
  });
});
