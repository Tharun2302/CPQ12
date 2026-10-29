import { describe, it, expect } from 'vitest';
import { calculateAllTiers, calculateDiyPricing, formatCurrency, isDiyConfig, type DiyWorkload } from '../../src/utils/pricing';
import type { ConfigurationData } from '../../src/types/pricing';
import { durationToCarry, primaryMigrateKind, selectedMigrateKinds, toggleMigrateOption, type MigrateKind } from '../../src/utils/migrateSelection';
import { exhibitCombinationKey, showExhibitSelector } from '../../src/utils/exhibitCombination';
import { diyAddOnTokens, diyTemplateTokens } from '../../src/utils/diyAgreement';
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

describe('Migrate DIY consulting hours', () => {
  const withHours = (hours: unknown, users: unknown = 60, workloads: DiyWorkload[] = ['Mailbox']) =>
    calculateDiyPricing({ users, workloads, consultingHours: hours });

  it('bills whole hours at $100 and keeps licences separate', () => {
    const p = withHours(10);
    expect(p.licenseCost).toBe(1200);
    expect(p.consultingCost).toBe(1000);
    expect(p.totalCost).toBe(2200);
  });

  it('treats blank, negative or invalid hours as none', () => {
    expect(withHours(undefined).consultingCost).toBe(0);
    expect(withHours(-3).consultingCost).toBe(0);
    expect(withHours('abc').consultingCost).toBe(0);
    expect(withHours(2.7).consultingHours).toBe(2);
  });

  it('charges no hours until the licences are priced', () => {
    expect(withHours(10, 0).totalCost).toBe(0);
    expect(withHours(10, 60, []).consultingCost).toBe(0);
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

  it('adds consulting hours at $100/hour on top of the licences', () => {
    // Matches the sample agreement: 490 licences x $35 + 40 hours x $100.
    const [t] = calculateAllTiers(diyConfig({ numberOfUsers: 490, diyConsultingHours: 40 }));
    expect(t.userCost).toBe(17150);
    expect(t.migrationCost).toBe(4000);
    expect(t.totalCost).toBe(21150);
    expect(t.diy?.consultingCost).toBe(4000);
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

  it('skips the exhibit step', () => {
    expect(showExhibitSelector(diyConfig())).toBe(false);
    expect(exhibitCombinationKey(diyConfig())).toBe('multi-combination');
  });
});

describe('Migrate DIY optional add-on table', () => {
  it('offers Messages at $10 on top of Content + Email, like the Backyard Symphony quote', () => {
    const t = diyAddOnTokens(diyConfig({ numberOfUsers: 490, diyConsultingHours: 40 }), formatCurrency(21150));
    expect(t['{{diy_has_addon}}']).toBe('true');
    expect(t['{{diy_addon_description}}']).toBe('Messages Workload Add-On');
    expect(t['{{diy_addon_upgrade_text}}']).toBe('upgrades plan to 3 workloads ($45 per license)');
    expect(t['{{diy_addon_licenses}}']).toBe('490');
    expect(t['{{diy_addon_rate}}']).toBe(formatCurrency(10));
    expect(t['{{diy_addon_price}}']).toBe(formatCurrency(4900));
    expect(t['{{diy_total_with_addon_breakdown}}']).toBe(`(${formatCurrency(21150)} + ${formatCurrency(4900)})`);
    expect(t['{{diy_total_with_addon}}']).toBe(formatCurrency(26050));
  });

  it('words the recommended-upgrade box like the Backyard Symphony quote', () => {
    const t = { ...diyTemplateTokens(diyConfig({ numberOfUsers: 490 })), ...diyAddOnTokens(diyConfig({ numberOfUsers: 490 }), formatCurrency(21150)) };
    expect(t['{{diy_upgrade_heading}}']).toBe('RECOMMENDED UPGRADE: ADD THE MESSAGES WORKLOAD');
    expect(t['{{diy_addon_names}}']).toBe('Messages');
    expect(t['{{diy_addon_rate_whole}}']).toBe('$10');
    expect(t['{{diy_addon_price_whole}}']).toBe('$4,900');
    expect(t['{{diy_addon_benefit}}']).toBe('channels, DMs, group chats and file attachments');
    expect(t['{{diy_current_names}}']).toBe('content and email');
    expect(t['{{diy_tier3_total}}']).toBe('$22,050');
    expect(t['{{diy_tier3_saved}}']).toBe('$7,350');
    expect(t['{{diy_current_effective_rate}}']).toBe(formatCurrency(17.5));
  });

  it('words the box for two missing workloads', () => {
    const t = diyAddOnTokens(diyConfig({ numberOfUsers: 100, diyWorkloads: ['Content'] }), formatCurrency(2000));
    expect(t['{{diy_upgrade_heading}}']).toBe('RECOMMENDED UPGRADE: ADD THE EMAIL + MESSAGES WORKLOADS');
    expect(t['{{diy_addon_benefit}}']).toBe('mailboxes, calendars and contacts plus channels, DMs, group chats and file attachments');
    expect(t['{{diy_current_names}}']).toBe('content');
    expect(t['{{diy_current_effective_rate}}']).toBe(formatCurrency(20));
  });

  it('bundles both missing workloads at $25 when one workload is licensed', () => {
    const t = diyAddOnTokens(diyConfig({ numberOfUsers: 100, diyWorkloads: ['Content'] }), formatCurrency(2000));
    expect(t['{{diy_addon_description}}']).toBe('Email + Messages Workload Add-On');
    expect(t['{{diy_addon_rate}}']).toBe(formatCurrency(25));
    expect(t['{{diy_total_with_addon}}']).toBe(formatCurrency(4500));
  });

  it('adds the add-on to the discounted Total Price it is given', () => {
    const t = diyAddOnTokens(diyConfig({ numberOfUsers: 490 }), formatCurrency(15435));
    expect(t['{{diy_total_with_addon}}']).toBe(formatCurrency(20335));
  });

  it('hides the table once all three workloads are licensed', () => {
    const t = diyAddOnTokens(diyConfig({ diyWorkloads: ['Mailbox', 'Content', 'Messages'] }), formatCurrency(2700));
    expect(t['{{diy_has_addon}}']).toBe('');
    expect(t['{{diy_total_with_addon}}']).toBe('');
  });

  it('adds nothing for other agreements', () => {
    expect(diyAddOnTokens(diyConfig({ migrationType: 'Multi combination' }), '$100.00')).toEqual({});
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

  it('fills the Migration Consulting Services row like the sample agreement', () => {
    const t = diyTemplateTokens(diyConfig({ numberOfUsers: 490, diyConsultingHours: 40 }));
    expect(t['{{diy_license_cost}}']).toBe(formatCurrency(17150));
    expect(t['{{diy_consulting_hours}}']).toBe('40 hours');
    expect(t['{{diy_consulting_hours_title}}']).toBe('40 Hours');
    expect(t['{{diy_has_consulting}}']).toBe('true');
    expect(t['{{diy_consulting_rate}}']).toBe(`${formatCurrency(100)} per hour`);
    expect(t['{{diy_consulting_cost}}']).toBe(formatCurrency(4000));
    expect(t['{{diy_total}}']).toBe(formatCurrency(21150));
  });

  it('leaves the consulting row blank without hours', () => {
    const t = diyTemplateTokens(diyConfig());
    expect(t['{{diy_has_consulting}}']).toBe('');
    expect(t['{{diy_consulting_hours}}']).toBe('');
    expect(t['{{diy_consulting_cost}}']).toBe('');
  });

  it('marks the unticked workloads as $15 add-ons when only Content is licensed', () => {
    const t = diyTemplateTokens(diyConfig({ diyWorkloads: ['Content'] }));
    expect(t['{{diy_content_included}}']).toBe('true');
    expect(t['{{diy_content_status}}']).toBe('INCLUDED');
    expect(t['{{diy_content_allowance}}']).toBe('50 GB per user');
    for (const key of ['email', 'messages']) {
      expect(t[`{{diy_${key}_included}}`]).toBe('');
      expect(t[`{{diy_${key}_status}}`]).toBe('OPTIONAL ADD-ON');
      expect(t[`{{diy_${key}_allowance}}`]).toBe('Add for $15 per user');
    }
  });

  it('prices the Messages add-on at $10 on top of Content + Email, like the sample', () => {
    const t = diyTemplateTokens(diyConfig({ diyWorkloads: ['Mailbox', 'Content'] }));
    expect(t['{{diy_email_status}}']).toBe('INCLUDED');
    expect(t['{{diy_messages_allowance}}']).toBe('Add for $10 per user');
  });

  it('lists every workload as included with no add-ons at three workloads', () => {
    const t = diyTemplateTokens(diyConfig({ diyWorkloads: ['Mailbox', 'Content', 'Messages'] }));
    expect(t['{{diy_messages_included}}']).toBe('true');
    expect(t['{{diy_messages_allowance}}']).toBe('No data cap');
  });

  it.each([
    [['Mailbox', 'Content'], 'Up to 50 GB per user for Content and up to 50 GB per user for Email (Mailbox)'],
    [['Content'], 'Up to 50 GB per user for Content'],
    [['Mailbox'], 'Up to 50 GB per user for Email (Mailbox)'],
    [['Content', 'Messages'], 'Up to 50 GB per user for Content; no data cap for Messages'],
    [['Messages'], 'No data cap for Messages']
  ] as [DiyWorkload[], string][])('words the License Terms data allowance for %j', (diyWorkloads, text) => {
    expect(diyTemplateTokens(diyConfig({ diyWorkloads }))['{{diy_data_allowance_text}}']).toBe(text);
  });

  it('splits the license row details and shows the tiered rate steps', () => {
    const two = diyTemplateTokens(diyConfig());
    expect(two['{{diy_workload_count_text}}']).toBe('Two Workloads');
    expect(two['{{diy_workload_names}}']).toBe('Content + Email');
    expect(two['{{diy_rate_breakdown}}']).toBe('($20 + $15)');
    const three = diyTemplateTokens(diyConfig({ diyWorkloads: ['Mailbox', 'Content', 'Messages'] }));
    expect(three['{{diy_workload_names}}']).toBe('Content + Email + Chat');
    expect(three['{{diy_rate_breakdown}}']).toBe('($20 + $15 + $10)');
    expect(diyTemplateTokens(diyConfig({ diyWorkloads: ['Content'] }))['{{diy_rate_breakdown}}']).toBe('');
  });

  it('fills the savings table like the Backyard Symphony quote (490 licences, 2 workloads)', () => {
    const t = diyTemplateTokens(diyConfig({ numberOfUsers: 490 }));
    expect(t['{{diy_tier_licenses}}']).toBe('490');
    expect([t['{{diy_tier1_total}}'], t['{{diy_tier1_separate}}'], t['{{diy_tier1_save}}']]).toEqual(['$9,800', '$9,800', '–']);
    expect([t['{{diy_tier2_total}}'], t['{{diy_tier2_separate}}'], t['{{diy_tier2_save}}']]).toEqual(['$17,150', '$19,600', '$2,450 (12.5%)']);
    expect([t['{{diy_tier3_total}}'], t['{{diy_tier3_separate}}'], t['{{diy_tier3_save}}']]).toEqual(['$22,050', '$29,400', '$7,350 (25%)']);
    expect([t['{{diy_tier1_current}}'], t['{{diy_tier2_current}}'], t['{{diy_tier3_current}}']]).toEqual(['', '(current plan)', '']);
  });

  it('prices the savings table on billed licences, so the 50 minimum applies', () => {
    const t = diyTemplateTokens(diyConfig({ numberOfUsers: 30, diyWorkloads: ['Content'] }));
    expect(t['{{diy_tier_licenses}}']).toBe('50');
    expect(t['{{diy_tier1_total}}']).toBe('$1,000');
    expect(t['{{diy_tier1_current}}']).toBe('(current plan)');
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
