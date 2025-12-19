import type { ConfigurationData } from '../types/pricing';

/**
 * Returns the effective duration (in months) to use for quoting/templating.
 *
 * For Multi combination, duration can live in nested configs (either the legacy single
 * `messagingConfig/contentConfig` OR the newer `messagingConfigs/contentConfigs` arrays),
 * and sometimes in top-level `duration`.
 *
 * We use the MAX duration across nested configs (messaging/content), falling back to top-level
 * if nested durations are missing.
 */
export function getEffectiveDurationMonths(configuration?: ConfigurationData | null): number {
  if (!configuration) return 0;

  const top = Number(configuration.duration || 0);
  if (configuration.migrationType !== 'Multi combination') return top;

  const durations: number[] = [];

  // Legacy shape
  durations.push(Number(configuration.messagingConfig?.duration || 0));
  durations.push(Number(configuration.contentConfig?.duration || 0));

  // Newer shape (arrays)
  for (const cfg of configuration.messagingConfigs || []) {
    durations.push(Number(cfg?.duration || 0));
  }
  for (const cfg of configuration.contentConfigs || []) {
    durations.push(Number(cfg?.duration || 0));
  }

  const nestedMax = Math.max(0, ...durations);

  // For Multi combination:
  // If nested configs exist, use their max duration; otherwise use top-level duration.
  return nestedMax > 0 ? nestedMax : top;
}

export function formatMonths(durationMonths: number): string {
  const d = Number(durationMonths || 0);
  return `${d} Month${d === 1 ? '' : 's'}`;
}


