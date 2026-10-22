import { describe, it, expect } from 'vitest';
import type { ConfigurationData, ManageSprawlConfig } from '../../src/types/pricing';
import {
  PRICING_TIERS,
  calculatePricing,
  isMultiWithSprawl,
  multiSprawlLines,
  multiSprawlTotal,
  withSprawlConfigs,
  lookupContentSprawlRate,
  lookupMessageSprawlRate
} from '../../src/utils/pricing';
import { multiSprawlIssue, multiSprawlLineItems, withMultiSprawl, withoutMultiSprawl } from '../../src/utils/multiSprawl';
import { sprawlConfigIssue } from '../../src/utils/sprawlGroups';

const STANDARD = PRICING_TIERS[1];

const contentGroup = (users: number, gb: number): ManageSprawlConfig => ({
  exhibitId: 'dbx', exhibitIds: ['dbx'], exhibitName: 'Content Sprawl DropBox', type: 'Content', users, quantity: gb
});
const messageGroup = (users: number): ManageSprawlConfig => ({
  exhibitId: 'slack', exhibitIds: ['slack'], exhibitName: 'Message Sprawl Slack', type: 'Message', users, quantity: 0
});

const multi = (extra: Partial<ConfigurationData> = {}): ConfigurationData => ({
  numberOfUsers: 1,
  instanceType: 'Small',
  numberOfInstances: 1,
  duration: 1,
  migrationType: 'Multi combination',
  dataSizeGB: 0,
  combination: 'multi-combination',
  servicePlan: 'Migrate',
  customerLocation: '1',
  contentConfigs: [{
    exhibitId: 'pair', exhibitName: 'Box to SharePoint', numberOfUsers: 100,
    instanceType: 'Small', numberOfInstances: 1, duration: 1, dataSizeGB: 500
  }],
  ...extra
});

const withSprawl = (groups: ManageSprawlConfig[], extra: Partial<ConfigurationData> = {}) =>
  withSprawlConfigs({ ...withMultiSprawl(multi(), 'data-sprawl'), ...extra }, groups);

describe('isMultiWithSprawl', () => {
  it('is true only for a Multi combination quote with the toggle on', () => {
    expect(isMultiWithSprawl(withSprawl([]))).toBe(true);
    expect(isMultiWithSprawl(multi())).toBe(false);
    expect(isMultiWithSprawl({ ...withSprawl([]), migrationType: 'Content' })).toBe(false);
    expect(isMultiWithSprawl({ ...withSprawl([]), servicePlan: 'Manage' })).toBe(false);
    expect(isMultiWithSprawl(undefined)).toBe(false);
  });
});

describe('calculatePricing — Multi combination + Data Sprawl', () => {
  it('adds the flat sprawl rows to the total without touching the migration lines', () => {
    const base = calculatePricing(multi(), STANDARD);
    const config = withSprawl([contentGroup(50, 1000), messageGroup(200)]);
    const result = calculatePricing(config, STANDARD);

    const expectedSprawl = Math.round(lookupContentSprawlRate(1000) * 1000 * 100) / 100
      + Math.round(lookupMessageSprawlRate(200) * 200 * 100) / 100;
    expect(result.multiSprawlCost).toBeCloseTo(expectedSprawl, 2);
    expect(result.multiSprawlLines).toHaveLength(2);
    expect(result.totalCost).toBeCloseTo(base.totalCost + expectedSprawl, 2);
    expect(result.userCost).toBe(base.userCost);
    expect(result.dataCost).toBe(base.dataCost);
    expect(result.contentCombinationBreakdowns).toEqual(base.contentCombinationBreakdowns);
  });

  it('charges no Manage licence and never sets the Manage sprawl fields', () => {
    const result = calculatePricing(withSprawl([contentGroup(50, 1000)]), STANDARD);
    expect(result.sprawlType).toBeUndefined();
    expect(result.sprawlLines).toBeUndefined();
    expect(result.sprawlStandalone).toBeUndefined();
  });

  it('prices the same sprawl amount on every tier', () => {
    const config = withSprawl([contentGroup(10, 300)]);
    const costs = PRICING_TIERS.map(t => calculatePricing(config, t).multiSprawlCost);
    expect(new Set(costs).size).toBe(1);
  });

  it('is unchanged when the toggle is off, even if stale groups remain on the config', () => {
    const stale = withSprawlConfigs(multi(), [contentGroup(50, 1000)]);
    const result = calculatePricing(stale, STANDARD);
    expect(result.multiSprawlCost).toBeUndefined();
    expect(result.totalCost).toBe(calculatePricing(multi(), STANDARD).totalCost);
    expect(multiSprawlTotal(stale)).toBe(0);
  });
});

describe('multiSprawlIssue', () => {
  it('passes a quote without the toggle', () => {
    expect(multiSprawlIssue(multi())).toBeNull();
  });

  it('asks for an exhibit, then the group inputs', () => {
    expect(multiSprawlIssue(withSprawl([]))).toBe('Please select at least one Data Sprawl exhibit');
    expect(multiSprawlIssue(withSprawl([contentGroup(0, 10)]))).toMatch(/number of users/);
    expect(multiSprawlIssue(withSprawl([contentGroup(5, 0)]))).toMatch(/data size in GB/);
  });

  it('needs no duration of its own: it shares the migration Duration (Months)', () => {
    expect(multiSprawlIssue(withSprawl([contentGroup(5, 10)]))).toBeNull();
  });

  it('leaves the Manage Data Sprawl check untouched', () => {
    expect(sprawlConfigIssue(withSprawl([]))).toBeNull();
  });
});

describe('multiSprawlLineItems', () => {
  it('builds one agreement row per sprawl group, worded like the Data Sprawl agreement', () => {
    const items = multiSprawlLineItems(withSprawl([contentGroup(50, 1000), messageGroup(200)], { serviceTermMonths: 12 }));
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('CloudFuze Data Sprawl');
    expect(items[0].description).toBe('Data Sprawl – DropBox (1,000 GB)');
    expect(items[1].description).toBe('Message Sprawl – Slack');
    const sum = items.reduce((acc, it) => acc + Number(it.price.replace(/[$,]/g, '')), 0);
    expect(sum).toBeCloseTo(multiSprawlTotal(withSprawl([contentGroup(50, 1000), messageGroup(200)])), 2);
  });

  it('is empty when the toggle is off', () => {
    expect(multiSprawlLineItems(withSprawlConfigs(multi(), [contentGroup(50, 1000)]))).toEqual([]);
    expect(multiSprawlLines(multi())).toEqual([]);
  });
});

describe('withMultiSprawl / withoutMultiSprawl', () => {
  it('turning it off clears the sprawl part and keeps the migration rows', () => {
    const on = withSprawl([contentGroup(50, 1000)], { serviceTermMonths: 6, dataSprawlExhibitIds: ['dbx'] });
    const off = withoutMultiSprawl(on);
    expect(off.includeDataSprawl).toBe(false);
    expect(off.dataSprawlExhibitIds).toEqual([]);
    expect(off.dataSprawlCombination).toBe('');
    expect(off.manageSprawlConfigs).toEqual([]);
    expect(off.serviceTermMonths).toBeUndefined();
    expect(off.contentConfigs).toEqual(on.contentConfigs);
  });

  it('keeps a Manage agreement term', () => {
    const manage = { ...multi(), servicePlan: 'Manage' as const, serviceTermMonths: 12 };
    expect(withoutMultiSprawl(manage).serviceTermMonths).toBe(12);
  });

  it('turning it on starts empty', () => {
    const on = withMultiSprawl(withSprawlConfigs(multi(), [contentGroup(1, 1)]), 'data-sprawl');
    expect(on.includeDataSprawl).toBe(true);
    expect(on.dataSprawlCombination).toBe('data-sprawl');
    expect(on.dataSprawlExhibitIds).toEqual([]);
    expect(on.manageSprawlConfigs).toEqual([]);
  });
});
