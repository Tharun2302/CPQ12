import { describe, it, expect } from 'vitest';
import {
  MANAGE_STANDALONE_LABEL,
  isManageStandaloneLabel,
  isManageStandaloneCatalogRow,
  isBuiltInManageStandalone,
  manageTemplateLookupValue,
  normalizeLegacyManageStandalone,
} from '../../src/utils/manageStandaloneOption';
import { effectiveTemplateKey, templateChoiceChanged } from '../../src/utils/templateSelection';

const STANDALONE_CONFIG = {
  servicePlan: 'Manage' as const,
  migrationType: '' as any,
  manageAgreementLabel: MANAGE_STANDALONE_LABEL,
};

describe('isManageStandaloneLabel', () => {
  it('matches the exact label', () => {
    expect(isManageStandaloneLabel('Manage Standalone')).toBe(true);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(isManageStandaloneLabel('  MANAGE standalone  ')).toBe(true);
  });

  it('rejects other labels and empty values', () => {
    expect(isManageStandaloneLabel('Manage Standalone Plus')).toBe(false);
    expect(isManageStandaloneLabel('mange+sprawl')).toBe(false);
    expect(isManageStandaloneLabel('')).toBe(false);
    expect(isManageStandaloneLabel(undefined)).toBe(false);
  });
});

describe('isManageStandaloneCatalogRow', () => {
  it('matches a Manage row with the standalone label', () => {
    expect(isManageStandaloneCatalogRow({ value: 'x', label: 'manage standalone', migrationType: 'Manage' })).toBe(true);
  });

  it('ignores rows of other migration types', () => {
    expect(isManageStandaloneCatalogRow({ value: 'x', label: 'Manage Standalone', migrationType: 'Content' })).toBe(false);
  });

  it('ignores Manage rows with other labels', () => {
    expect(isManageStandaloneCatalogRow({ value: 'data-sprawl', label: 'data-sprawl', migrationType: 'Manage' })).toBe(false);
  });
});

describe('isBuiltInManageStandalone', () => {
  it('is true for the built-in option', () => {
    expect(isBuiltInManageStandalone(STANDALONE_CONFIG)).toBe(true);
  });

  it('is false once a catalog agreement is chosen', () => {
    expect(isBuiltInManageStandalone({ ...STANDALONE_CONFIG, migrationType: 'mange+sprawl' as any })).toBe(false);
  });

  it('is false outside the Manage plan or without the label', () => {
    expect(isBuiltInManageStandalone({ ...STANDALONE_CONFIG, servicePlan: 'Migrate' })).toBe(false);
    expect(isBuiltInManageStandalone({ ...STANDALONE_CONFIG, manageAgreementLabel: '' })).toBe(false);
    expect(isBuiltInManageStandalone(null)).toBe(false);
  });
});

describe('manageTemplateLookupValue', () => {
  const combos = [
    { value: 'mange+sprawl', label: 'mange+sprawl', migrationType: 'Manage', hasFile: true },
    { value: 'Manage-Standalone-Row', label: ' Manage Standalone ', migrationType: 'Manage', hasFile: true },
  ];

  it('resolves the built-in option to the catalog row found by label', () => {
    expect(manageTemplateLookupValue(STANDALONE_CONFIG, combos)).toBe('manage-standalone-row');
  });

  it('prefers a same-labelled row that has a file', () => {
    const rows = [
      { value: 'no-file', label: 'Manage Standalone', migrationType: 'Manage', hasFile: false },
      { value: 'with-file', label: 'Manage Standalone', migrationType: 'Manage', hasFile: true },
    ];
    expect(manageTemplateLookupValue(STANDALONE_CONFIG, rows)).toBe('with-file');
  });

  it('returns empty for the built-in option when no catalog row matches', () => {
    expect(manageTemplateLookupValue(STANDALONE_CONFIG, combos.slice(0, 1))).toBe('');
    expect(manageTemplateLookupValue(STANDALONE_CONFIG, [])).toBe('');
  });

  it('keeps using migrationType for catalog agreements', () => {
    const config = { servicePlan: 'Manage' as const, migrationType: ' Mange+Sprawl ' as any, manageAgreementLabel: 'mange+sprawl' };
    expect(manageTemplateLookupValue(config, combos)).toBe('mange+sprawl');
  });
});

describe('template keys for the built-in option', () => {
  const combos = [
    { value: 'mange+sprawl', label: 'mange+sprawl', migrationType: 'Manage', hasFile: true },
    { value: 'Standalone-Row', label: 'Manage Standalone', migrationType: 'Manage', hasFile: true },
  ];
  const selectNothing = { servicePlan: 'Manage' as const, migrationType: '' as any, manageAgreementLabel: '' };

  it('effectiveTemplateKey resolves the built-in option to its catalog row', () => {
    expect(effectiveTemplateKey(STANDALONE_CONFIG, combos)).toBe('standalone-row');
    expect(effectiveTemplateKey(STANDALONE_CONFIG, [])).toBe('');
  });

  it('effectiveTemplateKey keeps migrationType for agreements and combination outside Manage', () => {
    expect(effectiveTemplateKey({ servicePlan: 'Manage', migrationType: 'mange+sprawl' as any }, combos)).toBe('mange+sprawl');
    expect(effectiveTemplateKey({ servicePlan: 'Migrate', combination: ' Slack-To-Teams ' }, combos)).toBe('slack-to-teams');
  });

  it('choosing "Select Combination" after Manage Standalone counts as a template change', () => {
    expect(templateChoiceChanged(STANDALONE_CONFIG, selectNothing)).toBe(true);
    expect(templateChoiceChanged(selectNothing, STANDALONE_CONFIG)).toBe(true);
  });

  it('re-sending the same built-in selection is not a template change', () => {
    expect(templateChoiceChanged(STANDALONE_CONFIG, { ...STANDALONE_CONFIG })).toBe(false);
  });
});

describe('normalizeLegacyManageStandalone', () => {
  const catalog = [
    { value: 'mange+sprawl', label: 'mange+sprawl', migrationType: 'Manage' },
    { value: 'Manage-Standalone', label: ' manage STANDALONE ', migrationType: 'Manage', hasFile: true },
  ];
  const legacy = {
    servicePlan: 'Manage',
    migrationType: ' manage-standalone ',
    manageAgreementLabel: 'Manage Standalone',
    combination: 'manage-standalone',
    manageUsers: 30,
    manageRequiresUsers: false,
    serviceTermMonths: 24,
    contentConfigs: [{ exhibitId: 'e1' }],
    manageSprawlConfigs: [{ id: 'g1', type: 'Content', users: 5, dataGB: 10 }],
    manageSprawlTypes: ['Content'],
  } as any;

  it('maps a session that selected the hidden catalog row to the built-in option', () => {
    const out = normalizeLegacyManageStandalone(legacy, catalog)!;
    expect(out).not.toBe(legacy);
    expect(out.migrationType).toBe('');
    expect(out.manageAgreementLabel).toBe(MANAGE_STANDALONE_LABEL);
    expect(out.manageRequiresUsers).toBe(true);
    expect(out.manageUsers).toBe(30);
    expect(isBuiltInManageStandalone(out)).toBe(true);
  });

  it('clears legacy exhibit rows and sprawl groups and resets the term to the 12-month default', () => {
    const out = normalizeLegacyManageStandalone(legacy, catalog)!;
    expect(out.contentConfigs).toEqual([]);
    expect(out.messagingConfigs).toEqual([]);
    expect(out.emailConfigs).toEqual([]);
    expect(out.manageSprawlConfigs).toEqual([]);
    expect(out.manageSprawlTypes).toEqual([]);
    expect(out.serviceTermMonths).toBe(12);
  });

  it('returns the same object when nothing needs mapping', () => {
    const agreement = { ...legacy, migrationType: 'mange+sprawl', manageAgreementLabel: 'mange+sprawl' };
    const builtIn = { ...legacy, migrationType: '' };
    const migrate = { ...legacy, servicePlan: 'Migrate' };
    expect(normalizeLegacyManageStandalone(agreement, catalog)).toBe(agreement);
    expect(normalizeLegacyManageStandalone(builtIn, catalog)).toBe(builtIn);
    expect(normalizeLegacyManageStandalone(migrate, catalog)).toBe(migrate);
    expect(normalizeLegacyManageStandalone(legacy, [])).toBe(legacy);
    expect(normalizeLegacyManageStandalone(legacy, null)).toBe(legacy);
    expect(normalizeLegacyManageStandalone(undefined, catalog)).toBeUndefined();
  });

  it('tolerates catalog rows without a value', () => {
    expect(normalizeLegacyManageStandalone(legacy, [{ label: 'x', migrationType: 'Manage' }])).toBe(legacy);
  });
});
