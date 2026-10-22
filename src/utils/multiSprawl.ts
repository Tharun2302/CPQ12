import type { ConfigurationData } from '../types/pricing';
import { hasSprawlConfigs, isMultiWithSprawl, multiSprawlLines, withSprawlConfigs } from './pricing';
import { sprawlGroupsIssue } from './sprawlGroups';
import { buildSprawlAgreementData } from './sprawlAgreement';

export interface MultiSprawlLineItem {
  name: string;
  description: string;
  price: string;
}

// Submit-only check for Data Sprawl ticked with Multi combination. No term check: it shares the
// migration's Duration (Months), which the Multi rows already require.
export function multiSprawlIssue(config: ConfigurationData | undefined | null): string | null {
  if (!config || !isMultiWithSprawl(config)) return null;
  if (!hasSprawlConfigs(config)) return 'Please select at least one Data Sprawl exhibit';
  return sprawlGroupsIssue(config);
}

// The Multi template has no sprawl loop, so these rows are injected into its pricing table,
// worded exactly as the Data Sprawl agreement words them.
export function multiSprawlLineItems(config: ConfigurationData | undefined | null): MultiSprawlLineItem[] {
  if (!config || multiSprawlLines(config).length === 0) return [];
  return buildSprawlAgreementData(config).rows.map(row => ({
    name: row.sprawlJobRequirement,
    description: row.sprawlLabel,
    price: row.sprawlPrice
  }));
}

// Every way out of Multi combination (or turning the toggle off) drops the sprawl part with it.
export function withoutMultiSprawl(config: ConfigurationData): ConfigurationData {
  const cleared = withSprawlConfigs(config, []);
  return {
    ...cleared,
    includeDataSprawl: false,
    dataSprawlExhibitIds: [],
    dataSprawlCombination: '',
    serviceTermMonths: config.servicePlan === 'Manage' ? config.serviceTermMonths : undefined
  };
}

export function withMultiSprawl(config: ConfigurationData, sprawlCombination: string): ConfigurationData {
  return {
    ...withSprawlConfigs(config, []),
    includeDataSprawl: true,
    dataSprawlExhibitIds: [],
    dataSprawlCombination: sprawlCombination,
    serviceTermMonths: undefined
  };
}
