import { describe, it, expect } from 'vitest';
import { isDiscountOnlyBlock } from '../../src/utils/docxTemplateProcessor';

// This predicate decides what gets DELETED from a generated agreement when no discount
// applies. It previously used `includes('discount')`, which silently removed any content
// merely mentioning a discount.
describe('isDiscountOnlyBlock', () => {
  it('removes the Discount line itself', () => {
    for (const text of [
      'discount',
      'discount 5%',
      'discount (5%) - $9.15',
      'discount 0% $0.00',
      '  Discount  ',
    ]) {
      expect(isDiscountOnlyBlock(text.toLowerCase().trim())).toBe(true);
    }
  });

  it('regression: keeps a custom line item that merely mentions a discount', () => {
    // Reported class of bug: this row vanished from every undiscounted agreement.
    expect(isDiscountOnlyBlock('loyalty discount $500.00')).toBe(false);
    expect(isDiscountOnlyBlock('early renewal discount')).toBe(false);
    expect(isDiscountOnlyBlock('volume discount tier 2 $1,200.00')).toBe(false);
  });

  it('regression: keeps a scope block containing the word discount', () => {
    // In-Scope items render as one paragraph, so a single item mentioning a discount
    // would otherwise delete the entire block.
    const scopeBlock =
      '• migrate 500 mailboxes • apply volume discount rules • decommission source tenant';
    expect(isDiscountOnlyBlock(scopeBlock)).toBe(false);
  });

  it('keeps prose about discounts', () => {
    expect(isDiscountOnlyBlock(
      'discounts above 15% require additional approval from the team lead and legal'
    )).toBe(false);
    expect(isDiscountOnlyBlock('no discount applies to this agreement under any circumstances')).toBe(false);
  });

  it('keeps a long line even when it starts with discount', () => {
    const long = 'discount ' + 'x'.repeat(60);
    expect(long.length).toBeGreaterThan(60);
    expect(isDiscountOnlyBlock(long)).toBe(false);
  });

  it('keeps unrelated content', () => {
    expect(isDiscountOnlyBlock('total price $295.97')).toBe(false);
    expect(isDiscountOnlyBlock('cloudfuze data sprawl message sprawl $180.00')).toBe(false);
    expect(isDiscountOnlyBlock('')).toBe(false);
  });

  it('tolerates missing or non-string input', () => {
    expect(isDiscountOnlyBlock(undefined as unknown as string)).toBe(false);
    expect(isDiscountOnlyBlock(null as unknown as string)).toBe(false);
  });
});
