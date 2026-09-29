import { describe, it, expect } from 'vitest';
import {
  applySprawlGroups,
  buildSprawlGroups,
  keepLegacySprawl,
  manageCoreConfigReady,
  reconcileSprawlConfigs,
  resolveSprawlExhibitType,
  sprawlConfigIssue,
  sprawlExhibitFolder,
  type SprawlExhibit,
} from '../../src/utils/sprawlGroups';
import { sprawlGroupLabel, withSprawlConfigs } from '../../src/utils/pricing';
import { parseSprawlName } from '../../src/utils/sprawlName';
import type { ConfigurationData, ManageSprawlConfig } from '../../src/types/pricing';

function cfg(overrides: Partial<ConfigurationData> = {}): ConfigurationData {
  return {
    numberOfUsers: 0,
    instanceType: 'Small',
    numberOfInstances: 1,
    duration: 1,
    migrationType: 'data-sprawl' as never,
    dataSizeGB: 0,
    servicePlan: 'Manage',
    customerLocation: '1',
    manageAgreementLabel: 'Data Sprawl',
    ...overrides,
  };
}

const ex = (id: string, name: string, category = 'content'): SprawlExhibit & { combinations: string[] } => ({
  _id: id,
  name,
  category,
  combinations: ['data-sprawl'],
});

const EXHIBITS = [
  ex('dbx', 'Content Sprawl DropBox'),
  ex('egn-in', 'Content Sprawl Egnyte'),
  ex('egn-out', 'Content Sprawl Egnyte - Not Included'),
  ex('slack', 'Message Sprawl Slack'),
  ex('gmail', 'Email Sprawl Gmail'),
];

describe('resolveSprawlExhibitType', () => {
  it('the name prefix wins over the upload-default category', () => {
    expect(resolveSprawlExhibitType({ name: 'Message Sprawl Slack', category: 'content' }))
      .toEqual({ type: 'Message', source: 'name' });
  });

  it('accepts the data / messaging / mail aliases', () => {
    expect(resolveSprawlExhibitType({ name: 'Data Sprawl Box' }).type).toBe('Content');
    expect(resolveSprawlExhibitType({ name: 'Messaging Sprawl Teams' }).type).toBe('Message');
    expect(resolveSprawlExhibitType({ name: 'mail sprawl Outlook' }).type).toBe('Email');
  });

  it('falls back to the category, then Content', () => {
    expect(resolveSprawlExhibitType({ name: 'Terms', category: 'messaging' })).toEqual({ type: 'Message', source: 'category' });
    expect(resolveSprawlExhibitType({ name: 'Terms', category: 'email' }).type).toBe('Email');
    expect(resolveSprawlExhibitType({ name: 'Terms' })).toEqual({ type: 'Content', source: 'category' });
  });

  it('does not use the migration name hints: "Content Sprawl Exchange" stays Content', () => {
    expect(resolveSprawlExhibitType({ name: 'Content Sprawl Exchange', category: 'content' }).type).toBe('Content');
  });
});

describe('buildSprawlGroups', () => {
  it('DropBox + Egnyte give two groups', () => {
    const groups = buildSprawlGroups(EXHIBITS, ['dbx', 'egn-in']);
    expect(groups.map(g => g.exhibitName)).toEqual(['Content Sprawl DropBox', 'Content Sprawl Egnyte']);
    expect(groups.every(g => g.type === 'Content')).toBe(true);
  });

  it('the Included and Not Included files of one folder stay one group', () => {
    const groups = buildSprawlGroups(EXHIBITS, ['egn-in', 'egn-out']);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ exhibitId: 'egn-in', exhibitIds: ['egn-in', 'egn-out'], exhibitName: 'Content Sprawl Egnyte' });
  });

  it('case and whitespace variants of one name are one group', () => {
    const list = [ex('a', 'Content Sprawl  Egnyte'), ex('b', 'content sprawl egnyte')];
    expect(buildSprawlGroups(list, ['a', 'b'])).toHaveLength(1);
  });

  it('skips unknown ids and dedupes repeated ones', () => {
    const groups = buildSprawlGroups(EXHIBITS, ['dbx', 'missing', 'dbx', '']);
    expect(groups).toHaveLength(1);
    expect(groups[0].exhibitIds).toEqual(['dbx']);
  });

  it('sorts by type order, keeping selection order within a type', () => {
    const groups = buildSprawlGroups(EXHIBITS, ['gmail', 'slack', 'egn-in', 'dbx']);
    expect(groups.map(g => g.exhibitId)).toEqual(['egn-in', 'dbx', 'slack', 'gmail']);
    expect(groups.map(g => g.type)).toEqual(['Content', 'Content', 'Message', 'Email']);
  });

  it('regression: exhibits that all carry the agreement slug still split by name', () => {
    const groups = buildSprawlGroups(EXHIBITS, EXHIBITS.map(e => e._id));
    expect(groups).toHaveLength(4);
  });
});

describe('reconcileSprawlConfigs', () => {
  const groupsFor = (ids: string[]) => buildSprawlGroups(EXHIBITS, ids);
  const entry = (overrides: Partial<ManageSprawlConfig>): ManageSprawlConfig => ({
    exhibitId: 'dbx', exhibitIds: ['dbx'], exhibitName: 'Content Sprawl DropBox', type: 'Content', users: 10, quantity: 345,
    ...overrides,
  });

  it('keeps entered values by exhibit id and by name', () => {
    const prev = [
      entry({}),
      entry({ exhibitId: 'old-egnyte-id', exhibitIds: ['old-egnyte-id'], exhibitName: 'content sprawl egnyte', users: 20, quantity: 1200 }),
    ];
    const next = reconcileSprawlConfigs(prev, groupsFor(['dbx', 'egn-in']), cfg());
    expect(next.map(c => [c.exhibitId, c.users, c.quantity])).toEqual([['dbx', 10, 345], ['egn-in', 20, 1200]]);
  });

  it('keeps users and resets the quantity when the type changes', () => {
    const prev = [entry({ exhibitId: 'slack', exhibitIds: ['slack'], exhibitName: 'Message Sprawl Slack', type: 'Content' })];
    const [next] = reconcileSprawlConfigs(prev, groupsFor(['slack']), cfg());
    expect(next).toMatchObject({ type: 'Message', users: 10, quantity: 0 });
  });

  it('drops deselected groups and starts new ones at 0', () => {
    const next = reconcileSprawlConfigs([entry({})], groupsFor(['egn-in']), cfg());
    expect(next).toEqual([expect.objectContaining({ exhibitId: 'egn-in', users: 0, quantity: 0 })]);
  });

  it('seeds the first group of each type from a legacy per-type config, later ones with 0', () => {
    const legacy = cfg({
      manageSprawlTypes: ['Content', 'Message'],
      manageUsersByType: { Content: 12, Message: 424 },
      manageUsers: 436,
      manageDataGB: 345,
      manageMessageCount: 9000,
    });
    const next = reconcileSprawlConfigs(undefined, groupsFor(['dbx', 'egn-in', 'slack']), legacy);
    expect(next.map(c => [c.exhibitId, c.users, c.quantity])).toEqual([
      ['dbx', 12, 345],
      ['egn-in', 0, 0],
      ['slack', 424, 9000],
    ]);
  });

  it('does not seed a type the legacy config never selected', () => {
    const legacy = cfg({ manageSprawlTypes: ['Message'], manageUsersByType: { Message: 50 }, manageUsers: 50 });
    const next = reconcileSprawlConfigs(undefined, groupsFor(['dbx']), legacy);
    expect(next[0]).toMatchObject({ users: 0, quantity: 0 });
  });
});

describe('sprawlConfigIssue', () => {
  const grouped = (configs: Partial<ManageSprawlConfig>[]) =>
    withSprawlConfigs(cfg(), configs.map((c, i) => ({
      exhibitId: `id-${i}`, exhibitIds: [`id-${i}`], exhibitName: 'Content Sprawl DropBox', type: 'Content', users: 0, quantity: 0,
      ...c,
    })) as ManageSprawlConfig[]);

  it('asks for users first, naming the group', () => {
    expect(sprawlConfigIssue(grouped([{ quantity: 5 }])))
      .toBe('Please enter the number of users for Data Sprawl – DropBox');
  });

  it('asks for GB on a Content group', () => {
    expect(sprawlConfigIssue(grouped([{ users: 5 }])))
      .toBe('Please enter the data size in GB for Data Sprawl – DropBox');
  });

  it('Message/Email counts are optional', () => {
    expect(sprawlConfigIssue(grouped([{ type: 'Message', exhibitName: 'Message Sprawl Slack', users: 5 }]))).toBeNull();
  });

  it('passes a complete configuration', () => {
    expect(sprawlConfigIssue(grouped([{ users: 5, quantity: 100 }]))).toBeNull();
  });

  it('blocks a sprawl agreement with no exhibit selected', () => {
    expect(sprawlConfigIssue(withSprawlConfigs(cfg(), []))).toBe('Please select at least one Data Sprawl exhibit');
    expect(sprawlConfigIssue(cfg())).toBe('Please select at least one Data Sprawl exhibit');
  });

  it('returns null for legacy configs and non-sprawl plans', () => {
    expect(sprawlConfigIssue(cfg({ manageSprawlTypes: ['Content'], manageUsers: 0 }))).toBeNull();
    expect(sprawlConfigIssue(cfg({ migrationType: 'manage-basic' as never, manageAgreementLabel: 'Manage Basic' }))).toBeNull();
    expect(sprawlConfigIssue(cfg({ servicePlan: 'Migrate' }))).toBeNull();
  });
});

describe('sprawl naming styles', () => {
  const EGNYTE_VARIANTS = [
    'Content Sprawl Egnyte',
    'Content Sprawl Egnyte - Not Included',
    'Not Included Egnyte Content Sprawl',
    'Egnyte Content Sprawl',
    'egnyte content sprawl included',
    'Content Sprawl Egnyte Not Include',
    'Content Sprawl Egnyte Standard Plan - Standard',
    'Content Sprawl Egnyte Standard Plan - Not Included',
    'Content Sprawl Egnyte Basic Plan',
  ];

  it.each(EGNYTE_VARIANTS)('parses "%s" as Content / Egnyte', (name) => {
    const parsed = parseSprawlName(name);
    expect(parsed.type).toBe('Content');
    expect(parsed.source.toLowerCase()).toBe('egnyte');
  });

  it('every Egnyte variant lands in ONE group labelled "Data Sprawl – Egnyte"', () => {
    const list = EGNYTE_VARIANTS.map((name, i) => ex(`e${i}`, name));
    const groups = buildSprawlGroups(list, list.map(e => e._id));
    expect(groups).toHaveLength(1);
    expect(groups[0].exhibitIds).toHaveLength(EGNYTE_VARIANTS.length);
    expect(sprawlGroupLabel(groups[0].type, groups[0].exhibitName)).toBe('Data Sprawl – Egnyte');
  });

  it('Google variants in lower case are one group with a readable label', () => {
    const list = [ex('g1', 'content sprawl google'), ex('g2', 'content sprawl google not included'), ex('g3', 'Content Sprawl Google')];
    const groups = buildSprawlGroups(list, ['g1', 'g2', 'g3']);
    expect(groups).toHaveLength(1);
    expect(sprawlGroupLabel(groups[0].type, groups[0].exhibitName)).toBe('Data Sprawl – Google');
  });

  it('a suffix type word is recognised: "Slack Message Sprawl" is Message', () => {
    expect(resolveSprawlExhibitType({ name: 'Slack Message Sprawl', category: 'content' }))
      .toEqual({ type: 'Message', source: 'name' });
    const [group] = buildSprawlGroups([ex('s', 'Slack Message Sprawl')], ['s']);
    expect(sprawlGroupLabel(group.type, group.exhibitName)).toBe('Message Sprawl – Slack');
  });

  it('the same source with different types stays two groups', () => {
    const groups = buildSprawlGroups([ex('c', 'Google Content Sprawl'), ex('m', 'Google Email Sprawl')], ['c', 'm']);
    expect(groups.map(g => g.type)).toEqual(['Content', 'Email']);
  });

  it('ExhibitSelector and the cards share one folder key per source', () => {
    const keys = EGNYTE_VARIANTS.map(name => sprawlExhibitFolder({ name, category: 'content' }).key);
    expect(new Set(keys).size).toBe(1);
  });
});

describe('legacy restore never drops a priced type', () => {
  const groupsFor = (ids: string[]) => buildSprawlGroups(EXHIBITS, ids);

  it('legacy Message + only a Content exhibit keeps the legacy config', () => {
    const legacy = cfg({ manageSprawlTypes: ['Message'], manageUsersByType: { Message: 424 }, manageUsers: 424 });
    expect(keepLegacySprawl(legacy, groupsFor(['dbx']))).toBe(true);
    expect(applySprawlGroups(legacy, groupsFor(['dbx']), new Map())).toBe(legacy);
  });

  it('legacy Content + Message + only a Content exhibit keeps the legacy config', () => {
    const legacy = cfg({
      manageSprawlTypes: ['Content', 'Message'],
      manageUsersByType: { Content: 12, Message: 424 },
      manageUsers: 436,
      manageDataGB: 345,
    });
    expect(applySprawlGroups(legacy, groupsFor(['dbx']), new Map())).toBe(legacy);
  });

  it('legacy with no exhibits yet keeps the legacy config', () => {
    const legacy = cfg({ manageSprawlTypes: ['Content'], manageUsers: 5, manageDataGB: 10 });
    expect(applySprawlGroups(legacy, [], new Map())).toBe(legacy);
  });

  it('switches to groups once every legacy type is covered, seeding the values', () => {
    const legacy = cfg({ manageSprawlTypes: ['Message'], manageUsersByType: { Message: 424 }, manageUsers: 424 });
    const next = applySprawlGroups(legacy, groupsFor(['slack', 'dbx']), new Map());
    expect(next.manageSprawlConfigs?.map(c => [c.exhibitId, c.users])).toEqual([['dbx', 0], ['slack', 424]]);
  });
});

describe('applySprawlGroups', () => {
  it('returns the same object when the groups are unchanged, so nothing re-renders or re-writes', () => {
    const first = applySprawlGroups(cfg(), buildSprawlGroups(EXHIBITS, ['dbx']), new Map());
    expect(first).not.toBe(cfg());
    expect(applySprawlGroups(first, buildSprawlGroups(EXHIBITS, ['dbx']), new Map())).toBe(first);
  });

  it('remembers typed values across a deselect and reselect', () => {
    const memory = new Map<string, ManageSprawlConfig>();
    const one = withSprawlConfigs(cfg(), [{
      exhibitId: 'dbx', exhibitIds: ['dbx'], exhibitName: 'Content Sprawl DropBox', type: 'Content', users: 7, quantity: 30,
    }]);
    const cleared = applySprawlGroups(one, [], memory);
    expect(cleared.manageSprawlConfigs).toEqual([]);
    const back = applySprawlGroups(cleared, buildSprawlGroups(EXHIBITS, ['dbx']), memory);
    expect(back.manageSprawlConfigs?.[0]).toMatchObject({ users: 7, quantity: 30 });
  });
});

describe('manageCoreConfigReady (App recalculation gate)', () => {
  it('a sprawl agreement with zero groups is not ready, even with a leftover licence count', () => {
    expect(manageCoreConfigReady(withSprawlConfigs(cfg({ manageUsers: 40 }), []))).toBe(false);
    expect(manageCoreConfigReady(cfg({ manageUsers: 40 }))).toBe(false);
  });

  it('groups must pass validation', () => {
    const group: ManageSprawlConfig = { exhibitId: 'dbx', exhibitIds: ['dbx'], exhibitName: 'Content Sprawl DropBox', type: 'Content', users: 5, quantity: 0 };
    expect(manageCoreConfigReady(withSprawlConfigs(cfg(), [group]))).toBe(false);
    expect(manageCoreConfigReady(withSprawlConfigs(cfg(), [{ ...group, quantity: 10 }]))).toBe(true);
  });

  it('legacy sprawl and non-sprawl Manage keep their original rules', () => {
    expect(manageCoreConfigReady(cfg({ manageSprawlTypes: ['Content'], manageUsers: 5, manageDataGB: 10 }))).toBe(true);
    expect(manageCoreConfigReady(cfg({ manageSprawlTypes: ['Content'], manageUsers: 5, manageDataGB: 0 }))).toBe(false);
    const plain = { migrationType: 'manage-basic' as never, manageAgreementLabel: 'Manage' };
    expect(manageCoreConfigReady(cfg({ ...plain, manageUsers: 5 }))).toBe(true);
    expect(manageCoreConfigReady(cfg({ ...plain, manageUsers: 0 }))).toBe(false);
    expect(manageCoreConfigReady(cfg({ ...plain, manageRequiresUsers: false, manageDataGB: 3 }))).toBe(true);
  });
});
