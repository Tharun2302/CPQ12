import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  resolveTenantId,
  isValidTenantId,
  getMicrosoftAuthority,
  getMicrosoftAuthorizeUrl,
  getMicrosoftTokenUrl,
  MICROSOFT_NOT_CONFIGURED_MESSAGE,
} from '../../src/utils/microsoftAuthority';

const GUID = '00000000-1111-2222-3333-444444444444';

describe('resolveTenantId', () => {
  it('accepts a GUID in production', () => {
    expect(resolveTenantId(GUID, true)).toBe(GUID);
  });

  it('accepts a verified domain name and trims whitespace', () => {
    expect(resolveTenantId('  contoso.onmicrosoft.com ', true)).toBe('contoso.onmicrosoft.com');
  });

  it.each(['common', 'organizations', 'consumers', 'not a tenant', '1234', 'a/b.com', GUID + '/x', 'evil.com?x=1'])(
    'rejects invalid value %s',
    (value) => {
      expect(() => resolveTenantId(value, true)).toThrow(MICROSOFT_NOT_CONFIGURED_MESSAGE);
      expect(() => resolveTenantId(value, false)).toThrow(MICROSOFT_NOT_CONFIGURED_MESSAGE);
    },
  );

  it('fails with a NOT_CONFIGURED error when unset in a production build', () => {
    for (const unset of [undefined, '', '   ']) {
      let caught: (Error & { code?: string }) | null = null;
      try {
        resolveTenantId(unset, true);
      } catch (err) {
        caught = err as Error & { code?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught?.message).toBe('Microsoft sign-in is not configured');
      expect(caught?.code).toBe('NOT_CONFIGURED');
    }
  });

  it('falls back to common only when unset in dev or test', () => {
    expect(resolveTenantId(undefined, false)).toBe('common');
    expect(resolveTenantId('', false)).toBe('common');
  });
});

describe('isValidTenantId', () => {
  it('distinguishes GUIDs and domains from junk', () => {
    expect(isValidTenantId(GUID)).toBe(true);
    expect(isValidTenantId('contoso.com')).toBe(true);
    expect(isValidTenantId('contoso')).toBe(false);
  });
});

describe('authority URLs from the build environment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses common when VITE_MSAL_TENANT_ID is unset under the test build', () => {
    vi.stubEnv('VITE_MSAL_TENANT_ID', '');
    expect(getMicrosoftAuthority()).toBe('https://login.microsoftonline.com/common');
  });

  it('builds tenant-specific authorize and token endpoints', () => {
    vi.stubEnv('VITE_MSAL_TENANT_ID', GUID);
    expect(getMicrosoftAuthority()).toBe(`https://login.microsoftonline.com/${GUID}`);
    expect(getMicrosoftAuthorizeUrl()).toBe(`https://login.microsoftonline.com/${GUID}/oauth2/v2.0/authorize`);
    expect(getMicrosoftTokenUrl()).toBe(`https://login.microsoftonline.com/${GUID}/oauth2/v2.0/token`);
  });

  it('refuses a malformed tenant even in dev', () => {
    vi.stubEnv('VITE_MSAL_TENANT_ID', 'common');
    expect(() => getMicrosoftAuthority()).toThrow(MICROSOFT_NOT_CONFIGURED_MESSAGE);
  });
});
