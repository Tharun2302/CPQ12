import type { ConfigurationData } from '../types/pricing';
import { selectedMigrateKinds, type MigrateKind } from './migrateSelection';

// Same wording as the Migrate options on the Configure page
const MIGRATE_KIND_LABELS: Record<MigrateKind, string> = {
  multi: 'Multi-Combination',
  overage: 'Overage-Agreement',
  sprawl: 'Data Sprawl',
  diy: 'DIY',
};

const MAX_LABEL_LENGTH = 150;

// The combination shown to approvers: every ticked Migrate option, else the agreement's own name.
export function approvalCombinationLabel(
  config: ConfigurationData | undefined | null,
  agreementDisplayName: string | undefined | null,
): string {
  const kinds = selectedMigrateKinds(config);
  // A single Data Sprawl keeps the agreement name, which says Standalone or MANAGE + Sprawl
  const useKinds = kinds.length > 1 || (kinds.length === 1 && kinds[0] !== 'sprawl');
  const label = useKinds
    ? kinds.map((kind) => MIGRATE_KIND_LABELS[kind]).join(' + ')
    : String(agreementDisplayName || '').trim();
  return label === 'Selected Template' ? '' : label.slice(0, MAX_LABEL_LENGTH);
}
