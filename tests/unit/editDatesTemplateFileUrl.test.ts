import { describe, it, expect } from 'vitest';
import { templateFileUrl } from '../../src/components/EditDatesModal';
import { BACKEND_URL } from '../../src/config/api';

describe('EditDatesModal templateFileUrl', () => {
  it('fetches a normal template from the templates route', () => {
    expect(templateFileUrl('template-1700000000000-abc12')).toBe(
      `${BACKEND_URL}/api/templates/template-1700000000000-abc12/file`
    );
  });

  it('fetches a combination-attached agreement from the combinations route', () => {
    expect(templateFileUrl('combo-combination-1700000000000-xyz')).toBe(
      `${BACKEND_URL}/api/combinations/combination-1700000000000-xyz/file`
    );
  });

  it('only strips the leading combo- prefix', () => {
    expect(templateFileUrl('combo-combo-1')).toBe(`${BACKEND_URL}/api/combinations/combo-1/file`);
  });

  it('keeps an id with "combo-" in the middle on the templates route', () => {
    expect(templateFileUrl('template-combo-1')).toBe(`${BACKEND_URL}/api/templates/template-combo-1/file`);
  });

  it('encodes unsafe characters so the id cannot change the path', () => {
    expect(templateFileUrl('combo-../x')).toBe(`${BACKEND_URL}/api/combinations/..%2Fx/file`);
  });
});
