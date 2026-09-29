import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { templateChoiceChanged, templateSelectionKey } from '../../src/utils/templateSelection';
import type { ConfigurationData } from '../../src/types/pricing';

type Choice = Pick<ConfigurationData, 'servicePlan' | 'migrationType' | 'combination'>;

const multiCombo: Choice = { servicePlan: 'Migrate', migrationType: 'Multi combination', combination: 'multi-combination' };
const manageTab: Choice = { servicePlan: 'Manage', migrationType: '' as Choice['migrationType'], combination: '' };
const manageAgreement: Choice = {
  servicePlan: 'Manage',
  migrationType: 'data-sprawl' as Choice['migrationType'],
  combination: 'manage-standalone',
};
const migrateTab: Choice = { servicePlan: 'Migrate', migrationType: '' as Choice['migrationType'], combination: '' };
const overage: Choice = { servicePlan: 'Migrate', migrationType: 'Overage Agreement', combination: 'overage-agreement' };

describe('templateSelectionKey', () => {
  it('uses the combination for Migrate and Bundle', () => {
    expect(templateSelectionKey(overage)).toBe('overage-agreement');
    expect(templateSelectionKey({ ...overage, servicePlan: 'Bundle' })).toBe('overage-agreement');
    expect(templateSelectionKey({ combination: ' Multi-Combination ' })).toBe('multi-combination');
  });

  it('uses the agreement slug for Manage, whose combination never changes', () => {
    expect(templateSelectionKey(manageAgreement)).toBe('data-sprawl');
  });

  it('is empty while a plan tab has just been clicked', () => {
    expect(templateSelectionKey(migrateTab)).toBe('');
    expect(templateSelectionKey(manageTab)).toBe('');
    expect(templateSelectionKey(null)).toBe('');
  });
});

describe('templateChoiceChanged', () => {
  it('keeps the template when there was no previous configuration (a brand-new session)', () => {
    expect(templateChoiceChanged(undefined, overage)).toBe(false);
    expect(templateChoiceChanged(null, overage)).toBe(false);
  });

  it('keeps the template when only other fields change', () => {
    expect(templateChoiceChanged(overage, { ...overage })).toBe(false);
  });

  it('flags a new Manage agreement even though the combination stays manage-standalone', () => {
    const other = { ...manageAgreement, migrationType: 'manage-sprawl' as Choice['migrationType'] };
    expect(templateChoiceChanged(manageAgreement, other)).toBe(true);
  });

  it('flags a plan switch even when the combination value is the same', () => {
    expect(templateChoiceChanged(overage, { ...overage, servicePlan: 'Bundle' })).toBe(true);
  });

  it('treats a missing servicePlan as Migrate, matching the form default', () => {
    const legacy = { migrationType: overage.migrationType, combination: overage.combination };
    expect(templateChoiceChanged(legacy, overage)).toBe(false);
  });

  // The reported bug: Multi combination -> Manage -> Migrate -> Overage kept a stale template until refresh.
  it('clears at every step of the reported flow and never auto-picks for an empty plan tab', () => {
    const flow = [multiCombo, manageTab, manageAgreement, migrateTab, overage];
    const changes = flow.slice(1).map((next, i) => ({
      changed: templateChoiceChanged(flow[i], next),
      canAutoPick: templateSelectionKey(next) !== '',
    }));

    expect(changes).toEqual([
      { changed: true, canAutoPick: false },
      { changed: true, canAutoPick: true },
      { changed: true, canAutoPick: false },
      { changed: true, canAutoPick: true },
    ]);
  });
});

describe('App.tsx wiring — handleConfigurationChange', () => {
  const appPath = fileURLToPath(new URL('../../src/App.tsx', import.meta.url));
  const appSrc = fs.readFileSync(appPath, 'utf8');
  const start = appSrc.indexOf('const handleConfigurationChange = ');
  const end = appSrc.indexOf('\n  const ', start + 1);
  const handler = appSrc.slice(start, end);

  it('clears the template on any plan or agreement change, not only when a tier is selected', () => {
    expect(start).toBeGreaterThan(-1);
    expect(handler).toContain('if (templateChoiceChanged(configuration, config)) {');
    expect(handler).not.toMatch(/\(combinationChanged \|\| manageAgreementChanged\) && selectedTier/);
    expect(handler.indexOf('setSelectedTemplate(null)')).toBeGreaterThan(handler.indexOf('templateChoiceChanged('));
  });

  it('only auto-picks a template once a combination or agreement is actually chosen', () => {
    // Guarded inside the picker itself so tier selection and the templates-loaded retry are covered too
    const picker = appSrc.slice(appSrc.indexOf('const autoSelectTemplateForPlan = '));
    expect(picker.slice(0, 400)).toContain('if (!templateSelectionKey(config)) return null;');
  });
});
