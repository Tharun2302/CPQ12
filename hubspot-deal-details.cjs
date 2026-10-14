const HUBSPOT_API_BASE = 'https://api.hubapi.com/crm/v3/objects';

// dealstage/closedate are left out: HubSpot returns an internal stage id and a raw timestamp,
// and the link already carries the readable values that quotes print
const DEAL_PROPERTIES = ['dealname', 'amount', 'hubspot_owner_id'];
const CONTACT_PROPERTIES = ['firstname', 'lastname', 'email', 'phone', 'jobtitle', 'company'];
const COMPANY_PROPERTIES = ['name', 'domain', 'phone', 'address', 'city', 'state', 'zip', 'country'];
// A hung HubSpot call must not hold the user's request open indefinitely
const HUBSPOT_TIMEOUT_MS = 10000;

// HubSpot object IDs are numeric; rejecting anything else keeps user input out of the upstream URL path
function isValidHubSpotId(id) {
  return typeof id === 'string' && /^\d{1,20}$/.test(id);
}

function isHubSpotConfigured(token) {
  return typeof token === 'string' && token.trim() !== '' && token !== 'demo-key';
}

// v3 lists the primary association as "deal_to_company" and duplicates it as "..._unlabeled"
function pickAssociationId(deal, objectType, primaryType) {
  const results = deal?.associations?.[objectType]?.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const primary = results.find(r => r.type === primaryType);
  return String((primary || results[0]).id);
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Only non-empty values are returned so callers can merge over URL-supplied fallbacks
function buildDealDetails(deal, contact, company) {
  const d = deal?.properties || {};
  const c = contact?.properties || {};
  const co = company?.properties || {};
  const contactName = [clean(c.firstname), clean(c.lastname)].filter(Boolean).join(' ');
  const companyAddress = [co.address, co.city, co.state, co.zip, co.country]
    .map(clean)
    .filter(Boolean)
    .join(', ');
  const companyName = clean(co.name) || clean(c.company);

  const details = {
    dealId: clean(deal?.id),
    dealName: clean(d.dealname),
    amount: clean(d.amount),
    ownerId: clean(d.hubspot_owner_id),
    contactName,
    contactEmail: clean(c.email),
    contactPhone: clean(c.phone),
    contactJobTitle: clean(c.jobtitle),
    company: companyName,
    companyByContact: companyName,
    companyDomain: clean(co.domain),
    companyPhone: clean(co.phone),
    companyAddress,
  };
  return Object.fromEntries(Object.entries(details).filter(([, v]) => v));
}

async function hubspotGet(path, token, fetchImpl) {
  const response = await fetchImpl(`${HUBSPOT_API_BASE}/${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(HUBSPOT_TIMEOUT_MS),
  });
  if (!response.ok) {
    const err = new Error(`HubSpot API error: ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

// A missing or unreadable contact/company must not hide the deal itself
async function getOptional(path, token, fetchImpl) {
  try {
    return await hubspotGet(path, token, fetchImpl);
  } catch {
    return null;
  }
}

async function fetchDealDetails(dealId, { token, fetchImpl = fetch }) {
  const deal = await hubspotGet(
    `deals/${dealId}?properties=${DEAL_PROPERTIES.join(',')}&associations=contacts,companies`,
    token,
    fetchImpl
  );
  const contactId = pickAssociationId(deal, 'contacts', 'deal_to_contact');
  const companyId = pickAssociationId(deal, 'companies', 'deal_to_company');
  const contactPath = `contacts/${contactId}?properties=${CONTACT_PROPERTIES.join(',')}`;
  const companyPath = `companies/${companyId}?properties=${COMPANY_PROPERTIES.join(',')}`;
  const [contact, company] = await Promise.all([
    contactId ? getOptional(contactPath, token, fetchImpl) : null,
    companyId ? getOptional(companyPath, token, fetchImpl) : null,
  ]);
  return { deal, details: buildDealDetails(deal, contact, company) };
}

// Built as a factory so the route can be exercised without booting server.cjs
function createDealDetailsHandler({ getDb, getAuthenticatedUser, getToken, logger, fetchImpl = fetch }) {
  return async (req, res) => {
    try {
      const { dealId } = req.params;
      if (!isValidHubSpotId(dealId)) {
        return res.status(400).json({ success: false, error: 'Invalid deal ID' });
      }
      if (!getDb()) return res.status(503).json({ success: false, error: 'Database not available' });
      const authUser = await getAuthenticatedUser(req, res);
      if (!authUser) return;
      const token = getToken();
      if (!isHubSpotConfigured(token)) {
        return res.status(503).json({ success: false, error: 'HubSpot integration not configured' });
      }

      const { deal, details } = await fetchDealDetails(dealId, { token, fetchImpl });
      res.json({ success: true, data: deal, details });
    } catch (error) {
      if (error.status === 404) {
        return res.status(404).json({ success: false, error: 'Deal not found' });
      }
      logger.error('HubSpot deal fetch failed', {
        source: 'hubspot-deal',
        status: error.status,
        error: error.message,
      });
      res.status(502).json({ success: false, error: 'Failed to load deal from HubSpot' });
    }
  };
}

module.exports = {
  isValidHubSpotId,
  isHubSpotConfigured,
  pickAssociationId,
  buildDealDetails,
  fetchDealDetails,
  createDealDetailsHandler,
};
