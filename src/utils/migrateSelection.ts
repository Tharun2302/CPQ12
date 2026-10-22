import type { ConfigurationData } from '../types/pricing';
import { acceptsOverageAddOn, formatCurrency, hasOverageAddOn, isMultiWithSprawl, overageAddOnCost, sharedMigrateDuration } from './pricing';
import { isDataSprawlSelected } from './dataSprawlOption';
import { isOverageAgreement } from './exhibitCombination';
import { multiSprawlLineItems, type MultiSprawlLineItem } from './multiSprawl';

// The Migrate list lets these three be ticked together; one option per kind.
export type MigrateKind = 'multi' | 'overage' | 'sprawl';

export type OverageAddOn = NonNullable<ConfigurationData['overageAddOn']>;

// Starts at 0, never 1: a seeded instance would be a silent charge.
export const EMPTY_OVERAGE_ADD_ON: OverageAddOn = { instanceType: 'Small', numberOfInstances: 0 };

export function selectedMigrateKinds(config: ConfigurationData | undefined | null): MigrateKind[] {
  if (!config) return [];
  const kinds: MigrateKind[] = [];
  if (config.migrationType === 'Multi combination' && config.servicePlan !== 'Manage') kinds.push('multi');
  if (isOverageAgreement(config) || hasOverageAddOn(config)) kinds.push('overage');
  if (isDataSprawlSelected(config) || isMultiWithSprawl(config)) kinds.push('sprawl');
  return kinds;
}

// The agreement the quote is built on; the other ticked options are added into it.
export function primaryMigrateKind(kinds: MigrateKind[]): MigrateKind | null {
  if (kinds.includes('multi')) return 'multi';
  if (kinds.includes('sprawl')) return 'sprawl';
  if (kinds.includes('overage')) return 'overage';
  return null;
}

export function overageAddOnIssue(config: ConfigurationData | undefined | null): string | null {
  if (!config || !hasOverageAddOn(config)) return null;
  if (!(config.overageAddOn!.numberOfInstances >= 1)) return 'Please enter the number of instances for the Overage Agreement';
  if (sharedMigrateDuration(config) < 1) return 'Please enter the Duration (Months)';
  return null;
}

export function overageLineItem(config: ConfigurationData | undefined | null): MultiSprawlLineItem | null {
  if (!config || !hasOverageAddOn(config)) return null;
  const { instanceType, numberOfInstances } = config.overageAddOn!;
  const duration = sharedMigrateDuration(config);
  const instances = `${numberOfInstances} Instance${numberOfInstances === 1 ? '' : 's'}`;
  const months = `${duration} Month${duration === 1 ? '' : 's'}`;
  return {
    name: 'Overage Agreement',
    description: `${instanceType} Instance Type | ${instances} | Valid for ${months}`,
    price: formatCurrency(overageAddOnCost(config))
  };
}

// Rows injected into the main agreement's pricing table for everything ticked alongside it.
export function migrateAddOnLineItems(config: ConfigurationData | undefined | null): MultiSprawlLineItem[] {
  const overage = overageLineItem(config);
  return [...multiSprawlLineItems(config), ...(overage ? [overage] : [])];
}

// A main agreement that cannot carry Overage drops a stale add-on rather than pricing it.
// Only the two Overage inputs are kept; a stored months value would compete with the shared Duration.
export function withOverageAddOn(config: ConfigurationData, addOn: OverageAddOn | undefined): ConfigurationData {
  return {
    ...config,
    overageAddOn: addOn && acceptsOverageAddOn(config)
      ? { instanceType: addOn.instanceType, numberOfInstances: addOn.numberOfInstances }
      : undefined
  };
}

// The Duration to keep when the main agreement changes, read as the old main agreement holds it.
export function durationToCarry(config: ConfigurationData, oldPrimary: MigrateKind | null): number {
  if (oldPrimary === 'overage') {
    const months = Math.floor(Number(config.duration));
    return Number.isFinite(months) && months > 0 ? months : 0;
  }
  return oldPrimary ? sharedMigrateDuration(config) : 0;
}

// Multi combination with Data Sprawl or Overage ticked: one Duration for every row of the quote.
export function isCombinedMulti(config: ConfigurationData | undefined | null): boolean {
  if (!config || config.migrationType !== 'Multi combination' || config.servicePlan === 'Manage') return false;
  return isMultiWithSprawl(config) || hasOverageAddOn(config);
}

// Sets that one Duration on every Multi row; each row still prices on its own months, now all equal.
export function withCommonDuration(config: ConfigurationData, months: number): ConfigurationData {
  const n = Math.max(0, Math.floor(Number(months) || 0));
  const set = <T extends { duration: number }>(rows: T[] | undefined): T[] => (rows || []).map(r => ({ ...r, duration: n }));
  return {
    ...config,
    duration: n,
    messagingConfigs: set(config.messagingConfigs),
    contentConfigs: set(config.contentConfigs),
    emailConfigs: set(config.emailConfigs)
  };
}
