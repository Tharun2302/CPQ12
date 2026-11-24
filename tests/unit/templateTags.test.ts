import { describe, it, expect } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import helper from '../../template-tags.cjs';

const { sanitizeTemplateTags } = helper as { sanitizeTemplateTags: (value: unknown) => string[] | null };

describe('sanitizeTemplateTags', () => {
  it('keeps a list of tag names, without duplicates', () => {
    expect(sanitizeTemplateTags(['Date', 'Effective Date', 'Date'])).toEqual(['Date', 'Effective Date']);
    expect(sanitizeTemplateTags([])).toEqual([]);
  });

  it('rejects anything that is not a plain list of short names', () => {
    expect(sanitizeTemplateTags(undefined)).toBeNull();
    expect(sanitizeTemplateTags('Date')).toBeNull();
    expect(sanitizeTemplateTags(['Date', 3])).toBeNull();
    expect(sanitizeTemplateTags(['Date', ''])).toBeNull();
    expect(sanitizeTemplateTags(['x'.repeat(201)])).toBeNull();
    expect(sanitizeTemplateTags(Array.from({ length: 501 }, (_, i) => `t${i}`))).toBeNull();
  });
});
