export const MAX_DISCOUNT_PERCENT = 100;

export interface DiscountResult {
  percent: number;
  amount: number;
  finalTotal: number;
}

const roundToCents = (value: number): number => Math.round(value * 100) / 100;

// A discount above 100% would make the quote total negative
export function normalizeDiscountPercent(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_DISCOUNT_PERCENT);
}

// Round the amount first so the discount line and the final total always add back up to the total
export function calculateDiscount(total: number, percent: unknown): DiscountResult {
  const safeTotal = Number.isFinite(total) ? total : 0;
  const pct = normalizeDiscountPercent(percent);
  const amount = pct > 0 ? roundToCents(safeTotal * (pct / 100)) : 0;
  return { percent: pct, amount, finalTotal: roundToCents(safeTotal - amount) };
}

// Returns the value to store for a raw Discount (%) input: '' clears it, otherwise a clamped number string
export function sanitizeDiscountInput(raw: string): string {
  if (raw.trim() === '') return '';
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n > MAX_DISCOUNT_PERCENT) return String(MAX_DISCOUNT_PERCENT);
  return raw;
}

export interface QuoteTotals extends DiscountResult {
  subtotal: number;
}

interface QuoteLike {
  calculation?: { totalCost?: number } | null;
  totalCost?: number;
  discount?: number;
}

// Saved quotes keep calculation.totalCost BEFORE discount; this is the price the customer pays
export function getQuoteTotals(quote: QuoteLike | null | undefined): QuoteTotals {
  const subtotal = Number(quote?.calculation?.totalCost ?? quote?.totalCost ?? 0) || 0;
  return { subtotal, ...calculateDiscount(subtotal, quote?.discount) };
}
