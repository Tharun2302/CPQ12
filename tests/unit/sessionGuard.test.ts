// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ACTIVITY_PING_INTERVAL_MS,
  SESSION_DEADLINE_KEY,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_WARNING_MS,
  SessionCallResult,
  formatCountdown,
  reportUserActivity,
  startSessionGuard,
} from '../../src/utils/sessionGuard';

const MINUTE = 60 * 1000;
const ok = (idleRemainingMs = SESSION_IDLE_TIMEOUT_MS): SessionCallResult => ({ status: 'ok', idleRemainingMs });

function setup(overrides: Partial<Parameters<typeof startSessionGuard>[0]> = {}) {
  const sendActivity = vi.fn(async () => ok());
  const checkSession = vi.fn(async (): Promise<SessionCallResult> => ({ status: 'expired' }));
  const onWarningChange = vi.fn();
  const onExpire = vi.fn();
  const guard = startSessionGuard({
    initialRemainingMs: SESSION_IDLE_TIMEOUT_MS,
    sendActivity,
    checkSession,
    onWarningChange,
    onExpire,
    acceptUntrustedEvents: true,
    ...overrides,
  });
  return { guard, sendActivity, checkSession, onWarningChange, onExpire };
}

const press = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));

describe('sessionGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T09:00:00Z'));
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('warns 2 minutes before the deadline and signs out at it', async () => {
    const { guard, onWarningChange, onExpire, checkSession } = setup();
    await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_MS - 1000);
    expect(onWarningChange).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onWarningChange).toHaveBeenCalledWith(true, expect.any(Number));
    await vi.advanceTimersByTimeAsync(SESSION_WARNING_MS);
    expect(checkSession).toHaveBeenCalledTimes(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
    guard.stop();
  });

  it('sends no ping without real activity', async () => {
    const { guard, sendActivity } = setup();
    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    expect(sendActivity).not.toHaveBeenCalled();
    guard.stop();
  });

  it('ignores script-generated events in production mode', async () => {
    const { guard, sendActivity } = setup({ acceptUntrustedEvents: false });
    press();
    window.dispatchEvent(new MouseEvent('mousedown'));
    await vi.advanceTimersByTimeAsync(0);
    expect(sendActivity).not.toHaveBeenCalled();
    guard.stop();
  });

  it('ignores zero-movement mousemove fired by scrolling or re-rendering under a still cursor', async () => {
    const { guard, sendActivity } = setup();
    const still = new MouseEvent('mousemove');
    Object.defineProperties(still, { movementX: { value: 0 }, movementY: { value: 0 } });
    window.dispatchEvent(still);
    await vi.advanceTimersByTimeAsync(0);
    expect(sendActivity).not.toHaveBeenCalled();
    const moved = new MouseEvent('mousemove');
    Object.defineProperties(moved, { movementX: { value: 3 }, movementY: { value: 0 } });
    window.dispatchEvent(moved);
    await vi.advanceTimersByTimeAsync(0);
    expect(sendActivity).toHaveBeenCalledTimes(1);
    guard.stop();
  });

  it('retries a failed check at the deadline before signing out', async () => {
    const checkSession = vi.fn()
      .mockResolvedValueOnce({ status: 'error' })
      .mockResolvedValueOnce(ok(20 * MINUTE));
    const { guard, onExpire } = setup({ checkSession });
    await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS + 2000);
    expect(checkSession).toHaveBeenCalledTimes(2);
    expect(onExpire).not.toHaveBeenCalled();
    guard.stop();
  });

  it('signs out when checks at the deadline keep failing past the grace period', async () => {
    const checkSession = vi.fn(async (): Promise<SessionCallResult> => ({ status: 'error' }));
    const { guard, onExpire } = setup({ checkSession });
    await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS + 20 * 1000);
    expect(onExpire).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15 * 1000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    guard.stop();
  });

  it('keeps the open warning countdown on the moved deadline', async () => {
    const { guard, onWarningChange } = setup();
    await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_MS + 30 * 1000);
    const later = Date.now() + 110 * 1000;
    localStorage.setItem(SESSION_DEADLINE_KEY, String(later));
    await vi.advanceTimersByTimeAsync(1000);
    expect(onWarningChange).toHaveBeenLastCalledWith(true, later);
    guard.stop();
  });

  it.each(['keydown', 'mousedown', 'mousemove', 'touchstart', 'wheel'])('%s counts as activity', async (type) => {
    const { guard, sendActivity } = setup();
    window.dispatchEvent(new Event(type));
    await vi.advanceTimersByTimeAsync(0);
    expect(sendActivity).toHaveBeenCalledTimes(1);
    guard.stop();
  });

  it('counts OnlyOffice editor activity reported by the editor component', async () => {
    const { guard, sendActivity } = setup();
    reportUserActivity();
    await vi.advanceTimersByTimeAsync(0);
    expect(sendActivity).toHaveBeenCalledTimes(1);
    guard.stop();
  });

  it('sends at most one ping per minute and flushes trailing activity', async () => {
    const { guard, sendActivity } = setup();
    press();
    press();
    await vi.advanceTimersByTimeAsync(10 * 1000);
    press();
    expect(sendActivity).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(ACTIVITY_PING_INTERVAL_MS);
    expect(sendActivity).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(sendActivity).toHaveBeenCalledTimes(2);
    guard.stop();
  });

  it('activity moves the deadline so a busy user is never warned', async () => {
    const { guard, onWarningChange, onExpire } = setup();
    for (let i = 0; i < 90; i += 1) {
      press();
      await vi.advanceTimersByTimeAsync(MINUTE);
    }
    expect(onWarningChange).not.toHaveBeenCalled();
    expect(onExpire).not.toHaveBeenCalled();
    guard.stop();
  });

  it('ignores ambient activity while the warning is open; Stay signed in extends', async () => {
    const { guard, sendActivity, onWarningChange, onExpire } = setup();
    await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_MS);
    expect(onWarningChange).toHaveBeenLastCalledWith(true, expect.any(Number));
    press();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sendActivity).not.toHaveBeenCalled();

    await expect(guard.staySignedIn()).resolves.toBe(true);
    expect(sendActivity).toHaveBeenCalledTimes(1);
    expect(onWarningChange).toHaveBeenLastCalledWith(false, expect.any(Number));
    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    expect(onExpire).not.toHaveBeenCalled();
    guard.stop();
  });

  it('signs out when the server says the session already ended', async () => {
    const { guard, onExpire } = setup({ sendActivity: vi.fn(async () => ({ status: 'expired' }) as SessionCallResult) });
    press();
    await vi.advanceTimersByTimeAsync(0);
    expect(onExpire).toHaveBeenCalledTimes(1);
    guard.stop();
  });

  it('retries a failed ping on the next interval instead of signing out', async () => {
    const sendActivity = vi.fn()
      .mockResolvedValueOnce({ status: 'error' })
      .mockResolvedValue(ok());
    const { guard, onExpire } = setup({ sendActivity });
    press();
    await vi.advanceTimersByTimeAsync(ACTIVITY_PING_INTERVAL_MS);
    expect(sendActivity).toHaveBeenCalledTimes(2);
    expect(onExpire).not.toHaveBeenCalled();
    guard.stop();
  });

  it('follows a later deadline written by another tab', async () => {
    const { guard, onWarningChange, onExpire } = setup();
    await vi.advanceTimersByTimeAsync(50 * MINUTE);
    localStorage.setItem(SESSION_DEADLINE_KEY, String(Date.now() + SESSION_IDLE_TIMEOUT_MS));
    await vi.advanceTimersByTimeAsync(55 * MINUTE);
    expect(onWarningChange).not.toHaveBeenCalled();
    expect(onExpire).not.toHaveBeenCalled();
    guard.stop();
  });

  it('closes the warning when another tab extends the session', async () => {
    const { guard, onWarningChange } = setup();
    await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_MS);
    expect(onWarningChange).toHaveBeenLastCalledWith(true, expect.any(Number));
    localStorage.setItem(SESSION_DEADLINE_KEY, String(Date.now() + SESSION_IDLE_TIMEOUT_MS));
    await vi.advanceTimersByTimeAsync(1000);
    expect(onWarningChange).toHaveBeenLastCalledWith(false, expect.any(Number));
    guard.stop();
  });

  it('keeps the session when the server reports it was extended at the deadline', async () => {
    const checkSession = vi.fn(async () => ok(30 * MINUTE));
    const { guard, onExpire } = setup({ checkSession });
    await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS);
    expect(checkSession).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();
    guard.stop();
  });

  it('starts from the server time left, so a reload does not reset the clock', async () => {
    const { guard, onExpire } = setup({ initialRemainingMs: 5 * MINUTE });
    expect(Number(localStorage.getItem(SESSION_DEADLINE_KEY))).toBe(Date.now() + 5 * MINUTE);
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(onExpire).toHaveBeenCalledTimes(1);
    guard.stop();
  });

  it('stop removes listeners and timers', async () => {
    const { guard, sendActivity, onExpire } = setup();
    guard.stop();
    press();
    await vi.advanceTimersByTimeAsync(2 * SESSION_IDLE_TIMEOUT_MS);
    expect(sendActivity).not.toHaveBeenCalled();
    expect(onExpire).not.toHaveBeenCalled();
    await expect(guard.staySignedIn()).resolves.toBe(false);
  });

  it('formats the countdown as m:ss', () => {
    expect(formatCountdown(2 * MINUTE)).toBe('2:00');
    expect(formatCountdown(61 * 1000)).toBe('1:01');
    expect(formatCountdown(500)).toBe('0:01');
    expect(formatCountdown(-5)).toBe('0:00');
  });
});
