import { describe, it, expect } from 'vitest';
import { esignFieldRenderMode, isEsignFieldValuePrefilled } from '../../src/utils/esignFieldRender';

describe('esignFieldRenderMode', () => {
  it('renders signature fields as the signature control', () => {
    expect(esignFieldRenderMode({ type: 'signature' })).toBe('signature');
  });

  it('keeps a signature field interactive even when a prefill is present', () => {
    expect(esignFieldRenderMode({ type: 'signature', prefill: 'anush' })).toBe('signature');
  });

  // The bug: name/title/date skipped the prefill check, so a signer could overwrite a reviewer's entry.
  it.each(['name', 'title', 'date'])('locks a reviewer-filled %s field to static copy', (type) => {
    expect(esignFieldRenderMode({ type, prefill: 'anush' })).toBe('static');
  });

  it.each(['name', 'title', 'date'])('leaves an unfilled %s field editable', (type) => {
    expect(esignFieldRenderMode({ type })).toBe('input');
  });

  it('locks a prefilled text field and leaves an empty one editable', () => {
    expect(esignFieldRenderMode({ type: 'text', prefill: 'carried over' })).toBe('static');
    expect(esignFieldRenderMode({ type: 'text' })).toBe('textarea');
  });

  it('treats a whitespace-only prefill as unfilled so the field stays usable', () => {
    expect(esignFieldRenderMode({ type: 'name', prefill: '   ' })).toBe('input');
    expect(esignFieldRenderMode({ type: 'text', prefill: '\n\t ' })).toBe('textarea');
  });

  it('ignores prefill values the API may send as null', () => {
    expect(esignFieldRenderMode({ type: 'date', prefill: null })).toBe('input');
  });

  it('is case-insensitive about the type the API returns', () => {
    expect(esignFieldRenderMode({ type: 'SIGNATURE' })).toBe('signature');
    expect(esignFieldRenderMode({ type: 'Name', prefill: 'anush' })).toBe('static');
  });

  it('falls back to the signature control for a missing type', () => {
    expect(esignFieldRenderMode({})).toBe('signature');
    expect(esignFieldRenderMode(null)).toBe('signature');
  });
});

describe('isEsignFieldValuePrefilled', () => {
  it('is true only for a non-blank string prefill', () => {
    expect(isEsignFieldValuePrefilled({ prefill: 'anush' })).toBe(true);
    expect(isEsignFieldValuePrefilled({ prefill: ' ' })).toBe(false);
    expect(isEsignFieldValuePrefilled({ prefill: null })).toBe(false);
    expect(isEsignFieldValuePrefilled({})).toBe(false);
    expect(isEsignFieldValuePrefilled(undefined)).toBe(false);
  });
});
