import { describe, it, expect } from 'vitest';
import { numberInputValue } from '../../src/utils/numberInput';

// A 0 left sitting in a number input is what the next keystroke appends to: the field shows
// "0", the user types 78, and the box reads "078". Rendering 0 as empty is the fix.

describe('numberInputValue', () => {
  it('renders a stored 0 as an empty field, which is the actual bug', () => {
    expect(numberInputValue(0)).toBe('');
  });

  it('renders a real number', () => {
    expect(numberInputValue(78)).toBe(78);
  });

  it('renders an empty field when nothing is set', () => {
    expect(numberInputValue(undefined)).toBe('');
    expect(numberInputValue(null)).toBe('');
  });

  it('falls back only when the primary is absent, not when it is 0', () => {
    expect(numberInputValue(undefined, 50)).toBe(50);
    expect(numberInputValue(null, 50)).toBe(50);
  });

  // Clearing a per-type count must not resurrect the shared total behind it.
  it('does not resurrect the fallback for a field the user cleared', () => {
    expect(numberInputValue(0, 50)).toBe('');
  });

  it('prefers the primary over the fallback', () => {
    expect(numberInputValue(78, 50)).toBe(78);
  });

  it('is empty when both are zero or absent', () => {
    expect(numberInputValue(0, 0)).toBe('');
    expect(numberInputValue(undefined, undefined)).toBe('');
  });

  it('ignores a non-numeric value rather than rendering NaN', () => {
    expect(numberInputValue('abc' as never)).toBe('');
  });
});
