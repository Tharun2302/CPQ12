import { describe, it, expect } from 'vitest';

import {
  combinationsMissingPlan,
  configsMissingPlan,
  dropOtherPlanExhibits,
  exhibitPlan,
  exhibitPlanResolver,
  missingPlanExhibitsMessage,
  planSelectionBlockedMessage,
} from '../../src/utils/exhibitPlan';
import { combinedExhibitFamily, inCombinedFamily } from '../../src/utils/exhibitCombination';

type Ex = { _id: string; name: string; planType?: string; combinations: string[] };

const BOX_MS = 'Box to Microsoft(OneDrive&SharePointOnline)';
const boxMsStdIn: Ex = { _id: 'bm-std-in', name: `${BOX_MS} Standard Plan - Standard Include`, planType: 'standard', combinations: ['box-to-microsoft-onedriveandsharepointonline'] };
const odBasicIn: Ex = { _id: 'od-basic-in', name: 'Box to OneDrive Basic Plan - Basic Include', planType: 'basic', combinations: ['box-to-onedrive'] };
const odStdIn: Ex = { _id: 'od-std-in', name: 'Box to OneDrive Standard Plan - Standard Include', planType: 'standard', combinations: ['box-to-onedrive'] };
const generic: Ex = { _id: 'generic', name: 'Google Chat to Google Chat', combinations: ['google-chat-to-google-chat'] };

const ALL = [boxMsStdIn, odBasicIn, odStdIn, generic];
const lookup = new Map(ALL.map((ex) => [ex._id, ex]));
const keyOf = (ex: Ex) => ex.combinations[0];
const basic = () => 'basic';

describe('exhibitPlan', () => {
  it('reads planType first, then the name', () => {
    expect(exhibitPlan(boxMsStdIn)).toBe('standard');
    expect(exhibitPlan({ name: 'Slack to Teams Basic Plan - Basic Include' })).toBe('basic');
    expect(exhibitPlan({ name: 'slack-to-google-chat-std' })).toBe('standard');
  });

  it('returns empty for an exhibit with no plan', () => {
    expect(exhibitPlan(generic)).toBe('');
    expect(exhibitPlan(undefined)).toBe('');
  });
});

describe('dropOtherPlanExhibits', () => {
  it('drops a ticked Standard exhibit from a Basic agreement', () => {
    expect(dropOtherPlanExhibits(['bm-std-in', 'od-basic-in'], lookup, basic)).toEqual(['od-basic-in']);
  });

  it('keeps exhibits with no plan and ids it does not know', () => {
    expect(dropOtherPlanExhibits(['generic', 'unknown-id'], lookup, basic)).toEqual(['generic', 'unknown-id']);
  });

  it('honours a different plan per combination', () => {
    const planFor = (ex: Ex) => (keyOf(ex) === 'box-to-onedrive' ? 'standard' : 'basic');
    expect(dropOtherPlanExhibits(['od-basic-in', 'od-std-in'], lookup, planFor)).toEqual(['od-std-in']);
  });
});

describe('combinationsMissingPlan', () => {
  it('reports a combination that has no exhibit for the chosen plan', () => {
    expect(combinationsMissingPlan([boxMsStdIn, odBasicIn, odStdIn], basic, keyOf)).toEqual([
      { combination: BOX_MS, plan: 'basic' },
    ]);
  });

  it('reports nothing when every combination has the chosen plan', () => {
    expect(combinationsMissingPlan([odBasicIn, odStdIn], basic, keyOf)).toEqual([]);
  });

  it('does not report a combination whose exhibits have no plan', () => {
    expect(combinationsMissingPlan([generic], basic, keyOf)).toEqual([]);
  });
});

describe('configsMissingPlan', () => {
  // Configured as on the plan page: the config names the folder and points at the ticked exhibit.
  const configs = [
    { exhibitId: 'bm-std-in', exhibitName: BOX_MS },
    { exhibitId: 'od-std-in', exhibitName: 'Box To Onedrive' },
  ];

  it('flags a combination with no Basic exhibits when Basic is chosen', () => {
    expect(configsMissingPlan(configs, ALL, () => 'Basic')).toEqual([{ combination: BOX_MS, plan: 'basic' }]);
  });

  it('flags nothing when Standard is chosen', () => {
    expect(configsMissingPlan(configs, ALL, () => 'Standard')).toEqual([]);
  });

  it('uses each combination\'s own plan', () => {
    const planFor = (name: string) => (name === BOX_MS ? 'Standard' : 'Basic');
    expect(configsMissingPlan(configs, ALL, planFor)).toEqual([]);
  });

  it('matches by folder name when the ticked exhibit is not in the catalogue', () => {
    expect(configsMissingPlan([{ exhibitName: BOX_MS }], ALL, () => 'Basic')).toEqual([{ combination: BOX_MS, plan: 'basic' }]);
  });

  it('flags nothing before the catalogue has loaded', () => {
    expect(configsMissingPlan(configs, [], () => 'Basic')).toEqual([]);
  });
});

describe('planSelectionBlockedMessage', () => {
  it('asks for another plan or the missing exhibits', () => {
    expect(planSelectionBlockedMessage([{ combination: BOX_MS, plan: 'basic' }])).toBe(
      `There are no Basic plan exhibits for:\n- ${BOX_MS}\n\nPlease choose another plan, or upload the missing exhibits for this combination in Exhibits.`,
    );
  });
});

describe('exhibitPlanResolver', () => {
  const configs = [{ exhibitId: 'od-std-in', exhibitName: 'Box To Onedrive' }];

  it('uses the custom plan\'s exhibit plan for that combination, both Include and Not Include', () => {
    const planFor = exhibitPlanResolver(configs, { 'Box To Onedrive': 'Basic' }, ALL, 'Standard');
    expect(planFor(odStdIn)).toBe('basic');
    expect(planFor({ _id: 'x', name: 'Box to OneDrive Basic Plan - Basic Not Include', combinations: ['onedrive'] })).toBe('basic');
  });

  it('uses the chosen plan card for every other combination', () => {
    const planFor = exhibitPlanResolver(configs, { 'Box To Onedrive': 'Basic' }, ALL, 'Standard');
    expect(planFor(boxMsStdIn)).toBe('standard');
  });

  it('uses the plan card everywhere when no exhibit plans are given', () => {
    const planFor = exhibitPlanResolver(configs, undefined, ALL, 'Basic');
    expect(planFor(odStdIn)).toBe('basic');
    expect(planFor(boxMsStdIn)).toBe('basic');
  });
});

describe('missingPlanExhibitsMessage', () => {
  it('names the plan and the combination', () => {
    expect(missingPlanExhibitsMessage([{ combination: BOX_MS, plan: 'basic' }])).toBe(
      `There are no Basic plan exhibits for:\n- ${BOX_MS}\n\nThe agreement will be generated without exhibits for this combination.`,
    );
  });

  it('names each plan when combinations use different plans', () => {
    const msg = missingPlanExhibitsMessage([
      { combination: BOX_MS, plan: 'basic' },
      { combination: 'Gmail to Outlook', plan: 'standard' },
    ]);
    expect(msg).toContain(`- ${BOX_MS} (Basic plan)`);
    expect(msg).toContain('- Gmail to Outlook (Standard plan)');
    expect(msg).toContain('these combinations');
  });

  it('is empty when nothing is missing', () => {
    expect(missingPlanExhibitsMessage([])).toBe('');
  });
});

// A combined exhibit ("X to Y (A & B)") may only be replaced by a dedicated exhibit of the same
// source and destination; it used to be dropped whenever any other combination was selected.
describe('combinedExhibitFamily', () => {
  it('takes the source-to-destination before the bracket', () => {
    expect(combinedExhibitFamily(`${BOX_MS} Basic Plan - Basic Include`)).toBe('box to microsoft');
    expect(combinedExhibitFamily('Dropbox to Google(MyDrive & ShareDrive) Standard Plan - Standard Not Include')).toBe('dropbox to google');
  });

  it('has no family when the bracket comes before " to "', () => {
    expect(combinedExhibitFamily('Google (MyDrive & Shared Drive) to Microsoft (OneDrive & SharePoint Online) Basic Plan - Basic Include')).toBe('');
    expect(combinedExhibitFamily('Microsoft(OneDrive/SharePointOnline)-Google(MyDrive/ ShareDrive) Standard Plan - Standard Include')).toBe('');
  });

  it('treats a dedicated exhibit of the same pair as an alternative', () => {
    expect(inCombinedFamily('Dropbox to Google MyDrive Basic Plan - Basic Include', 'dropbox to google')).toBe(true);
    expect(inCombinedFamily('Box to Google MyDrive Basic Plan - Basic Include', 'box to google')).toBe(true);
  });

  it('does not treat another combination as an alternative', () => {
    expect(inCombinedFamily('Box To Onedrive Basic Plan - Basic Include', 'box to microsoft')).toBe(false);
    expect(inCombinedFamily('Dropbox to Google MyDrive Basic Plan - Basic Include', 'box to google')).toBe(false);
    expect(inCombinedFamily('Box to Googlesheets Basic Plan - Basic Include', 'box to google')).toBe(false);
    expect(inCombinedFamily('anything', '')).toBe(false);
  });
});
