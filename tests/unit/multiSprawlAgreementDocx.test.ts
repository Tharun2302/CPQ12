import { describe, it, expect } from 'vitest';
import fs from 'fs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { DocxTemplateProcessor } from '../../src/utils/docxTemplateProcessor';
import { multiSprawlLineItems, multiSprawlOverageNote, withMultiSprawl } from '../../src/utils/multiSprawl';
import { migrateAddOnLineItems } from '../../src/utils/migrateSelection';
import { withSprawlConfigs } from '../../src/utils/pricing';
import type { ConfigurationData } from '../../src/types/pricing';

const TEMPLATE = 'backend-templates/MultiCombinations.docx';
const MAIN_JOBS = ['CloudFuze Migrate', 'CloudFuze Data Sprawl'];

const config = withSprawlConfigs({
  ...withMultiSprawl({
    numberOfUsers: 1, instanceType: 'Small', numberOfInstances: 1, duration: 1, dataSizeGB: 0,
    migrationType: 'Multi combination', combination: 'multi-combination', servicePlan: 'Migrate',
  } as ConfigurationData, 'data-sprawl'),
  serviceTermMonths: 12,
}, [{ exhibitId: 'dbx', exhibitIds: ['dbx'], exhibitName: 'Content Sprawl DropBox', type: 'Content', users: 10, quantity: 1000 }]);

const withOverage = { ...config, overageAddOn: { instanceType: 'Small' as const, numberOfInstances: 2 } };

function renderMulti(exhibitNames: string[] = ['Box to SharePoint']): string {
  const doc = new Docxtemplater(new PizZip(fs.readFileSync(TEMPLATE)), {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: () => '',
  });
  doc.render({
    exhibits: exhibitNames.map(name => ({
      exhibitType: 'CloudFuze Migrate', exhibitDesc: name, exhibitPrice: '$1,000.00',
      exhibitCombinationName: name, exhibitOveragePerUser: '$40.00', exhibitOveragePerServer: '$500.00', exhibitOveragePerGB: '$1.80'
    })),
    servers: [{ serverDescription: '1 X Small server', combinationName: exhibitNames[0], serverMonths: '1', serverPrice: '$500.00' }],
    discount_percent: '10',
    discount_amount: '-$113.00',
    total_price_discount: '$1,017.00',
  });
  return doc.getZip().file('word/document.xml')!.asText();
}

const plain = (xml: string) => xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const inject = (xml: string, items: ReturnType<typeof migrateAddOnLineItems>) =>
  (DocxTemplateProcessor.getInstance() as any).injectCustomLineItemRows(xml, items, null, MAIN_JOBS) as string;

describe('Multi-Combination agreement with add-on rows', () => {
  it('puts the Data Sprawl row directly under the CloudFuze Migrate row, above Managed Migration Service', () => {
    const text = plain(inject(renderMulti(), multiSprawlLineItems(config)));
    const sprawlAt = text.indexOf('CloudFuze Data Sprawl');
    expect(sprawlAt).toBeGreaterThan(text.indexOf('Box to SharePoint'));
    expect(sprawlAt).toBeLessThan(text.indexOf('Managed Migration Service'));
    expect(sprawlAt).toBeLessThan(text.indexOf('Instance Type'));
    expect(text).toContain('Data Sprawl – DropBox (1,000 GB)');
    expect(text).toContain(multiSprawlLineItems(config)[0].price);
  });

  it('goes under the last CloudFuze Migrate row when there are several', () => {
    const text = plain(inject(renderMulti(['Box to SharePoint', 'Slack to Teams']), multiSprawlLineItems(config)));
    const sprawlAt = text.indexOf('CloudFuze Data Sprawl');
    expect(sprawlAt).toBeGreaterThan(text.indexOf('Slack to Teams'));
    expect(sprawlAt).toBeLessThan(text.indexOf('Managed Migration Service'));
  });

  it('all three ticked: Data Sprawl then Overage, both under the migration rows', () => {
    const text = plain(inject(renderMulti(), migrateAddOnLineItems(withOverage)));
    const sprawlAt = text.indexOf('CloudFuze Data Sprawl');
    const overageAt = text.indexOf('Server Instance');
    expect(sprawlAt).toBeGreaterThan(text.indexOf('Box to SharePoint'));
    expect(overageAt).toBeGreaterThan(sprawlAt);
    expect(overageAt).toBeLessThan(text.indexOf('Managed Migration Service'));
  });

  it('falls back to above Discount when the template has no main-agreement row', () => {
    const xml = renderMulti().replace(/CloudFuze Migrate/g, 'Migration');
    const text = plain(inject(xml, multiSprawlLineItems(config)));
    const sprawlAt = text.indexOf('CloudFuze Data Sprawl');
    expect(sprawlAt).toBeGreaterThan(text.indexOf('Instance Type'));
    expect(sprawlAt).toBeLessThan(text.indexOf('Discount'));
  });
});

describe('Multi-Combination agreement with Data Sprawl: Payment Notes', () => {
  const notes = (xml: string, lines: string[]) =>
    (DocxTemplateProcessor.getInstance() as any).injectNoteLines(xml, lines) as string;

  it('words the line as the Data Sprawl agreement does', () => {
    expect(multiSprawlOverageNote(config)).toMatch(/^Overage Charge: \$[\d.]+ per GB \| \$1500 \/ month$/);
    expect(multiSprawlOverageNote(withSprawlConfigs({ ...config, includeDataSprawl: false }, []))).toBeNull();
  });

  it('adds it as a bullet after the migration overage bullets, before Initial Service Term', () => {
    const xml = notes(renderMulti(['Box to SharePoint', 'Slack to Teams']), [multiSprawlOverageNote(config)!]);
    const text = plain(xml);
    const noteAt = text.indexOf('Overage Charge: ');
    expect(noteAt).toBeGreaterThan(text.lastIndexOf('Overage Charges for Slack to Teams'));
    expect(noteAt).toBeLessThan(text.indexOf('Initial Service Term'));
    // Same list marker and bold run as the template's own Overage Charges bullet.
    const para = (xml.match(/<w:p>(?:(?!<\/w:p>)[\s\S])*Overage Charge: (?:(?!<\/w:p>)[\s\S])*<\/w:p>/) || [''])[0];
    expect(para).toContain('<w:numPr>');
    expect(para).toContain('<w:b/>');
  });

  it('leaves a blank line below the added bullet, before Initial Service Term', () => {
    const xml = notes(renderMulti(), [multiSprawlOverageNote(config)!]);
    const paras = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
    const at = paras.findIndex(p => p.replace(/<[^>]+>/g, '').startsWith('Overage Charge: '));
    const next = paras[at + 1];
    expect(next.replace(/<[^>]+>/g, '').trim()).toBe('');
    expect(next).not.toContain('<w:numPr>');
    expect(paras[at + 2].replace(/<[^>]+>/g, '')).toMatch(/^Initial Service Term/);
  });

  it('lines every Payment Notes bullet up with the first one', () => {
    const align = (xml: string) => (DocxTemplateProcessor.getInstance() as any).alignPaymentNoteBullets(xml) as string;
    const xml = align(notes(renderMulti(), [multiSprawlOverageNote(config)!]));
    const paras = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
    const textOfP = (p: string) => p.replace(/<[^>]+>/g, '').trim();
    const start = paras.findIndex(p => /^Important Payment Notes:?$/.test(textOfP(p)));
    const end = paras.findIndex((p, i) => i > start && /SAAS SERVICE AGREEMENT/.test(textOfP(p)));
    const block = paras.slice(start + 1, end);
    const bullets = block.filter(p => /<w:numPr>/.test(p));
    // No stray empty bullets either.
    expect(bullets.every(p => !!textOfP(p))).toBe(true);
    const pPr = (p: string) => (p.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/) || [''])[0];

    expect(bullets.map(textOfP).map(t => t.slice(0, 22))).toEqual([
      '100% pre-payment befor', 'All prices are in US d', 'Any required sales tax',
      'Overage Charges for Bo', 'Overage Charge: $0.13 ', 'Initial Service Term: ',
    ]);
    // Same list, indent and spacing as the first bullet, so the markers line up.
    expect(new Set(bullets.map(pPr)).size).toBe(1);
    // No empty spacer lines left between bullets; the first bullet's spacing applies instead.
    const first = block.indexOf(bullets[0]);
    const last = block.indexOf(bullets[bullets.length - 1]);
    expect(block.slice(first, last + 1).filter(p => !textOfP(p))).toHaveLength(0);
    // Text styling is kept: the overage lines stay bold.
    const overage = bullets.find(p => textOfP(p).startsWith('Overage Charge: '))!;
    expect(overage.replace(pPr(overage), '')).toContain('<w:b/>');
  });

  it('leaves Payment Notes alone when every bullet already uses one list', () => {
    const align = (xml: string) => (DocxTemplateProcessor.getInstance() as any).alignPaymentNoteBullets(xml) as string;
    const once = align(renderMulti());
    expect(align(once)).toBe(once);
  });

  it('leaves the document alone when there is nothing to add', () => {
    const xml = renderMulti();
    expect(notes(xml, [])).toBe(xml);
  });
});
