import { describe, it, expect } from 'vitest';
import { buildSprawlAgreementData, buildOverageLine, sprawlPerDataCost, sprawlQuantityNote, withDiscountRow } from '../../src/utils/sprawlAgreement';
import { calculatePricing, PRICING_TIERS, calcSprawlLines, manageAgreementCard, withSprawlTypes } from '../../src/utils/pricing';
import type { ConfigurationData } from '../../src/types/pricing';

const MANAGE = PRICING_TIERS[0];

function cfg(overrides: Partial<ConfigurationData> = {}): ConfigurationData {
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
    manageDataGB: 0,
    ...overrides,
  };
}

describe('buildSprawlAgreementData', () => {
  it('builds one loop row per selected type, in canonical order', () => {
    const data = buildSprawlAgreementData(
      cfg({ manageSprawlTypes: ['Message', 'Content'], manageDataGB: 345 })
    );
    // Content shows its priced GB; Message has no captured count in this fixture.
    expect(data.rows.map(r => r.sprawlLabel)).toEqual(['Data Sprawl (345 GB)', 'Message Sprawl']);
    expect(data.rows.map(r => r.sprawlPrice)).toEqual(['$55.20', '$2,248.40']);
    expect(data.rows.every(r => r.sprawlJobRequirement === 'CloudFuze Data Sprawl')).toBe(true);
    expect(data.rows.map(r => r.isLast)).toEqual([false, true]);
  });

  it('row metadata carries rate, basis and quantity', () => {
    const data = buildSprawlAgreementData(
      cfg({ manageSprawlTypes: ['Content', 'Message'], manageDataGB: 345 })
    );
    expect(data.rows[0]).toMatchObject({ sprawlRate: '$0.16', sprawlBasis: 'per GB', sprawlQty: '345' });
    expect(data.rows[1]).toMatchObject({ sprawlRate: '$2.20', sprawlBasis: 'per user', sprawlQty: '1022' });
  });

  it('agrees with the engine on user, data and total cost', () => {
    const config = cfg({ manageSprawlTypes: ['Content', 'Message'], manageDataGB: 345 });
    const engine = calculatePricing(config, MANAGE);
    const data = buildSprawlAgreementData(config, engine);
    expect(data.userCost).toBe(engine.userCost);
    expect(data.dataCost).toBeCloseTo(engine.dataCost, 2);
    expect(data.totalCost).toBeCloseTo(engine.totalCost, 2);
  });

  it('standalone selection keeps the license off the agreement', () => {
    const config = cfg({ manageSprawlTypes: ['Content', 'Message'], manageDataGB: 345 });
    const standalone = { sprawlType: 'Content' as const, userCost: 0 };
    const data = buildSprawlAgreementData(config, standalone);
    expect(data.userCost).toBe(0);
    // Total equals the printed rows, which is the whole point of the standalone plan
    expect(data.totalCost).toBeCloseTo(2303.6, 2);
  });

  it('printed rows always add up to the printed total', () => {
    const config = cfg({ manageSprawlTypes: ['Content', 'Message', 'Email'], manageDataGB: 345 });
    const data = buildSprawlAgreementData(config, { sprawlType: 'Content', userCost: 0 });
    const rowSum = data.rows.reduce((s, r) => s + Number(r.sprawlPrice.replace(/[$,]/g, '')), 0);
    expect(rowSum).toBeCloseTo(data.totalCost, 2);
  });

  describe('un-upgraded single-row templates', () => {
    it('single-type tokens are exactly the pre-feature strings', () => {
      const data = buildSprawlAgreementData(cfg({ manageSprawlTypes: ['Message'] }));
      expect(data.tokens['{{manag_data_label}}']).toBe('Message Sprawl');
      expect(data.tokens['{{manag_data_cost}}']).toBe('$2,248.40');
      expect(data.tokens['{{sprawl_row_count}}']).toBe('1');
    });

    it('multi-select joins the labels and sums the cost so the row matches the total', () => {
      const data = buildSprawlAgreementData(
        cfg({ manageSprawlTypes: ['Content', 'Message'], manageDataGB: 345 })
      );
      expect(data.tokens['{{manag_data_label}}']).toBe('Data Sprawl (345 GB) + Message Sprawl');
      expect(data.tokens['{{manag_data_cost}}']).toBe('$2,303.60');
      expect(data.tokens['{{sprawl_row_count}}']).toBe('2');
    });
  });

  it('no selection yields no rows and empty overage text', () => {
    const data = buildSprawlAgreementData(cfg({ manageSprawlTypes: [] }));
    expect(data.rows).toEqual([]);
    expect(data.types).toEqual([]);
    expect(data.tokens['{{sprawl_overage_line}}']).toBe('');
  });

  it('legacy single-field configs still build a row', () => {
    const data = buildSprawlAgreementData(cfg({ manageSprawlType: 'Email' }));
    expect(data.rows.map(r => r.sprawlLabel)).toEqual(['Email Sprawl']);
  });

  it('tolerates an undefined config', () => {
    const data = buildSprawlAgreementData(undefined);
    expect(data.rows).toEqual([]);
    expect(data.totalCost).toBe(0);
  });
});

describe('buildOverageLine', () => {
  it('labels each rate with its own unit', () => {
    const lines = calcSprawlLines(['Content', 'Message'], 1022, 345);
    expect(buildOverageLine(lines)).toBe('Overage Charge: $0.16 per GB | $2.20 per user');
  });

  it('fixes the per-GB mislabelling for per-user types', () => {
    expect(buildOverageLine(calcSprawlLines(['Message'], 1022, 0)))
      .toBe('Overage Charge: $2.20 per user');
    expect(buildOverageLine(calcSprawlLines(['Content'], 0, 345)))
      .toBe('Overage Charge: $0.16 per GB');
  });

  it('is empty with no lines', () => {
    expect(buildOverageLine([])).toBe('');
  });
});

describe('sprawlPerDataCost (legacy token on un-upgraded templates)', () => {
  it('prefers the Content rate, which matches the static "per GB" wording', () => {
    expect(sprawlPerDataCost(cfg({ manageSprawlTypes: ['Content', 'Message'], manageDataGB: 345 })))
      .toBe('$0.16');
  });

  it('keeps the deployed per-user value when no Content type is selected', () => {
    expect(sprawlPerDataCost(cfg({ manageSprawlTypes: ['Message'] }))).toBe('$2.20');
  });

  it('returns undefined without sprawl so the non-sprawl fallback runs', () => {
    expect(sprawlPerDataCost(cfg({ manageSprawlTypes: [] }))).toBeUndefined();
  });
});

describe('manageAgreementCard — which pricing card the dropdown selects', () => {
  function manage(overrides: Partial<ConfigurationData>): ConfigurationData {
    return cfg({ servicePlan: 'Manage', ...overrides });
  }

  it('"Data Sprawl" shows the standalone card only', () => {
    expect(manageAgreementCard(manage({ manageAgreementLabel: 'Data Sprawl' }))).toBe('standalone');
  });

  it('"MANAGE + Sprawl" shows the combined card only', () => {
    expect(manageAgreementCard(manage({ manageAgreementLabel: 'MANAGE + Sprawl' }))).toBe('combined');
  });

  it('is tolerant of spacing, case and punctuation in the label', () => {
    for (const label of ['data sprawl', 'Data-Sprawl', 'DATASPRAWL', ' Data  Sprawl ']) {
      expect(manageAgreementCard(manage({ manageAgreementLabel: label }))).toBe('standalone');
    }
    for (const label of ['manage+sprawl', 'Manage Plus Sprawl', 'MANAGE  +  SPRAWL']) {
      expect(manageAgreementCard(manage({ manageAgreementLabel: label }))).toBe('combined');
    }
  });

  it('falls back to migrationType when no label was captured', () => {
    expect(manageAgreementCard(manage({ migrationType: 'datasprawl' as never }))).toBe('standalone');
    expect(manageAgreementCard(manage({ migrationType: 'manage-sprawl' as never }))).toBe('combined');
  });

  it('shows both cards for a Manage agreement that is not a sprawl agreement', () => {
    expect(manageAgreementCard(manage({ manageAgreementLabel: 'Manage Plan SaaS Agreement' }))).toBe('both');
    expect(manageAgreementCard(manage({ manageAgreementLabel: '', migrationType: 'manage-saas' as never })))
      .toBe('both');
  });

  it('an empty label falls back to migrationType rather than giving up', () => {
    expect(manageAgreementCard(manage({ manageAgreementLabel: '', migrationType: 'datasprawl' as never })))
      .toBe('standalone');
  });

  it('never restricts cards outside the Manage plan', () => {
    expect(manageAgreementCard(cfg({ servicePlan: 'Migrate' }))).toBe('both');
    expect(manageAgreementCard(undefined)).toBe('both');
  });
});

describe('sprawlQuantityNote — captured counts in the row description', () => {
  it('prints each type with its own unit', () => {
    const c = cfg({
      manageSprawlTypes: ['Content', 'Message', 'Email'],
      manageDataGB: 345,
      manageMessageCount: 1200000,
      manageEmailCount: 500,
    });
    expect(sprawlQuantityNote('Content', c)).toBe('345 GB');
    expect(sprawlQuantityNote('Message', c)).toBe('1,200,000 messages');
    expect(sprawlQuantityNote('Email', c)).toBe('500 emails');
  });

  it('is omitted when the count is missing, zero or invalid', () => {
    expect(sprawlQuantityNote('Message', cfg({}))).toBe('');
    expect(sprawlQuantityNote('Message', cfg({ manageMessageCount: 0 }))).toBe('');
    expect(sprawlQuantityNote('Email', cfg({ manageEmailCount: -5 }))).toBe('');
    expect(sprawlQuantityNote('Content', cfg({ manageDataGB: Number.NaN }))).toBe('');
  });

  it('appears in the agreement row description', () => {
    const data = buildSprawlAgreementData(cfg({
      manageSprawlTypes: ['Message', 'Email'],
      manageMessageCount: 1200000,
      manageEmailCount: 500,
    }));
    expect(data.rows.map(r => r.sprawlLabel))
      .toEqual(['Message Sprawl (1,200,000 messages)', 'Email Sprawl (500 emails)']);
  });

  it('does not change the price — the counts are not a basis', () => {
    const base = cfg({ manageSprawlTypes: ['Message'], manageUsers: 424 });
    const withCount = cfg({ manageSprawlTypes: ['Message'], manageUsers: 424, manageMessageCount: 9999999 });
    expect(buildSprawlAgreementData(withCount).dataCost)
      .toBe(buildSprawlAgreementData(base).dataCost);
    expect(calculatePricing(withCount, MANAGE).totalCost)
      .toBe(calculatePricing(base, MANAGE).totalCost);
  });

  it('withSprawlTypes clears the count of a deselected type', () => {
    const filled = cfg({ manageMessageCount: 1000, manageEmailCount: 2000, manageDataGB: 345 });
    const onlyMessage = withSprawlTypes(filled, ['Message']);
    expect(onlyMessage.manageMessageCount).toBe(1000);
    expect(onlyMessage.manageEmailCount).toBe(0);
    expect(onlyMessage.manageDataGB).toBe(0);
  });
});

describe('agreement rows with DISTINCT per-type user counts', () => {
  // The gap that hid the critical bug: every other fixture used one shared count, where
  // the aggregate and the per-type values coincide.
  function perType(overrides: Partial<ConfigurationData> = {}): ConfigurationData {
    return cfg({
      manageSprawlTypes: ['Content', 'Message', 'Email'],
      manageUsersByType: { Content: 62, Message: 424, Email: 100 },
      manageUsers: 586,
      manageDataGB: 345,
      ...overrides,
    });
  }

  it('regression: each row is priced on its OWN count, not the aggregate', () => {
    const data = buildSprawlAgreementData(perType());
    expect(data.rows.map(r => r.sprawlQty)).toEqual(['345', '424', '100']);
    // 424 -> $2.80 band, 100 -> $3.60 band. The aggregate 586 would give $2.50 for both.
    expect(data.rows.map(r => r.sprawlRate)).toEqual(['$0.16', '$2.80', '$3.60']);
    expect(data.rows.map(r => r.sprawlPrice)).toEqual(['$55.20', '$1,187.20', '$360.00']);
  });

  it('regression: printed rows sum to the printed data line for every subset', () => {
    const subsets: ConfigurationData['manageSprawlTypes'][] = [
      ['Content'], ['Message'], ['Email'],
      ['Content', 'Message'], ['Content', 'Email'], ['Message', 'Email'],
      ['Content', 'Message', 'Email'],
    ];
    for (const types of subsets) {
      const config = perType({ manageSprawlTypes: types });
      const data = buildSprawlAgreementData(config);
      const rowSum = data.rows.reduce((s, r) => s + Number(r.sprawlPrice.replace(/[$,]/g, '')), 0);
      expect(rowSum).toBeCloseTo(data.dataCost, 2);
      expect(data.totalCost).toBeCloseTo(data.userCost + rowSum, 2);
    }
  });

  it('regression: the agreement agrees with the engine', () => {
    const config = perType();
    const engine = calculatePricing(config, MANAGE);
    const data = buildSprawlAgreementData(config, engine);
    expect(data.dataCost).toBeCloseTo(engine.dataCost, 2);
    expect(data.totalCost).toBeCloseTo(engine.totalCost, 2);
    expect(data.userCost).toBe(engine.userCost);
  });

  it('regression: the overage line names each type\'s own rate', () => {
    const data = buildSprawlAgreementData(perType({ manageSprawlTypes: ['Message', 'Email'] }));
    expect(data.tokens['{{sprawl_overage_line}}'])
      .toBe('Overage Charge: $2.80 per user | $3.60 per user');
  });

  it('sprawlPerDataCost uses the per-type rate, not the aggregate band', () => {
    expect(sprawlPerDataCost(perType({ manageSprawlTypes: ['Message', 'Email'] }))).toBe('$2.80');
    expect(sprawlPerDataCost(perType())).toBe('$0.16');
  });

  it('sprawlPerDataCost is undefined off the Manage plan', () => {
    // manageSprawlTypes survives a switch to Migrate, so the guard has to be explicit
    expect(sprawlPerDataCost(perType({ servicePlan: 'Migrate' }))).toBeUndefined();
  });
});

describe('withDiscountRow — the Discount line in the agreement table', () => {
  const rows = () => buildSprawlAgreementData(cfg({
    manageSprawlTypes: ['Content', 'Message', 'Email'],
    manageUsersByType: { Content: 21, Message: 1022, Email: 897 },
    manageUsers: 1940,
    manageDataGB: 204,
  })).rows;

  it('appends a Discount row matching the reference format', () => {
    const withDiscount = withDiscountRow(rows(), 20, 1262.18);
    const last = withDiscount[withDiscount.length - 1];
    expect(last.sprawlJobRequirement).toBe('Discount');
    expect(last.sprawlLabel).toBe('20%');
    expect(last.sprawlPrice).toBe('– $1,262.18');
  });

  it('renders no Discount row when no discount is applied', () => {
    const base = rows();
    expect(withDiscountRow(base, 0, 0)).toHaveLength(base.length);
    expect(withDiscountRow(base, 0, 0).some(r => r.sprawlJobRequirement === 'Discount')).toBe(false);
    // A percent with no amount, or an amount with no percent, must not produce a row either
    expect(withDiscountRow(base, 20, 0).some(r => r.sprawlJobRequirement === 'Discount')).toBe(false);
    expect(withDiscountRow(base, 0, 100).some(r => r.sprawlJobRequirement === 'Discount')).toBe(false);
  });

  it('moves isLast onto the Discount row', () => {
    const withDiscount = withDiscountRow(rows(), 5, 10);
    expect(withDiscount.filter(r => r.isLast)).toHaveLength(1);
    expect(withDiscount[withDiscount.length - 1].isLast).toBe(true);
  });

  it('trims a trailing .00 from the percentage', () => {
    expect(withDiscountRow(rows(), 20.0, 5).slice(-1)[0].sprawlLabel).toBe('20%');
    expect(withDiscountRow(rows(), 12.5, 5).slice(-1)[0].sprawlLabel).toBe('12.5%');
  });

  it('ignores non-finite or negative input', () => {
    const base = rows();
    for (const [p, a] of [[Number.NaN, 10], [-5, 10], [10, -5], [Infinity, 10]]) {
      expect(withDiscountRow(base, p, a)).toHaveLength(base.length);
    }
  });

  it('does not disturb the priced rows', () => {
    const base = rows();
    const withDiscount = withDiscountRow(base, 20, 1262.18);
    expect(withDiscount.slice(0, base.length).map(r => r.sprawlPrice))
      .toEqual(base.map(r => r.sprawlPrice));
  });
});
