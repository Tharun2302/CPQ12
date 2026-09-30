import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import {
  DocxTemplateProcessor, findStandaloneTotalPricePos, tableDepthAt,
} from '../../src/utils/docxTemplateProcessor';

const DATA_SPRAWL = path.resolve(__dirname, '../../backend-templates/manage-datasprawl.docx');
const MULTI_COMBO = path.resolve(__dirname, '../../backend-templates/MultiCombinations.docx');
const VALIDITY = 'This quote is valid till 2nd of January, 2026';
const CONTIGUOUS_TOTAL =
  '<w:p><w:r><w:tab/><w:t>Total Price</w:t></w:r><w:r><w:tab/><w:t>{{total_price}}</w:t></w:r></w:p>';
const PARA_RE = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;

type Row = { sprawlJobRequirement: string; sprawlLabel: string; sprawlPrice: string };
const row = (label: string, price: string): Row => ({
  sprawlJobRequirement: 'CloudFuze Data Sprawl', sprawlLabel: label, sprawlPrice: price,
});
const ROWS = [
  row('Data Sprawl – DropBox (12 GB)', '$2.00'),
  row('Data Sprawl – Egnyte (54 GB)', '$9.00'),
  row('Data Sprawl – Box (7 GB)', '$1.00'),
];

const visibleText = (xml: string) => xml.replace(/<[^>]+>/g, '');

function docxFile(templatePath: string, edit: (xml: string) => string = x => x): File {
  const zip = new PizZip(fs.readFileSync(templatePath));
  zip.file('word/document.xml', edit(zip.file('word/document.xml')!.asText()));
  return new File([zip.generate({ type: 'uint8array' })], path.basename(templatePath), {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

// The uploaded Data Sprawl agreement writes its Total Price paragraph as one contiguous run.
function withContiguousTotal(xml: string): string {
  const tp = [...xml.matchAll(PARA_RE)].find(m => /total\s*price/i.test(visibleText(m[0])))!;
  return xml.slice(0, tp.index) + CONTIGUOUS_TOTAL + xml.slice(tp.index! + tp[0].length);
}

async function renderXml(file: File, rows: Row[] = []): Promise<string> {
  const data = {
    '{{Company Name}}': 'Contact Company Inc.',
    '{{instance_cost}}': '$0.00',
    '{{total_price}}': '$11.00',
    '{{quote_validity_line}}': VALIDITY,
    sprawlRows: rows,
  } as unknown as Parameters<DocxTemplateProcessor['processDocxTemplate']>[1];
  const result = await new DocxTemplateProcessor().processDocxTemplate(file, data);
  expect(result.success).toBe(true);
  return new PizZip(await result.processedDocx!.arrayBuffer()).file('word/document.xml')!.asText();
}

function expectLineBetweenTableAndTotal(xml: string, rows: Row[]) {
  const tbl = xml.slice(xml.indexOf('<w:tbl>'), xml.indexOf('</w:tbl>'));
  for (const r of rows) expect(tbl).toContain(r.sprawlLabel);
  expect(tbl).not.toContain('valid till');

  const between = visibleText(xml.slice(xml.indexOf('</w:tbl>'), xml.indexOf('Total Price')));
  expect(between.trim()).toBe(VALIDITY);
  expect(xml.split(VALIDITY)).toHaveLength(2);
}

describe('quote validity line — Data Sprawl standalone Total Price paragraph', () => {
  it.each([0, 1, 2, 3])('keeps all %i pricing rows in one table, line after it', async (n) => {
    const rows = ROWS.slice(0, n);
    const xml = await renderXml(docxFile(DATA_SPRAWL, withContiguousTotal), rows);
    expect((xml.match(/CloudFuze Data Sprawl/g) || []).length).toBe(n);
    expectLineBetweenTableAndTotal(xml, rows);
  });

  it('handles the shipped template, whose Total Price is split across runs', async () => {
    const rows = ROWS.slice(0, 2);
    const xml = await renderXml(docxFile(DATA_SPRAWL), rows);
    const tbl = xml.slice(xml.indexOf('<w:tbl>'), xml.indexOf('</w:tbl>'));
    for (const r of rows) expect(tbl).toContain(r.sprawlLabel);
    expect(tbl).not.toContain('valid till');
    const tpPara = [...xml.matchAll(PARA_RE)].find(m => /total\s*price/i.test(visibleText(m[0])))!;
    expect(xml.lastIndexOf(VALIDITY, tpPara.index)).toBeGreaterThan(xml.indexOf('</w:tbl>'));
  });

  it('anchors on the real total, not a later prose mention of Total Price', async () => {
    const prose = '<w:p><w:r><w:t>The Total Price excludes taxes.</w:t></w:r></w:p>';
    const xml = await renderXml(
      docxFile(DATA_SPRAWL, x => {
        const withTotal = withContiguousTotal(x);
        const at = withTotal.indexOf(CONTIGUOUS_TOTAL) + CONTIGUOUS_TOTAL.length;
        return withTotal.slice(0, at) + prose + withTotal.slice(at);
      }),
      ROWS.slice(0, 2),
    );
    expectLineBetweenTableAndTotal(xml, ROWS.slice(0, 2));
  });
});

describe('quote validity line — Total Price as a table row (unchanged path)', () => {
  it('inserts the line as a row directly above the Total Price row', async () => {
    const xml = await renderXml(docxFile(MULTI_COMBO));
    const tp = xml.indexOf('Total Price');
    const line = xml.indexOf(VALIDITY);
    expect(line).toBeGreaterThan(-1);
    expect(line).toBeLessThan(tp);
    expect(tableDepthAt(xml, line)).toBeGreaterThan(0);
    // Same table: no table boundary between the validity row and the Total Price row
    expect(xml.slice(line, tp)).not.toMatch(/<\/?w:tbl[\s>]/);
  });
});

describe('findStandaloneTotalPricePos', () => {
  const tbl = (inner: string) => `<w:tbl><w:tr><w:tc>${inner}</w:tc></w:tr></w:tbl>`;
  const p = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;

  it('returns the first standalone Total Price after the table', () => {
    const xml = tbl(p('Row')) + p('Total Price') + p('Total Price excludes taxes');
    expect(findStandaloneTotalPricePos(xml)).toBe(xml.indexOf('Total Price'));
  });

  it('keeps the row path when Total Price is a row, even with a later prose mention', () => {
    expect(findStandaloneTotalPricePos(tbl(p('Total Price')) + p('Total Price excludes taxes'))).toBe(-1);
  });

  it('keeps the row path when a closed nested table precedes the Total Price row', () => {
    const xml = `<w:tbl><w:tr><w:tc>${tbl(p('nested'))}</w:tc></w:tr><w:tr><w:tc>${p('Total Price')}</w:tc></w:tr></w:tbl>`;
    expect(findStandaloneTotalPricePos(xml)).toBe(-1);
  });

  it('returns -1 when there is no contiguous Total Price', () => {
    expect(findStandaloneTotalPricePos(tbl(p('Row')) + '<w:p><w:r><w:t>Total</w:t></w:r><w:r><w:t> Price</w:t></w:r></w:p>')).toBe(-1);
  });
});
