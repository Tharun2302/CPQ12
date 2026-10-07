import type { ConfigurationData } from '../types/pricing';
import { isDataSprawlSelected } from './dataSprawlOption';
import { isManageSaasConfig, MANAGE_SAAS_BILLING_MONTHS } from './pricing';

export const MANAGE_FREE_TRIAL_MONTHS = 3;
export const SERVICE_TERM_MIN_MONTHS = 1;
export const SERVICE_TERM_MAX_MONTHS = 60;
// Prefilled for Manage Standalone and assumed for sessions saved before it had a Duration field.
export const MANAGE_STANDALONE_DEFAULT_TERM_MONTHS = MANAGE_SAAS_BILLING_MONTHS;

export interface ServiceTerm {
  months: number;
  label: string;
}

const monthsLabel = (months: number): string => `${months}-Month${months === 1 ? '' : 's'}`;

export function isValidServiceTermMonths(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= SERVICE_TERM_MIN_MONTHS
    && value <= SERVICE_TERM_MAX_MONTHS;
}

// Data Sprawl quotes saved before the Duration field existed keep the free trial term.
export function resolveServiceTerm(config: ConfigurationData | undefined | null, migrateMonths: number): ServiceTerm {
  if (config?.servicePlan !== 'Manage') {
    const months = migrateMonths || 0;
    return { months, label: monthsLabel(months) };
  }
  if (isDataSprawlSelected(config) && isValidServiceTermMonths(config.serviceTermMonths)) {
    return { months: config.serviceTermMonths, label: monthsLabel(config.serviceTermMonths) };
  }
  // Older Manage Standalone sessions and quotes predate its Duration field and ran for the billed year.
  if (isManageSaasConfig(config)) {
    const months = isValidServiceTermMonths(config.serviceTermMonths)
      ? config.serviceTermMonths
      : MANAGE_STANDALONE_DEFAULT_TERM_MONTHS;
    return { months, label: monthsLabel(months) };
  }
  return { months: MANAGE_FREE_TRIAL_MONTHS, label: `${MANAGE_FREE_TRIAL_MONTHS}-Month Free Trial` };
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: CalendarDate) => `${d.year}-${pad(d.month + 1)}-${pad(d.day)}`;

// Calendar fields only, so the result never depends on the viewer's timezone.
function parseCalendarDate(value: string): CalendarDate | null {
  // A stored ISO timestamp keeps its written date; reading it in local time could move it a day.
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value.trim());
  if (iso) {
    const [year, month, day] = [Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])];
    if (month < 0 || month > 11 || day < 1 || day > daysInMonth(year, month)) return null;
    return { year, month, day };
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
}

function termEnd(start: CalendarDate, months: number): CalendarDate {
  const total = start.month + months;
  const year = start.year + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = daysInMonth(year, month);
  // No anniversary day in a short month (e.g. 31 Jan + 1): the term runs to that month's last day.
  if (start.day > lastDay) return { year, month, day: lastDay };
  const anniversary = new Date(year, month, start.day - 1);
  return { year: anniversary.getFullYear(), month: anniversary.getMonth(), day: anniversary.getDate() };
}

/** Last day of a term of `months` from `startDate`: the day before the monthly anniversary, as yyyy-mm-dd. */
export function serviceTermEndDate(startDate: string | undefined | null, months: number): string | null {
  if (!startDate || !months) return null;
  const start = parseCalendarDate(startDate);
  return start ? toIso(termEnd(start, months)) : null;
}

/** Whole months a term from `startDate` to `endDate` (inclusive) spans; null when either date is unusable. */
export function serviceTermMonthsBetween(startDate: string | undefined | null, endDate: string | null): number | null {
  const start = startDate ? parseCalendarDate(startDate) : null;
  const end = endDate ? parseCalendarDate(endDate) : null;
  if (!start || !end) return null;
  const endIso = toIso(end);
  let months = (end.year - start.year) * 12 + (end.month - start.month);
  while (months > 0 && toIso(termEnd(start, months)) > endIso) months -= 1;
  while (toIso(termEnd(start, months + 1)) <= endIso) months += 1;
  return months > 0 ? months : null;
}

export interface ServiceTermTokens {
  endDate: string | null;
  label: string;
}

/** End date and label printed on the agreement; Manage Standalone's label is read back from its dates. */
export function serviceTermTokens(
  config: ConfigurationData | undefined | null,
  migrateMonths: number
): ServiceTermTokens {
  const term = resolveServiceTerm(config, migrateMonths);
  const endDate = serviceTermEndDate(config?.startDate, term.months);
  if (!isManageSaasConfig(config)) {
    return { endDate, label: term.label };
  }
  const spanned = serviceTermMonthsBetween(config?.startDate, endDate);
  return { endDate, label: monthsLabel(spanned ?? term.months) };
}
