import { useSyncExternalStore } from 'react';
import { MINUTE_MS } from '../utils/approvalTiming';

const listeners = new Set<() => void>();
let nowMs = Date.now();
let timerId: ReturnType<typeof setInterval> | null = null;

const tick = () => {
  nowMs = Date.now();
  listeners.forEach((listener) => listener());
};

// One interval for the whole page; it runs only while a live label is mounted
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (timerId === null) timerId = setInterval(tick, MINUTE_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  };
};

const getSnapshot = () => {
  // With no interval running the cached time is stale; flooring keeps repeat calls equal
  if (timerId === null) nowMs = Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
  return nowMs;
};

export function useMinuteClock(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
