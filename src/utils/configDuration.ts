import type { ConfigurationData } from '../types/pricing';

/**
 * Returns the effective duration (in months) to use for quoting/templating.
 *
 * For Multi combination, duration can live in nested configs (either the legacy single
 * `messagingConfig/contentConfig` OR the newer `messagingConfigs/contentConfigs` arrays),
 * and sometimes in top-level `duration`.
 *
 * For Multi combination, we SUM durations across categories (Messaging + Content [+ Email]),
 * using the maximum duration within each category. Falls back to top-level duration if nested
 * durations are missing.
 */
export function getEffectiveDurationMonths(configuration?: ConfigurationData | null): number {
  if (!configuration) return 0;

  const top = Number(configuration.duration || 0);
  if (configuration.migrationType !== 'Multi combination') return top;

  const msgDurations: number[] = [Number(configuration.messagingConfig?.duration || 0)];
  const contentDurations: number[] = [Number(configuration.contentConfig?.duration || 0)];
  const emailDurations: number[] = [];

  // Newer shape (arrays)
  for (const cfg of configuration.messagingConfigs || []) {
    msgDurations.push(Number(cfg?.duration || 0));
  }
  for (const cfg of configuration.contentConfigs || []) {
    contentDurations.push(Number(cfg?.duration || 0));
  }
  for (const cfg of configuration.emailConfigs || []) {
    emailDurations.push(Number(cfg?.duration || 0));
  }

  const msgMax = Math.max(0, ...msgDurations);
  const contentMax = Math.max(0, ...contentDurations);
  const emailMax = Math.max(0, ...emailDurations);

  const nestedSum = msgMax + contentMax + emailMax;

  // For Multi combination:
  // If nested configs exist, use their sum; otherwise use top-level duration.
  return nestedSum > 0 ? nestedSum : top;
}

export function formatMonths(durationMonths: number): string {
  const d = Number(durationMonths || 0);
  return `${d} Month${d === 1 ? '' : 's'}`;
}


