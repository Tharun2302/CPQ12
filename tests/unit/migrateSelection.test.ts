import { describe, it, expect } from 'vitest';
import fs from 'fs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import type { ConfigurationData, ManageSprawlConfig } from '../../src/types/pricing';
import {
  PRICING_TIERS,
  calculatePricing,
  hasOverageAddOn,
  migrateAddOnTotal,
  overageAddOnCost,
  sharedMigrateDuration,
  withSprawlConfigs
} from '../../src/utils/pricing';
import { withMultiSprawl } from '../../src/utils/multiSprawl';
import { buildSprawlAgreementData } from '../../src/utils/sprawlAgreement';
import { DocxTemplateProcessor } from '../../src/utils/docxTemplateProcessor';
import {
  migrateAddOnLineItems,
  overageAddOnIssue,
  overageLineItem,
  primaryMigrateKind,
  selectedMigrateKinds,
  withOverageAddOn
} from '../../src/utils/migrateSelection';

const STANDARD = PRICING_TIERS[1];
const OVERAGE = { instanceType: 'Standard' as const, numberOfInstances: 2 };
const dbx: ManageSprawlConfig = { exhibitId: 'dbx', exhibitIds: ['dbx'], exhibitName: 'Content Sprawl DropBox', type: 'Content', users: 10, quantity: 1000 };

const multi = (extra: Partial<ConfigurationData> = {}): ConfigurationData => ({
  numberOfUsers: 1, instanceType: 'Small', numberOfInstances: 1, duration: 1, dataSizeGB: 0,
  migrationType: 'Multi combination', combination: 'multi-combination', servicePlan: 'Migrate', customerLocation: '1',
  contentConfigs: [{ exhibitId: 'pair', exhibitName: 'Box to SharePoint', numberOfUsers: 100, instanceType: 'Small', numberOfInstances: 1, duration: 3, dataSizeGB: 500 }],
  ...extra
});

const dataSprawl = (extra: Partial<ConfigurationData> = {}): ConfigurationData => withSprawlConfigs({
  numberOfUsers: 1, instanceType: 'Small', numberOfInstances: 1, duration: 1, dataSizeGB: 0,
  migrationType: 'data-sprawl' as never, combination: 'manage-standalone', servicePlan: 'Manage',
  manageAgreementLabel: 'Data Sprawl', serviceTermMonths: 3, ...extra
}, [dbx]);

const allThree = () => withSprawlConfigs({ ...withMultiSprawl(multi(), 'data-sprawl'), overageAddOn: OVERAGE, serviceTermMonths: 12 }, [dbx]);

describe('shared Duration', () => {
  it('is the migration Duration on a Multi combination quote (the longest row)', () => {
    const rows = multi().contentConfigs!;
    expect(sharedMigrateDuration(multi())).toBe(3);
    expect(sharedMigrateDuration(multi({ contentConfigs: [...rows, { ...rows[0], exhibitId: 'p2', duration: 7 }] }))).toBe(7);
  });

  it('is the Data Sprawl Duration when Data Sprawl is the main agreement', () => {
    expect(sharedMigrateDuration(dataSprawl({ serviceTermMonths: 9 }))).toBe(9);
    expect(sharedMigrateDuration(dataSprawl({ serviceTermMonths: undefined }))).toBe(0);
  });

  it('changing it reprices Overage, applied once', () => {
    const at = (months: number) => overageAddOnCost(multi({
      overageAddOn: OVERAGE,
      contentConfigs: [{ ...multi().contentConfigs![0], duration: months }]
    }));
    expect(at(3)).toBe(1000 * 3 * 2);
    expect(at(12)).toBe(1000 * 12 * 2);
    expect(overageAddOnCost(dataSprawl({ overageAddOn: OVERAGE, serviceTermMonths: 12 }))).toBe(1000 * 12 * 2);
  });

  it('ignores a months value stored by an older session', () => {
    const legacy = { ...OVERAGE, duration: 99 } as unknown as typeof OVERAGE;
    expect(overageAddOnCost(multi({ overageAddOn: legacy }))).toBe(1000 * 3 * 2);
    expect(withOverageAddOn(multi(), legacy).overageAddOn).toEqual(OVERAGE);
  });
});

describe('overage add-on pricing', () => {
  it('uses the Overage Agreement formula: monthly instance price x shared months x instances', () => {
    expect(overageAddOnCost(multi({ overageAddOn: OVERAGE }))).toBe(1000 * 3 * 2);
  });

  it('is only an add-on on Multi combination or Data Sprawl', () => {
    expect(hasOverageAddOn(multi({ overageAddOn: OVERAGE }))).toBe(true);
    expect(hasOverageAddOn(dataSprawl({ overageAddOn: OVERAGE }))).toBe(true);
    expect(hasOverageAddOn(dataSprawl({ overageAddOn: OVERAGE, manageAgreementLabel: 'MANAGE + Sprawl', migrationType: 'mange+sprawl' as never }))).toBe(false);
    expect(hasOverageAddOn({ ...multi({ overageAddOn: OVERAGE }), migrationType: 'Content' })).toBe(false);
    expect(overageAddOnCost({ ...multi({ overageAddOn: OVERAGE }), migrationType: 'Overage Agreement' })).toBe(0);
  });

  it('adds to the Multi combination total, with Data Sprawl as well', () => {
    const base = calculatePricing(multi(), STANDARD).totalCost;
    const result = calculatePricing(allThree(), STANDARD);
    expect(result.overageAddOnCost).toBe(6000);
    expect(result.totalCost).toBeCloseTo(base + (result.multiSprawlCost ?? 0) + 6000, 2);
    expect(migrateAddOnTotal(allThree())).toBeCloseTo((result.multiSprawlCost ?? 0) + 6000, 2);
  });

  it('adds to the Data Sprawl standalone total without touching the sprawl rows', () => {
    const plain = calculatePricing(dataSprawl(), STANDARD);
    const result = calculatePricing(dataSprawl({ overageAddOn: OVERAGE }), STANDARD);
    expect(result.sprawlStandalone?.totalCost).toBeCloseTo((plain.sprawlStandalone?.totalCost ?? 0) + 6000, 2);
    expect(result.sprawlStandalone?.dataCost).toBe(plain.sprawlStandalone?.dataCost);
    expect(result.instanceCost).toBe(0);
  });

  it('leaves a quote without the add-on unchanged', () => {
    expect(calculatePricing(dataSprawl(), STANDARD).overageAddOnCost).toBeUndefined();
    expect(calculatePricing(multi(), STANDARD).overageAddOnCost).toBeUndefined();
  });
});

describe('overage add-on rows and checks', () => {
  it('builds one agreement row', () => {
    expect(overageLineItem(multi({ overageAddOn: OVERAGE }))).toEqual({
      name: 'Overage Agreement',
      description: 'Standard Instance Type | 2 Instances | Valid for 3 Months',
      price: '$6,000.00'
    });
    expect(overageLineItem(multi())).toBeNull();
  });

  it('lists Data Sprawl rows before the Overage row', () => {
    expect(migrateAddOnLineItems(allThree()).map(i => i.name)).toEqual(['CloudFuze Data Sprawl', 'Overage Agreement']);
  });

  it('asks for instances and duration', () => {
    expect(overageAddOnIssue(multi({ overageAddOn: { ...OVERAGE, numberOfInstances: 0 } }))).toMatch(/number of instances/);
    expect(overageAddOnIssue(dataSprawl({ overageAddOn: OVERAGE, serviceTermMonths: undefined }))).toMatch(/Duration/);
    expect(overageAddOnIssue(multi({ overageAddOn: OVERAGE }))).toBeNull();
    expect(overageAddOnIssue(multi())).toBeNull();
  });

  it('drops the add-on on an agreement that cannot carry it', () => {
    expect(withOverageAddOn({ ...multi(), migrationType: 'Overage Agreement' }, OVERAGE).overageAddOn).toBeUndefined();
    expect(withOverageAddOn(multi(), OVERAGE).overageAddOn).toEqual(OVERAGE);
  });
});

describe('selected Migrate options', () => {
  it('reads every combination back from the config', () => {
    expect(selectedMigrateKinds(multi())).toEqual(['multi']);
    expect(selectedMigrateKinds(allThree())).toEqual(['multi', 'overage', 'sprawl']);
    expect(selectedMigrateKinds(dataSprawl({ overageAddOn: OVERAGE }))).toEqual(['overage', 'sprawl']);
    expect(selectedMigrateKinds({ ...multi(), migrationType: 'Overage Agreement', combination: 'overage-agreement' })).toEqual(['overage']);
    expect(selectedMigrateKinds(undefined)).toEqual([]);
  });

  it('builds on Multi combination, then Data Sprawl, then Overage', () => {
    expect(primaryMigrateKind(['overage', 'sprawl', 'multi'])).toBe('multi');
    expect(primaryMigrateKind(['overage', 'sprawl'])).toBe('sprawl');
    expect(primaryMigrateKind(['overage'])).toBe('overage');
    expect(primaryMigrateKind([])).toBeNull();
  });
});

describe('Data Sprawl agreement with an Overage row', () => {
  it('injects the Overage row under the sprawl rows, above Total Price', () => {
    const config = dataSprawl({ overageAddOn: OVERAGE });
    const doc = new Docxtemplater(new PizZip(fs.readFileSync('backend-templates/manage-datasprawl.docx')), {
      paragraphLoop: true, linebreaks: true, delimiters: { start: '{{', end: '}}' }, nullGetter: () => '',
    });
    doc.render({ sprawlRows: buildSprawlAgreementData(config, null).rows });
    const xml = doc.getZip().file('word/document.xml')!.asText();
    const injected = (DocxTemplateProcessor.getInstance() as any).injectCustomLineItemRows(xml, migrateAddOnLineItems(config), null) as string;
    const text = injected.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text.indexOf('Overage Agreement')).toBeGreaterThan(text.indexOf('CloudFuze Data Sprawl'));
    expect(text).toContain('Standard Instance Type | 2 Instances | Valid for 3 Months');
    expect(text.indexOf('Overage Agreement')).toBeLessThan(text.indexOf('Total Price'));
  });
});
