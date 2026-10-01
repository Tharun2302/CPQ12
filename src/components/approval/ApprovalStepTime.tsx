import React from 'react';
import { useMinuteClock } from '../../hooks/useMinuteClock';
import {
  elapsedMs,
  formatDuration,
  liveElapsedLabel,
  type StepTiming,
  type TotalTiming,
} from '../../utils/approvalTiming';

const STEP_TIME_CLASS =
  'block mt-0.5 text-[11px] leading-tight tabular-nums truncate max-w-full whitespace-nowrap';
const TOTAL_TIME_CLASS = 'shrink-0 whitespace-nowrap text-sm tabular-nums text-gray-600';
const UNKNOWN = '—';

const useLiveElapsed = (sinceMs: number | null): string => liveElapsedLabel(sinceMs, useMinuteClock());

// No title here: the step column's own tooltip already carries the full time line
const LiveWait: React.FC<{ sinceMs: number | null }> = ({ sinceMs }) => {
  const elapsed = useLiveElapsed(sinceMs);
  return <span className={`${STEP_TIME_CLASS} text-amber-700`}>{`waiting ${elapsed}`}</span>;
};

export const StepTimeLabel: React.FC<{ timing?: StepTiming }> = ({ timing }) => {
  if (!timing || timing.kind === 'none') return null;
  if (timing.kind === 'waiting') return <LiveWait sinceMs={timing.sinceMs} />;
  if (timing.kind === 'unknown') return <span className={`${STEP_TIME_CLASS} text-gray-500`}>{UNKNOWN}</span>;
  const denied = timing.kind === 'denied';
  const duration = formatDuration(timing.ms);
  return (
    <span className={`${STEP_TIME_CLASS} ${denied ? 'text-[#991B1B]' : 'text-gray-500'}`}>
      {denied ? `rejected after ${duration}` : duration}
    </span>
  );
};

const hiddenNote = (total: TotalTiming): string | null => {
  if (total.hiddenRoles.length === 0) return null;
  const amount = total.hiddenMs > 0 ? formatDuration(total.hiddenMs) : 'time';
  return `Includes ${amount} on ${total.hiddenRoles.join(', ')} (not shown)`;
};

const TotalText: React.FC<{ total: TotalTiming; duration: string }> = ({ total, duration }) => {
  const text = `${total.label}: ${duration}`;
  const note = duration === UNKNOWN ? null : hiddenNote(total);
  return (
    <span className={TOTAL_TIME_CLASS} title={note ? `${text}\n${note}` : text}>
      {text}
    </span>
  );
};

const LiveTotal: React.FC<{ total: TotalTiming }> = ({ total }) => {
  const elapsed = useLiveElapsed(total.startMs);
  return <TotalText total={total} duration={elapsed} />;
};

export const TotalTimeLabel: React.FC<{ total: TotalTiming }> = ({ total }) =>
  total.live ? (
    <LiveTotal total={total} />
  ) : (
    <TotalText total={total} duration={formatDuration(elapsedMs(total.startMs, total.endMs))} />
  );
