'use strict';

// Kept out of server.cjs so the merge rule is unit tested without a database.

const MAX_VALUE_LENGTH = 200;

// Must include every key in src/utils/contractDateValues.ts (a unit test checks this)
const DATE_TEMPLATE_KEYS = new Set([
  '{{Effective Date}}', '{{effective_date}}', '{{effectiveDate}}', '{{Date}}', '{{date}}',
  '{{current_date}}', '{{currentDate}}', '{{generation_date}}', '{{today}}',
  '{{Start_date}}', '{{start_date}}', '{{startdate}}', '{{project_start_date}}', '{{project_start}}', '{{service_start_date}}',
  '{{service_end_date}}', '{{End_date}}', '{{end_date}}', '{{enddate}}', '{{project_end_date}}', '{{project_end}}',
  '{{End date}}', '{{end date}}',
  '{{quote_expiry_date}}', '{{quoteExpiryDate}}', '{{expiry_date}}', '{{expiryDate}}',
  '{{quote_expiry_date_long}}', '{{quoteExpiryDateLong}}', '{{expiry_date_long}}', '{{quote_validity_line}}',
]);

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

// Stored date text must follow what Edit Dates printed; only existing date keys with string values are taken
function mergeEditedTemplateData(stored, incoming) {
  if (!isPlainObject(stored) || !isPlainObject(incoming)) return null;
  const merged = { ...stored };
  for (const key of Object.keys(incoming)) {
    if (!DATE_TEMPLATE_KEYS.has(key) || !Object.prototype.hasOwnProperty.call(stored, key)) continue;
    const value = incoming[key];
    if (typeof value === 'string' && value.length <= MAX_VALUE_LENGTH) merged[key] = value;
  }
  return merged;
}

module.exports = { DATE_TEMPLATE_KEYS, mergeEditedTemplateData };
