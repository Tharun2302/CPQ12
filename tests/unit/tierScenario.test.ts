import { describe, it, expect } from 'vitest';
import {
  getTierScenario,
  displayTierLabel,
  isTierVisible,
  getTierOptionsForScenario,
  getTemplateTierRewrites,
} from '../../src/utils/tierScenario';

describe('getTierScenario', () => {
  it('should map one combination from each scenario set', () => {
    expect(getTierScenario('slack-to-google-chat')).toBe(1);
    expect(getTierScenario('dropbox-to-google-mydrive')).toBe(1);
    expect(getTierScenario('box-to-box')).toBe(2);
    expect(getTierScenario('sharepoint-online-to-sharepoint-online')).toBe(2);
    expect(getTierScenario('slack-to-teams')).toBe(3);
  });

  it('should normalize display names (case + whitespace) to slugs', () => {
    expect(getTierScenario('Dropbox To Google MyDrive')).toBe(1);
    expect(getTierScenario('  Slack to Teams  ')).toBe(3);
  });

  it('should return null for unknown combinations', () => {
    expect(getTierScenario('overage-agreement')).toBeNull();
    expect(getTierScenario('gmail-to-gmail')).toBeNull();
  });

  it('should return null for null, undefined, and empty input', () => {
    expect(getTierScenario(null)).toBeNull();
    expect(getTierScenario(undefined)).toBeNull();
    expect(getTierScenario('')).toBeNull();
  });
});

describe('displayTierLabel', () => {
  it('should always relabel Advanced as Standard', () => {
    expect(displayTierLabel('Advanced', 1)).toBe('Standard');
    expect(displayTierLabel('Advanced', 2)).toBe('Standard');
    expect(displayTierLabel('Advanced', 3)).toBe('Standard');
    expect(displayTierLabel('Advanced', null)).toBe('Standard');
  });

  it('should relabel Standard as Basic only in scenario 2', () => {
    expect(displayTierLabel('Standard', 2)).toBe('Basic');
    expect(displayTierLabel('Standard', 1)).toBe('Standard');
    expect(displayTierLabel('Standard', 3)).toBe('Standard');
    expect(displayTierLabel('Standard', null)).toBe('Standard');
  });

  it('should leave Basic unchanged in every scenario', () => {
    expect(displayTierLabel('Basic', 1)).toBe('Basic');
    expect(displayTierLabel('Basic', 2)).toBe('Basic');
    expect(displayTierLabel('Basic', null)).toBe('Basic');
  });
});

describe('isTierVisible', () => {
  it('should keep the legacy hide-Advanced rule when no scenario applies', () => {
    expect(isTierVisible('Basic', null)).toBe(true);
    expect(isTierVisible('Standard', null)).toBe(true);
    expect(isTierVisible('Advanced', null)).toBe(false);
  });

  it('should show only Basic and Advanced in scenarios 1 and 3', () => {
    for (const scenario of [1, 3] as const) {
      expect(isTierVisible('Basic', scenario)).toBe(true);
      expect(isTierVisible('Advanced', scenario)).toBe(true);
      expect(isTierVisible('Standard', scenario)).toBe(false);
    }
  });

  it('should show only Standard and Advanced in scenario 2', () => {
    expect(isTierVisible('Standard', 2)).toBe(true);
    expect(isTierVisible('Advanced', 2)).toBe(true);
    expect(isTierVisible('Basic', 2)).toBe(false);
  });
});

describe('getTierOptionsForScenario', () => {
  it('should return Basic + relabeled Advanced for scenarios 1 and 3', () => {
    const expected = [
      { value: 'Basic', label: 'Basic Plan' },
      { value: 'Advanced', label: 'Standard Plan' },
    ];
    expect(getTierOptionsForScenario(1)).toEqual(expected);
    expect(getTierOptionsForScenario(3)).toEqual(expected);
  });

  it('should return relabeled Standard + Advanced for scenario 2', () => {
    expect(getTierOptionsForScenario(2)).toEqual([
      { value: 'Standard', label: 'Basic Plan' },
      { value: 'Advanced', label: 'Standard Plan' },
    ]);
  });

  it('should fall back to the legacy three-option list for null', () => {
    expect(getTierOptionsForScenario(null)).toEqual([
      { value: 'Basic', label: 'Basic Plan' },
      { value: 'Standard', label: 'Standard Plan' },
      { value: 'Advanced', label: 'Standard Plan' },
    ]);
  });
});

describe('getTemplateTierRewrites', () => {
  it('should add the standard→basic rule before the global rule for scenario-2 standard templates', () => {
    // Act
    const rules = getTemplateTierRewrites('box-to-box-standard.docx');

    // Assert — order matters: Standard→Basic must run before Advanced→Standard
    expect(rules).toHaveLength(2);
    expect(rules[0].replacement).toBe('Basic Plan');
    expect('Standard Plan'.replace(rules[0].pattern, rules[0].replacement)).toBe('Basic Plan');
    expect(rules[1].replacement).toBe('Standard Plan');
    expect('Advanced Plan'.replace(rules[1].pattern, rules[1].replacement)).toBe('Standard Plan');
  });

  it('should recognize the -std.docx suffix variant', () => {
    expect(getTemplateTierRewrites('dropbox-to-egnyte-std.docx')).toHaveLength(2);
  });

  it('should only apply the global advanced→standard rule for non-scenario-2 templates', () => {
    // Scenario-1 standard file: filtered by UI, no standard→basic rewrite
    const scenario1Rules = getTemplateTierRewrites('slack-to-google-chat-standard.docx');
    expect(scenario1Rules).toHaveLength(1);
    expect(scenario1Rules[0].replacement).toBe('Standard Plan');

    // Advanced file of any combination gets only the global rule
    expect(getTemplateTierRewrites('box-to-box-advanced.docx')).toHaveLength(1);
  });

  it('should not rewrite words without the required " Plan" suffix', () => {
    // Arrange
    const rules = getTemplateTierRewrites('box-to-box-advanced.docx');

    // Act
    const rewritten = 'Advanced search inside the Advanced Plan'.replace(
      rules[0].pattern,
      rules[0].replacement
    );

    // Assert — bare "Advanced" untouched, "Advanced Plan" rewritten
    expect(rewritten).toBe('Advanced search inside the Standard Plan');
  });
});
