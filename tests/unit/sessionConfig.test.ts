import { describe, it, expect } from 'vitest';
import { readStoredConfiguration, CONFIG_SESSION_KEY } from '../../src/utils/sessionConfig';

function storage(value: string | null) {
  return { getItem: (key: string) => (key === CONFIG_SESSION_KEY ? value : null) };
}

describe('readStoredConfiguration', () => {
  it('restores a stored Manage configuration', () => {
    const stored = {
      servicePlan: 'Manage',
      migrationType: 'data-sprawl',
      manageSprawlTypes: ['Message', 'Email'],
      manageUsersByType: { Message: 424, Email: 100 },
      manageUsers: 524,
    };
    const restored = readStoredConfiguration(storage(JSON.stringify(stored)));
    // servicePlan and migrationType are what template selection keys off
    expect(restored?.servicePlan).toBe('Manage');
    expect(restored?.migrationType).toBe('data-sprawl');
    expect(restored?.manageUsersByType).toEqual({ Message: 424, Email: 100 });
  });

  it('returns undefined when nothing is stored', () => {
    expect(readStoredConfiguration(storage(null))).toBeUndefined();
    expect(readStoredConfiguration(storage(''))).toBeUndefined();
  });

  it('returns undefined rather than throwing on malformed data', () => {
    expect(readStoredConfiguration(storage('{not json'))).toBeUndefined();
    expect(readStoredConfiguration(storage('null'))).toBeUndefined();
    expect(readStoredConfiguration(storage('"a string"'))).toBeUndefined();
    expect(readStoredConfiguration(storage('42'))).toBeUndefined();
    // An array is object-typed but never a valid configuration
    expect(readStoredConfiguration(storage('[]'))).toBeUndefined();
  });

  it('survives a storage that throws (private mode, blocked site data)', () => {
    const hostile = { getItem: () => { throw new Error('blocked'); } };
    expect(readStoredConfiguration(hostile)).toBeUndefined();
  });

  it('reads the same key ConfigurationForm writes', () => {
    expect(CONFIG_SESSION_KEY).toBe('cpq_configuration_session');
  });
});
