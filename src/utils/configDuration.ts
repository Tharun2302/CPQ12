import type { ConfigurationData } from '../types/pricing';

/**
 * Returns the effective duration (in months) to use for quoting/templating.
 *
 * For Multi combination, duration can live in nested configs (either the legacy single
 * `messagingConfig/contentConfig` OR the newer `messagingConfigs/contentConfigs` arrays),
 * and sometimes in top-level `duration`.
 *
 * For Multi combination, we SUM durations across ALL selected exhibit configs
 * (Messaging + Content + Email), across every per-combination entry. Falls back to top-level
 * duration if nested durations are missing.
 */
export function getEffectiveDurationMonths(configuration?: ConfigurationData | null): number {
  if (!configuration) return 0;

  const top = Number(configuration.duration || 0);
  if (configuration.migrationType !== 'Multi combination') return top;

  const sum = (nums: number[]) => nums.reduce((acc, n) => acc + (Number.isFinite(n) ? n : 0), 0);

  // Newer shape (arrays): sum across every per-combination config
  const msgArraySum = sum((configuration.messagingConfigs || []).map((c) => Number(c?.duration || 0)));
  const contentArraySum = sum((configuration.contentConfigs || []).map((c) => Number(c?.duration || 0)));
  const emailArraySum = sum((configuration.emailConfigs || []).map((c) => Number(c?.duration || 0)));

  const arrayTotal = msgArraySum + contentArraySum + emailArraySum;

  // Legacy single-config fallback
  const legacyTotal =
    Number(configuration.messagingConfig?.duration || 0) +
    Number(configuration.contentConfig?.duration || 0) +
    Number((configuration as any).emailConfig?.duration || 0);

  // For Multi combination:
  // If nested configs exist, use their sum; otherwise use top-level duration.
  if (arrayTotal > 0) return arrayTotal;
  if (legacyTotal > 0) return legacyTotal;
  return top;
}

export function formatMonths(durationMonths: number): string {
  const d = Number(durationMonths || 0);
  return `${d} Month${d === 1 ? '' : 's'}`;
}


