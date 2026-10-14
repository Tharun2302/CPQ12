import { BACKEND_URL } from '../config/api';
import { getAuthHeaders } from './authUtils';

export type HubSpotDealDetails = Partial<Record<
  | 'dealId' | 'dealName' | 'amount' | 'stage' | 'closeDate' | 'ownerId'
  | 'contactName' | 'contactEmail' | 'contactPhone' | 'contactJobTitle'
  | 'company' | 'companyByContact' | 'companyDomain' | 'companyPhone' | 'companyAddress',
  string
>>;

export type DealInfo = HubSpotDealDetails & { dealId: string; [key: string]: unknown };

// URL parsing fills gaps with these labels; they must never reach client info as real data
const PLACEHOLDER_VALUES = new Set(['Not Available', 'Not Set']);

function real(value: string | undefined): string {
  return value && !PLACEHOLDER_VALUES.has(value) ? value : '';
}

export function isHubSpotDealId(dealId: unknown): dealId is string {
  return typeof dealId === 'string' && /^\d{1,20}$/.test(dealId);
}

// Live HubSpot values win; URL-supplied values stay only where HubSpot has nothing
export function mergeDealDetails<T extends object>(base: T, details: HubSpotDealDetails | null | undefined): T {
  if (!details) return base;
  const filled = Object.fromEntries(Object.entries(details).filter(([, v]) => typeof v === 'string' && v.trim()));
  return { ...base, ...filled };
}

export function toClientInfo(deal: HubSpotDealDetails) {
  return {
    clientName: real(deal.contactName),
    clientEmail: real(deal.contactEmail),
    company: real(deal.company) || real(deal.companyByContact),
    phone: real(deal.contactPhone),
    jobTitle: real(deal.contactJobTitle),
    companyDomain: real(deal.companyDomain),
    companyPhone: real(deal.companyPhone),
    companyAddress: real(deal.companyAddress),
  };
}

// Returns null when the deal can't be loaded so callers keep the URL-supplied data
export async function fetchHubSpotDealDetails(dealId: string): Promise<HubSpotDealDetails | null> {
  if (!isHubSpotDealId(dealId)) return null;
  try {
    const response = await fetch(`${BACKEND_URL}/api/hubspot/deals/${dealId}`, { headers: getAuthHeaders() });
    if (!response.ok) return null;
    const result = await response.json();
    return result?.success && result.details ? (result.details as HubSpotDealDetails) : null;
  } catch {
    return null;
  }
}
