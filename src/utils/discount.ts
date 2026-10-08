export const DEFAULT_MAX_DISCOUNT_PERCENT = 15;
export const ABSOLUTE_MAX_DISCOUNT_PERCENT = 100;

export interface DiscountResult {
  percent: number;
  amount: number;
  finalTotal: number;
}

const roundToCents = (value: number): number => Math.round(value * 100) / 100;

// Anything outside 0..100 is a corrupt setting, and falling back to 100 would silently allow any discount
export function clampMaxDiscount(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(n) || n < 0 || n > ABSOLUTE_MAX_DISCOUNT_PERCENT) return DEFAULT_MAX_DISCOUNT_PERCENT;
  return roundToCents(n);
}

const effectiveMax = (max: number): number =>
  Number.isFinite(max) ? Math.min(Math.max(max, 0), ABSOLUTE_MAX_DISCOUNT_PERCENT) : ABSOLUTE_MAX_DISCOUNT_PERCENT;

// A discount above 100% would make the quote total negative
export function normalizeDiscountPercent(value: unknown, max: number = ABSOLUTE_MAX_DISCOUNT_PERCENT): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, effectiveMax(max));
}

// Round the amount first so the discount line and the final total always add back up to the total
export function calculateDiscount(
  total: number,
  percent: unknown,
  max: number = ABSOLUTE_MAX_DISCOUNT_PERCENT,
): DiscountResult {
  const safeTotal = Number.isFinite(total) ? total : 0;
  const pct = normalizeDiscountPercent(percent, max);
  const amount = pct > 0 ? roundToCents(safeTotal * (pct / 100)) : 0;
  return { percent: pct, amount, finalTotal: roundToCents(safeTotal - amount) };
}

// Decimal-string shift so 12.555 rounds to 12.56 (multiplying by 100 gives 1255.4999…)
function roundPercent(n: number): number {
  const shifted = Math.round(Number(`${n}e2`));
  return Number.isFinite(shifted) ? Number(`${shifted}e-2`) : roundToCents(n);
}

const PLAIN_TWO_DECIMALS = /^\d+(\.\d{0,2})?$/;

// Returns the value to store for a raw Discount (%) input: '' clears it, otherwise a clamped 2-decimal number string
export function sanitizeDiscountInput(raw: string, max: number = ABSOLUTE_MAX_DISCOUNT_PERCENT): string {
  if (raw.trim() === '') return '';
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return '0';
  const cap = effectiveMax(max);
  if (n > cap) return String(cap);
  // Echo plain values back untouched so a controlled input can still hold '1.0' while '1.05' is typed
  if (PLAIN_TWO_DECIMALS.test(raw.trim())) return raw.trim();
  return String(roundPercent(n));
}

export function isDiscountAboveMax(raw: string, max: number): boolean {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isFinite(n) && n > max;
}

export function discountExceededMessage(max: number): string {
  return `The maximum discount is ${max}% (set by admin). The value was capped.`;
}

export interface QuoteTotals extends DiscountResult {
  subtotal: number;
}

interface QuoteLike {
  calculation?: { totalCost?: number } | null;
  totalCost?: number;
  discount?: number;
}

// Saved quotes keep calculation.totalCost BEFORE discount; this is the price the customer pays.
// Uses the absolute cap on purpose: lowering the admin max must not rewrite already-saved quotes.
export function getQuoteTotals(quote: QuoteLike | null | undefined): QuoteTotals {
  const subtotal = Number(quote?.calculation?.totalCost ?? quote?.totalCost ?? 0) || 0;
  return { subtotal, ...calculateDiscount(subtotal, quote?.discount) };
}
