import { describe, it, expect } from 'vitest';
import { calculateAllTiers, calculateDiyPricing, formatCurrency, isDiyConfig, type DiyWorkload } from '../../src/utils/pricing';
import type { ConfigurationData } from '../../src/types/pricing';
import { durationToCarry, primaryMigrateKind, selectedMigrateKinds, toggleMigrateOption, type MigrateKind } from '../../src/utils/migrateSelection';
import { exhibitCombinationKey, showExhibitSelector } from '../../src/utils/exhibitCombination';
import { diyTemplateTokens } from '../../src/utils/diyAgreement';
import { diyWorkloadsForFamilies, syncDiyWorkloads } from '../../src/utils/diyWorkloadSync';

const price = (users: unknown, workloads: DiyWorkload[], dataGB?: unknown) =>
  calculateDiyPricing({ users, workloads, dataGB });

describe('Migrate DIY rate per licence', () => {
  it('bundles workloads into one per-user rate: $20, $35, $45', () => {
    expect(price(100, ['Mailbox']).totalCost).toBe(2000);
    expect(price(100, ['Mailbox', 'Content']).totalCost).toBe(3500);
    expect(price(100, ['Mailbox', 'Content', 'Messages']).totalCost).toBe(4500);
  });

  it('prices by how many workloads, not which', () => {
    expect(price(60, ['Messages', 'Content']).totalCost).toBe(price(60, ['Mailbox', 'Content']).totalCost);
  });

  it('counts one licence per user, not per workload', () => {
    const p = price(50, ['Mailbox', 'Content']);
    expect(p.licenses).toBe(50);
    expect(p.totalCost).toBe(1750);
  });

  it('ignores duplicate workloads', () => {
    expect(price(60, ['Mailbox', 'Mailbox']).ratePerLicense).toBe(20);
  });
});

describe('Migrate DIY 50-licence minimum', () => {
  it.each([
    [['Mailbox'], 1000],
    [['Mailbox', 'Content'], 1750],
    [['Mailbox', 'Content', 'Messages'], 2250]
  ] as [DiyWorkload[], number][])('bills 50 licences under the minimum (%j = $%i)', (workloads, total) => {
    const p = price(30, workloads);
    expect(p.licenses).toBe(50);
    expect(p.minimumTopUp).toBe(20);
    expect(p.belowMinimum).toBe(true);
    expect(p.totalCost).toBe(total);
  });

  it('is not flagged at or above 50 users', () => {
    expect(price(50, ['Mailbox']).belowMinimum).toBe(false);
    expect(price(60, ['Mailbox']).minimumTopUp).toBe(0);
  });
});

describe('Migrate DIY data overage', () => {
  it('matches the Actifai quote: 50 users x 2 workloads carries 5,000 GB', () => {
    const p = price(50, ['Mailbox', 'Content'], 5000);
    expect(p.gbPerLicense).toBe(100);
    expect(p.dataOverageLicenses).toBe(0);
    expect(p.totalCost).toBe(1750);
  });

  it('adds whole licences at the bundled rate once data passes the allowance', () => {
    const p = price(50, ['Mailbox', 'Content'], 5001);
    expect(p.licenses).toBe(51);
    expect(p.dataOverageLicenses).toBe(1);
    expect(p.totalCost).toBe(51 * 35);
  });

  it('lets minimum top-up licences carry data before charging overage', () => {
    // 30 users billed as 50 licences x 50 GB = 2,500 GB allowance.
    expect(price(30, ['Mailbox'], 2500).dataOverageLicenses).toBe(0);
    expect(price(30, ['Mailbox'], 2600).licenses).toBe(52);
  });

  it('never caps Messages data', () => {
    const p = price(60, ['Messages'], 1_000_000);
    expect(p.gbPerLicense).toBe(0);
    expect(p.licenses).toBe(60);
  });

  it('caps only the Mailbox/Content share when Messages is bundled', () => {
    expect(price(50, ['Mailbox', 'Messages'], 2500).gbPerLicense).toBe(50);
    expect(price(50, ['Mailbox', 'Messages'], 2501).licenses).toBe(51);
  });
});

describe('Migrate DIY empty or invalid input', () => {
  it('prices nothing without users or workloads', () => {
    expect(price(0, ['Mailbox']).totalCost).toBe(0);
    expect(price(100, []).totalCost).toBe(0);
    expect(price('abc', ['Mailbox']).totalCost).toBe(0);
    expect(price(-5, ['Mailbox']).belowMinimum).toBe(false);
  });
});

const diyConfig = (extra: Partial<ConfigurationData> = {}) =>
  ({
    servicePlan: 'Migrate',
    migrationType: 'DIY',
    combination: 'diy',
    numberOfUsers: 60,
    dataSizeGB: 0,
    duration: 12,
    instanceType: 'Small',
    numberOfInstances: 0,
    customerLocation: '0.65',
    diyWorkloads: ['Mailbox', 'Content'],
    ...extra
  }) as ConfigurationData;

describe('Migrate DIY in the pricing engine', () => {
  it('prices every tier the same, at list price with no region multiplier', () => {
    const tiers = calculateAllTiers(diyConfig());
    expect(tiers.length).toBeGreaterThan(0);
    for (const t of tiers) {
      expect(t.totalCost).toBe(2100);
      expect(t.userCost).toBe(2100);
      expect(t.instanceCost).toBe(0);
      expect(t.diy?.licenses).toBe(60);
    }
  });

  it('is not DIY under the Manage plan or another migration type', () => {
    expect(isDiyConfig(diyConfig())).toBe(true);
    expect(isDiyConfig(diyConfig({ servicePlan: 'Manage' }))).toBe(false);
    expect(isDiyConfig(diyConfig({ migrationType: 'Overage Agreement' }))).toBe(false);
  });
});

describe('Migrate DIY is standalone in the Migrate list', () => {
  const options = [
    { value: 'multi-combination', kind: 'multi' as MigrateKind },
    { value: 'overage-agreement', kind: 'overage' as MigrateKind },
    { value: 'data-sprawl', kind: 'sprawl' as MigrateKind },
    { value: 'diy', kind: 'diy' as MigrateKind }
  ];
  const [multi, overage, , diy] = options;

  it('ticking DIY clears everything else', () => {
    expect(toggleMigrateOption(options, ['multi-combination', 'overage-agreement'], diy)).toEqual(['diy']);
  });

  it('ticking anything else clears DIY', () => {
    expect(toggleMigrateOption(options, ['diy'], multi)).toEqual(['multi-combination']);
  });

  it('still lets the other options combine', () => {
    expect(toggleMigrateOption(options, ['multi-combination'], overage)).toEqual(['multi-combination', 'overage-agreement']);
  });

  it('reports DIY as the only selected kind', () => {
    expect(selectedMigrateKinds(diyConfig())).toEqual(['diy']);
    expect(primaryMigrateKind(['diy'])).toBe('diy');
  });

  it('does not carry the licence term to the next agreement as a Duration', () => {
    expect(durationToCarry(diyConfig(), 'diy')).toBe(0);
  });

  it('offers the exhibit step, like Multi combination', () => {
    expect(showExhibitSelector(diyConfig())).toBe(true);
    expect(exhibitCombinationKey(diyConfig())).toBe('multi-combination');
  });
});

describe('Migrate DIY agreement tokens', () => {
  it('bills licences, not users, when under the minimum', () => {
    const t = diyTemplateTokens(diyConfig({ numberOfUsers: 30, diyWorkloads: ['Mailbox'] }));
    expect(t['{{users_count}}']).toBe('50');
    expect(t['{{diy_users}}']).toBe('30');
    expect(t['{{per_user_cost}}']).toBe(formatCurrency(20));
    expect(t['{{diy_total}}']).toBe(formatCurrency(1000));
    expect(t['{{diy_minimum_note}}']).toBe('Minimum purchase is 50 licenses.');
    expect(t['{{diy_description}}']).toBe('50 Licenses - Mailbox (12 Months)');
  });

  it('words the SOW workloads cell like the signed quotes', () => {
    const t = diyTemplateTokens(diyConfig({ numberOfUsers: 8800, diyWorkloads: ['Mailbox', 'Content', 'Messages'] }));
    expect(t['{{diy_workloads_text}}']).toBe('Three Workloads (Content + Email + Chat)');
    expect(t['{{diy_rate_text}}']).toBe('($45 per license)');
    expect(t['{{diy_licenses}}']).toBe('8800');
    expect(t['{{diy_total}}']).toBe(formatCurrency(396000));
    expect(diyTemplateTokens(diyConfig({ diyWorkloads: ['Mailbox'] }))['{{diy_workloads_text}}']).toBe('One Workload (Email)');
  });

  it('leaves the minimum note empty at or above 50 users', () => {
    expect(diyTemplateTokens(diyConfig())['{{diy_minimum_note}}']).toBe('');
  });

  it('adds nothing for other agreements', () => {
    expect(diyTemplateTokens(diyConfig({ migrationType: 'Multi combination' }))).toEqual({});
  });
});

describe('Migrate DIY ignores data size on the quote', () => {
  it('adds no data licences from a leftover dataSizeGB', () => {
    const tiers = calculateAllTiers(diyConfig({ numberOfUsers: 56, dataSizeGB: 1_000_000 }));
    expect(tiers[0].diy?.dataOverageLicenses).toBe(0);
    expect(tiers[0].totalCost).toBe(56 * 35);
  });
});

describe('Migrate DIY workloads follow the ticked exhibits', () => {
  it('maps exhibit families to workloads in display order', () => {
    expect(diyWorkloadsForFamilies(['messaging', 'content', 'email'])).toEqual(['Mailbox', 'Content', 'Messages']);
  });

  it('ticks the workload of a newly ticked exhibit', () => {
    expect(syncDiyWorkloads([], [], ['Content'])).toEqual(['Content']);
  });

  it('unticks it when its last exhibit is unticked', () => {
    expect(syncDiyWorkloads(['Content'], ['Content'], [])).toEqual([]);
  });

  it('keeps a workload the user ticked by hand', () => {
    expect(syncDiyWorkloads(['Messages', 'Content'], ['Content'], [])).toEqual(['Messages']);
  });
});
