// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import { mergeDocxFiles, MIGRATION_INCLUDED_TITLE, MIGRATION_NOT_INCLUDED_TITLE } from '../../src/utils/docxMerger';
import { manageExhibitTitles, SPRAWL_INCLUDED_TITLE, SPRAWL_NOT_INCLUDED_TITLE } from '../../src/utils/manageExhibitMerge';
import { DOCX_MIME } from '../../src/utils/scopeAttachment';
import type { ConfigurationData } from '../../src/types/pricing';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function makeDocx(bodyXml: string): Blob {
  const zip = new PizZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}">` +
      `<w:body>${bodyXml}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`,
  );
  return new Blob([zip.generate({ type: 'arraybuffer' })], { type: DOCX_MIME });
}

const para = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const xmlOf = async (blob: Blob) => new PizZip(await blob.arrayBuffer()).file('word/document.xml')?.asText() || '';
const textOf = async (blob: Blob) => (await xmlOf(blob)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// The title paragraph without its text, to compare styling.
const titleShell = (xml: string, title: string) => {
  const p = (xml.match(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*<\/w:p>/g) || []).find(x => x.includes(title)) || '';
  return p.replace(title, '');
};

const included = (name: string) => ({ name, category: 'content', includeType: 'included' as const });
const notIncluded = (name: string) => ({ name, category: 'content', includeType: 'notincluded' as const });
const SPRAWL_TITLES = { includedTitle: SPRAWL_INCLUDED_TITLE, notIncludedTitle: SPRAWL_NOT_INCLUDED_TITLE };

describe('Exhibit 1 header in the merged agreement', () => {
  it('migration exhibits keep "Exhibit 1 - INCLUDED IN MIGRATION"', async () => {
    const merged = await mergeDocxFiles(makeDocx(para('Agreement')), [makeDocx(para('Box features'))], [included('Box')]);
    const text = await textOf(merged);
    expect(text).toContain(MIGRATION_INCLUDED_TITLE);
    expect(text).not.toContain('INCLUDED IN SPRAWL');
  });

  it('Data Sprawl exhibits get "Exhibit 1 - INCLUDED IN SPRAWL" with the same styling', async () => {
    const migration = await xmlOf(await mergeDocxFiles(makeDocx(para('Agreement')), [makeDocx(para('Box features'))], [included('Box')]));
    const sprawlBlob = await mergeDocxFiles(
      makeDocx(para('Agreement')),
      [makeDocx(para('Egnyte pre-scan features'))],
      [included('Content Sprawl Egnyte')],
      SPRAWL_TITLES,
    );
    const sprawl = await xmlOf(sprawlBlob);
    const text = await textOf(sprawlBlob);
    expect(text).toContain(SPRAWL_INCLUDED_TITLE);
    expect(text).not.toContain('INCLUDED IN MIGRATION');
    expect(text).toContain('Egnyte pre-scan features');
    expect(titleShell(sprawl, SPRAWL_INCLUDED_TITLE)).toBe(titleShell(migration, MIGRATION_INCLUDED_TITLE));
  });

  it('one agreement with both: each exhibit set has its own header', async () => {
    const withMigration = await mergeDocxFiles(makeDocx(para('Agreement')), [makeDocx(para('Box features'))], [included('Box')]);
    const both = await mergeDocxFiles(
      withMigration,
      [makeDocx(para('Egnyte pre-scan features'))],
      [included('Content Sprawl Egnyte')],
      SPRAWL_TITLES,
    );
    const text = await textOf(both);
    const migrationAt = text.indexOf(MIGRATION_INCLUDED_TITLE);
    const sprawlAt = text.indexOf(SPRAWL_INCLUDED_TITLE);
    expect(migrationAt).toBeGreaterThan(-1);
    expect(text.indexOf('Box features')).toBeGreaterThan(migrationAt);
    expect(sprawlAt).toBeGreaterThan(text.indexOf('Box features'));
    expect(text.indexOf('Egnyte pre-scan features')).toBeGreaterThan(sprawlAt);
  });
});

describe('Exhibit 2 header in the merged agreement', () => {
  const mergeBoth = (options?: Parameters<typeof mergeDocxFiles>[3]) => mergeDocxFiles(
    makeDocx(para('Agreement')),
    [makeDocx(para('Included features')), makeDocx(para('Owner and size for folder'))],
    [included('In'), notIncluded('Out')],
    options,
  );

  it('migration exhibits keep "Exhibit 2 - NOT INCLUDED IN MIGRATION FEATURES"', async () => {
    const text = await textOf(await mergeBoth());
    expect(text).toContain(MIGRATION_NOT_INCLUDED_TITLE);
    expect(text).not.toContain('NOT INCLUDED IN SPRAWL');
  });

  it('Data Sprawl exhibits get "Exhibit 2 - NOT INCLUDED IN SPRAWL" with the same styling', async () => {
    const migration = await xmlOf(await mergeBoth());
    const sprawlBlob = await mergeBoth(SPRAWL_TITLES);
    const text = await textOf(sprawlBlob);
    expect(text).toContain(SPRAWL_NOT_INCLUDED_TITLE);
    expect(text).not.toContain('NOT INCLUDED IN MIGRATION');
    expect(text.indexOf('Owner and size for folder')).toBeGreaterThan(text.indexOf(SPRAWL_NOT_INCLUDED_TITLE));
    expect(titleShell(await xmlOf(sprawlBlob), SPRAWL_NOT_INCLUDED_TITLE)).toBe(titleShell(migration, MIGRATION_NOT_INCLUDED_TITLE));
  });

  it('one agreement with both: each Not Included set has its own header', async () => {
    const withMigration = await mergeBoth();
    const both = await mergeDocxFiles(
      withMigration,
      [makeDocx(para('Folder and file count')), makeDocx(para('External collaborators'))],
      [included('Content Sprawl Egnyte'), notIncluded('Content Sprawl Egnyte - Not Included')],
      SPRAWL_TITLES,
    );
    const text = await textOf(both);
    expect(text.indexOf(MIGRATION_NOT_INCLUDED_TITLE)).toBeLessThan(text.indexOf(SPRAWL_INCLUDED_TITLE));
    expect(text.indexOf(SPRAWL_NOT_INCLUDED_TITLE)).toBeGreaterThan(text.indexOf('Folder and file count'));
    expect(text.indexOf('External collaborators')).toBeGreaterThan(text.indexOf(SPRAWL_NOT_INCLUDED_TITLE));
  });
});

describe('manageExhibitTitles', () => {
  const base = { numberOfUsers: 1, instanceType: 'Small', numberOfInstances: 1, duration: 1, dataSizeGB: 0 };
  const dataSprawl = { ...base, servicePlan: 'Manage', migrationType: 'data-sprawl', combination: 'manage-standalone', manageAgreementLabel: 'Data Sprawl' } as unknown as ConfigurationData;
  const multiWithSprawl = { ...base, servicePlan: 'Migrate', migrationType: 'Multi combination', combination: 'multi-combination', includeDataSprawl: true, dataSprawlCombination: 'data-sprawl' } as ConfigurationData;

  it('is Sprawl for a Data Sprawl agreement', () => {
    expect(manageExhibitTitles(dataSprawl, 'data-sprawl')).toEqual(SPRAWL_TITLES);
  });

  it('is Sprawl for Data Sprawl ticked with Multi-Combination', () => {
    expect(manageExhibitTitles(multiWithSprawl, 'data-sprawl')).toEqual(SPRAWL_TITLES);
  });

  it('keeps the default for everything else', () => {
    expect(manageExhibitTitles({ ...multiWithSprawl, includeDataSprawl: false }, 'data-sprawl')).toBeUndefined();
    expect(manageExhibitTitles({ ...dataSprawl, migrationType: 'manage-saas' as never, manageAgreementLabel: 'Manage Plan' }, 'manage-saas')).toBeUndefined();
    expect(manageExhibitTitles(dataSprawl, 'other-agreement')).toBeUndefined();
    expect(manageExhibitTitles(undefined, 'data-sprawl')).toBeUndefined();
  });
});
