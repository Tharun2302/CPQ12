import { BACKEND_URL } from '../config/api';

export interface ReportClientErrorOptions {
  stack?: string;
  severity?: 'error' | 'warn' | 'info';
  context?: Record<string, unknown>;
}

/**
 * Best-effort client-side error reporter. Fire-and-forget by design: callers
 * must never have their own error handling disrupted by a failure here, so
 * every failure mode (network down, backend unreachable, bad response) is
 * swallowed instead of surfaced.
 */
export function reportClientError(message: string, opts?: ReportClientErrorOptions): void {
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('cpq_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    fetch(`${BACKEND_URL}/api/client-log`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message,
        stack: opts?.stack,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        severity: opts?.severity ?? 'error',
        context: opts?.context,
      }),
    }).catch(() => {
      // Best-effort only: reporting failures must never surface to the caller.
    });
  } catch {
    // Never let error reporting itself throw.
  }
}
