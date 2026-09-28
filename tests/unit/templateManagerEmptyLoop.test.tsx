// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { templatesUpdateIsNoop } from '../../src/utils/templateState';

// Regression cover for the request storm seen on /templates: every template in the collection
// was archived, the list went empty, and TemplateManager refetched /api/templates forever at
// roughly one call every 3ms. The cycle was pure array identity — empty state replaced by a
// brand new empty array, which is this component's effect dependency.

type TemplateLike = { id: string; name: string };

const template = (id: string): TemplateLike => ({ id, name: id });

describe('templatesUpdateIsNoop', () => {
  it('reports empty -> empty as a no-op, which is the write that caused the loop', () => {
    expect(templatesUpdateIsNoop([], [])).toBe(true);
  });

  it('allows clearing a populated list, so deleting the last template still updates the UI', () => {
    expect(templatesUpdateIsNoop([template('a')], [])).toBe(false);
  });

  it('allows the first load to populate an empty list', () => {
    expect(templatesUpdateIsNoop([], [template('a')])).toBe(false);
  });

  it('allows replacing one populated list with another', () => {
    expect(templatesUpdateIsNoop([template('a')], [template('b')])).toBe(false);
  });

  it('treats a missing list as empty rather than throwing', () => {
    expect(templatesUpdateIsNoop(undefined as never, [])).toBe(true);
    expect(templatesUpdateIsNoop([], undefined as never)).toBe(true);
  });

  // The identity point: two distinct empty arrays are still the same state. Comparing by
  // reference here is exactly what React's dependency check does, and why the loop existed.
  it('is identity-insensitive, unlike the dependency check that drove the refetch', () => {
    const a: TemplateLike[] = [];
    const b: TemplateLike[] = [];
    expect(a === b).toBe(false);
    expect(templatesUpdateIsNoop(a, b)).toBe(true);
  });
});
