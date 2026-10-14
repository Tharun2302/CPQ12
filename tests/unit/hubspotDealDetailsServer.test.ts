import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import dealDetailsHelper from '../../hubspot-deal-details.cjs';

const {
  isValidHubSpotId,
  isHubSpotConfigured,
  pickAssociationId,
  buildDealDetails,
  fetchDealDetails,
  createDealDetailsHandler,
} =
  dealDetailsHelper as Record<string, any>;

const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const DEAL = {
  id: '57397519774',
  properties: { dealname: 'Wavenet - Sonic', amount: '1200', dealstage: 'qualified' },
  associations: {
    contacts: { results: [{ id: '901', type: 'deal_to_contact' }] },
    companies: {
      results: [
        { id: '700', type: 'deal_to_company_unlabeled' },
        { id: '701', type: 'deal_to_company' },
      ],
    },
  },
};
const CONTACT = {
  id: '901',
  properties: { firstname: 'Nathan', lastname: 'Harris', email: 'nathan.harris@wavenet.co.uk', jobtitle: 'Senior 365 Consultant' },
};
const COMPANY = { id: '701', properties: { name: 'Wavenet', domain: 'wavenet.co.uk', city: 'Solihull', country: 'UK' } };

function hubspotFetch(overrides: Record<string, Response> = {}) {
  return vi.fn(async (url: string) => {
    const match = Object.keys(overrides).find(k => url.includes(k));
    if (match) return overrides[match];
    if (url.includes('/deals/')) return json(200, DEAL);
    if (url.includes('/contacts/901')) return json(200, CONTACT);
    if (url.includes('/companies/701')) return json(200, COMPANY);
    return json(404, {});
  });
}

describe('server helper: hubspot-deal-details.cjs', () => {
  it('accepts only numeric HubSpot IDs', () => {
    expect(isValidHubSpotId('57397519774')).toBe(true);
    expect(isValidHubSpotId('../owners')).toBe(false);
    expect(isValidHubSpotId('123?x=1')).toBe(false);
    expect(isValidHubSpotId('')).toBe(false);
    expect(isValidHubSpotId(undefined)).toBe(false);
  });

  it('treats the demo placeholder key as not configured', () => {
    expect(isHubSpotConfigured('demo-key')).toBe(false);
    expect(isHubSpotConfigured('')).toBe(false);
    expect(isHubSpotConfigured(undefined)).toBe(false);
    expect(isHubSpotConfigured('pat-na1-real')).toBe(true);
  });

  it('prefers the primary company association over unlabeled ones', () => {
    expect(pickAssociationId(DEAL, 'companies', 'deal_to_company')).toBe('701');
    expect(pickAssociationId(DEAL, 'contacts', 'deal_to_contact')).toBe('901');
    expect(pickAssociationId({ associations: {} }, 'contacts', 'deal_to_contact')).toBeNull();
    expect(pickAssociationId({}, 'companies', 'deal_to_company')).toBeNull();
  });

  it('builds details from the deal, contact and company, omitting blanks', () => {
    const details = buildDealDetails(DEAL, CONTACT, COMPANY);
    expect(details).toMatchObject({
      dealId: '57397519774',
      dealName: 'Wavenet - Sonic',
      contactName: 'Nathan Harris',
      contactEmail: 'nathan.harris@wavenet.co.uk',
      contactJobTitle: 'Senior 365 Consultant',
      company: 'Wavenet',
      companyByContact: 'Wavenet',
      companyDomain: 'wavenet.co.uk',
      companyAddress: 'Solihull, UK',
    });
    expect(details).not.toHaveProperty('contactPhone');
  });

  it('leaves stage and close date to the link, since HubSpot returns raw ids/timestamps', () => {
    const deal = { ...DEAL, properties: { ...DEAL.properties, closedate: '2026-07-15T00:00:00Z' } };
    const details = buildDealDetails(deal, null, null);
    expect(details).not.toHaveProperty('stage');
    expect(details).not.toHaveProperty('closeDate');
  });

  it('falls back to the contact company property when no company is associated', () => {
    const contact = { properties: { ...CONTACT.properties, company: 'Wavenet Ltd' } };
    expect(buildDealDetails(DEAL, contact, null).company).toBe('Wavenet Ltd');
  });

  it('fetches the deal with associations, then the contact and company', async () => {
    const fetchImpl = hubspotFetch();
    const { details } = await fetchDealDetails('57397519774', { token: 't', fetchImpl });
    expect(details.contactName).toBe('Nathan Harris');
    expect(details.company).toBe('Wavenet');
    const urls = fetchImpl.mock.calls.map(c => c[0]);
    expect(urls[0]).toContain('/deals/57397519774?');
    expect(urls[0]).toContain('associations=contacts,companies');
    expect(urls.some(u => u.includes('/companies/701'))).toBe(true);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer t');
  });

  it('still returns the deal when the contact lookup fails', async () => {
    const fetchImpl = hubspotFetch({ '/contacts/901': json(403, {}) });
    const { details } = await fetchDealDetails('57397519774', { token: 't', fetchImpl });
    expect(details.dealName).toBe('Wavenet - Sonic');
    expect(details).not.toHaveProperty('contactName');
    expect(details.company).toBe('Wavenet');
  });

  it('makes no contact/company calls for a deal with no associations', async () => {
    const fetchImpl = vi.fn(async () => json(200, { id: '1', properties: { dealname: 'Solo' } }));
    const { details } = await fetchDealDetails('1', { token: 't', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(details).toEqual({ dealId: '1', dealName: 'Solo' });
  });

  it('propagates the upstream status when the deal itself fails', async () => {
    const fetchImpl = vi.fn(async () => json(404, {}));
    await expect(fetchDealDetails('1', { token: 't', fetchImpl })).rejects.toMatchObject({ status: 404 });
  });
});

describe('server route: GET /api/hubspot/deals/:dealId', () => {
  const serverSrc = fs.readFileSync(fileURLToPath(new URL('../../server.cjs', import.meta.url)), 'utf8');

  function fakeRes() {
    const res: any = { statusCode: 200, body: undefined };
    res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
    res.json = vi.fn((body: unknown) => { res.body = body; return res; });
    return res;
  }

  function handler(overrides: Record<string, unknown> = {}) {
    const deps = {
      getDb: () => ({}),
      getAuthenticatedUser: vi.fn(async () => ({ id: 'u1' })),
      getToken: () => 'pat-real',
      logger: { error: vi.fn() },
      fetchImpl: hubspotFetch(),
      ...overrides,
    };
    return { deps, run: createDealDetailsHandler(deps) };
  }

  async function call(run: any, dealId: string) {
    const res = fakeRes();
    await run({ params: { dealId }, headers: {} }, res);
    return res;
  }

  it('is mounted behind the rate limiter using the shared handler', () => {
    expect(serverSrc).toMatch(/app\.get\('\/api\/hubspot\/deals\/:dealId', hubspotDealLimiter, createDealDetailsHandler\(/);
  });

  it('returns 400 for a non-numeric ID without touching auth or HubSpot', async () => {
    const { deps, run } = handler();
    const res = await call(run, '../owners');
    expect(res.statusCode).toBe(400);
    expect(deps.getAuthenticatedUser).not.toHaveBeenCalled();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it('stops when the caller is not signed in', async () => {
    const getAuthenticatedUser = vi.fn(async (_req: unknown, res: any) => {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return null;
    });
    const { deps, run } = handler({ getAuthenticatedUser });
    const res = await call(run, '57397519774');
    expect(res.statusCode).toBe(401);
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it('returns 503 when only the demo HubSpot key is configured', async () => {
    const { deps, run } = handler({ getToken: () => 'demo-key' });
    const res = await call(run, '57397519774');
    expect(res.statusCode).toBe(503);
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it('returns 503 when the database is unavailable', async () => {
    const { run } = handler({ getDb: () => null });
    expect((await call(run, '1')).statusCode).toBe(503);
  });

  it('returns the raw deal and resolved details on success', async () => {
    const { run } = handler();
    const res = await call(run, '57397519774');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('57397519774');
    expect(res.body.details).toMatchObject({ contactName: 'Nathan Harris', company: 'Wavenet' });
  });

  it('maps an upstream 404 to 404', async () => {
    const { run } = handler({ fetchImpl: vi.fn(async () => json(404, {})) });
    const res = await call(run, '1');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Deal not found' });
  });

  it('maps other upstream failures to a generic 502 and logs without PII', async () => {
    const { deps, run } = handler({ fetchImpl: vi.fn(async () => json(500, { message: 'internal detail' })) });
    const res = await call(run, '1');
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ success: false, error: 'Failed to load deal from HubSpot' });
    expect(deps.logger.error).toHaveBeenCalledWith('HubSpot deal fetch failed', expect.objectContaining({ status: 500 }));
  });

  it('passes a timeout signal on every HubSpot call', async () => {
    const fetchImpl = hubspotFetch();
    await fetchDealDetails('57397519774', { token: 't', fetchImpl });
    for (const [, init] of fetchImpl.mock.calls as any[]) expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
