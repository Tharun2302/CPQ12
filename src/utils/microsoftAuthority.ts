export const MICROSOFT_NOT_CONFIGURED_MESSAGE = 'Microsoft sign-in is not configured';

const AUTHORITY_HOST = 'https://login.microsoftonline.com';
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN_PATTERN = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export type NotConfiguredError = Error & { code: 'NOT_CONFIGURED' };

function notConfigured(): NotConfiguredError {
  const err = new Error(MICROSOFT_NOT_CONFIGURED_MESSAGE) as NotConfiguredError;
  err.code = 'NOT_CONFIGURED';
  return err;
}

export function isValidTenantId(value: string): boolean {
  return GUID_PATTERN.test(value) || DOMAIN_PATTERN.test(value);
}

// A production build must never silently fall back to the multi-tenant /common endpoint.
export function resolveTenantId(raw: string | undefined, isProd: boolean): string {
  const value = (raw || '').trim();
  if (!value) {
    if (isProd) throw notConfigured();
    return 'common';
  }
  if (!isValidTenantId(value)) throw notConfigured();
  return value;
}

export function getMicrosoftTenantId(): string {
  const raw = import.meta.env.VITE_MSAL_TENANT_ID as string | undefined;
  return resolveTenantId(raw, Boolean(import.meta.env.PROD));
}

export function getMicrosoftAuthority(): string {
  return `${AUTHORITY_HOST}/${getMicrosoftTenantId()}`;
}

export function getMicrosoftAuthorizeUrl(): string {
  return `${getMicrosoftAuthority()}/oauth2/v2.0/authorize`;
}

export function getMicrosoftTokenUrl(): string {
  return `${getMicrosoftAuthority()}/oauth2/v2.0/token`;
}
