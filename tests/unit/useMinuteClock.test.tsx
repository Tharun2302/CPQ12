// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useMinuteClock } from '../../src/hooks/useMinuteClock';

const MIN = 60_000;
const HOUR = 60 * MIN;
const START_MS = Date.parse('2026-09-20T10:00:00.000Z');

function Clock({ seen }: { seen?: number[] }) {
  const nowMs = useMinuteClock();
  seen?.push(nowMs);
  return <span>{nowMs}</span>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START_MS);
});

afterEach(() => {
  // vitest.config.ts does not enable globals, so RTL's auto-cleanup never registers
  cleanup();
  vi.useRealTimers();
});

describe('useMinuteClock', () => {
  it('shows the current time on the first render after a remount', () => {
    const first = render(<Clock />);
    first.unmount();

    vi.advanceTimersByTime(2 * HOUR);
    const seen: number[] = [];
    render(<Clock seen={seen} />);

    expect(seen[0]).toBe(START_MS + 2 * HOUR);
  });

  it('floors the first value to the minute so repeat reads match', () => {
    vi.setSystemTime(START_MS + 30_000);
    const seen: number[] = [];
    render(<Clock seen={seen} />);

    expect(new Set(seen)).toEqual(new Set([START_MS]));
  });

  it('ticks once a minute while mounted', () => {
    const { container } = render(<Clock />);

    act(() => {
      vi.advanceTimersByTime(MIN);
    });

    expect(container.textContent).toBe(String(START_MS + MIN));
  });

  it('shares one interval across many labels and stops after the last unmount', () => {
    const labels = render(
      <>
        {Array.from({ length: 50 }, (_, index) => (
          <Clock key={index} />
        ))}
      </>,
    );

    expect(vi.getTimerCount()).toBe(1);

    labels.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
