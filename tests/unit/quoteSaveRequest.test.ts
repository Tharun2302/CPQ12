import { describe, it, expect } from 'vitest';

import { buildQuoteSaveBody, readDiscountRejection, toQuoteDiscount } from '../../src/services/quoteSaveRequest';
import { Quote } from '../../src/types/pricing';

const baseQuote = {
  id: 'quote-001',
  clientName: 'Acme',
  clientEmail: 'buyer@acme.test',
  company: 'Acme Inc',
  configuration: {},
  selectedTier: { id: 'basic' },
  calculation: { totalCost: 1000 },
  createdAt: new Date('2026-10-08T00:00:00.000Z'),
  status: 'draft',
  dealData: null,
} as unknown as Quote;

const response = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response;

describe('toQuoteDiscount', () => {
  it('returns a normalized number for a real discount', () => {
    expect(toQuoteDiscount(12.5)).toBe(12.5);
    expect(toQuoteDiscount('10')).toBe(10);
    expect(toQuoteDiscount(0)).toBe(0);
  });

  it('returns undefined when no discount was entered', () => {
    expect(toQuoteDiscount(undefined)).toBeUndefined();
    expect(toQuoteDiscount(null)).toBeUndefined();
    expect(toQuoteDiscount('')).toBeUndefined();
    expect(toQuoteDiscount('abc')).toBeUndefined();
  });

  it('leaves an over-cap value for the server to reject but never exceeds 100', () => {
    expect(toQuoteDiscount(40)).toBe(40);
    expect(toQuoteDiscount(250)).toBe(100);
  });
});

describe('buildQuoteSaveBody', () => {
  it('includes the discount in the POST /api/quotes body', () => {
    const body = buildQuoteSaveBody({ ...baseQuote, discount: 12 });
    expect(body.discount).toBe(12);
    expect(JSON.parse(JSON.stringify(body))).toMatchObject({ id: 'quote-001', clientName: 'Acme', discount: 12 });
  });

  it('omits the discount key from the JSON when there is none', () => {
    const json = JSON.parse(JSON.stringify(buildQuoteSaveBody(baseQuote)));
    expect('discount' in json).toBe(false);
  });
});

describe('readDiscountRejection', () => {
  it('returns the server message for a discount-policy rejection', async () => {
    const msg = await readDiscountRejection(
      response(400, { success: false, error: 'Discount cannot exceed 15%', code: 'DISCOUNT_EXCEEDS_MAX', maxDiscountPercent: 15 }),
    );
    expect(msg).toBe('Discount cannot exceed 15%');
  });

  it('handles INVALID_DISCOUNT too', async () => {
    expect(await readDiscountRejection(response(400, { error: 'Invalid discount', code: 'INVALID_DISCOUNT' }))).toBe('Invalid discount');
  });

  it('returns null for other failures or unreadable bodies', async () => {
    expect(await readDiscountRejection(response(500, { error: 'boom' }))).toBeNull();
    const broken = { ok: false, status: 502, json: () => Promise.reject(new Error('not json')) } as unknown as Response;
    expect(await readDiscountRejection(broken)).toBeNull();
  });
});
