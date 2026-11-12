export const MICROSOFT_UNAVAILABLE_MESSAGE = 'Microsoft sign-in is temporarily unavailable';
export const MICROSOFT_FAILED_MESSAGE = 'Microsoft sign-in failed, please try again';
export const MICROSOFT_NOT_AUTHORIZED_MESSAGE = 'Microsoft sign-in was not authorized for this account';

export const MICROSOFT_SERVER_ERROR_CODE = 'MICROSOFT_SERVER_ERROR';

const MAX_SERVER_MESSAGE_LENGTH = 200;

export type MicrosoftServerError = Error & { code: typeof MICROSOFT_SERVER_ERROR_CODE; status: number };

function serverMessage(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const { error, message } = body as { error?: unknown; message?: unknown };
  const text = typeof error === 'string' ? error : typeof message === 'string' ? message : '';
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_SERVER_MESSAGE_LENGTH ? trimmed : '';
}

// Returns null for statuses the UI should keep treating as a generic failure.
export function microsoftBackendErrorMessage(status: number, body: unknown): string | null {
  const fromServer = serverMessage(body);
  switch (status) {
    case 503:
      return fromServer || MICROSOFT_UNAVAILABLE_MESSAGE;
    case 401:
    case 403:
      return fromServer || MICROSOFT_NOT_AUTHORIZED_MESSAGE;
    case 400:
      return MICROSOFT_FAILED_MESSAGE;
    default:
      return null;
  }
}

export function createMicrosoftServerError(status: number, message: string): MicrosoftServerError {
  const err = new Error(message) as MicrosoftServerError;
  err.code = MICROSOFT_SERVER_ERROR_CODE;
  err.status = status;
  return err;
}

export function isMicrosoftServerError(error: unknown): error is MicrosoftServerError {
  return (error as { code?: string } | null)?.code === MICROSOFT_SERVER_ERROR_CODE;
}

const CODE_ALREADY_USED_MESSAGE = 'Authorization code already used. Please try signing in again.';

// Lets the opener surface the popup's safe messages while raw OAuth error codes stay generic.
export function microsoftPopupErrorMessage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw === MICROSOFT_FAILED_MESSAGE || raw === CODE_ALREADY_USED_MESSAGE) return raw;
  if (raw.startsWith('Access denied:') && raw.length <= MAX_SERVER_MESSAGE_LENGTH) return raw;
  return null;
}

// Only the popup's own, already user-safe messages are shown; anything else (Graph or token errors) stays generic.
export function microsoftCallbackErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('already redeemed')) {
    return CODE_ALREADY_USED_MESSAGE;
  }
  if (message.startsWith('Access denied:')) return message;
  return MICROSOFT_FAILED_MESSAGE;
}
