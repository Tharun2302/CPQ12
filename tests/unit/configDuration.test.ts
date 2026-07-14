import { describe, it, expect } from 'vitest';
import { getEffectiveDurationMonths, formatMonths } from '../../src/utils/configDuration';
import type { ConfigurationData } from '../../src/types/pricing';

function makeConfig(overrides: Partial<ConfigurationData> = {}): ConfigurationData {
  return {
    numberOfUsers: 100,
    instanceType: 'Small',
    numberOfInstances: 1,
    duration: 5,
    migrationType: 'Messaging',
    dataSizeGB: 0,
    ...overrides,
  };
}

function makeExhibit(duration: number) {
  return {
    exhibitId: 'x',
    exhibitName: 'x',
    numberOfUsers: 10,
    instanceType: 'Small' as const,
    numberOfInstances: 1,
    duration,
    messages: 0,
    dataSizeGB: 0,
  };
}

describe('getEffectiveDurationMonths', () => {
  it('should return 0 for null or undefined configuration', () => {
    expect(getEffectiveDurationMonths(null)).toBe(0);
    expect(getEffectiveDurationMonths(undefined)).toBe(0);
  });

  it('should return the top-level duration for non-multi migration types', () => {
    // Arrange — nested configs must be ignored outside Multi combination
    const config = makeConfig({
      migrationType: 'Content',
      duration: 6,
      contentConfigs: [makeExhibit(12)],
    });

    // Act + Assert
    expect(getEffectiveDurationMonths(config)).toBe(6);
  });

  it('should return the MAX duration across all exhibit config arrays for Multi combination', () => {
    // Arrange
    const config = makeConfig({
      migrationType: 'Multi combination',
      duration: 1,
      messagingConfigs: [makeExhibit(3), makeExhibit(5)],
      contentConfigs: [makeExhibit(4)],
      emailConfigs: [makeExhibit(9)],
    });

    // Act + Assert — overall agreement duration = max(3, 5, 4, 9)
    expect(getEffectiveDurationMonths(config)).toBe(9);
  });

  it('should fall back to legacy single messagingConfig/contentConfig/emailConfig', () => {
    // Arrange — no arrays, only legacy nested configs
    const config = makeConfig({
      migrationType: 'Multi combination',
      duration: 1,
      messagingConfig: {
        numberOfUsers: 10,
        instanceType: 'Small',
        numberOfInstances: 1,
        duration: 4,
        messages: 0,
      },
      contentConfig: {
        numberOfUsers: 10,
        instanceType: 'Small',
        numberOfInstances: 1,
        duration: 7,
        dataSizeGB: 100,
      },
    });

    // Act + Assert — legacy overall = max(4, 7)
    expect(getEffectiveDurationMonths(config)).toBe(7);
  });

  it('should read the legacy emailConfig duration too', () => {
    // Arrange — emailConfig is not in the type but is read defensively by the code
    const config = {
      ...makeConfig({ migrationType: 'Multi combination', duration: 2 }),
      emailConfig: { duration: 8 },
    } as unknown as ConfigurationData;

    // Act + Assert
    expect(getEffectiveDurationMonths(config)).toBe(8);
  });

  it('should fall back to the top-level duration when nested durations are missing or zero', () => {
    // Arrange — arrays exist but carry no usable durations
    const config = makeConfig({
      migrationType: 'Multi combination',
      duration: 5,
      messagingConfigs: [makeExhibit(0)],
      contentConfigs: [],
    });

    // Act + Assert
    expect(getEffectiveDurationMonths(config)).toBe(5);

    // No nested configs at all → top-level wins as well
    expect(
      getEffectiveDurationMonths(makeConfig({ migrationType: 'Multi combination', duration: 3 }))
    ).toBe(3);
  });

  it('should ignore non-numeric nested durations', () => {
    // Arrange — a corrupt duration must not poison the max computation
    const config = makeConfig({
      migrationType: 'Multi combination',
      duration: 1,
      messagingConfigs: [makeExhibit('abc' as unknown as number)],
      contentConfigs: [makeExhibit(6)],
    });

    // Act + Assert — NaN is skipped, max = 6
    expect(getEffectiveDurationMonths(config)).toBe(6);
  });
});

describe('formatMonths', () => {
  it('should use the singular label for exactly 1 month', () => {
    expect(formatMonths(1)).toBe('1 Month');
  });

  it('should use the plural label for 0 and 2 months', () => {
    expect(formatMonths(0)).toBe('0 Months');
    expect(formatMonths(2)).toBe('2 Months');
  });
});
