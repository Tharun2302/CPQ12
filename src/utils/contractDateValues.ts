export interface ContractDates {
  projectStartDate: string | null;
  effectiveDate: string | null;
  quoteExpiryDate: string | null;
}

export interface DateEditRecord {
  reRendered?: boolean;
  templateDataUpdated?: boolean;
  newDates?: ContractDates | null;
  oldDates?: ContractDates | null;
}

// Every name QuoteGenerator prints each date under; edit-dates-template-data.cjs must list them all
export const EFFECTIVE_DATE_KEYS = [
  '{{Effective Date}}', '{{effective_date}}', '{{effectiveDate}}', '{{Date}}', '{{date}}',
  '{{current_date}}', '{{currentDate}}', '{{generation_date}}', '{{today}}',
];
export const START_DATE_KEYS = [
  '{{Start_date}}', '{{start_date}}', '{{startdate}}', '{{project_start_date}}', '{{project_start}}', '{{service_start_date}}',
];
export const END_DATE_KEYS = [
  '{{service_end_date}}', '{{End_date}}', '{{end_date}}', '{{enddate}}', '{{project_end_date}}', '{{project_end}}',
  '{{End date}}', '{{end date}}',
];
export const EXPIRY_SHORT_KEYS = ['{{quote_expiry_date}}', '{{quoteExpiryDate}}', '{{expiry_date}}', '{{expiryDate}}'];
export const EXPIRY_LONG_KEYS = ['{{quote_expiry_date_long}}', '{{quoteExpiryDateLong}}', '{{expiry_date_long}}'];
export const VALIDITY_LINE_KEY = '{{quote_validity_line}}';

// Templates print only some of these names, so a warning is only worth showing per date the user changed
const DATE_FIELDS: Array<{ label: string; dateKey: keyof ContractDates; keys: string[] }> = [
  { label: 'Effective Date', dateKey: 'effectiveDate', keys: EFFECTIVE_DATE_KEYS },
  { label: 'Project Start Date', dateKey: 'projectStartDate', keys: [...START_DATE_KEYS, ...END_DATE_KEYS] },
  { label: 'Quote Expiry Date', dateKey: 'quoteExpiryDate', keys: [...EXPIRY_SHORT_KEYS, ...EXPIRY_LONG_KEYS, VALIDITY_LINE_KEY] },
];

// Changed dates with no printed text swapped anywhere in the file
export function changedDatesNotInFile(
  current: Record<string, string>,
  swappedTexts: Set<string>,
  oldDates: ContractDates | null,
  newDates: ContractDates
): string[] {
  return DATE_FIELDS
    .filter((f) => (oldDates?.[f.dateKey] || '') !== (newDates[f.dateKey] || ''))
    .filter((f) => !f.keys.some((k) => k in current && swappedTexts.has(current[k])))
    .map((f) => f.label);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDate(dateString: string): Date | null {
  const date = dateString.includes('-') ? new Date(dateString + 'T00:00:00') : new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
}

function toMMDDYYYY(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
}

// "27th of June, 2026" — must stay in sync with formatDateLongOrdinal in QuoteGenerator
export function formatDateLongOrdinal(dateString: string): string {
  const date = dateString ? parseIsoDate(dateString) : null;
  if (!date) return '';
  const day = date.getDate();
  const suffix = day >= 11 && day <= 13 ? 'th' : day % 10 === 1 ? 'st' : day % 10 === 2 ? 'nd' : day % 10 === 3 ? 'rd' : 'th';
  const month = date.toLocaleString('en-US', { month: 'long' });
  return `${day}${suffix} of ${month}, ${date.getFullYear()}`;
}

// "MM/DD/YYYY" — matches DocxTemplateProcessor.formatDateMMDDYYYY
export function formatDateMMDDYYYY(dateString: string): string {
  const date = dateString ? parseIsoDate(dateString) : null;
  return date ? toMMDDYYYY(date) : '';
}

function parseMMDDYYYY(value: string): Date | null {
  const parts = value.split('/');
  if (parts.length !== 3) return null;
  const date = new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
  return isNaN(date.getTime()) ? null : date;
}

// Whole days, so a daylight-saving change in between cannot move a date by one day
function daysBetween(fromIso: string, toIso: string): number | null {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  return from && to ? Math.round((to.getTime() - from.getTime()) / DAY_MS) : null;
}

function setAll(out: Record<string, string>, keys: string[], value: string) {
  for (const key of keys) out[key] = value;
}

// Each end date moves by as many days as the start date did, keeping the term length; a blank start leaves them alone
function shiftEndDates(out: Record<string, string>, newStart: string, oldStart: string | null | undefined) {
  const days = newStart && oldStart ? daysBetween(oldStart, newStart) : null;
  if (!days) return;
  for (const key of END_DATE_KEYS) {
    const end = out[key] ? parseMMDDYYYY(out[key]) : null;
    if (end) out[key] = toMMDDYYYY(new Date(end.getFullYear(), end.getMonth(), end.getDate() + days));
  }
}

// Returns a copy of the printed values with every date name set from newDates
export function applyDatesToTemplateData(
  snapshot: Record<string, string>,
  newDates: ContractDates,
  oldDates: ContractDates | null
): Record<string, string> {
  const out: Record<string, string> = { ...snapshot };
  if (newDates.effectiveDate) setAll(out, EFFECTIVE_DATE_KEYS, formatDateMMDDYYYY(newDates.effectiveDate));
  if (newDates.projectStartDate) setAll(out, START_DATE_KEYS, formatDateMMDDYYYY(newDates.projectStartDate));
  shiftEndDates(out, newDates.projectStartDate || '', oldDates?.projectStartDate);
  if (newDates.quoteExpiryDate) {
    const expiryLong = formatDateLongOrdinal(newDates.quoteExpiryDate);
    setAll(out, EXPIRY_SHORT_KEYS, formatDateMMDDYYYY(newDates.quoteExpiryDate));
    setAll(out, EXPIRY_LONG_KEYS, expiryLong);
    out[VALIDITY_LINE_KEY] = expiryLong ? `This quote is valid till ${expiryLong}` : '';
  }
  return out;
}

// Exactly what the pre-2026-11-24 rebuild printed, bugs included; only used to work out text already in old files
function applyDatesLikeOldRebuild(
  snapshot: Record<string, string>,
  newDates: ContractDates,
  oldDates: ContractDates | null
): Record<string, string> {
  const out: Record<string, string> = { ...snapshot };
  const newStart = newDates.projectStartDate || '';
  let serviceEnd = out['{{service_end_date}}'] || out['{{end_date}}'] || '';
  if (newStart && oldDates?.projectStartDate && serviceEnd && serviceEnd !== 'N/A') {
    const end = parseMMDDYYYY(serviceEnd);
    const oldStart = new Date(oldDates.projectStartDate + 'T00:00:00');
    const start = new Date(newStart + 'T00:00:00');
    if (end && !isNaN(oldStart.getTime()) && !isNaN(start.getTime())) {
      serviceEnd = toMMDDYYYY(new Date(end.getTime() + (start.getTime() - oldStart.getTime())));
    }
  }
  if (newDates.effectiveDate) {
    setAll(out, ['{{Effective Date}}', '{{effective_date}}', '{{effectiveDate}}', '{{Date}}', '{{date}}', '{{current_date}}', '{{today}}'],
      formatDateMMDDYYYY(newDates.effectiveDate));
  }
  if (newStart) setAll(out, START_DATE_KEYS, formatDateMMDDYYYY(newStart));
  if (serviceEnd) setAll(out, END_DATE_KEYS, serviceEnd);
  if (newDates.quoteExpiryDate) {
    const expiryLong = formatDateLongOrdinal(newDates.quoteExpiryDate);
    setAll(out, EXPIRY_LONG_KEYS, expiryLong);
    out[VALIDITY_LINE_KEY] = expiryLong ? `This quote is valid till ${expiryLong}` : '';
  }
  return out;
}

// The date text in the saved file now: old rebuilds never stored their new text, so the last one is replayed
export function printedTemplateValues(
  templateData: Record<string, string>,
  dateHistory: DateEditRecord[] | null | undefined
): Record<string, string> {
  const history = Array.isArray(dateHistory) ? dateHistory : [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (!entry) continue;
    if (entry.templateDataUpdated) return { ...templateData };
    if (entry.reRendered && entry.newDates) {
      return applyDatesLikeOldRebuild(templateData, entry.newDates, entry.oldDates ?? null);
    }
  }
  return { ...templateData };
}
