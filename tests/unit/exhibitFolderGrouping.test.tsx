// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { deriveFolderName, buildFolderGroups } from '../../src/components/ExhibitManager';

type ExhibitLike = Parameters<typeof deriveFolderName>[0];

let seq = 0;
function makeExhibit(overrides: Partial<ExhibitLike> = {}): ExhibitLike {
  seq += 1;
  return {
    _id: `exhibit-${seq}`,
    name: `Sample Exhibit ${seq}`,
    description: 'desc',
    fileName: `file-${seq}.docx`,
    fileSize: 1024,
    category: 'content',
    combinations: ['box-to-onedrive'],
    displayOrder: seq,
    keywords: [],
    isRequired: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  } as ExhibitLike;
}

describe('deriveFolderName', () => {
  it('groups two exhibits sharing a base combination into one folder', () => {
    const list = [
      makeExhibit({ combinations: ['box-to-onedrive'] }),
      makeExhibit({ combinations: ['box-to-onedrive'] }),
    ];

    const folders = buildFolderGroups(list);

    expect(folders).toHaveLength(1);
    expect(folders[0].exhibits).toHaveLength(2);
  });

  it('strips stacked include and plan suffixes so both variants land in one folder', () => {
    const included = makeExhibit({ combinations: ['box-to-onedrive-standard-included'] });
    const notIncluded = makeExhibit({ combinations: ['box-to-onedrive-standard-notincluded'] });

    expect(deriveFolderName(included)).toBe(deriveFolderName(notIncluded));
    expect(buildFolderGroups([included, notIncluded])).toHaveLength(1);
  });

  it('prefers the predefined combination label over any reconstruction', () => {
    const exhibit = makeExhibit({
      category: 'messaging',
      combinations: ['slack-to-teams'],
      name: 'Something Else - Standard',
    });

    expect(deriveFolderName(exhibit)).toBe('Slack to Teams');
  });

  it('routes the "all" combination to Ungrouped', () => {
    const exhibit = makeExhibit({ combinations: ['all'] });

    expect(deriveFolderName(exhibit)).toBeNull();
    const folders = buildFolderGroups([exhibit]);
    expect(folders).toHaveLength(1);
    expect(folders[0].isUngrouped).toBe(true);
    expect(folders[0].name).toBe('Ungrouped');
  });

  it('routes an empty combinations array to Ungrouped', () => {
    const exhibit = makeExhibit({ combinations: [] });

    expect(deriveFolderName(exhibit)).toBeNull();
    expect(buildFolderGroups([exhibit])[0].isUngrouped).toBe(true);
  });

  it('routes undefined combinations to Ungrouped without throwing', () => {
    const exhibit = makeExhibit({ combinations: undefined as unknown as string[] });

    expect(() => deriveFolderName(exhibit)).not.toThrow();
    expect(deriveFolderName(exhibit)).toBeNull();
    expect(buildFolderGroups([exhibit])[0].isUngrouped).toBe(true);
  });

  it('falls back to the exhibit name for an unknown category without throwing', () => {
    const exhibit = makeExhibit({
      category: 'default' as unknown as ExhibitLike['category'],
      combinations: ['acme-to-widget-standard'],
      name: 'Acme To Widget Standard Plan - Standard Include',
    });

    expect(() => deriveFolderName(exhibit)).not.toThrow();
    expect(deriveFolderName(exhibit)).toBe('Acme To Widget');
  });

  it('reconstructs a non-empty name from the slug when the name has no " - "', () => {
    const exhibit = makeExhibit({
      category: 'default' as unknown as ExhibitLike['category'],
      combinations: ['acme-to-widget'],
      name: 'NoDashHere',
    });

    expect(deriveFolderName(exhibit)).toBe('Acme To Widget');
  });
});

describe('buildFolderGroups', () => {
  it('sorts folders alphabetically and forces Ungrouped last', () => {
    const list = [
      makeExhibit({ combinations: ['all'] }),
      makeExhibit({ category: 'messaging', combinations: ['slack-to-teams'] }),
      makeExhibit({ combinations: ['box-to-onedrive'] }),
    ];

    const names = buildFolderGroups(list).map(folder => folder.name);

    expect(names[names.length - 1]).toBe('Ungrouped');
    const grouped = names.slice(0, -1);
    expect(grouped).toEqual([...grouped].sort());
    expect(grouped).toContain('Slack to Teams');
  });

  it('omits the Ungrouped folder entirely when nothing is ungrouped', () => {
    const folders = buildFolderGroups([makeExhibit({ combinations: ['box-to-onedrive'] })]);

    expect(folders.some(folder => folder.isUngrouped)).toBe(false);
  });

  it('preserves every input exhibit exactly once across all folders', () => {
    const list = [
      makeExhibit({ combinations: ['box-to-onedrive-standard-included'] }),
      makeExhibit({ combinations: ['box-to-onedrive-standard-notincluded'] }),
      makeExhibit({ category: 'messaging', combinations: ['slack-to-teams'] }),
      makeExhibit({ combinations: ['all'] }),
      makeExhibit({ combinations: [] }),
      makeExhibit({ combinations: undefined as unknown as string[] }),
      makeExhibit({ combinations: ['egnyte-to-sharepoint-basic'] }),
    ];

    const folders = buildFolderGroups(list);
    const flattened = folders.flatMap(folder => folder.exhibits);

    expect(flattened).toHaveLength(list.length);
    expect(new Set(flattened.map(exhibit => exhibit._id)).size).toBe(list.length);
  });

  it('agrees with the sorted deriveFolderName set that feeds the upload dropdown', () => {
    const list = [
      makeExhibit({ combinations: ['box-to-onedrive-standard-included'] }),
      makeExhibit({ combinations: ['box-to-onedrive-standard-notincluded'] }),
      makeExhibit({ category: 'messaging', combinations: ['slack-to-teams'] }),
      makeExhibit({ combinations: ['egnyte-to-sharepoint-basic'] }),
      makeExhibit({ combinations: ['all'] }),
    ];

    const availableFolders = Array.from(
      new Set(list.map(deriveFolderName).filter(Boolean) as string[])
    ).sort();
    const groupNames = buildFolderGroups(list)
      .filter(folder => !folder.isUngrouped)
      .map(folder => folder.name);

    expect(groupNames).toEqual(availableFolders);
  });
});
