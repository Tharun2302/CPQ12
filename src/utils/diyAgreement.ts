import type { ConfigurationData, DiyWorkload } from '../types/pricing';
import { DIY_GB_PER_LICENSE_PER_WORKLOAD, DIY_MIN_LICENSES, DIY_RATE_BY_WORKLOAD_COUNT, DIY_VALIDITY_MONTHS, diyPricingFromConfig, formatCurrency, isDiyConfig } from './pricing';

// The SOW names workloads as the customer knows them, Content first.
const SOW_WORKLOAD_NAMES: [DiyWorkload, string][] = [['Content', 'Content'], ['Mailbox', 'Email'], ['Messages', 'Chat']];
const COUNT_WORDS = ['', 'One', 'Two', 'Three'];

// "Three Workloads (Content + Email + Chat)"
function sowWorkloadsText(workloads: DiyWorkload[]): string {
  const names = SOW_WORKLOAD_NAMES.filter(([w]) => workloads.includes(w)).map(([, name]) => name);
  if (!names.length) return '';
  return `${COUNT_WORDS[names.length]} Workload${names.length === 1 ? '' : 's'} (${names.join(' + ')})`;
}

// DIY values are empty on purpose (an empty flag hides its {{#…}} row and shows its {{^…}} row),
// so the "fill empty tokens with a fallback" passes must skip them. A fallback like the client's
// email in {{diy_email_included}} would print the wrong row.
export const isDiyToken = (key: string): boolean => key.trim().toLowerCase().startsWith('{{diy_');

// "$45" rather than "$45.00": the DIY rates are whole dollars.
const wholeDollars = (n: number): string => `$${n.toLocaleString('en-US')}`;

// "($20 + $15)": each workload's step in the tiered rate; empty for a single workload.
function rateBreakdownText(count: number): string {
  if (count < 2) return '';
  const steps = [1, 2, 3].slice(0, count).map(n =>
    DIY_RATE_BY_WORKLOAD_COUNT[n as 1 | 2 | 3] - (n > 1 ? DIY_RATE_BY_WORKLOAD_COUNT[(n - 1) as 1 | 2] : 0));
  return `(${steps.map(wholeDollars).join(' + ')})`;
}

const WORKLOAD_TOKEN_KEYS: [DiyWorkload, string][] = [['Content', 'content'], ['Mailbox', 'email'], ['Messages', 'messages']];

// "What's Included in Your License" rows. diy_<key>_included is 'true' or '' so the template
// can wrap a styled INCLUDED row in {{#…}} and a styled add-on row in {{^…}}.
function workloadRowTokens(workloads: DiyWorkload[]): Record<string, string> {
  const count = workloads.length as 0 | 1 | 2 | 3;
  // An add-on costs the step to the next tier: $15 on top of one workload, $10 on top of two.
  const addOnRate = count >= 1 && count < 3 ? DIY_RATE_BY_WORKLOAD_COUNT[(count + 1) as 2 | 3] - DIY_RATE_BY_WORKLOAD_COUNT[count as 1 | 2] : 0;
  const tokens: Record<string, string> = {};
  for (const [w, key] of WORKLOAD_TOKEN_KEYS) {
    const included = workloads.includes(w);
    const allowance = w === 'Messages' ? 'No data cap' : `${DIY_GB_PER_LICENSE_PER_WORKLOAD} GB per user`;
    tokens[`{{diy_${key}_included}}`] = included ? 'true' : '';
    tokens[`{{diy_${key}_status}}`] = included ? 'INCLUDED' : 'OPTIONAL ADD-ON';
    tokens[`{{diy_${key}_allowance}}`] = included ? allowance : addOnRate ? `Add for ${wholeDollars(addOnRate)} per user` : '';
  }
  return tokens;
}

// License Terms "Data allowance" cell, e.g. "Up to 50 GB per user for Content and up to 50 GB per user for Email (Mailbox)".
function dataAllowanceText(workloads: DiyWorkload[]): string {
  const capped = ([['Content', 'Content'], ['Mailbox', 'Email (Mailbox)']] as [DiyWorkload, string][])
    .filter(([w]) => workloads.includes(w))
    .map(([, name]) => `up to ${DIY_GB_PER_LICENSE_PER_WORKLOAD} GB per user for ${name}`);
  const parts = [capped.join(' and ')].filter(Boolean);
  if (workloads.includes('Messages')) parts.push('no data cap for Messages');
  const text = parts.join('; ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// "Add More Workloads, Save More" table: what the billed licences cost at each tier, against
// buying every workload as its own single-workload licence.
function savingsTableTokens(licenses: number, workloadCount: number): Record<string, string> {
  const single = DIY_RATE_BY_WORKLOAD_COUNT[1];
  const tokens: Record<string, string> = { '{{diy_tier_licenses}}': licenses.toLocaleString('en-US') };
  for (const n of [1, 2, 3] as const) {
    const total = licenses * DIY_RATE_BY_WORKLOAD_COUNT[n];
    const separate = licenses * single * n;
    const saved = separate - total;
    const percent = Number(((saved / (single * n * (licenses || 1))) * 100).toFixed(1));
    tokens[`{{diy_tier${n}_total}}`] = wholeDollars(total);
    tokens[`{{diy_tier${n}_separate}}`] = wholeDollars(separate);
    tokens[`{{diy_tier${n}_save}}`] = saved > 0 ? `${wholeDollars(saved)} (${percent}%)` : '–';
    tokens[`{{diy_tier${n}_saved}}`] = wholeDollars(saved);
    tokens[`{{diy_tier${n}_current}}`] = n === workloadCount ? '(current plan)' : '';
  }
  return tokens;
}

// Name, and what the upgrade box says it migrates, per workload.
const ADD_ON_NAMES: [DiyWorkload, string, string][] = [
  ['Content', 'Content', 'files, folders and sites'],
  ['Mailbox', 'Email', 'mailboxes, calendars and contacts'],
  ['Messages', 'Messages', 'channels, DMs, group chats and file attachments']
];

// "content and email", "content, email and messages"
const listInWords = (names: string[]): string =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');

// "Recommended upgrade" box and "Optional Add-On" table: every unlicensed workload offered
// together as one upgrade to the full three-workload rate, added (undiscounted) to the Total
// Price printed above it. Runs after discount and custom line items so `totalPriceText` is final.
export function diyAddOnTokens(config: ConfigurationData | undefined | null, totalPriceText: string | undefined): Record<string, string> {
  if (!isDiyConfig(config)) return {};
  const diy = diyPricingFromConfig(config);
  const missing = ADD_ON_NAMES.filter(([w]) => !diy.workloads.includes(w));
  const current = ADD_ON_NAMES.filter(([w]) => diy.workloads.includes(w));
  const names = missing.map(([, name]) => name);
  const fullRate = DIY_RATE_BY_WORKLOAD_COUNT[3];
  const addOnRate = fullRate - diy.ratePerLicense;
  const addOnPrice = diy.licenses * addOnRate;
  const parsed = parseFloat(String(totalPriceText || '').replace(/[^0-9.-]/g, ''));
  const totalPrice = Number.isFinite(parsed) ? parsed : diy.totalCost;
  const tokens: Record<string, string> = {
    '{{diy_has_addon}}': 'true',
    '{{diy_upgrade_heading}}': `RECOMMENDED UPGRADE: ADD THE ${names.join(' + ').toUpperCase()} WORKLOAD${names.length > 1 ? 'S' : ''}`,
    '{{diy_addon_names}}': names.join(' + '),
    '{{diy_addon_benefit}}': missing.map(([, , benefit]) => benefit).join(' plus '),
    '{{diy_current_names}}': listInWords(current.map(([, name]) => name.toLowerCase())),
    '{{diy_addon_rate_whole}}': wholeDollars(addOnRate),
    '{{diy_addon_price_whole}}': wholeDollars(addOnPrice),
    '{{diy_current_effective_rate}}': diy.workloads.length ? formatCurrency(diy.ratePerLicense / diy.workloads.length) : '',
    '{{diy_addon_description}}': `${names.join(' + ')} Workload Add-On`,
    '{{diy_addon_upgrade_text}}': `upgrades plan to 3 workloads (${wholeDollars(fullRate)} per license)`,
    '{{diy_addon_licenses}}': String(diy.licenses),
    '{{diy_addon_rate}}': formatCurrency(addOnRate),
    '{{diy_addon_price}}': formatCurrency(addOnPrice),
    '{{diy_total_with_addon_breakdown}}': `(${formatCurrency(totalPrice)} + ${formatCurrency(addOnPrice)})`,
    '{{diy_total_with_addon}}': formatCurrency(totalPrice + addOnPrice)
  };
  // Nothing left to sell (or nothing priced yet): blank every token so the wrapped section hides.
  if (!diy.licenses || !missing.length) {
    return Object.fromEntries(Object.keys(tokens).map(k => [k, '']));
  }
  return tokens;
}

// Agreement tokens for a Migrate DIY quote; empty for every other agreement.
// The quote bills licences, not users, so the generic per-user tokens are overridden to read
// "licences x rate = users cost" even when the 50 minimum or extra data licences apply.
export function diyTemplateTokens(config: ConfigurationData | undefined | null): Record<string, string> {
  if (!isDiyConfig(config)) return {};
  const diy = diyPricingFromConfig(config);
  const workloads = diy.workloads.join(' + ');
  const description = `${diy.licenses} Licenses - ${workloads} (${DIY_VALIDITY_MONTHS} Months)`;
  return {
    ...workloadRowTokens(diy.workloads),
    ...savingsTableTokens(diy.licenses, diy.workloads.length),
    '{{diy_workloads}}': workloads,
    '{{diy_workload_count}}': String(diy.workloads.length),
    '{{diy_workloads_text}}': sowWorkloadsText(diy.workloads),
    // The same text split over two lines: "Two Workloads" / "Content + Email".
    '{{diy_workload_count_text}}': sowWorkloadsText(diy.workloads).replace(/ \(.*\)$/, ''),
    '{{diy_workload_names}}': SOW_WORKLOAD_NAMES.filter(([w]) => diy.workloads.includes(w)).map(([, name]) => name).join(' + '),
    '{{diy_rate_breakdown}}': rateBreakdownText(diy.workloads.length),
    '{{diy_rate_text}}': diy.ratePerLicense ? `(${wholeDollars(diy.ratePerLicense)} per license)` : '',
    '{{diy_users}}': String(diy.users),
    '{{diy_licenses}}': String(diy.licenses),
    '{{diy_rate}}': formatCurrency(diy.ratePerLicense),
    '{{diy_data_gb}}': String(diy.dataGB),
    '{{diy_data_allowance_gb}}': String(diy.licenses * diy.gbPerLicense),
    '{{diy_data_allowance_text}}': dataAllowanceText(diy.workloads),
    '{{diy_extra_licenses}}': String(diy.dataOverageLicenses),
    '{{diy_minimum_licenses}}': String(DIY_MIN_LICENSES),
    '{{diy_minimum_note}}': diy.belowMinimum ? `Minimum purchase is ${DIY_MIN_LICENSES} licenses.` : '',
    '{{diy_validity_months}}': String(DIY_VALIDITY_MONTHS),
    '{{diy_description}}': description,
    '{{diy_license_cost}}': formatCurrency(diy.licenseCost),
    // Wraps the optional consulting row/section: {{#diy_has_consulting}}…{{/diy_has_consulting}}
    '{{diy_has_consulting}}': diy.consultingHours ? 'true' : '',
    '{{diy_consulting_hours}}': diy.consultingHours ? `${diy.consultingHours} hours` : '',
    // Title case for the "Migration Consulting Services – 40 Hours" heading.
    '{{diy_consulting_hours_title}}': diy.consultingHours ? `${diy.consultingHours} Hours` : '',
    '{{diy_consulting_rate}}': diy.consultingHours ? `${formatCurrency(diy.consultingRatePerHour)} per hour` : '',
    '{{diy_consulting_cost}}': diy.consultingHours ? formatCurrency(diy.consultingCost) : '',
    '{{diy_total}}': formatCurrency(diy.totalCost),
    '{{users_count}}': String(diy.licenses),
    '{{per_user_cost}}': formatCurrency(diy.ratePerLicense),
    '{{user_description}}': description
  };
}
