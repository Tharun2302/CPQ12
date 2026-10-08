import { Quote } from '../types/pricing';
import { normalizeDiscountPercent } from '../utils/discount';
import { DISCOUNT_POLICY_ERROR_CODES } from './discountPolicyService';

// Blank means "no discount entered"; over-cap values are sent as-is so the server can reject them
export function toQuoteDiscount(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? normalizeDiscountPercent(n) : undefined;
}

export function buildQuoteSaveBody(quote: Quote) {
  return {
    id: quote.id,
    clientName: quote.clientName,
    clientEmail: quote.clientEmail,
    company: quote.company,
    configuration: quote.configuration,
    selectedTier: quote.selectedTier,
    calculation: quote.calculation,
    status: quote.status,
    dealData: quote.dealData,
    discount: quote.discount,
  };
}

// Returns the server's message only for discount-policy rejections; other failures keep the generic handling
export async function readDiscountRejection(response: Response): Promise<string | null> {
  try {
    const body = await response.json();
    const code = body && typeof body === 'object' ? body.code : undefined;
    if (typeof code !== 'string' || !DISCOUNT_POLICY_ERROR_CODES.includes(code)) return null;
    return typeof body.error === 'string' && body.error ? body.error : 'The discount exceeds the maximum allowed.';
  } catch {
    return null;
  }
}
