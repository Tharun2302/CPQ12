import type { ConfigurationData } from '../types/pricing';

/**
 * Returns the effective duration (in months) to use for quoting/templating.
 *
 * For Multi combination, duration can live in the nested configs OR in top-level duration
 * (when the quote was created with the sum already calculated).
 * We SUM all nested durations (messaging + content), or use top-level if nested are missing.
 */
export function getEffectiveDurationMonths(configuration?: ConfigurationData | null): number {
  if (!configuration) return 0;

  const top = Number(configuration.duration || 0);
  if (configuration.migrationType !== 'Multi combination') return top;

  const msg = Number(configuration.messagingConfig?.duration || 0);
  const content = Number(configuration.contentConfig?.duration || 0);
  const nestedSum = msg + content;

  // For Multi combination:
  // If nested configs exist, use their sum
  // Otherwise use top-level duration (for quotes created with sum already calculated)
  return nestedSum > 0 ? nestedSum : top;
}

export function formatMonths(durationMonths: number): string {
  const d = Number(durationMonths || 0);
  return `${d} Month${d === 1 ? '' : 's'}`;
}


