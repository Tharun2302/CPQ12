export const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
export const SESSION_WARNING_MS = 2 * 60 * 1000;
export const ACTIVITY_PING_INTERVAL_MS = 60 * 1000;
// Open tabs share one deadline so activity in any tab keeps the others signed in
export const SESSION_DEADLINE_KEY = 'cpq_session_deadline';
export const USER_ACTIVITY_EVENT = 'cpq:user-activity';
// A failed check at the deadline is retried this long before signing out
export const EXPIRY_CHECK_GRACE_MS = 30 * 1000;

const ACTIVITY_DOM_EVENTS = ['keydown', 'mousedown', 'mousemove', 'touchstart', 'wheel'] as const;

export type SessionCallResult =
  | { status: 'ok'; idleRemainingMs: number; maxAgeRemainingMs?: number }
  | { status: 'expired' }
  | { status: 'error' };

// 'idle' can be extended by activity; 'limit' is the absolute sign-in cap and cannot
export type SessionEndKind = 'idle' | 'limit';

export interface SessionGuardOptions {
  initialRemainingMs: number;
  initialMaxAgeRemainingMs?: number;
  sendActivity: () => Promise<SessionCallResult>;
  checkSession: () => Promise<SessionCallResult>;
  onWarningChange: (open: boolean, deadline: number, kind: SessionEndKind) => void;
  onExpire: (kind: SessionEndKind) => void;
  now?: () => number;
  target?: Window;
  storage?: Storage;
  tickMs?: number;
  // Tests only: synthetic DOM events are never isTrusted
  acceptUntrustedEvents?: boolean;
}

export interface SessionGuard {
  staySignedIn: () => Promise<boolean>;
  stop: () => void;
}

// For activity the page cannot see itself, such as typing inside the OnlyOffice iframe
export function reportUserActivity(target: Window = window): void {
  target.dispatchEvent(new Event(USER_ACTIVITY_EVENT));
}

// Browsers fire zero-movement mousemove when content scrolls or re-renders under a still cursor
function isRealActivity(event: Event, acceptUntrusted: boolean): boolean {
  if (event.type === USER_ACTIVITY_EVENT) return true;
  if (!event.isTrusted && !acceptUntrusted) return false;
  if (event.type === 'mousemove') {
    const { movementX, movementY } = event as MouseEvent;
    return movementX !== 0 || movementY !== 0;
  }
  return true;
}

// Blocked site data makes the localStorage getter itself throw
function safeLocalStorage(target: Window): Storage | null {
  try {
    return target.localStorage;
  } catch {
    return null;
  }
}

function readSharedDeadline(storage: Storage | null): number {
  if (!storage) return 0;
  try {
    const value = Number(storage.getItem(SESSION_DEADLINE_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeSharedDeadline(storage: Storage | null, deadline: number): void {
  if (!storage) return;
  try {
    storage.setItem(SESSION_DEADLINE_KEY, String(deadline));
  } catch {
    // Without storage each tab still keeps its own deadline
  }
}

export function startSessionGuard(options: SessionGuardOptions): SessionGuard {
  const now = options.now ?? Date.now;
  const target = options.target ?? window;
  const storage = options.storage ?? safeLocalStorage(target);
  const tickMs = options.tickMs ?? 1000;

  // The idle deadline is shared across tabs; the cap is fixed for the session, so each tab knows it from the server
  let idleDeadline = now() + options.initialRemainingMs;
  let capDeadline = now() + (options.initialMaxAgeRemainingMs ?? Number.POSITIVE_INFINITY);
  let lastPingAt = Number.NEGATIVE_INFINITY;
  let pendingActivity = false;
  let pingInFlight = false;
  let checkingExpiry = false;
  let warningOpen = false;
  let stopped = false;

  const deadline = () => Math.min(idleDeadline, capDeadline);
  const kind = (): SessionEndKind => (capDeadline <= idleDeadline ? 'limit' : 'idle');

  writeSharedDeadline(storage, idleDeadline);

  // Also re-sent while open so the countdown and message follow a moved deadline
  const refreshWarning = () => {
    const open = deadline() - now() <= SESSION_WARNING_MS;
    if (!open && !warningOpen) return;
    warningOpen = open;
    options.onWarningChange(open, deadline(), kind());
  };

  const moveIdleDeadline = (next: number) => {
    idleDeadline = next;
    if (warningOpen) refreshWarning();
  };

  const adoptRemaining = (result: { idleRemainingMs: number; maxAgeRemainingMs?: number }) => {
    if (typeof result.maxAgeRemainingMs === 'number') capDeadline = now() + result.maxAgeRemainingMs;
    moveIdleDeadline(now() + result.idleRemainingMs);
    writeSharedDeadline(storage, idleDeadline);
  };

  const expire = () => {
    if (stopped) return;
    const endKind = kind();
    stop();
    options.onExpire(endKind);
  };

  const ping = async (): Promise<boolean> => {
    pingInFlight = true;
    pendingActivity = false;
    lastPingAt = now();
    try {
      const result = await options.sendActivity();
      if (stopped) return false;
      if (result.status === 'ok') {
        adoptRemaining(result);
        return true;
      }
      if (result.status === 'expired') {
        expire();
        return false;
      }
      pendingActivity = true;
      return false;
    } finally {
      pingInFlight = false;
    }
  };

  const flushIfDue = () => {
    if (!pendingActivity || pingInFlight || stopped) return;
    if (now() - lastPingAt < ACTIVITY_PING_INTERVAL_MS) return;
    void ping();
  };

  // While the warning is open only "Stay signed in" extends, so a stray mouse move cannot dismiss it
  const onActivity = (event: Event) => {
    if (stopped || warningOpen || !isRealActivity(event, options.acceptUntrustedEvents === true)) return;
    pendingActivity = true;
    flushIfDue();
  };

  // At the deadline the server decides, since another tab may have extended the session
  const confirmExpiry = async () => {
    checkingExpiry = true;
    try {
      const result = await options.checkSession();
      if (stopped) return;
      if (result.status === 'ok' && result.idleRemainingMs > 0 && (result.maxAgeRemainingMs ?? 1) > 0) adoptRemaining(result);
      else if (result.status === 'error' && now() - deadline() < EXPIRY_CHECK_GRACE_MS) return;
      else expire();
    } finally {
      checkingExpiry = false;
    }
  };

  const tick = () => {
    if (stopped) return;
    const shared = readSharedDeadline(storage);
    if (shared > idleDeadline) moveIdleDeadline(shared);
    flushIfDue();
    const remaining = deadline() - now();
    if (remaining <= 0) {
      if (!checkingExpiry) void confirmExpiry();
      return;
    }
    if (remaining <= SESSION_WARNING_MS && !warningOpen) refreshWarning();
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_DEADLINE_KEY) tick();
  };

  const listenerOptions = { passive: true, capture: true };
  ACTIVITY_DOM_EVENTS.forEach((name) => target.addEventListener(name, onActivity, listenerOptions));
  target.addEventListener(USER_ACTIVITY_EVENT, onActivity);
  target.addEventListener('storage', onStorage);
  const timer = target.setInterval(tick, tickMs);

  function stop() {
    if (stopped) return;
    stopped = true;
    target.clearInterval(timer);
    ACTIVITY_DOM_EVENTS.forEach((name) => target.removeEventListener(name, onActivity, { capture: true }));
    target.removeEventListener(USER_ACTIVITY_EVENT, onActivity);
    target.removeEventListener('storage', onStorage);
  }

  const staySignedIn = async () => {
    if (stopped) return false;
    if (pingInFlight) return true;
    return ping();
  };

  return { staySignedIn, stop };
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
