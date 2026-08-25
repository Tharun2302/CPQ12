// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initHotjar, identifyHotjarUser } from '../../src/analytics/hotjar';

const tags = () => document.querySelectorAll('script#hotjar-tag');

/** Replaces the real queue with a spy, so calls can be asserted directly. */
function spyOnQueue() {
  const hj = vi.fn();
  window.hj = hj as unknown as NonNullable<Window['hj']>;
  return hj;
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete window.hj;
  delete window._hjSettings;
  vi.restoreAllMocks();
});

describe('initHotjar — no site ID', () => {
  it('requests no script and defines nothing on window', () => {
    expect(initHotjar(undefined)).toBe(false);
    expect(tags()).toHaveLength(0);
    expect(window.hj).toBeUndefined();
    expect(window._hjSettings).toBeUndefined();
  });

  it('treats a blank or whitespace-only ID as off', () => {
    expect(initHotjar('')).toBe(false);
    expect(initHotjar('   ')).toBe(false);
    expect(tags()).toHaveLength(0);
    expect(window.hj).toBeUndefined();
  });

  it('is off by default, reading the committed blank config', () => {
    expect(initHotjar()).toBe(false);
    expect(tags()).toHaveLength(0);
    expect(window.hj).toBeUndefined();
  });

  it('identify returns false when Hotjar never loaded', () => {
    initHotjar(undefined);
    expect(identifyHotjarUser({ email: 'someone@example.com', role: 'viewer' })).toBe(false);
  });
});

describe('initHotjar — site ID set', () => {
  it('injects exactly one script tag pointing at the configured ID', () => {
    expect(initHotjar('1234567')).toBe(true);
    expect(tags()).toHaveLength(1);
    expect(tags()[0].getAttribute('src')).toBe('https://static.hotjar.com/c/hotjar-1234567.js?sv=6');
  });

  it('sets _hjSettings.hjid as a Number, matching Hotjar\u2019s snippet', () => {
    initHotjar('1234567');
    expect(window._hjSettings).toEqual({ hjid: 1234567, hjsv: 6 });
    expect(typeof window._hjSettings!.hjid).toBe('number');
  });

  it('accepts a numeric site ID as well as a string', () => {
    expect(initHotjar(1234567)).toBe(true);
    expect(window._hjSettings!.hjid).toBe(1234567);
  });

  it('still has exactly one script tag after a second init call', () => {
    initHotjar('1234567');
    expect(initHotjar('1234567')).toBe(true);
    expect(tags()).toHaveLength(1);
  });

  it('stays at one script tag across many init calls (StrictMode + HMR)', () => {
    for (let i = 0; i < 5; i++) initHotjar('1234567');
    expect(tags()).toHaveLength(1);
  });

  it('does not replace an existing queue on re-init', () => {
    initHotjar('1234567');
    const first = window.hj;
    initHotjar('1234567');
    expect(window.hj).toBe(first);
  });
});

describe('initHotjar — malformed site ID', () => {
  it('warns and refuses to load, rather than looking identical to being off', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(initHotjar('abc123')).toBe(false);
    expect(tags()).toHaveLength(0);
    expect(window.hj).toBeUndefined();
    expect(window._hjSettings).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('abc123');
  });

  it('never requests hotjar-NaN.js', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    initHotjar('your-hotjar-site-id-here');
    initHotjar('123abc');
    initHotjar('12.34');
    expect(tags()).toHaveLength(0);
    expect(document.documentElement.innerHTML).not.toContain('NaN');
    expect(document.documentElement.innerHTML).not.toContain('static.hotjar.com');
  });
});

describe('identifyHotjarUser', () => {
  it('lowercases and trims the email, and sends the role', () => {
    initHotjar('1234567');
    const hj = spyOnQueue();

    expect(identifyHotjarUser({ email: '  Lavanya.Gopasana@CloudFuze.COM ', role: 'exhibit_admin' })).toBe(true);
    expect(hj).toHaveBeenCalledWith('identify', 'lavanya.gopasana@cloudfuze.com', {
      email: 'lavanya.gopasana@cloudfuze.com',
      role: 'exhibit_admin',
    });
  });

  it('treats differently-cased sign-ins as one Hotjar user', () => {
    initHotjar('1234567');
    const hj = spyOnQueue();

    identifyHotjarUser({ email: 'Sam@Example.com', role: 'viewer' });
    identifyHotjarUser({ email: 'sam@example.com', role: 'viewer' });

    const ids = hj.mock.calls.map((call) => call[1]);
    expect(new Set(ids).size).toBe(1);
  });

  it('queues the identify call made before the tag script finishes loading', () => {
    initHotjar('1234567');
    expect(identifyHotjarUser({ email: 'A@B.com', role: 'viewer' })).toBe(true);

    const queue = window.hj?.q;
    expect(queue).toHaveLength(1);
    expect(queue?.[0]).toEqual([
      'identify',
      'a@b.com',
      { email: 'a@b.com', role: 'viewer' },
    ]);
  });

  it('defaults a missing role rather than sending undefined', () => {
    initHotjar('1234567');
    const hj = spyOnQueue();

    identifyHotjarUser({ email: 'sam@example.com' });
    expect(hj).toHaveBeenCalledWith('identify', 'sam@example.com', {
      email: 'sam@example.com',
      role: 'unknown',
    });
  });

  it('returns false for a missing, blank or null email', () => {
    initHotjar('1234567');
    expect(identifyHotjarUser({ email: '', role: 'viewer' })).toBe(false);
    expect(identifyHotjarUser({ email: '   ', role: 'viewer' })).toBe(false);
    expect(identifyHotjarUser({ email: null })).toBe(false);
    expect(identifyHotjarUser({})).toBe(false);
    expect(identifyHotjarUser(null)).toBe(false);
    expect(identifyHotjarUser(undefined)).toBe(false);
  });

  it('returns false instead of throwing when the Hotjar queue throws', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    initHotjar('1234567');
    window.hj = (() => {
      throw new Error('hotjar exploded');
    }) as unknown as NonNullable<Window['hj']>;
    expect(identifyHotjarUser({ email: 'sam@example.com', role: 'viewer' })).toBe(false);
  });
});
