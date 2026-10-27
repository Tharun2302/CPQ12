import type { ConfigurationData, DiyWorkload } from '../types/pricing';
import { DIY_MIN_LICENSES, DIY_VALIDITY_MONTHS, diyPricingFromConfig, formatCurrency, isDiyConfig } from './pricing';

// The SOW names workloads as the customer knows them, Content first.
const SOW_WORKLOAD_NAMES: [DiyWorkload, string][] = [['Content', 'Content'], ['Mailbox', 'Email'], ['Messages', 'Chat']];
const COUNT_WORDS = ['', 'One', 'Two', 'Three'];

// "Three Workloads (Content + Email + Chat)"
function sowWorkloadsText(workloads: DiyWorkload[]): string {
  const names = SOW_WORKLOAD_NAMES.filter(([w]) => workloads.includes(w)).map(([, name]) => name);
  if (!names.length) return '';
  return `${COUNT_WORDS[names.length]} Workload${names.length === 1 ? '' : 's'} (${names.join(' + ')})`;
}

// "$45" rather than "$45.00": the DIY rates are whole dollars.
const wholeDollars = (n: number): string => `$${n.toLocaleString('en-US')}`;

// Agreement tokens for a Migrate DIY quote; empty for every other agreement.
// The quote bills licences, not users, so the generic per-user tokens are overridden to read
// "licences x rate = users cost" even when the 50 minimum or extra data licences apply.
export function diyTemplateTokens(config: ConfigurationData | undefined | null): Record<string, string> {
  if (!isDiyConfig(config)) return {};
  const diy = diyPricingFromConfig(config);
  const workloads = diy.workloads.join(' + ');
  const description = `${diy.licenses} Licenses - ${workloads} (${DIY_VALIDITY_MONTHS} Months)`;
  return {
    '{{diy_workloads}}': workloads,
    '{{diy_workload_count}}': String(diy.workloads.length),
    '{{diy_workloads_text}}': sowWorkloadsText(diy.workloads),
    '{{diy_rate_text}}': diy.ratePerLicense ? `(${wholeDollars(diy.ratePerLicense)} per license)` : '',
    '{{diy_users}}': String(diy.users),
    '{{diy_licenses}}': String(diy.licenses),
    '{{diy_rate}}': formatCurrency(diy.ratePerLicense),
    '{{diy_data_gb}}': String(diy.dataGB),
    '{{diy_data_allowance_gb}}': String(diy.licenses * diy.gbPerLicense),
    '{{diy_extra_licenses}}': String(diy.dataOverageLicenses),
    '{{diy_minimum_licenses}}': String(DIY_MIN_LICENSES),
    '{{diy_minimum_note}}': diy.belowMinimum ? `Minimum purchase is ${DIY_MIN_LICENSES} licenses.` : '',
    '{{diy_validity_months}}': String(DIY_VALIDITY_MONTHS),
    '{{diy_description}}': description,
    '{{diy_total}}': formatCurrency(diy.totalCost),
    '{{users_count}}': String(diy.licenses),
    '{{per_user_cost}}': formatCurrency(diy.ratePerLicense),
    '{{user_description}}': description
  };
}
