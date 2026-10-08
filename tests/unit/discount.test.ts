import { describe, it, expect } from 'vitest';
import {
  ABSOLUTE_MAX_DISCOUNT_PERCENT,
  DEFAULT_MAX_DISCOUNT_PERCENT,
  calculateDiscount,
  clampMaxDiscount,
  getQuoteTotals,
  normalizeDiscountPercent,
  sanitizeDiscountInput,
  isDiscountAboveMax,
} from '../../src/utils/discount';

describe('normalizeDiscountPercent', () => {
  it('passes through a normal percent', () => {
    expect(normalizeDiscountPercent(20)).toBe(20);
    expect(normalizeDiscountPercent('12.5')).toBe(12.5);
  });

  it('treats empty, negative and invalid values as 0', () => {
    expect(normalizeDiscountPercent(undefined)).toBe(0);
    expect(normalizeDiscountPercent('')).toBe(0);
    expect(normalizeDiscountPercent(-5)).toBe(0);
    expect(normalizeDiscountPercent('abc')).toBe(0);
    expect(normalizeDiscountPercent(NaN)).toBe(0);
  });

  it('caps at 100 so the total can never go negative', () => {
    expect(normalizeDiscountPercent(120)).toBe(100);
  });
});

describe('calculateDiscount', () => {
  it('calculates amount and final total', () => {
    expect(calculateDiscount(10000, 20)).toEqual({ percent: 20, amount: 2000, finalTotal: 8000 });
  });

  it('returns the full total when there is no discount', () => {
    expect(calculateDiscount(1234.56, 0)).toEqual({ percent: 0, amount: 0, finalTotal: 1234.56 });
    expect(calculateDiscount(1234.56, undefined)).toEqual({ percent: 0, amount: 0, finalTotal: 1234.56 });
  });

  it('rounds to cents so amount + final total equals the total', () => {
    const r = calculateDiscount(999.99, 33.33);
    expect(r.amount).toBe(333.3);
    expect(r.finalTotal).toBe(666.69);
    expect(Math.round((r.amount + r.finalTotal) * 100) / 100).toBe(999.99);
  });

  it('never produces a negative total above 100%', () => {
    expect(calculateDiscount(5000, 150)).toEqual({ percent: 100, amount: 5000, finalTotal: 0 });
  });

  it('handles a non-finite total', () => {
    expect(calculateDiscount(NaN, 10)).toEqual({ percent: 10, amount: 0, finalTotal: 0 });
  });
});

describe('sanitizeDiscountInput', () => {
  it('keeps an empty box empty (clearing the discount)', () => {
    expect(sanitizeDiscountInput('')).toBe('');
  });

  it('turns a negative value into 0', () => {
    expect(sanitizeDiscountInput('-5')).toBe('0');
  });

  it('caps values above 100', () => {
    expect(sanitizeDiscountInput('150')).toBe('100');
  });

  it('keeps a valid value as typed', () => {
    expect(sanitizeDiscountInput('12.5')).toBe('12.5');
    expect(sanitizeDiscountInput('10')).toBe('10');
    expect(sanitizeDiscountInput('1.0')).toBe('1.0');
  });

  it('rounds to 2 decimals (half up, despite binary floating point)', () => {
    expect(sanitizeDiscountInput('12.555')).toBe('12.56');
    expect(sanitizeDiscountInput('12.554')).toBe('12.55');
    expect(sanitizeDiscountInput('1.005')).toBe('1.01');
  });

  it('normalizes exponent notation', () => {
    expect(sanitizeDiscountInput('1e-3')).toBe('0');
    expect(sanitizeDiscountInput('1e1')).toBe('10');
    expect(sanitizeDiscountInput('1e-7')).toBe('0');
  });

  it('caps at the given admin max', () => {
    expect(sanitizeDiscountInput('20', 15)).toBe('15');
    expect(sanitizeDiscountInput('14.999', 15)).toBe('15');
  });
});

describe('isDiscountAboveMax', () => {
  it('is true only for a number above the max', () => {
    expect(isDiscountAboveMax('16', 15)).toBe(true);
    expect(isDiscountAboveMax('15', 15)).toBe(false);
    expect(isDiscountAboveMax('', 15)).toBe(false);
    expect(isDiscountAboveMax('abc', 15)).toBe(false);
  });
});

describe('getQuoteTotals', () => {
  it('takes the saved discount off the saved total', () => {
    expect(getQuoteTotals({ calculation: { totalCost: 10000 }, discount: 20 }))
      .toEqual({ subtotal: 10000, percent: 20, amount: 2000, finalTotal: 8000 });
  });

  it('returns the full total when the quote has no discount', () => {
    expect(getQuoteTotals({ calculation: { totalCost: 5000 } }).finalTotal).toBe(5000);
  });

  it('returns 0 (not a missing value) for a 100% discount', () => {
    expect(getQuoteTotals({ calculation: { totalCost: 10000 }, discount: 100 }).finalTotal).toBe(0);
  });

  it('falls back to a top-level totalCost and handles missing quotes', () => {
    expect(getQuoteTotals({ totalCost: 400, discount: 50 }).finalTotal).toBe(200);
    expect(getQuoteTotals(undefined)).toEqual({ subtotal: 0, percent: 0, amount: 0, finalTotal: 0 });
  });
});

describe('admin max discount', () => {
  it('exposes the default and absolute caps', () => {
    expect(DEFAULT_MAX_DISCOUNT_PERCENT).toBe(15);
    expect(ABSOLUTE_MAX_DISCOUNT_PERCENT).toBe(100);
  });

  it('normalizeDiscountPercent caps at the given max', () => {
    expect(normalizeDiscountPercent(20, 15)).toBe(15);
    expect(normalizeDiscountPercent(10, 15)).toBe(10);
    expect(normalizeDiscountPercent(5, 0)).toBe(0);
  });

  it('normalizeDiscountPercent never exceeds 100 even with a larger or invalid max', () => {
    expect(normalizeDiscountPercent(150, 200)).toBe(100);
    expect(normalizeDiscountPercent(150, NaN)).toBe(100);
  });

  it('calculateDiscount applies the max before computing the amount', () => {
    expect(calculateDiscount(10000, 30, 15)).toEqual({ percent: 15, amount: 1500, finalTotal: 8500 });
  });

  it('sanitizeDiscountInput caps the typed value at the max', () => {
    expect(sanitizeDiscountInput('20', 15)).toBe('15');
    expect(sanitizeDiscountInput('12.5', 15)).toBe('12.5');
    expect(sanitizeDiscountInput('7.25', 7.25)).toBe('7.25');
    expect(sanitizeDiscountInput('', 15)).toBe('');
  });

  it('getQuoteTotals keeps the absolute cap so saved quotes above the admin max are unchanged', () => {
    expect(getQuoteTotals({ calculation: { totalCost: 10000 }, discount: 40 }).finalTotal).toBe(6000);
  });
});

describe('clampMaxDiscount', () => {
  it('keeps valid caps (rounded to cents)', () => {
    expect(clampMaxDiscount(25)).toBe(25);
    expect(clampMaxDiscount('12.5')).toBe(12.5);
    expect(clampMaxDiscount(0)).toBe(0);
    expect(clampMaxDiscount(100)).toBe(100);
  });

  it('falls back to 15 (never 100) for missing or out-of-range values', () => {
    expect(clampMaxDiscount(undefined)).toBe(15);
    expect(clampMaxDiscount(null)).toBe(15);
    expect(clampMaxDiscount('abc')).toBe(15);
    expect(clampMaxDiscount(-1)).toBe(15);
    expect(clampMaxDiscount(101)).toBe(15);
    expect(clampMaxDiscount(Infinity)).toBe(15);
  });
});
