import { describe, it, expect } from 'vitest';
import {
  applyDatesToTemplateData, changedDatesNotInFile, printedTemplateValues,
  EFFECTIVE_DATE_KEYS, START_DATE_KEYS, END_DATE_KEYS, EXPIRY_SHORT_KEYS, EXPIRY_LONG_KEYS, VALIDITY_LINE_KEY,
} from '../../src/utils/contractDateValues';
import { planTextReplacements } from '../../src/utils/docxTextSwap';
import editDates from '../../edit-dates-template-data.cjs';

// The date names QuoteGenerator saves for an agreement made on 11/24/2026, starting 12/01/2026 for 12 months
const generated: Record<string, string> = {
  '{{date}}': '11/24/2026', '{{Date}}': '11/24/2026', '{{current_date}}': '11/24/2026', '{{currentDate}}': '11/24/2026',
  '{{generation_date}}': '11/24/2026', '{{effective_date}}': '11/24/2026', '{{effectiveDate}}': '11/24/2026',
  '{{Effective Date}}': '11/24/2026',
  '{{Start_date}}': '12/01/2026', '{{start_date}}': '12/01/2026', '{{startdate}}': '12/01/2026',
  '{{project_start_date}}': '12/01/2026', '{{project_start}}': '12/01/2026', '{{service_start_date}}': '12/01/2026',
  '{{End_date}}': '12/01/2027', '{{end_date}}': '12/01/2027', '{{enddate}}': '12/01/2027',
  '{{project_end_date}}': '12/01/2027', '{{project_end}}': '12/01/2027', '{{service_end_date}}': '11/30/2027',
  '{{quote_expiry_date}}': '12/24/2026', '{{quoteExpiryDate}}': '12/24/2026', '{{expiry_date}}': '12/24/2026',
  '{{expiryDate}}': '12/24/2026', '{{quote_expiry_date_long}}': '24th of December, 2026',
  '{{quote_validity_line}}': 'This quote is valid till 24th of December, 2026',
  '{{company_name}}': 'Acme',
};
const savedDates = { projectStartDate: '2026-12-01', effectiveDate: '2026-11-24', quoteExpiryDate: '2026-12-24' };

describe('applyDatesToTemplateData', () => {
  it('changes every name the effective date is printed under, so editing it is not refused', () => {
    const next = applyDatesToTemplateData(generated, { ...savedDates, effectiveDate: '2026-11-30' }, savedDates);
    for (const key of EFFECTIVE_DATE_KEYS.filter((k) => k in generated)) expect(next[key]).toBe('11/30/2026');
    expect(planTextReplacements(generated, next)).toEqual({
      ok: true, replacements: [{ from: '11/24/2026', to: '11/30/2026' }], unplaceable: [],
    });
  });

  it('leaves the end dates alone when only the expiry date changes', () => {
    const next = applyDatesToTemplateData(generated, { ...savedDates, quoteExpiryDate: '2027-01-05' }, savedDates);
    for (const key of END_DATE_KEYS.filter((k) => k in generated)) expect(next[key]).toBe(generated[key]);
    const plan = planTextReplacements(generated, next);
    expect(plan.ok && plan.replacements).toEqual([
      { from: '12/24/2026', to: '01/05/2027' },
      { from: '24th of December, 2026', to: '5th of January, 2027' },
    ]);
  });

  it('moves each end date by as many days as the start date moved, keeping them different', () => {
    const next = applyDatesToTemplateData(generated, { ...savedDates, projectStartDate: '2026-12-15' }, savedDates);
    expect(next['{{End_date}}']).toBe('12/15/2027');
    expect(next['{{service_end_date}}']).toBe('12/14/2027');
    expect(next['{{start_date}}']).toBe('12/15/2026');
  });

  it('counts whole days across a daylight-saving change', () => {
    const values = { '{{start_date}}': '03/01/2026', '{{end_date}}': '11/01/2026' };
    const next = applyDatesToTemplateData(values, { projectStartDate: '2026-04-01', effectiveDate: null, quoteExpiryDate: null },
      { projectStartDate: '2026-03-01', effectiveDate: null, quoteExpiryDate: null });
    expect(next['{{end_date}}']).toBe('12/02/2026');
  });

  it('keeps an N/A end date as it is', () => {
    const next = applyDatesToTemplateData({ ...generated, '{{service_end_date}}': 'N/A' }, { ...savedDates, projectStartDate: '2026-12-15' }, savedDates);
    expect(next['{{service_end_date}}']).toBe('N/A');
    expect(next['{{End_date}}']).toBe('12/15/2027');
  });

  it('formats the long expiry and the validity line', () => {
    const next = applyDatesToTemplateData(generated, { ...savedDates, quoteExpiryDate: '2027-01-05' }, savedDates);
    expect(next['{{quote_expiry_date_long}}']).toBe('5th of January, 2027');
    expect(next[VALIDITY_LINE_KEY]).toBe('This quote is valid till 5th of January, 2027');
  });
});

describe('printedTemplateValues', () => {
  const datesB = { ...savedDates, projectStartDate: '2026-12-15' };

  it('uses the stored values when the dates were never edited', () => {
    expect(printedTemplateValues(generated, [])).toEqual(generated);
  });

  it('replays an old-style rebuild the way it really printed, end date bug included', () => {
    const printed = printedTemplateValues(generated, [{ reRendered: true, newDates: datesB, oldDates: savedDates }]);
    expect(printed['{{start_date}}']).toBe('12/15/2026');
    // The old rebuild copied the shifted service end date into every end date name
    expect(printed['{{End_date}}']).toBe('12/14/2027');
    // and never touched these two
    expect(printed['{{currentDate}}']).toBe('11/24/2026');
    expect(printed['{{quote_expiry_date}}']).toBe('12/24/2026');
  });

  it('trusts the stored values once an edit has saved them', () => {
    const history = [
      { reRendered: true, newDates: datesB, oldDates: savedDates },
      { reRendered: true, templateDataUpdated: true, newDates: savedDates, oldDates: datesB },
    ];
    expect(printedTemplateValues(generated, history)).toEqual(generated);
  });

  it('skips date-only edits that did not touch the file', () => {
    const history = [
      { reRendered: true, newDates: datesB, oldDates: savedDates },
      { reRendered: false, newDates: savedDates, oldDates: datesB },
    ];
    expect(printedTemplateValues(generated, history)['{{start_date}}']).toBe('12/15/2026');
  });
});

describe('changedDatesNotInFile', () => {
  const newDates = { projectStartDate: '2026-12-15', effectiveDate: '2026-11-30', quoteExpiryDate: '2027-01-05' };

  it('names only the changed dates that were not swapped anywhere', () => {
    // The real MultiCombinations template prints Start, End and Date, but no expiry
    const swapped = new Set(['11/24/2026', '12/01/2026', '12/01/2027']);
    expect(changedDatesNotInFile(generated, swapped, savedDates, newDates)).toEqual(['Quote Expiry Date']);
  });

  it('says nothing about dates the user left alone', () => {
    const onlyStart = { ...savedDates, projectStartDate: '2026-12-15' };
    expect(changedDatesNotInFile(generated, new Set(['12/01/2026']), savedDates, onlyStart)).toEqual([]);
  });

  it('counts a start date as shown when only its end date was printed', () => {
    const onlyStart = { ...savedDates, projectStartDate: '2026-12-15' };
    expect(changedDatesNotInFile(generated, new Set(['12/01/2027']), savedDates, onlyStart)).toEqual([]);
  });

  it('names a date that was N/A in the agreement', () => {
    const values = { ...generated, '{{start_date}}': 'N/A', '{{Start_date}}': 'N/A', '{{End_date}}': 'N/A' };
    const fromBlank = { ...savedDates, projectStartDate: null };
    expect(changedDatesNotInFile(values, new Set(), fromBlank, { ...savedDates, projectStartDate: '2026-12-15' }))
      .toEqual(['Project Start Date']);
  });
});

describe('the server accepts every date name the screen sends', () => {
  it('lists each key in edit-dates-template-data.cjs', () => {
    const all = [...EFFECTIVE_DATE_KEYS, ...START_DATE_KEYS, ...END_DATE_KEYS, ...EXPIRY_SHORT_KEYS, ...EXPIRY_LONG_KEYS, VALIDITY_LINE_KEY];
    expect(all.filter((k) => !editDates.DATE_TEMPLATE_KEYS.has(k))).toEqual([]);
  });
});
