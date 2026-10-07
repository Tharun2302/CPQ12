import { describe, it, expect } from 'vitest';
import {
  MANAGE_FREE_TRIAL_MONTHS,
  resolveServiceTerm,
  serviceTermEndDate,
  serviceTermMonthsBetween,
  serviceTermTokens,
} from '../../src/utils/serviceTerm';
import { PRICING_TIERS, calculatePricing, withSprawlConfigs } from '../../src/utils/pricing';
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

const FREE_TRIAL = { months: 3, label: '3-Month Free Trial' };
const STANDALONE = { migrationType: '' as never, manageAgreementLabel: 'Manage Standalone' };
const COMBINED = { migrationType: 'mange+sprawl' as never, manageAgreementLabel: 'mange+sprawl' };

describe('resolveServiceTerm', () => {
  it('Data Sprawl uses its own Duration (Months)', () => {
    expect(resolveServiceTerm(cfg({ serviceTermMonths: 12 }), 5)).toEqual({ months: 12, label: '12-Months' });
    expect(resolveServiceTerm(cfg({ serviceTermMonths: 1 }), 5)).toEqual({ months: 1, label: '1-Month' });
    expect(resolveServiceTerm(cfg({ serviceTermMonths: 60 }), 5)).toEqual({ months: 60, label: '60-Months' });
  });

  it('Data Sprawl without a valid term (incl. older saved quotes) keeps the free trial', () => {
    expect(MANAGE_FREE_TRIAL_MONTHS).toBe(3);
    expect(resolveServiceTerm(cfg(), 5)).toEqual(FREE_TRIAL);
    for (const bad of [0, NaN, 61, -2, 2.5]) {
      expect(resolveServiceTerm(cfg({ serviceTermMonths: bad }), 5)).toEqual(FREE_TRIAL);
    }
  });

  it('Manage Standalone uses its Duration (Months)', () => {
    expect(resolveServiceTerm(cfg({ ...STANDALONE, serviceTermMonths: 24 }), 5)).toEqual({ months: 24, label: '24-Months' });
    expect(resolveServiceTerm(cfg({ ...STANDALONE, serviceTermMonths: 1 }), 5)).toEqual({ months: 1, label: '1-Month' });
  });

  it('Manage Standalone without a valid term (older sessions and quotes) runs 12 months', () => {
    const twelve = { months: 12, label: '12-Months' };
    expect(resolveServiceTerm(cfg(STANDALONE), 5)).toEqual(twelve);
    expect(resolveServiceTerm(cfg({ ...STANDALONE, manageAgreementLabel: '' }), 5)).toEqual(twelve);
    for (const bad of [0, NaN, 61, 2.5]) {
      expect(resolveServiceTerm(cfg({ ...STANDALONE, serviceTermMonths: bad }), 5)).toEqual(twelve);
    }
  });

  it('mange+sprawl ignores the term and keeps the free trial', () => {
    expect(resolveServiceTerm(cfg({ ...COMBINED, serviceTermMonths: 12 }), 5)).toEqual(FREE_TRIAL);
  });

  it('Manage Standalone ends the day before its anniversary', () => {
    const term = resolveServiceTerm(cfg(STANDALONE), 5);
    expect(serviceTermEndDate('2026-10-07', term.months)).toBe('2027-10-06');
  });

  it('non-Manage plans use the migrate duration, as before', () => {
    const migrate = cfg({ servicePlan: 'Migrate', migrationType: 'Content' as never, manageAgreementLabel: '', serviceTermMonths: 12 });
    expect(resolveServiceTerm(migrate, 6)).toEqual({ months: 6, label: '6-Months' });
    expect(resolveServiceTerm(migrate, 1)).toEqual({ months: 1, label: '1-Month' });
    expect(resolveServiceTerm(migrate, 0)).toEqual({ months: 0, label: '0-Months' });
    expect(resolveServiceTerm(undefined, 4)).toEqual({ months: 4, label: '4-Months' });
  });
});

describe('serviceTermEndDate', () => {
  // Rule: end = start + N months - 1 day, on calendar dates only. When the start day does not
  // exist in the end month (e.g. 31 Jan + 1 month), the term runs to that month's last day.
  it('ends the day before the monthly anniversary', () => {
    expect(serviceTermEndDate('2026-10-07', 12)).toBe('2027-10-06');
    expect(serviceTermEndDate('2026-01-15', 12)).toBe('2027-01-14');
    expect(serviceTermEndDate('2026-01-15', 3)).toBe('2026-04-14');
    expect(serviceTermEndDate('2026-03-01', 1)).toBe('2026-03-31');
    expect(serviceTermEndDate('2026-01-01', 12)).toBe('2026-12-31');
    expect(serviceTermEndDate('2026-11-15', 2)).toBe('2027-01-14');
    expect(serviceTermEndDate('2026-10-07', 60)).toBe('2031-10-06');
  });

  it('clamps to the last day of a shorter end month', () => {
    expect(serviceTermEndDate('2027-01-31', 1)).toBe('2027-02-28');
    expect(serviceTermEndDate('2027-01-30', 1)).toBe('2027-02-28');
    expect(serviceTermEndDate('2027-01-29', 1)).toBe('2027-02-28');
    expect(serviceTermEndDate('2027-01-28', 1)).toBe('2027-02-27');
    expect(serviceTermEndDate('2028-01-31', 1)).toBe('2028-02-29');
    expect(serviceTermEndDate('2026-03-31', 1)).toBe('2026-04-30');
    expect(serviceTermEndDate('2026-08-31', 6)).toBe('2027-02-28');
  });

  it('accepts MM/DD/YYYY starts', () => {
    expect(serviceTermEndDate('10/07/2026', 12)).toBe('2027-10-06');
  });

  it('does not depend on the timezone', () => {
    const original = process.env.TZ;
    const offsets = new Set<number>();
    try {
      for (const tz of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
        process.env.TZ = tz;
        offsets.add(new Date(2026, 9, 7).getTimezoneOffset());
        expect(serviceTermEndDate('2026-10-07', 12)).toBe('2027-10-06');
        expect(serviceTermEndDate('2027-01-31', 1)).toBe('2027-02-28');
        expect(serviceTermEndDate('2026-03-08', 1)).toBe('2026-04-07');
        expect(serviceTermMonthsBetween('2026-10-07', '2027-10-06')).toBe(12);
      }
      // Guards against the runtime ignoring TZ, which would make this test vacuous.
      expect(offsets.size).toBeGreaterThan(1);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it('returns null for a missing or unparseable start, or no months', () => {
    expect(serviceTermEndDate(undefined, 12)).toBeNull();
    expect(serviceTermEndDate(null, 12)).toBeNull();
    expect(serviceTermEndDate('', 12)).toBeNull();
    expect(serviceTermEndDate('not-a-date', 12)).toBeNull();
    expect(serviceTermEndDate('nonsense', 12)).toBeNull();
    expect(serviceTermEndDate('2026-02-30', 12)).toBeNull();
    expect(serviceTermEndDate('2026-01-15', 0)).toBeNull();
  });
});

describe('serviceTermMonthsBetween', () => {
  it('counts the whole months from start to the day after end', () => {
    expect(serviceTermMonthsBetween('2026-10-07', '2027-10-06')).toBe(12);
    expect(serviceTermMonthsBetween('2026-10-07', '2026-11-06')).toBe(1);
    expect(serviceTermMonthsBetween('2027-01-31', '2027-02-28')).toBe(1);
    expect(serviceTermMonthsBetween('2026-10-07', '2028-10-06')).toBe(24);
  });

  it('is the inverse of serviceTermEndDate for every supported term', () => {
    for (const start of ['2026-10-07', '2027-01-31', '2026-02-28', '2028-02-29']) {
      for (let months = 1; months <= 60; months += 1) {
        expect(serviceTermMonthsBetween(start, serviceTermEndDate(start, months))).toBe(months);
      }
    }
  });

  it('rounds a partial month down and returns null when no whole month or a date is missing', () => {
    expect(serviceTermMonthsBetween('2026-10-07', '2027-10-20')).toBe(12);
    expect(serviceTermMonthsBetween('2026-10-07', '2026-10-20')).toBeNull();
    expect(serviceTermMonthsBetween(undefined, '2027-10-06')).toBeNull();
    expect(serviceTermMonthsBetween('2026-10-07', null)).toBeNull();
  });
});

describe('serviceTermTokens', () => {
  it('Manage Standalone prints the chosen term and its end date', () => {
    const config = cfg({ ...STANDALONE, startDate: '2026-10-07', serviceTermMonths: 24 });
    expect(serviceTermTokens(config, 5)).toEqual({ endDate: '2028-10-06', label: '24-Months' });
  });

  it('Manage Standalone defaults to 12 months and falls back to the duration with no start date', () => {
    expect(serviceTermTokens(cfg({ ...STANDALONE, startDate: '2026-10-07' }), 5))
      .toEqual({ endDate: '2027-10-06', label: '12-Months' });
    expect(serviceTermTokens(cfg({ ...STANDALONE, serviceTermMonths: 6 }), 5))
      .toEqual({ endDate: null, label: '6-Months' });
  });

  it('other plans keep their labels', () => {
    expect(serviceTermTokens(cfg({ ...COMBINED, startDate: '2026-10-07' }), 5))
      .toEqual({ endDate: '2027-01-06', label: '3-Month Free Trial' });
    expect(serviceTermTokens(cfg({ startDate: '2026-10-07', serviceTermMonths: 12 }), 5))
      .toEqual({ endDate: '2027-10-06', label: '12-Months' });
    const migrate = cfg({
      servicePlan: 'Migrate', migrationType: 'Content' as never, manageAgreementLabel: '', startDate: '2026-10-07',
    });
    expect(serviceTermTokens(migrate, 6)).toEqual({ endDate: '2027-04-06', label: '6-Months' });
  });
});

describe('Data Sprawl price does not depend on the term', () => {
  it('is identical for serviceTermMonths 3, 12 and unset', () => {
    const group: ManageSprawlConfig = { exhibitId: 'dbx', exhibitIds: ['dbx'], exhibitName: 'Content Sprawl DropBox', type: 'Content', users: 12, quantity: 345 };
    const base = withSprawlConfigs(cfg(), [group]);
    const totals = [undefined, 3, 12].map(m => calculatePricing({ ...base, serviceTermMonths: m }, PRICING_TIERS[0]));
    expect(totals[0].totalCost).toBeGreaterThan(0);
    expect(totals[1]).toEqual(totals[0]);
    expect(totals[2]).toEqual(totals[0]);
  });
});

describe('serviceTermEndDate input shapes', () => {
  it('reads a stored ISO timestamp by its written date, not the viewer\'s local day', () => {
    expect(serviceTermEndDate('2026-10-07T00:00:00Z', 12)).toBe('2027-10-06');
    expect(serviceTermEndDate('2026-10-07T23:30:00.000Z', 12)).toBe('2027-10-06');
  });

  it('pins month-end clamping for 28-31 Jan starts in a non-leap year', () => {
    expect(serviceTermEndDate('2027-01-28', 1)).toBe('2027-02-27');
    expect(serviceTermEndDate('2027-01-29', 1)).toBe('2027-02-28');
    expect(serviceTermEndDate('2027-01-30', 1)).toBe('2027-02-28');
    expect(serviceTermEndDate('2027-01-31', 1)).toBe('2027-02-28');
  });
});
