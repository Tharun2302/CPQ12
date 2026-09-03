import { describe, it, expect } from 'vitest';
import fs from 'fs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { buildSprawlAgreementData } from '../../src/utils/sprawlAgreement';
import { formatCurrency, SPRAWL_TYPE_ORDER } from '../../src/utils/pricing';
import type { ConfigurationData, SprawlType } from '../../src/types/pricing';

const TEMPLATE = 'backend-templates/manage-datasprawl.docx';

// Every non-empty selection.
const SUBSETS: SprawlType[][] = [
  ['Content'],
  ['Message'],
  ['Email'],
  ['Content', 'Message'],
  ['Content', 'Email'],
  ['Message', 'Email'],
  ['Content', 'Message', 'Email'],
];

function cfg(types: SprawlType[]): ConfigurationData {
  return {
    numberOfUsers: 0,
    instanceType: 'Small',
    numberOfInstances: 1,
    duration: 1,
    migrationType: 'Datasprawl' as never,
    dataSizeGB: 0,
    servicePlan: 'Manage',
    customerLocation: '1',
    manageUsers: 1022,
    manageDataGB: 345,
    manageSprawlTypes: types,
  };
}

function render(data: Record<string, unknown>): string {
  const doc = new Docxtemplater(new PizZip(fs.readFileSync(TEMPLATE)), {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: () => '',
  });
  doc.render(data);
  return doc.getZip().file('word/document.xml')!.asText();
}

describe('Data Sprawl agreement — docx loop renders one row per type', () => {
  it.each(SUBSETS.map(t => [t.join(' + '), t] as const))(
    'renders %s',
    (_name, types) => {
      const data = buildSprawlAgreementData(cfg(types as SprawlType[]), null);
      const xml = render({
        sprawlRows: data.rows,
        sprawl_overage_line: data.tokens['{{sprawl_overage_line}}'],
        total_price: formatCurrency(data.totalCost),
      });
      const text = xml.replace(/<[^>]+>/g, '');

      // One "CloudFuze Data Sprawl" job-requirement cell per selected type
      expect((xml.match(/CloudFuze Data Sprawl/g) || []).length).toBe(types.length);
      for (const line of data.lines) expect(text).toContain(line.label);
      expect(text).toContain(data.tokens['{{sprawl_overage_line}}']);
      // No unreplaced tokens survive
      expect(xml).not.toContain('{{');
    }
  );

  it('prices in the rendered rows sum to the printed total', () => {
    const data = buildSprawlAgreementData(cfg(['Content', 'Message', 'Email']), null);
    const text = render({
      sprawlRows: data.rows,
      sprawl_overage_line: data.tokens['{{sprawl_overage_line}}'],
      total_price: formatCurrency(data.totalCost),
    }).replace(/<[^>]+>/g, '');

    for (const row of data.rows) expect(text).toContain(row.sprawlPrice);
    expect(text).toContain(formatCurrency(data.totalCost));
    const rowSum = data.rows.reduce((s, r) => s + Number(r.sprawlPrice.replace(/[$,]/g, '')), 0);
    expect(rowSum).toBeCloseTo(data.dataCost, 2);
    expect(data.totalCost).toBeCloseTo(data.userCost + rowSum, 2);
  });

  it('standalone prints a total equal to the rows, with no licence line', () => {
    // PricingComparison zeroes userCost for the standalone plan.
    const standalone = { sprawlType: 'Content' as const, userCost: 0 };
    const data = buildSprawlAgreementData(cfg(['Content', 'Message']), standalone);
    const rowSum = data.rows.reduce((s, r) => s + Number(r.sprawlPrice.replace(/[$,]/g, '')), 0);
    expect(data.userCost).toBe(0);
    expect(data.totalCost).toBeCloseTo(rowSum, 2);
  });

  // Regression guard for the design's top risk: the processor drops array keys it does not
  // know, and a dropped loop array renders ZERO rows while the "no leftover tokens" check
  // still passes — a silent failure. This pins the failure mode so a lost registration in
  // docxTemplateProcessor cannot slip through unnoticed.
  it('a missing sprawlRows key renders zero rows and leaves no tokens behind', () => {
    const xml = render({ wrongKey: [{ sprawlLabel: 'x' }] });
    expect((xml.match(/CloudFuze Data Sprawl/g) || []).length).toBe(0);
    expect(xml).not.toContain('{{');
  });
});

describe('docxTemplateProcessor registers sprawlRows', () => {
  it('preserves the array and defaults it to []', async () => {
    const { DocxTemplateProcessor } = await import('../../src/utils/docxTemplateProcessor');
    const proc = new DocxTemplateProcessor() as unknown as {
      prepareTemplateData: (d: Record<string, unknown>) => Record<string, unknown>;
    };
    const rows = buildSprawlAgreementData(cfg([...SPRAWL_TYPE_ORDER]), null).rows;

    // {{instance_cost}} is supplied only to avoid an unrelated pre-existing
    // require('./pricing') path in prepareTemplateData (docxTemplateProcessor.ts:2748).
    const out = proc.prepareTemplateData({
      sprawlRows: rows, '{{Company Name}}': 'ACME', '{{instance_cost}}': '$0.00',
    });
    expect(out.sprawlRows).toHaveLength(3);
    expect((out.sprawlRows as typeof rows).map(r => r.sprawlLabel))
      .toEqual(['Data Sprawl (345 GB)', 'Message Sprawl', 'Email Sprawl']);

    const empty = proc.prepareTemplateData({ '{{Company Name}}': 'ACME', '{{instance_cost}}': '$0.00' });
    expect(empty.sprawlRows).toEqual([]);
  });
});

describe('template diagnostic accepts the sprawlRows loop', () => {
  // Reproduces the reported failure: generation was blocked with
  // "Missing data for tokens: sprawlJobRequirement, sprawlLabel, sprawlPrice"
  // because the loop's per-row fields are not top-level tokens.
  async function diagnose(sprawlRows: unknown) {
    const { TemplateDiagnostic } = await import('../../src/utils/templateDiagnostic');
    const file = new File([fs.readFileSync(TEMPLATE)], 'manage-datasprawl.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    return TemplateDiagnostic.diagnoseTemplate(file, {
      '{{Company Name}}': 'ACME',
      '{{total_price}}': '$1,242.40',
      sprawlRows,
    } as never);
  }

  it('does not report the loop fields as missing when rows are provided', async () => {
    const rows = buildSprawlAgreementData(cfg(['Content', 'Message']), null).rows;
    const result = await diagnose(rows);
    for (const token of ['sprawlJobRequirement', 'sprawlLabel', 'sprawlPrice']) {
      expect(result.missingTokens).not.toContain(token);
      expect(result.mismatchedTokens).not.toContain(token);
    }
  });

  it('also accepts an EMPTY rows array (no sprawl type selected)', async () => {
    const result = await diagnose([]);
    for (const token of ['sprawlJobRequirement', 'sprawlLabel', 'sprawlPrice']) {
      expect(result.missingTokens).not.toContain(token);
      expect(result.mismatchedTokens).not.toContain(token);
    }
  });
});
