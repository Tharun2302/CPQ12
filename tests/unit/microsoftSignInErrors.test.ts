import { describe, it, expect } from 'vitest';
import {
  microsoftBackendErrorMessage,
  microsoftCallbackErrorMessage,
  microsoftPopupErrorMessage,
  createMicrosoftServerError,
  isMicrosoftServerError,
  MICROSOFT_UNAVAILABLE_MESSAGE,
  MICROSOFT_FAILED_MESSAGE,
} from '../../src/utils/microsoftSignInErrors';

describe('microsoftBackendErrorMessage', () => {
  it('shows the 503 message from the server', () => {
    expect(microsoftBackendErrorMessage(503, { success: false, error: 'Microsoft sign-in is temporarily unavailable' }))
      .toBe('Microsoft sign-in is temporarily unavailable');
  });

  it('falls back to a fixed 503 message when the body is missing or unusable', () => {
    expect(microsoftBackendErrorMessage(503, null)).toBe(MICROSOFT_UNAVAILABLE_MESSAGE);
    expect(microsoftBackendErrorMessage(503, { error: 'x'.repeat(500) })).toBe(MICROSOFT_UNAVAILABLE_MESSAGE);
    expect(microsoftBackendErrorMessage(503, { error: { nested: true } })).toBe(MICROSOFT_UNAVAILABLE_MESSAGE);
  });

  it('shows the server message for 401 and 403 and a safe default otherwise', () => {
    expect(microsoftBackendErrorMessage(401, { error: 'Authentication failed' })).toBe('Authentication failed');
    expect(microsoftBackendErrorMessage(403, {})).toMatch(/not authorized/);
  });

  it('uses the generic failure message for 400 regardless of body', () => {
    expect(microsoftBackendErrorMessage(400, { error: 'internal detail' })).toBe(MICROSOFT_FAILED_MESSAGE);
  });

  it('leaves other statuses to the generic handler', () => {
    expect(microsoftBackendErrorMessage(500, { error: 'boom' })).toBeNull();
    expect(microsoftBackendErrorMessage(429, {})).toBeNull();
  });
});

describe('server error marker', () => {
  it('is recognised by isMicrosoftServerError', () => {
    const err = createMicrosoftServerError(503, 'down');
    expect(isMicrosoftServerError(err)).toBe(true);
    expect(err.status).toBe(503);
    expect(isMicrosoftServerError(new Error('x'))).toBe(false);
    expect(isMicrosoftServerError(null)).toBe(false);
  });
});

describe('popup messages', () => {
  it('maps any unexpected callback error to the generic failure message', () => {
    expect(microsoftCallbackErrorMessage(new Error('Profile fetch failed: 401 - secret body'))).toBe(MICROSOFT_FAILED_MESSAGE);
    expect(microsoftCallbackErrorMessage('weird')).toBe(MICROSOFT_FAILED_MESSAGE);
  });

  it('keeps the already-redeemed and access-denied messages', () => {
    expect(microsoftCallbackErrorMessage(new Error('AADSTS54005 code was already redeemed'))).toMatch(/already used/);
    expect(microsoftCallbackErrorMessage(new Error('Access denied: Only cloudfuze.com domain is allowed')))
      .toBe('Access denied: Only cloudfuze.com domain is allowed');
  });

  it('only forwards known safe popup messages to the opener', () => {
    expect(microsoftPopupErrorMessage(MICROSOFT_FAILED_MESSAGE)).toBe(MICROSOFT_FAILED_MESSAGE);
    expect(microsoftPopupErrorMessage('access_denied')).toBeNull();
    expect(microsoftPopupErrorMessage(undefined)).toBeNull();
    expect(microsoftPopupErrorMessage('<img src=x onerror=alert(1)>')).toBeNull();
  });
});
