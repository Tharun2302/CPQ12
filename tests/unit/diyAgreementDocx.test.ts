import { describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { TemplateDiagnostic } from '../../src/utils/templateDiagnostic';
import { diyAddOnTokens, diyTemplateTokens, isDiyToken } from '../../src/utils/diyAgreement';
import { formatCurrency } from '../../src/utils/pricing';
import type { ConfigurationData } from '../../src/types/pricing';

const cell = (text: string) => `<w:tc><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;
const row = (...cells: string[]) => `<w:tr>${cells.map(cell).join('')}</w:tr>`;
const para = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

// The DIY template's show/hide patterns: an INCLUDED row and an ADD-ON row per workload,
// and a section wrapped by tags on their own lines.
const BODY = [
  '<w:tbl>',
  row('{{#diy_content_included}}Content', 'INCLUDED', '{{diy_content_allowance}}{{/diy_content_included}}'),
  row('{{^diy_content_included}}Content', 'OPTIONAL ADD-ON', '{{diy_content_allowance}}{{/diy_content_included}}'),
  row('{{#diy_messages_included}}Messages', 'INCLUDED', '{{diy_messages_allowance}}{{/diy_messages_included}}'),
  row('{{^diy_messages_included}}Messages', 'OPTIONAL ADD-ON', '{{diy_messages_allowance}}{{/diy_messages_included}}'),
  '</w:tbl>',
  para('{{#diy_has_addon}}'),
  para('{{diy_upgrade_heading}}'),
  para('{{diy_addon_description}} {{diy_total_with_addon}}'),
  para('{{/diy_has_addon}}'),
].join('');

function docx(): ArrayBuffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${BODY}</w:body></w:document>`);
  return zip.generate({ type: 'arraybuffer' });
}

const config = (extra: Partial<ConfigurationData> = {}) =>
  ({
    servicePlan: 'Migrate', migrationType: 'DIY', combination: 'diy', numberOfUsers: 490, dataSizeGB: 0,
    duration: 12, instanceType: 'Small', numberOfInstances: 0, customerLocation: '1',
    diyWorkloads: ['Mailbox', 'Content'], ...extra
  }) as ConfigurationData;

const tokensFor = (c: ConfigurationData) => ({ ...diyTemplateTokens(c), ...diyAddOnTokens(c, formatCurrency(21150)) });

function renderText(tokens: Record<string, string>): string {
  const doc = new Docxtemplater(new PizZip(docx()), { paragraphLoop: true, linebreaks: true, delimiters: { start: '{{', end: '}}' } });
  doc.render(Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k.slice(2, -2), v])));
  return doc.getZip().file('word/document.xml')!.asText().replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
}

describe('docxTemplateProcessor keeps empty DIY values empty', () => {
  // Reproduces the reported bug: empty flags were auto-filled with "N/A" / "$0.00", which made
  // every INCLUDED row and the consulting row print for a Content-only quote with no hours.
  it('does not auto-fill the show/hide flags or blank DIY values', async () => {
    const { DocxTemplateProcessor } = await import('../../src/utils/docxTemplateProcessor');
    const proc = new DocxTemplateProcessor() as unknown as {
      prepareTemplateData: (d: Record<string, unknown>) => Record<string, unknown>;
    };
    const out = proc.prepareTemplateData({
      '{{Company Name}}': 'ACME',
      '{{instance_cost}}': '$0.00',
      ...diyTemplateTokens(config({ numberOfUsers: 50, diyWorkloads: ['Content'] }))
    });
    for (const key of ['{{diy_email_included}}', '{{diy_messages_included}}', '{{diy_has_consulting}}',
      '{{diy_consulting_hours}}', '{{diy_consulting_cost}}', '{{diy_rate_breakdown}}']) {
      expect(out[key]).toBe('');
    }
    expect(out['{{diy_content_included}}']).toBe('true');
  });
});

describe('isDiyToken', () => {
  it('marks every DIY value as intentionally empty, including names the fill rules match', () => {
    // "email" made the QuoteGenerator fill put the client's address into the Email flag.
    for (const key of ['{{diy_email_included}}', '{{diy_current_names}}', '{{diy_addon_price}}', '{{diy_has_consulting}}']) {
      expect(isDiyToken(key)).toBe(true);
    }
    for (const key of ['{{client_email}}', '{{total_price}}', '{{Company Name}}']) {
      expect(isDiyToken(key)).toBe(false);
    }
  });
});

describe('DIY agreement template show/hide blocks', () => {
  it('passes the template diagnostic, including {{^…}} inverted rows', async () => {
    const file = new File([docx()], 'diy.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const result = await TemplateDiagnostic.diagnoseTemplate(file, tokensFor(config()) as never);
    expect(result.missingTokens).toEqual([]);
    expect(result.mismatchedTokens).toEqual([]);
  });

  it('prints one styled row per workload and the add-on section when Messages is missing', () => {
    const text = renderText(tokensFor(config()));
    expect(text).toContain('|Content|INCLUDED|50 GB per user|');
    expect(text).not.toContain('|Content|OPTIONAL ADD-ON|');
    expect(text).toContain('|Messages|OPTIONAL ADD-ON|Add for $10 per user|');
    expect(text).not.toContain('|Messages|INCLUDED|');
    expect(text).toContain('RECOMMENDED UPGRADE: ADD THE MESSAGES WORKLOAD');
    expect(text).toContain(`Messages Workload Add-On ${formatCurrency(26050)}`);
    expect(text).not.toContain('{{');
  });

  it('shows Email and Messages as add-ons when only Content is licensed', () => {
    const text = renderText(tokensFor(config({ numberOfUsers: 50, diyWorkloads: ['Content'] })));
    expect(text).toContain('|Content|INCLUDED|50 GB per user|');
    expect(text).toContain('|Messages|OPTIONAL ADD-ON|Add for $15 per user|');
    expect(text).not.toContain('|Messages|INCLUDED|');
  });

  it('drops the add-on section entirely once every workload is licensed', () => {
    const text = renderText(tokensFor(config({ diyWorkloads: ['Mailbox', 'Content', 'Messages'] })));
    expect(text).toContain('|Messages|INCLUDED|No data cap|');
    expect(text).not.toContain('RECOMMENDED UPGRADE');
    expect(text).not.toContain('Add-On');
  });
});
