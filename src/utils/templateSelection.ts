import type { ConfigurationData } from '../types/pricing';

type TemplateChoiceFields = Pick<ConfigurationData, 'servicePlan' | 'migrationType' | 'combination'>;

/** The value an agreement template is chosen by; empty while nothing is picked yet. */
export function templateSelectionKey(config?: Partial<TemplateChoiceFields> | null): string {
  if (!config) return '';
  // Manage stores the agreement in migrationType because its combination is always 'manage-standalone'.
  const value = config.servicePlan === 'Manage' ? config.migrationType : config.combination;
  return String(value || '').trim().toLowerCase();
}

/** True when the selected template belongs to a different plan or agreement than the new configuration. */
export function templateChoiceChanged(
  previous: Partial<TemplateChoiceFields> | null | undefined,
  next: Partial<TemplateChoiceFields>
): boolean {
  if (!previous) return false;
  const planOf = (config: Partial<TemplateChoiceFields>) => config.servicePlan || 'Migrate';
  return planOf(previous) !== planOf(next) || templateSelectionKey(previous) !== templateSelectionKey(next);
}
