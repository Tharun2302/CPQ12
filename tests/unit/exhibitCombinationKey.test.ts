import { describe, it, expect } from 'vitest';
import {
  exhibitCombinationKey,
  restrictExhibitsToCombination,
  scopeExhibitsForCombination,
  matchesAgreementFilter,
  showExhibitSelector,
  isOverageAgreement,
  agreementsSupportingExhibits,
  DEFAULT_EXHIBIT_COMBINATION,
} from '../../src/utils/exhibitCombination';

// Manage pins `combination` to 'manage-standalone' for EVERY Manage agreement and keeps the
// real slug in `migrationType`. Reading the wrong field is silent: the selector renders, finds
// nothing to match, and the agreement simply comes out with no exhibits.

describe('exhibitCombinationKey', () => {
  it('uses migrationType for Manage, because combination is pinned to manage-standalone', () => {
    expect(exhibitCombinationKey({
      servicePlan: 'Manage',
      combination: 'manage-standalone',
      migrationType: 'data-sprawl',
    })).toBe('data-sprawl');
  });

  it('distinguishes two Manage agreements that share the same combination value', () => {
    const base = { servicePlan: 'Manage', combination: 'manage-standalone' };
    expect(exhibitCombinationKey({ ...base, migrationType: 'data-sprawl' })).toBe('data-sprawl');
    expect(exhibitCombinationKey({ ...base, migrationType: 'mange+sprawl' })).toBe('mange+sprawl');
  });

  it('keeps a template slug verbatim, so "+" is never lost to slugification', () => {
    expect(exhibitCombinationKey({ servicePlan: 'Manage', migrationType: 'mange+sprawl' }))
      .toBe('mange+sprawl');
  });

  it('uses combination for Migrate', () => {
    expect(exhibitCombinationKey({ servicePlan: 'Migrate', combination: 'slack-to-teams' }))
      .toBe('slack-to-teams');
  });

  it('falls back to multi-combination for Migrate with no combination yet', () => {
    expect(exhibitCombinationKey({ servicePlan: 'Migrate' })).toBe(DEFAULT_EXHIBIT_COMBINATION);
  });

  it('returns empty for a Manage agreement that has not been chosen yet', () => {
    expect(exhibitCombinationKey({ servicePlan: 'Manage', combination: 'manage-standalone' })).toBe('');
  });

  it('handles a missing config rather than throwing', () => {
    expect(exhibitCombinationKey(undefined)).toBe('');
    expect(exhibitCombinationKey(null)).toBe('');
  });
});

describe('restrictExhibitsToCombination', () => {
  // A data-sprawl agreement offering all 176 migration-pair exhibits is not just noise: the
  // wrong exhibit can end up on a signed agreement.
  it('narrows the list for a Manage agreement', () => {
    expect(restrictExhibitsToCombination({ servicePlan: 'Manage', migrationType: 'data-sprawl' })).toBe(true);
  });

  // Multi combination is designed to draw from any migration pair, so narrowing would break it.
  it('keeps the full catalogue for Migrate, including Multi combination', () => {
    expect(restrictExhibitsToCombination({ servicePlan: 'Migrate', combination: 'multi-combination' })).toBe(false);
    expect(restrictExhibitsToCombination({ servicePlan: 'Migrate', combination: 'slack-to-teams' })).toBe(false);
  });

  it('does not narrow when no service plan is set', () => {
    expect(restrictExhibitsToCombination({})).toBe(false);
    expect(restrictExhibitsToCombination(undefined)).toBe(false);
  });
});

describe('scopeExhibitsForCombination', () => {
  const sprawlIncluded = { _id: 'ds1', combinations: ['data-sprawl'] };
  const sprawlNotIncluded = { _id: 'ds2', combinations: ['data-sprawl'] };
  const mangeSprawl = { _id: 'ms1', combinations: ['mange+sprawl'] };
  const slackTeams = { _id: 'st1', combinations: ['slack-to-teams'] };
  const boxDropbox = { _id: 'bd1', combinations: ['box-to-dropbox'] };
  const catalogue = [sprawlIncluded, sprawlNotIncluded, mangeSprawl, slackTeams, boxDropbox];
  const MANAGE = ['data-sprawl', 'mange+sprawl'];

  it('shows a data-sprawl quote only its own exhibits', () => {
    const out = scopeExhibitsForCombination(catalogue, { combination: 'data-sprawl', restrict: true });
    expect(out).toEqual([sprawlIncluded, sprawlNotIncluded]);
  });

  it('does not leak one Manage agreement into another', () => {
    const out = scopeExhibitsForCombination(catalogue, { combination: 'mange+sprawl', restrict: true });
    expect(out).toEqual([mangeSprawl]);
  });

  // Without this, the first data-sprawl exhibit uploaded appears in every Multi combination quote.
  it('hides Manage-only exhibits from the migration catalogue', () => {
    const out = scopeExhibitsForCombination(catalogue, { restrict: false, excludeSlugs: MANAGE });
    expect(out).toEqual([slackTeams, boxDropbox]);
  });

  it('leaves migration pairs untouched when nothing is excluded', () => {
    expect(scopeExhibitsForCombination(catalogue, { restrict: false })).toEqual(catalogue);
  });

  it('matches slugs case-insensitively in both directions', () => {
    const odd = [{ _id: 'x', combinations: ['Data-Sprawl'] }];
    expect(scopeExhibitsForCombination(odd, { combination: 'data-sprawl', restrict: true })).toEqual(odd);
    expect(scopeExhibitsForCombination(odd, { restrict: false, excludeSlugs: ['DATA-SPRAWL'] })).toEqual([]);
  });

  it('keeps "+" intact so mange+sprawl is never confused with mange-sprawl', () => {
    const rows = [{ _id: 'a', combinations: ['mange+sprawl'] }, { _id: 'b', combinations: ['mange-sprawl'] }];
    expect(scopeExhibitsForCombination(rows, { combination: 'mange+sprawl', restrict: true }))
      .toEqual([rows[0]]);
  });

  it('returns nothing for an agreement with no exhibits authored yet', () => {
    expect(scopeExhibitsForCombination(catalogue, { combination: 'overage-agreement', restrict: true })).toEqual([]);
  });

  it('survives a missing list or missing combinations field', () => {
    expect(scopeExhibitsForCombination(undefined as never, { restrict: true, combination: 'data-sprawl' })).toEqual([]);
    expect(scopeExhibitsForCombination([{ _id: 'n' }], { restrict: false, excludeSlugs: MANAGE })).toEqual([{ _id: 'n' }]);
  });
});

describe('matchesAgreementFilter', () => {
  const sprawl = { combinations: ['data-sprawl'] };
  const mange = { combinations: ['mange+sprawl'] };
  const slack = { combinations: ['slack-to-teams'] };
  const untagged = { combinations: ['all'] };
  // Only Manage agreements own exhibits. Multi-Combination and Overage Agreement own none.
  const MANAGE_ONLY = ['data-sprawl', 'mange+sprawl'];

  it('shows everything when no filter is set', () => {
    for (const ex of [sprawl, mange, slack, untagged]) {
      expect(matchesAgreementFilter(ex, '', MANAGE_ONLY)).toBe(true);
    }
  });

  it('isolates a Manage agreement to its own exhibits', () => {
    expect(matchesAgreementFilter(sprawl, 'data-sprawl', MANAGE_ONLY)).toBe(true);
    expect(matchesAgreementFilter(mange, 'data-sprawl', MANAGE_ONLY)).toBe(false);
    expect(matchesAgreementFilter(slack, 'data-sprawl', MANAGE_ONLY)).toBe(false);
  });

  // Multi-Combination owns no exhibit, so a literal slug match would show an empty list —
  // the opposite of the truth, since a Multi combination quote offers every migration pair.
  it('shows the whole migration catalogue for Multi-Combination', () => {
    expect(matchesAgreementFilter(slack, 'multi-combination', MANAGE_ONLY)).toBe(true);
    expect(matchesAgreementFilter(untagged, 'multi-combination', MANAGE_ONLY)).toBe(true);
  });

  it('still keeps Manage exhibits out of Multi-Combination', () => {
    expect(matchesAgreementFilter(sprawl, 'multi-combination', MANAGE_ONLY)).toBe(false);
    expect(matchesAgreementFilter(mange, 'multi-combination', MANAGE_ONLY)).toBe(false);
  });

  it('does not confuse mange+sprawl with mange-sprawl', () => {
    expect(matchesAgreementFilter({ combinations: ['mange-sprawl'] }, 'mange+sprawl', MANAGE_ONLY)).toBe(false);
  });

  it('is case-insensitive and tolerates a missing combinations field', () => {
    expect(matchesAgreementFilter({ combinations: ['Data-Sprawl'] }, 'data-sprawl', MANAGE_ONLY)).toBe(true);
    expect(matchesAgreementFilter({}, 'data-sprawl', MANAGE_ONLY)).toBe(false);
    expect(matchesAgreementFilter({}, 'multi-combination', MANAGE_ONLY)).toBe(true);
  });
});

describe('showExhibitSelector', () => {
  it('offers the exhibit step for a migration combination', () => {
    expect(showExhibitSelector({ servicePlan: 'Migrate', combination: 'slack-to-teams' })).toBe(true);
  });

  it('offers it for Multi combination', () => {
    expect(showExhibitSelector({
      servicePlan: 'Migrate', combination: 'multi-combination', migrationType: 'Multi combination',
    })).toBe(true);
  });

  it('offers it for a Manage agreement such as data sprawl', () => {
    expect(showExhibitSelector({
      servicePlan: 'Manage', combination: 'manage-standalone', migrationType: 'data-sprawl',
    })).toBe(true);
  });

  // Overage prices overage on an existing deal. There is no scope to attach, so the step is
  // skipped and the user goes straight to project configuration.
  it('hides it for Overage Agreement, identified by migrationType', () => {
    expect(showExhibitSelector({
      servicePlan: 'Migrate', combination: 'overage-agreement', migrationType: 'Overage Agreement',
    })).toBe(false);
  });

  it('hides it for Overage Agreement identified by combination alone', () => {
    expect(showExhibitSelector({ servicePlan: 'Migrate', combination: 'overage-agreement' })).toBe(false);
  });

  it('hides it before a combination is chosen, and for Bundle', () => {
    expect(showExhibitSelector({ servicePlan: 'Migrate' })).toBe(false);
    expect(showExhibitSelector({ servicePlan: 'Bundle', combination: 'slack-to-teams' })).toBe(false);
    expect(showExhibitSelector(undefined)).toBe(false);
  });
});

describe('isOverageAgreement / agreementsSupportingExhibits', () => {
  it('recognises overage by either field and nothing else', () => {
    expect(isOverageAgreement({ migrationType: 'Overage Agreement' })).toBe(true);
    expect(isOverageAgreement({ combination: 'Overage-Agreement' })).toBe(true);
    expect(isOverageAgreement({ migrationType: 'data-sprawl' })).toBe(false);
  });

  // Offering overage in the pickers would invite exhibits that can never be shown anywhere.
  it('keeps overage out of the exhibit pickers', () => {
    const all = [
      { value: 'mange+sprawl', migrationType: 'Manage' },
      { value: 'multi-combination', migrationType: 'Multi combination' },
      { value: 'overage-agreement', migrationType: 'Overage Agreement' },
      { value: 'data-sprawl', migrationType: 'Manage' },
    ];
    expect(agreementsSupportingExhibits(all).map((c) => c.value))
      .toEqual(['mange+sprawl', 'multi-combination', 'data-sprawl']);
  });
});
