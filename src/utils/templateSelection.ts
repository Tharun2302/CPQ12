import type { ConfigurationData } from '../types/pricing';
import { isBuiltInManageStandalone, manageTemplateLookupValue } from './manageStandaloneOption';

type TemplateChoiceFields = Pick<
  ConfigurationData,
  'servicePlan' | 'migrationType' | 'combination' | 'manageAgreementLabel'
>;

/** The value an agreement template is chosen by; empty while nothing is picked yet. */
export function templateSelectionKey(config?: Partial<TemplateChoiceFields> | null): string {
  if (!config) return '';
  // Manage stores the agreement in migrationType because its combination is always 'manage-standalone'.
  const value = config.servicePlan === 'Manage' ? config.migrationType : config.combination;
  return String(value || '').trim().toLowerCase();
}

/** The combination a selected template must match; built-in Manage Standalone resolves via its catalog row. */
export function effectiveTemplateKey(
  config: Partial<TemplateChoiceFields> | null | undefined,
  combinations: Array<{ value?: string; label?: string; migrationType?: string; hasFile?: boolean }>
): string {
  if (config?.servicePlan === 'Manage') return manageTemplateLookupValue(config, combinations);
  return templateSelectionKey(config);
}

/** True when the selected template belongs to a different plan or agreement than the new configuration. */
export function templateChoiceChanged(
  previous: Partial<TemplateChoiceFields> | null | undefined,
  next: Partial<TemplateChoiceFields>
): boolean {
  if (!previous) return false;
  const planOf = (config: Partial<TemplateChoiceFields>) => config.servicePlan || 'Migrate';
  return planOf(previous) !== planOf(next)
    || templateSelectionKey(previous) !== templateSelectionKey(next)
    // Built-in Manage Standalone and "Select Combination" share an empty key but not a template.
    || isBuiltInManageStandalone(previous) !== isBuiltInManageStandalone(next);
}
