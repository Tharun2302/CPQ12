import type { ConfigurationData } from '../types/pricing';
import { withSprawlConfigs } from './pricing';
import { MANAGE_STANDALONE_DEFAULT_TERM_MONTHS } from './serviceTerm';

export const MANAGE_STANDALONE_LABEL = 'Manage Standalone';

interface CatalogRow {
  value?: string;
  label?: string;
  migrationType?: string;
  hasFile?: boolean;
}

type StandaloneFields = Pick<ConfigurationData, 'servicePlan' | 'migrationType' | 'manageAgreementLabel'>;

export function isManageStandaloneLabel(label: string | undefined | null): boolean {
  return String(label || '').trim().toLowerCase() === MANAGE_STANDALONE_LABEL.toLowerCase();
}

// A row with this label only carries the built-in option's template, so it is not listed twice.
export function isManageStandaloneCatalogRow(row: CatalogRow): boolean {
  return row.migrationType === 'Manage' && isManageStandaloneLabel(row.label);
}

export function isBuiltInManageStandalone(config?: Partial<StandaloneFields> | null): boolean {
  return config?.servicePlan === 'Manage'
    && !String(config.migrationType || '').trim()
    && isManageStandaloneLabel(config.manageAgreementLabel);
}

// The built-in option keeps migrationType '' for SaaS pricing, so its template is found by row label.
export function manageTemplateLookupValue(
  config: Partial<StandaloneFields> | null | undefined,
  combinations: CatalogRow[]
): string {
  if (!isBuiltInManageStandalone(config)) {
    return String(config?.migrationType || '').trim().toLowerCase();
  }
  const rows = (combinations || []).filter(isManageStandaloneCatalogRow);
  const row = rows.find(r => r.hasFile) || rows[0];
  return String(row?.value || '').trim().toLowerCase();
}

const normalizedValue = (value: unknown) => String(value || '').trim().toLowerCase();

// Sessions saved while the row was listed priced it as an agreement, so map them to the built-in option.
export function normalizeLegacyManageStandalone<T extends ConfigurationData | undefined>(
  config: T,
  catalog: CatalogRow[] | null | undefined
): T {
  if (!config || config.servicePlan !== 'Manage' || !config.migrationType) return config;
  const current = normalizedValue(config.migrationType);
  const row = (catalog || []).find(c => normalizedValue(c.value) === current);
  if (!row || !isManageStandaloneCatalogRow(row)) return config;
  // The built-in option starts with no exhibits, matching a fresh selection from the dropdown.
  return withSprawlConfigs({
    ...config,
    migrationType: '' as ConfigurationData['migrationType'],
    manageAgreementLabel: MANAGE_STANDALONE_LABEL,
    manageRequiresUsers: true,
    serviceTermMonths: MANAGE_STANDALONE_DEFAULT_TERM_MONTHS,
    messagingConfigs: [],
    contentConfigs: [],
    emailConfigs: [],
  }, []) as T;
}

/** Built-in Manage Standalone sessions saved before its Duration field existed get the default term. */
export function withDefaultStandaloneTerm<T extends ConfigurationData | undefined>(config: T): T {
  if (!config || !isBuiltInManageStandalone(config) || config.serviceTermMonths !== undefined) return config;
  return { ...config, serviceTermMonths: MANAGE_STANDALONE_DEFAULT_TERM_MONTHS };
}
