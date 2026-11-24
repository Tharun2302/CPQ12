import { describe, it, expect } from 'vitest';
import editDates from '../../edit-dates-template-data.cjs';

const { mergeEditedTemplateData } = editDates;

describe('mergeEditedTemplateData', () => {
  const stored = { '{{start_date}}': '07/01/2026', '{{client}}': 'Acme' };

  it('updates keys the agreement already has', () => {
    expect(mergeEditedTemplateData(stored, { '{{start_date}}': '08/01/2026' }))
      .toEqual({ '{{start_date}}': '08/01/2026', '{{client}}': 'Acme' });
  });

  it('ignores new keys, non-date keys, non-strings and very long values', () => {
    const merged = mergeEditedTemplateData(stored, {
      '{{today}}': '08/01/2026',
      '{{client}}': 'Someone Else',
      '{{start_date}}': 'x'.repeat(201),
    });
    expect(merged).toEqual(stored);
    expect(mergeEditedTemplateData(stored, { '{{start_date}}': { $set: 'x' } })).toEqual(stored);
  });

  it('cannot change the object prototype', () => {
    const merged = mergeEditedTemplateData(stored, JSON.parse('{"__proto__": {"polluted": "yes"}}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(merged).toEqual(stored);
  });

  it('returns null when there is nothing valid to merge', () => {
    expect(mergeEditedTemplateData(null, { a: 'b' })).toBeNull();
    expect(mergeEditedTemplateData(stored, undefined)).toBeNull();
    expect(mergeEditedTemplateData(stored, ['x'])).toBeNull();
  });
});
