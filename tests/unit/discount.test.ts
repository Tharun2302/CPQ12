import { describe, it, expect } from 'vitest';
import { calculateDiscount, getQuoteTotals, normalizeDiscountPercent, sanitizeDiscountInput } from '../../src/utils/discount';

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

  it('falls back to a top-level totalCost and handles missing quotes', () => {
    expect(getQuoteTotals({ totalCost: 400, discount: 50 }).finalTotal).toBe(200);
    expect(getQuoteTotals(undefined)).toEqual({ subtotal: 0, percent: 0, amount: 0, finalTotal: 0 });
  });
});
