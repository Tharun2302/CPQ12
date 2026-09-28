import { describe, it, expect } from 'vitest';
import {
  calculateManageSaasPricing,
  MANAGE_SAAS_PRICE_PER_USER_MONTHLY,
  MANAGE_SAAS_BILLING_MONTHS,
  calculateAllTiers,
  manageUserLineCost,
  isManageSaasConfig
} from '../../src/utils/pricing';
import type { ConfigurationData } from '../../src/types/pricing';

const saasConfig = (extra: Partial<ConfigurationData> = {}) =>
  ({ servicePlan: 'Manage', migrationType: '', manageUsers: 7, ...extra }) as unknown as ConfigurationData;

describe('Manage with no template uses the $5/user rate everywhere', () => {
  it('detects the no-template Manage config', () => {
    expect(isManageSaasConfig(saasConfig())).toBe(true);
    expect(isManageSaasConfig(saasConfig({ migrationType: 'data-sprawl' as never }))).toBe(false);
    expect(isManageSaasConfig(saasConfig({ servicePlan: 'Migrate' as never }))).toBe(false);
  });

  it('pricing engine matches the Configure page (7 users = $420)', () => {
    const tiers = calculateAllTiers(saasConfig());
    expect(tiers.length).toBeGreaterThan(0);
    for (const t of tiers) {
      expect(t.totalCost).toBe(420);
      expect(t.userCost).toBe(420);
      expect(t.dataCost).toBe(0);
    }
  });

  it('ignores region multiplier and leftover sprawl state', () => {
    const cfg = saasConfig({
      customerLocation: '0.65' as never,
      manageSprawlTypes: ['Content'] as never,
      manageDataGB: 500
    });
    expect(calculateAllTiers(cfg)[0].totalCost).toBe(420);
  });

  it('quote user line matches', () => {
    expect(manageUserLineCost(saasConfig())).toBe(420);
  });
});

describe('calculateManageSaasPricing', () => {
  it('prices users x $5 x 12 months', () => {
    const pricing = calculateManageSaasPricing(30);
    expect(pricing.totalCost).toBe(1800);
    expect(pricing.users).toBe(30);
    expect(pricing.pricePerUserMonthly).toBe(5);
    expect(pricing.months).toBe(12);
  });

  it('keeps the per-user rate fixed as the user count changes', () => {
    for (const users of [1, 50, 51, 500, 5001]) {
      expect(calculateManageSaasPricing(users).pricePerUserMonthly).toBe(MANAGE_SAAS_PRICE_PER_USER_MONTHLY);
      expect(calculateManageSaasPricing(users).totalCost)
        .toBe(users * MANAGE_SAAS_PRICE_PER_USER_MONTHLY * MANAGE_SAAS_BILLING_MONTHS);
    }
  });

  it('returns 0 for empty, zero, negative or non-numeric input', () => {
    for (const bad of [undefined, null, '', 0, -10, 'abc', NaN, Infinity]) {
      const pricing = calculateManageSaasPricing(bad);
      expect(pricing.users).toBe(0);
      expect(pricing.totalCost).toBe(0);
    }
  });

  it('accepts numeric strings and drops fractional users', () => {
    expect(calculateManageSaasPricing('30').totalCost).toBe(1800);
    expect(calculateManageSaasPricing(30.9).users).toBe(30);
  });
});
