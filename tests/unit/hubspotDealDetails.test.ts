// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchHubSpotDealDetails,
  isHubSpotDealId,
  mergeDealDetails,
  toClientInfo,
} from '../../src/utils/hubspotDealDetails';

const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('frontend: hubspotDealDetails utils', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lets live HubSpot values replace stale URL placeholders', () => {
    const urlDeal = {
      dealId: '57397519774',
      dealName: 'Wavenet - New Deal - Google Shared Drives',
      contactName: 'Not Available',
      contactEmail: 'Not Available',
      companyByContact: 'Not Available',
      stage: 'Not Set',
    };
    const merged = mergeDealDetails(urlDeal, {
      dealName: 'Wavenet - Sonic',
      contactName: 'Nathan Harris',
      contactEmail: 'nathan.harris@wavenet.co.uk',
      companyByContact: 'Wavenet',
      stage: '  ',
    });
    expect(merged).toMatchObject({
      dealName: 'Wavenet - Sonic',
      contactName: 'Nathan Harris',
      contactEmail: 'nathan.harris@wavenet.co.uk',
      companyByContact: 'Wavenet',
      stage: 'Not Set',
    });
  });

  it('returns the base deal unchanged when there are no details', () => {
    const base = { dealId: '1' };
    expect(mergeDealDetails(base, null)).toBe(base);
  });

  it('maps deal details to client info', () => {
    expect(toClientInfo({ contactName: 'Nathan Harris', companyByContact: 'Wavenet' })).toMatchObject({
      clientName: 'Nathan Harris',
      company: 'Wavenet',
      clientEmail: '',
    });
  });

  it('never turns URL placeholders into client info', () => {
    const info = toClientInfo({
      contactName: 'Not Available',
      contactEmail: 'Not Available',
      company: 'Not Available',
      companyByContact: 'Not Available',
    });
    expect(info).toEqual({
      clientName: '', clientEmail: '', company: '', phone: '',
      jobTitle: '', companyDomain: '', companyPhone: '', companyAddress: '',
    });
  });

  it('only fetches for numeric deal IDs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(isHubSpotDealId('HUBSPOT-1700000000')).toBe(false);
    expect(await fetchHubSpotDealDetails('HUBSPOT-1700000000')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the auth token and returns details on success', async () => {
    localStorage.setItem('cpq_token', 'a.b.c');
    const fetchMock = vi.fn(async () => json(200, { success: true, details: { contactName: 'Nathan Harris' } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchHubSpotDealDetails('57397519774')).toEqual({ contactName: 'Nathan Harris' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/hubspot/deals/57397519774');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer a.b.c');
  });

  it('returns null on auth, config or network failures so URL data is kept', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { success: false })));
    expect(await fetchHubSpotDealDetails('1')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => json(503, { success: false })));
    expect(await fetchHubSpotDealDetails('1')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await fetchHubSpotDealDetails('1')).toBeNull();
  });
});
