import { describe, it, expect } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import duplicates from '../../exhibit-duplicates.cjs';
import {
  POSSIBLE_DUPLICATE_EXHIBIT,
  isPossibleDuplicateResponse,
  duplicateConfirmMessage,
} from '../../src/utils/exhibitDuplicates';

type Exhibit = Record<string, unknown>;
type Match = { id: string; name: string; reasons: string[] };

const {
  DUPLICATE_CODE,
  normalizeExhibitFileName,
  findExhibitDuplicates,
  duplicateRulesForEdit,
  isDuplicateOverride,
  checkExhibitDuplicates,
} = duplicates as {
  DUPLICATE_CODE: string;
  normalizeExhibitFileName: (name: unknown) => string;
  findExhibitDuplicates: (candidate: Exhibit, existing: Exhibit[], options?: { excludeId?: string; reasons?: string[] }) => Match[];
  duplicateRulesForEdit: (existing: Exhibit, update: Exhibit) => string[];
  isDuplicateOverride: (value: unknown) => boolean;
  checkExhibitDuplicates: (input: Exhibit) => {
    status: number;
    body: { success: boolean; code: string; error: string; duplicates: Match[] };
  } | null;
};

const exhibit = (over: Exhibit = {}): Exhibit => ({
  _id: 'e1',
  name: 'Egnyte to SharePoint Online Standard Plan - Standard Include',
  fileName: 'Egnyte to SharePoint Online Standard Plan - Standard Include.docx',
  combinations: ['multi-combination'],
  planType: 'standard',
  includeType: 'included',
  ...over,
});

describe('normalizeExhibitFileName', () => {
  it('ignores case, extension, repeated spaces and separators', () => {
    expect(normalizeExhibitFileName('Egnyte to  Microsoft std- Include.DOCX'))
      .toBe(normalizeExhibitFileName('egnyte to microsoft std include.docx'));
  });

  it('ignores the copy suffix a browser download adds', () => {
    const plain = normalizeExhibitFileName('Box to OneDrive Basic Plan - Basic Include.docx');
    expect(normalizeExhibitFileName('Box to OneDrive Basic Plan - Basic Include (1).docx')).toBe(plain);
    expect(normalizeExhibitFileName('Box to OneDrive Basic Plan - Basic Include 1.docx')).toBe(plain);
  });

  // Real names from backend-exhibits/: browsers stack copy suffixes and double the extension.
  it('strips stacked copy suffixes and a doubled extension', () => {
    const plain = normalizeExhibitFileName('Google Chat to Teams - Included basic.docx');
    expect(normalizeExhibitFileName('Google Chat to Teams - Included basic (1) (1).docx')).toBe(plain);
    expect(normalizeExhibitFileName('teams to teams Inscope (2) (1) (2) (2) (1).docx'))
      .toBe(normalizeExhibitFileName('teams to teams Inscope.docx'));
    expect(normalizeExhibitFileName('Slack to Slack - Included.docx (1) (1).docx'))
      .toBe(normalizeExhibitFileName('Slack to Slack - Included.docx'));
    expect(normalizeExhibitFileName('Slack to Slack - Included.docx.docx'))
      .toBe(normalizeExhibitFileName('Slack to Slack - Included.docx'));
  });

  it('strips a trailing copy "1" with or without a space', () => {
    const plain = normalizeExhibitFileName('Egnyte to OneDrive Standard Plan - Standard Not Include.docx');
    expect(normalizeExhibitFileName('Egnyte to OneDrive Standard Plan - Standard Not Include1.docx')).toBe(plain);
  });

  it('keeps numbered and versioned names apart', () => {
    expect(normalizeExhibitFileName('Exhibit 1.docx')).not.toBe(normalizeExhibitFileName('Exhibit 2.docx'));
    expect(normalizeExhibitFileName('Box to Microsoft 365.docx')).not.toBe(normalizeExhibitFileName('Box to Microsoft.docx'));
  });

  it('keeps genuinely different names apart', () => {
    expect(normalizeExhibitFileName('Egnyte to OneDrive Standard Include.docx'))
      .not.toBe(normalizeExhibitFileName('Egnyte to SharePoint Standard Include.docx'));
  });

  it('returns an empty string for a missing name', () => {
    expect(normalizeExhibitFileName(undefined)).toBe('');
  });

  // A header-sized name of spaces used to backtrack quadratically and block the event loop.
  it('stays fast on a long run of whitespace', () => {
    const hostile = `a${' '.repeat(16000)}a (1).docx`;
    const started = performance.now();
    normalizeExhibitFileName(hostile);
    expect(performance.now() - started).toBeLessThan(50);
  });
});

describe('findExhibitDuplicates', () => {
  // Yesterday's upload: two different pairs tagged with the same agreement slug collide, which
  // is exactly the mistake the warning should have surfaced.
  it('flags the same combination + plan + include type', () => {
    const candidate = exhibit({ fileName: 'Egnyte to Microsoft std- Include.docx' });
    const matches = findExhibitDuplicates(candidate, [exhibit()]);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ id: 'e1', reasons: ['same_combination_plan_include'] });
  });

  it('flags a re-upload under a slightly different file name, whatever it is tagged', () => {
    const candidate = exhibit({
      fileName: 'egnyte to sharepoint online standard plan - standard include (1).docx',
      combinations: ['egnyte-to-sharepoint-online'],
    });
    expect(findExhibitDuplicates(candidate, [exhibit()])[0].reasons).toEqual(['similar_file_name']);
  });

  it('reports both reasons when both apply', () => {
    const candidate = exhibit({ _id: undefined, fileName: 'Egnyte to SharePoint Online Standard Plan - Standard Include 1.docx' });
    expect(findExhibitDuplicates(candidate, [exhibit()])[0].reasons)
      .toEqual(['same_combination_plan_include', 'similar_file_name']);
  });

  it('does not flag the other include type of the same combination and plan', () => {
    const candidate = exhibit({ includeType: 'notincluded', fileName: 'other.docx' });
    expect(findExhibitDuplicates(candidate, [exhibit()])).toEqual([]);
  });

  it('does not flag another plan of the same combination', () => {
    const candidate = exhibit({ planType: 'basic', fileName: 'other.docx' });
    expect(findExhibitDuplicates(candidate, [exhibit()])).toEqual([]);
  });

  it('does not flag a different combination', () => {
    const candidate = exhibit({ combinations: ['box-to-onedrive'], fileName: 'other.docx' });
    expect(findExhibitDuplicates(candidate, [exhibit()])).toEqual([]);
  });

  // "all" means "offered everywhere", so two catch-all exhibits are not the same exhibit.
  it('never matches on the "all" wildcard', () => {
    const candidate = exhibit({ combinations: ['all'], fileName: 'a.docx' });
    expect(findExhibitDuplicates(candidate, [exhibit({ combinations: ['all'], fileName: 'b.docx' })])).toEqual([]);
  });

  it('matches combinations case-insensitively and on any shared slug', () => {
    const candidate = exhibit({ combinations: ['EGNYTE-TO-MICROSOFT', 'all'], fileName: 'x.docx' });
    const other = exhibit({ combinations: ['egnyte-to-microsoft'], fileName: 'y.docx' });
    expect(findExhibitDuplicates(candidate, [other])).toHaveLength(1);
  });

  it('treats a missing includeType as "included", as the routes store it', () => {
    const candidate = exhibit({ includeType: '', fileName: 'x.docx' });
    expect(findExhibitDuplicates(candidate, [exhibit({ includeType: undefined })])).toHaveLength(1);
  });

  it('does not match on plan when the plan is blank', () => {
    const candidate = exhibit({ planType: '', fileName: 'x.docx' });
    expect(findExhibitDuplicates(candidate, [exhibit({ planType: '' })])).toEqual([]);
  });

  it('skips the record being edited', () => {
    expect(findExhibitDuplicates(exhibit(), [exhibit()], { excludeId: 'e1' })).toEqual([]);
  });

  it('tolerates a missing list and null entries', () => {
    expect(findExhibitDuplicates(exhibit(), undefined as unknown as Exhibit[])).toEqual([]);
    expect(findExhibitDuplicates(exhibit(), [null as unknown as Exhibit])).toEqual([]);
  });
});

describe('checkExhibitDuplicates', () => {
  it('lets a unique exhibit through', () => {
    expect(checkExhibitDuplicates({ candidate: exhibit({ fileName: 'x.docx', planType: 'basic' }), existing: [exhibit()] })).toBeNull();
  });

  it('answers a possible duplicate with a 409 that names the match', () => {
    const result = checkExhibitDuplicates({ candidate: exhibit({ fileName: 'x.docx' }), existing: [exhibit()] });
    expect(result!.status).toBe(409);
    expect(result!.body).toMatchObject({ success: false, code: DUPLICATE_CODE });
    expect(result!.body.error).toContain('Egnyte to SharePoint Online Standard Plan - Standard Include');
    expect(result!.body.duplicates).toHaveLength(1);
  });

  it('caps the names in the message but returns every match', () => {
    const many = Array.from({ length: 7 }, (_, i) => exhibit({ _id: `e${i}`, name: `Exhibit ${i}`, fileName: `f${i}.docx` }));
    const result = checkExhibitDuplicates({ candidate: exhibit({ fileName: 'x.docx' }), existing: many });
    expect(result!.body.error).toContain('and 2 more');
    expect(result!.body.duplicates).toHaveLength(7);
  });

  it('proceeds when the admin confirmed the duplicate', () => {
    expect(checkExhibitDuplicates({ candidate: exhibit(), existing: [exhibit()], allowDuplicate: 'true' })).toBeNull();
  });

  it('does not expose file contents in the response', () => {
    const result = checkExhibitDuplicates({
      candidate: exhibit({ fileName: 'x.docx' }),
      existing: [exhibit({ fileData: 'UEsDBBQABgAIAAAAIQ' })],
    });
    expect(JSON.stringify(result!.body)).not.toContain('UEsDBBQ');
  });
});

describe('isDuplicateOverride', () => {
  it('accepts only an explicit true', () => {
    expect(isDuplicateOverride(true)).toBe(true);
    expect(isDuplicateOverride('true')).toBe(true);
    expect(isDuplicateOverride('TRUE')).toBe(true);
    expect(isDuplicateOverride('false')).toBe(false);
    expect(isDuplicateOverride('1')).toBe(false);
    expect(isDuplicateOverride(undefined)).toBe(false);
  });
});

describe('duplicateRulesForEdit', () => {
  const current = exhibit();
  const BOTH = ['same_combination_plan_include', 'similar_file_name'];

  it('checks nothing for a rename, so renames are never blocked', () => {
    expect(duplicateRulesForEdit(current, { name: 'New name' })).toEqual([]);
  });

  it('checks nothing when the edit form re-sends the same values', () => {
    expect(duplicateRulesForEdit(current, {
      combinations: ['multi-combination'], planType: 'standard', includeType: 'included',
    })).toEqual([]);
  });

  it('checks everything when the combination, plan or include type changes', () => {
    expect(duplicateRulesForEdit(current, { combinations: ['egnyte-to-microsoft'] })).toEqual(BOTH);
    expect(duplicateRulesForEdit(current, { planType: 'basic' })).toEqual(BOTH);
    expect(duplicateRulesForEdit(current, { includeType: 'notincluded' })).toEqual(BOTH);
  });

  // The record's key was already accepted; re-flagging its siblings on every file swap is noise.
  it('checks only the file name when just the file is swapped', () => {
    expect(duplicateRulesForEdit(current, { fileName: 'Another.docx' })).toEqual(['similar_file_name']);
    expect(duplicateRulesForEdit(current, { fileName: current.fileName })).toEqual([]);
  });

  it('does not re-flag a grouped sibling when only the file changes', () => {
    const sibling = exhibit({ _id: 'e2', name: 'Egnyte to MS Standard Include', fileName: 'ms.docx' });
    const rules = duplicateRulesForEdit(current, { fileName: 'Another.docx' });
    const result = checkExhibitDuplicates({
      candidate: { ...current, fileName: 'Another.docx' }, existing: [current, sibling], excludeId: 'e1', reasons: rules,
    });
    expect(result).toBeNull();
  });
});

describe('frontend duplicate helpers', () => {
  const body = {
    code: POSSIBLE_DUPLICATE_EXHIBIT,
    error: 'dup',
    duplicates: [{
      id: 'e1', name: 'Egnyte to SharePoint Online Standard Plan - Standard Include', fileName: 'a.docx',
      combinations: ['multi-combination', 'all'], planType: 'standard', includeType: 'included', reasons: [],
    }],
  };

  it('recognises only the duplicate warning, not the hard file-name conflict', () => {
    expect(isPossibleDuplicateResponse(409, body)).toBe(true);
    expect(isPossibleDuplicateResponse(409, { error: 'Exhibit with this filename already exists' })).toBe(false);
    expect(isPossibleDuplicateResponse(200, body)).toBe(false);
    expect(isPossibleDuplicateResponse(409, null)).toBe(false);
  });

  it('lists each match with its combination and plan, and asks to confirm', () => {
    const message = duplicateConfirmMessage(body);
    expect(message).toContain('Egnyte to SharePoint Online Standard Plan - Standard Include (multi-combination; standard / Include)');
    expect(message).not.toContain('all;');
    expect(message.trim().endsWith('Save it anyway?')).toBe(true);
  });

  it('labels Not Include matches and summarises long lists', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...body.duplicates[0], name: `E${i}`, includeType: 'notincluded' }));
    const message = duplicateConfirmMessage({ ...body, duplicates: many });
    expect(message).toContain('standard / Not Include');
    expect(message).toContain('…and 1 more');
  });
});
