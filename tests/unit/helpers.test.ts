import { describe, it, expect } from 'vitest';
import { formatCurrency, generateQuoteId } from '../../src/utils/helpers';

describe('formatCurrency (helpers)', () => {
  it('should format USD by default with no decimal places', () => {
    // helpers.formatCurrency uses min/max fraction digits of 0, so cents are rounded away
    expect(formatCurrency(1000)).toBe('$1,000');
    expect(formatCurrency(1234.56)).toBe('$1,235');
  });

  it('should format other currencies via the currency argument', () => {
    expect(formatCurrency(1000, 'EUR')).toBe('€1,000');
  });

  it('should format zero', () => {
    expect(formatCurrency(0)).toBe('$0');
  });

  it('should format negative amounts', () => {
    expect(formatCurrency(-500)).toBe('-$500');
  });

  it('should fall back to a $-prefixed string when the currency code is invalid', () => {
    // Intl.NumberFormat throws for malformed codes; the catch branch returns `$` + toLocaleString
    expect(formatCurrency(1000, 'NOT_A_CODE')).toBe('$1,000');
  });
});

describe('generateQuoteId', () => {
  it('should return an id shaped like QTE-NNN', () => {
    expect(generateQuoteId()).toMatch(/^QTE-\d{3}$/);
  });

  // NOTE: possible bug — the function is documented as "Generate unique quote ID" but
  // always returns the constant 'QTE-001', so two calls are NOT unique. Testing actual behavior.
  it('should currently return the same constant id on every call', () => {
    expect(generateQuoteId()).toBe(generateQuoteId());
    expect(generateQuoteId()).toBe('QTE-001');
  });
});
