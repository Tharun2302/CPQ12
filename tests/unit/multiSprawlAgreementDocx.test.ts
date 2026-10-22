import { describe, it, expect } from 'vitest';
import fs from 'fs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { DocxTemplateProcessor } from '../../src/utils/docxTemplateProcessor';
import { multiSprawlLineItems, withMultiSprawl } from '../../src/utils/multiSprawl';
import { withSprawlConfigs } from '../../src/utils/pricing';
import type { ConfigurationData } from '../../src/types/pricing';

const TEMPLATE = 'backend-templates/MultiCombinations.docx';

const config = withSprawlConfigs({
  ...withMultiSprawl({
    numberOfUsers: 1, instanceType: 'Small', numberOfInstances: 1, duration: 1, dataSizeGB: 0,
    migrationType: 'Multi combination', combination: 'multi-combination', servicePlan: 'Migrate',
  } as ConfigurationData, 'data-sprawl'),
  serviceTermMonths: 12,
}, [{ exhibitId: 'dbx', exhibitIds: ['dbx'], exhibitName: 'Content Sprawl DropBox', type: 'Content', users: 10, quantity: 1000 }]);

function renderMulti(): string {
  const doc = new Docxtemplater(new PizZip(fs.readFileSync(TEMPLATE)), {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: () => '',
  });
  doc.render({
    exhibits: [{ exhibitType: 'CloudFuze Migrate', exhibitDesc: 'Box to SharePoint', exhibitPrice: '$1,000.00' }],
    servers: [],
    discount_percent: '10',
    discount_amount: '-$113.00',
    total_price_discount: '$1,017.00',
  });
  return doc.getZip().file('word/document.xml')!.asText();
}

const plain = (xml: string) => xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('Multi-Combination agreement with Data Sprawl rows', () => {
  it('puts the sprawl rows in the pricing table, after the migration rows and above Discount', () => {
    const injected = (DocxTemplateProcessor.getInstance() as any).injectCustomLineItemRows(
      renderMulti(),
      multiSprawlLineItems(config),
      null,
    ) as string;
    const text = plain(injected);
    const sprawlAt = text.indexOf('CloudFuze Data Sprawl');
    expect(sprawlAt).toBeGreaterThan(text.indexOf('Box to SharePoint'));
    expect(sprawlAt).toBeLessThan(text.indexOf('Discount'));
    expect(text).toContain('Data Sprawl – DropBox (1,000 GB)');
    expect(text).toContain(multiSprawlLineItems(config)[0].price);
  });
});
