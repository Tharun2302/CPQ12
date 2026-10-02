import { manageAgreementCard } from './pricing';
import type { ConfigurationData } from '../types/pricing';

// Listed under Migrate but saved as a Manage agreement, so pricing, exhibits and saved quotes are unchanged.
interface AgreementOption {
  value: string;
  label: string;
  migrationType?: string;
}

export function isDataSprawlOption(option: AgreementOption): boolean {
  return option.migrationType === 'Manage' && manageAgreementCard({
    servicePlan: 'Manage',
    manageAgreementLabel: option.label,
    migrationType: option.value
  } as ConfigurationData) === 'standalone';
}

export function isDataSprawlSelected(config: ConfigurationData | undefined): boolean {
  return manageAgreementCard(config) === 'standalone';
}

// The tab shown as active; config.servicePlan itself stays 'Manage' for Data-Sprawl.
export function displayedServicePlan(config: ConfigurationData): 'Migrate' | 'Manage' | 'Bundle' {
  if (isDataSprawlSelected(config)) return 'Migrate';
  return config.servicePlan || 'Migrate';
}
