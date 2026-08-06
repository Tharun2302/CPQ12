import { describe, it, expect } from 'vitest';
import {
  buildCreatorIndex,
  filterCreators,
  creatorSelectionState,
  toggleCreatorSelection,
  type CreatorSourceAgreement,
  type CreatorEntry,
} from '../../src/utils/esignCreatorSelection';

const agreement = (over: Partial<CreatorSourceAgreement> & { id: string }): CreatorSourceAgreement => ({
  creator_email: 'creator@cloudfuze.com',
  creator_name: 'Creator One',
  ...over,
});

const creator = (creators: CreatorEntry[], email: string): CreatorEntry => {
  const hit = creators.find((c) => c.email === email);
  if (!hit) throw new Error(`no creator indexed for ${email}`);
  return hit;
};

describe('buildCreatorIndex', () => {
  it('indexes the creator of each agreement', () => {
    const creators = buildCreatorIndex([
      agreement({ id: 'a1', creator_email: 'vicky.cariappa@cloudfuze.com', creator_name: 'Vicky Cariappa' }),
    ]);
    expect(creators).toHaveLength(1);
    expect(creator(creators, 'vicky.cariappa@cloudfuze.com').name).toBe('Vicky Cariappa');
  });

  it('ignores recipients entirely — signers must not appear as pickable people', () => {
    const creators = buildCreatorIndex([
      {
        id: 'a1',
        creator_email: 'arundhati.sen@cloudfuze.com',
        creator_name: 'Arundhati Sen',
        // Extra key a full Agreement carries; the index must not reach into it.
        ...({ recipients: [{ email: 'adi.nandyala@cloudfuze.com', name: 'Adi Nandyala' }] } as object),
      },
    ]);
    expect(creators.map((c) => c.email)).toEqual(['arundhati.sen@cloudfuze.com']);
  });

  it('collapses the same creator across agreements and accumulates their ids', () => {
    const creators = buildCreatorIndex([
      agreement({ id: 'a1', creator_email: 'deepak.rj@cloudfuze.com', creator_name: 'Deepak Rj' }),
      agreement({ id: 'a2', creator_email: 'deepak.rj@cloudfuze.com', creator_name: 'Deepak Rj' }),
      agreement({ id: 'a3', creator_email: 'other@cloudfuze.com', creator_name: 'Other' }),
    ]);
    expect(creator(creators, 'deepak.rj@cloudfuze.com').ids).toEqual(['a1', 'a2']);
    expect(creator(creators, 'other@cloudfuze.com').ids).toEqual(['a3']);
  });

  it('matches emails case- and whitespace-insensitively', () => {
    const creators = buildCreatorIndex([
      agreement({ id: 'a1', creator_email: 'Arundhati.Sen@cloudfuze.com' }),
      agreement({ id: 'a2', creator_email: '  arundhati.sen@CLOUDFUZE.com  ' }),
    ]);
    expect(creators).toHaveLength(1);
    expect(creator(creators, 'arundhati.sen@cloudfuze.com').ids).toEqual(['a1', 'a2']);
  });

  it('falls back to uploaded_by when creator_email is absent', () => {
    const creators = buildCreatorIndex([
      agreement({ id: 'a1', creator_email: null, uploaded_by: 'seth@cloudfuze.com' }),
    ]);
    expect(creator(creators, 'seth@cloudfuze.com').ids).toEqual(['a1']);
  });

  it('skips agreements with no creator email rather than creating a blank entry', () => {
    expect(buildCreatorIndex([agreement({ id: 'a1', creator_email: '', uploaded_by: null })])).toEqual([]);
    expect(buildCreatorIndex([agreement({ id: 'a1', creator_email: '   ', uploaded_by: '  ' })])).toEqual([]);
  });

  it('keeps the first non-empty display name and tolerates a missing one', () => {
    const creators = buildCreatorIndex([
      agreement({ id: 'a1', creator_email: 'x@cloudfuze.com', creator_name: null }),
      agreement({ id: 'a2', creator_email: 'x@cloudfuze.com', creator_name: 'Real Name' }),
      agreement({ id: 'a3', creator_email: 'x@cloudfuze.com', creator_name: 'Later Name' }),
    ]);
    expect(creator(creators, 'x@cloudfuze.com').name).toBe('Real Name');
  });

  it('sorts busiest creators first, then alphabetically', () => {
    const creators = buildCreatorIndex([
      agreement({ id: 'a1', creator_email: 'busy@cloudfuze.com', creator_name: 'Busy' }),
      agreement({ id: 'a2', creator_email: 'busy@cloudfuze.com', creator_name: 'Busy' }),
      agreement({ id: 'a3', creator_email: 'zoe@cloudfuze.com', creator_name: 'Zoe' }),
      agreement({ id: 'a4', creator_email: 'amy@cloudfuze.com', creator_name: 'Amy' }),
    ]);
    expect(creators.map((c) => c.name)).toEqual(['Busy', 'Amy', 'Zoe']);
  });

  it('handles an empty agreement list', () => {
    expect(buildCreatorIndex([])).toEqual([]);
  });

  it('never lists the same agreement id twice for one creator', () => {
    const creators = buildCreatorIndex([
      agreement({ id: 'a1', creator_email: 'dup@cloudfuze.com' }),
      agreement({ id: 'a1', creator_email: 'dup@cloudfuze.com' }),
    ]);
    expect(creator(creators, 'dup@cloudfuze.com').ids).toEqual(['a1']);
  });
});

describe('filterCreators', () => {
  const creators = buildCreatorIndex([
    agreement({ id: 'a1', creator_email: 'arundhati.sen@cloudfuze.com', creator_name: 'Arundhati Sen' }),
    agreement({ id: 'a2', creator_email: 'deepak.rj@cloudfuze.com', creator_name: 'Deepak Rj' }),
  ]);

  it('returns everyone for an empty or whitespace query', () => {
    expect(filterCreators(creators, '')).toHaveLength(2);
    expect(filterCreators(creators, '   ')).toHaveLength(2);
  });

  it('matches on email substring, case-insensitively', () => {
    expect(filterCreators(creators, 'DEEPAK').map((c) => c.email)).toEqual(['deepak.rj@cloudfuze.com']);
  });

  it('matches on display name', () => {
    expect(filterCreators(creators, 'arundhati').map((c) => c.name)).toEqual(['Arundhati Sen']);
  });

  it('returns nothing when no one matches', () => {
    expect(filterCreators(creators, 'nobody')).toEqual([]);
  });
});

describe('creatorSelectionState / toggleCreatorSelection', () => {
  const c: CreatorEntry = { email: 'c@cloudfuze.com', name: 'C', ids: ['a1', 'a2', 'a3'] };

  it('reports none, some, and all', () => {
    expect(creatorSelectionState(c, new Set())).toBe('none');
    expect(creatorSelectionState(c, new Set(['a1']))).toBe('some');
    expect(creatorSelectionState(c, new Set(['a1', 'a2']))).toBe('some');
    expect(creatorSelectionState(c, new Set(['a1', 'a2', 'a3']))).toBe('all');
  });

  it('ignores selected ids that do not belong to the creator', () => {
    expect(creatorSelectionState(c, new Set(['zzz']))).toBe('none');
    expect(creatorSelectionState(c, new Set(['a1', 'a2', 'a3', 'zzz']))).toBe('all');
  });

  it('treats a creator with no agreements as unselected', () => {
    expect(creatorSelectionState({ ...c, ids: [] }, new Set(['a1']))).toBe('none');
  });

  it('selects all of a creator’s agreements from none', () => {
    expect([...toggleCreatorSelection(c, new Set())].sort()).toEqual(['a1', 'a2', 'a3']);
  });

  it('completes a partial selection rather than clearing it', () => {
    expect([...toggleCreatorSelection(c, new Set(['a1']))].sort()).toEqual(['a1', 'a2', 'a3']);
  });

  it('clears a fully selected creator', () => {
    expect([...toggleCreatorSelection(c, new Set(['a1', 'a2', 'a3']))]).toEqual([]);
  });

  it('leaves other creators’ selections untouched when clearing', () => {
    const next = toggleCreatorSelection(c, new Set(['a1', 'a2', 'a3', 'other1']));
    expect([...next]).toEqual(['other1']);
  });

  it('does not mutate the set it was given', () => {
    const before = new Set(['a1']);
    toggleCreatorSelection(c, before);
    expect([...before]).toEqual(['a1']);
  });
});
