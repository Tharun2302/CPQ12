import { describe, it, expect } from 'vitest';
import { longestRowDuration, parseRowDurationMonths, withRowDuration } from '../../src/utils/rowDuration';
import { SERVICE_TERM_MAX_MONTHS } from '../../src/utils/serviceTerm';
import type { ConfigurationData } from '../../src/types/pricing';

const row = (duration: number) => ({ exhibitId: `x${duration}`, exhibitName: 'X', numberOfUsers: 1, instanceType: 'Small', numberOfInstances: 1, duration });

describe('parseRowDurationMonths', () => {
  it('reads whole months', () => {
    expect(parseRowDurationMonths('6')).toBe(6);
    expect(parseRowDurationMonths('2.7')).toBe(2);
  });

  it('turns empty, non-numeric and negative input into 0', () => {
    expect(parseRowDurationMonths('')).toBe(0);
    expect(parseRowDurationMonths('abc')).toBe(0);
    expect(parseRowDurationMonths('-5')).toBe(0);
  });

  it('caps at the service-term maximum', () => {
    expect(parseRowDurationMonths(String(SERVICE_TERM_MAX_MONTHS))).toBe(SERVICE_TERM_MAX_MONTHS);
    expect(parseRowDurationMonths('999999')).toBe(SERVICE_TERM_MAX_MONTHS);
  });
});

describe('withRowDuration', () => {
  const config = {
    migrationType: 'Multi combination',
    duration: 6,
    contentConfigs: [row(3), row(6)],
    emailConfigs: [row(2)],
  } as unknown as ConfigurationData;

  it('sets one row and makes the top-level duration the longest row', () => {
    const next = withRowDuration(config, 'contentConfigs', 1, 4);
    expect(next.contentConfigs?.map(c => c.duration)).toEqual([3, 4]);
    expect(next.emailConfigs?.[0].duration).toBe(2);
    expect(next.duration).toBe(4);
  });

  it('drops the top-level duration to 0 when every row is cleared', () => {
    let next = withRowDuration(config, 'contentConfigs', 0, 0);
    next = withRowDuration(next, 'contentConfigs', 1, 0);
    next = withRowDuration(next, 'emailConfigs', 0, 0);
    expect(next.duration).toBe(0);
    expect(longestRowDuration(next)).toBe(0);
  });

  it('leaves the original config untouched', () => {
    withRowDuration(config, 'contentConfigs', 0, 9);
    expect(config.contentConfigs?.[0].duration).toBe(3);
    expect(config.duration).toBe(6);
  });
});
