import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { planManageExhibitMerge, mergeManageExhibits } from '../../src/utils/manageExhibitMerge';

// Every real DOCX is a ZIP, so it starts with these four bytes
const ZIP_HEADER = 'PK\u0003\u0004';

const mergeDocxFiles = vi.fn();
vi.mock('../../src/utils/docxMerger', () => ({ mergeDocxFiles: (...args: unknown[]) => mergeDocxFiles(...args) }));

type Ex = {
  _id: string;
  name: string;
  combinations: string[];
  includeType?: string;
  displayOrder?: number;
  planType?: string;
};

const ex = (id: string, overrides: Partial<Ex> = {}): Ex => ({
  _id: id,
  name: `Exhibit ${id}`,
  combinations: ['data-sprawl'],
  displayOrder: 0,
  ...overrides,
});

const idsOf = (list: Array<{ _id: string }>) => list.map((e) => e._id);

describe('planManageExhibitMerge', () => {
  it('matches the template tag case-insensitively', () => {
    const all = [ex('a', { combinations: ['Data-Sprawl'] }), ex('b', { combinations: ['MANGE+SPRAWL'] })];
    expect(idsOf(planManageExhibitMerge(all, 'data-sprawl', ['a', 'b']).exhibits)).toEqual(['a']);
    expect(idsOf(planManageExhibitMerge(all, 'mange+sprawl', ['a', 'b']).exhibits)).toEqual(['b']);
  });

  it('includes only ticked exhibits', () => {
    const all = [ex('a'), ex('b'), ex('c')];
    expect(idsOf(planManageExhibitMerge(all, 'data-sprawl', ['a', 'c']).exhibits)).toEqual(['a', 'c']);
  });

  it('ignores ticked exhibits attached to another Manage template', () => {
    const all = [ex('a'), ex('b', { combinations: ['mange+sprawl'] })];
    expect(idsOf(planManageExhibitMerge(all, 'data-sprawl', ['a', 'b']).exhibits)).toEqual(['a']);
  });

  it('never includes migration-pair exhibits, even when a leftover selection ticks them', () => {
    const all = [
      ex('a'),
      ex('pair-in', { combinations: ['box-to-dropbox'], includeType: 'included', planType: 'basic' }),
      ex('pair-out', { combinations: ['box-to-dropbox'], includeType: 'notincluded', planType: 'basic' }),
      ex('multi', { combinations: ['multi-combination'] }),
    ];
    expect(idsOf(planManageExhibitMerge(all, 'data-sprawl', ['a', 'pair-in', 'pair-out', 'multi']).exhibits)).toEqual(['a']);
  });

  it('ignores plan type', () => {
    const all = [ex('a', { planType: 'basic' }), ex('b', { planType: 'advanced' }), ex('c')];
    expect(idsOf(planManageExhibitMerge(all, 'data-sprawl', ['a', 'b', 'c']).exhibits)).toEqual(['a', 'b', 'c']);
  });

  it('de-dupes by id, not by name', () => {
    const all = [
      ex('a', { name: 'Data Sprawl - Scope' }),
      ex('a', { name: 'Data Sprawl - Scope' }),
      ex('b', { name: 'Data Sprawl - Scope' }),
    ];
    const plan = planManageExhibitMerge(all, 'data-sprawl', ['a', 'a', 'b']);
    expect(idsOf(plan.exhibits)).toEqual(['a', 'b']);
  });

  it('none typed: plain mode in picker order (displayOrder, then name)', () => {
    const all = [
      ex('c', { name: 'Zeta', displayOrder: 2 }),
      ex('b', { name: 'Beta', displayOrder: 1 }),
      ex('a', { name: 'Alpha', displayOrder: 1 }),
    ];
    const plan = planManageExhibitMerge(all, 'data-sprawl', ['c', 'b', 'a']);
    expect(plan.mode).toBe('plain');
    expect(idsOf(plan.exhibits)).toEqual(['a', 'b', 'c']);
  });

  it('all typed: grouped mode, Include before Not Include', () => {
    const all = [
      ex('out', { includeType: 'notincluded', displayOrder: 0 }),
      ex('in2', { includeType: 'included', displayOrder: 5 }),
      ex('in1', { includeType: 'included', displayOrder: 1 }),
    ];
    const plan = planManageExhibitMerge(all, 'data-sprawl', ['out', 'in2', 'in1']);
    expect(plan.mode).toBe('grouped');
    expect(idsOf(plan.exhibits)).toEqual(['in1', 'in2', 'out']);
  });

  it('mixed: plain mode ordered Include, unset, Not Include', () => {
    const all = [
      ex('out', { includeType: 'notincluded' }),
      ex('none'),
      ex('odd', { includeType: 'something-else' }),
      ex('in', { includeType: 'included' }),
    ];
    const plan = planManageExhibitMerge(all, 'data-sprawl', ['out', 'none', 'odd', 'in']);
    expect(plan.mode).toBe('plain');
    expect(idsOf(plan.exhibits)).toEqual(['in', 'none', 'odd', 'out']);
  });

  it('returns nothing for no ticks, no template or no attached exhibits', () => {
    const all = [ex('a')];
    expect(planManageExhibitMerge(all, 'data-sprawl', []).exhibits).toEqual([]);
    expect(planManageExhibitMerge(all, '', ['a']).exhibits).toEqual([]);
    expect(planManageExhibitMerge([], 'data-sprawl', ['a']).exhibits).toEqual([]);
    expect(planManageExhibitMerge(all, 'mange+sprawl', ['a']).exhibits).toEqual([]);
  });
});

describe('mergeManageExhibits', () => {
  const BACKEND = 'http://backend.test';
  const agreement = new Blob(['agreement']);
  const merged = new Blob(['merged']);
  // 200 = a real DOCX (ZIP header), 'corrupt' = 200 with bytes that are not a DOCX, else the HTTP status
  let files: Record<string, number | 'corrupt'>;
  let catalogue: Ex[];

  beforeEach(() => {
    mergeDocxFiles.mockReset().mockResolvedValue(merged);
    files = {};
    catalogue = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith(`${BACKEND}/api/exhibits?`)) {
        return { ok: true, status: 200, json: async () => ({ success: true, exhibits: catalogue }) };
      }
      const m = url.match(/\/api\/exhibits\/([^/]+)\/file/);
      const entry = m ? files[m[1]] ?? 404 : 404;
      const status = entry === 'corrupt' ? 200 : entry;
      const body = entry === 'corrupt' ? ['not a docx'] : [ZIP_HEADER, `file-${m?.[1]}`];
      return { ok: status === 200, status, blob: async () => new Blob(body) };
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const run = (selectedIds: string[]) =>
    mergeManageExhibits(agreement, { backendUrl: BACKEND, templateValue: 'data-sprawl', selectedIds });

  const mergedFileTexts = async () => {
    const blobs = mergeDocxFiles.mock.calls[0][1] as Blob[];
    return Promise.all(blobs.map(async (b) => (await b.text()).slice(ZIP_HEADER.length)));
  };

  it('plain mode: merges without metadata and keeps all content', async () => {
    catalogue = [ex('a', { displayOrder: 2 }), ex('b', { displayOrder: 1 })];
    files = { a: 200, b: 200 };

    const result = await run(['a', 'b']);

    expect(result).toEqual({ blob: merged, attached: 2, failed: [] });
    expect(mergeDocxFiles).toHaveBeenCalledTimes(1);
    const [main, , meta, options] = mergeDocxFiles.mock.calls[0];
    expect(main).toBe(agreement);
    expect(await mergedFileTexts()).toEqual(['file-b', 'file-a']);
    expect(meta).toBeUndefined();
    expect(options).toEqual({ keepAllContent: true });
  });

  it('grouped mode: passes metadata aligned with the files', async () => {
    catalogue = [
      ex('out', { name: 'Out', includeType: 'notincluded' }),
      ex('in', { name: 'In', includeType: 'included' }),
    ];
    files = { out: 200, in: 200 };

    await run(['out', 'in']);

    const [, , meta, options] = mergeDocxFiles.mock.calls[0];
    expect(await mergedFileTexts()).toEqual(['file-in', 'file-out']);
    expect(meta).toEqual([
      { name: 'In', category: '', includeType: 'included' },
      { name: 'Out', category: '', includeType: 'notincluded' },
    ]);
    expect(options).toBeUndefined();
  });

  it('two exhibits with the same name are both merged', async () => {
    catalogue = [ex('a', { name: 'Same' }), ex('b', { name: 'Same' })];
    files = { a: 200, b: 200 };

    const result = await run(['a', 'b']);

    expect(result.attached).toBe(2);
    expect(await mergedFileTexts()).toEqual(['file-a', 'file-b']);
  });

  it('reports a file that fails to load and still merges the rest', async () => {
    catalogue = [ex('a', { name: 'Loads' }), ex('b', { name: 'Broken' })];
    files = { a: 200, b: 500 };

    const result = await run(['a', 'b']);

    expect(result.failed).toEqual(['Broken']);
    expect(result.attached).toBe(1);
    expect(await mergedFileTexts()).toEqual(['file-a']);
  });

  it('reports a file that downloads but is not a DOCX instead of letting the merger drop it silently', async () => {
    catalogue = [ex('a', { name: 'Loads' }), ex('b', { name: 'Corrupt' })];
    files = { a: 200, b: 'corrupt' };

    const result = await run(['a', 'b']);

    expect(result.failed).toEqual(['Corrupt']);
    expect(result.attached).toBe(1);
    expect(await mergedFileTexts()).toEqual(['file-a']);
  });

  it('returns the agreement untouched when every file fails', async () => {
    catalogue = [ex('a', { name: 'Broken' })];
    files = { a: 500 };

    const result = await run(['a']);

    expect(result).toEqual({ blob: agreement, attached: 0, failed: ['Broken'] });
    expect(mergeDocxFiles).not.toHaveBeenCalled();
  });

  it('does not fetch files or merge when nothing attached is ticked', async () => {
    catalogue = [ex('a'), ex('pair', { combinations: ['box-to-dropbox'] })];
    files = { a: 200, pair: 200 };

    const result = await run(['pair']);

    expect(result).toEqual({ blob: agreement, attached: 0, failed: [] });
    expect(mergeDocxFiles).not.toHaveBeenCalled();
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some(([u]) => String(u).includes('/file'))).toBe(false);
  });

  it('throws when the exhibit list cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(run(['a'])).rejects.toThrow(/exhibit list/);
  });
});
