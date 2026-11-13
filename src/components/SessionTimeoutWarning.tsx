import { useEffect, useState } from 'react';
import { SessionEndKind, formatCountdown } from '../utils/sessionGuard';

interface SessionTimeoutWarningProps {
  deadline: number;
  kind: SessionEndKind;
  onStaySignedIn: () => void;
  onSignOut: () => void;
}

function SessionTimeoutWarning({ deadline, kind, onStaySignedIn, onSignOut }: SessionTimeoutWarningProps) {
  const isLimit = kind === 'limit';
  // The 12-hour notice can be closed so the user can save their work before it ends
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(false), [kind]);
  const [remainingMs, setRemainingMs] = useState(() => deadline - Date.now());

  useEffect(() => {
    setRemainingMs(deadline - Date.now());
    const timer = window.setInterval(() => setRemainingMs(deadline - Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  if (isLimit && dismissed) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4" role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
        aria-describedby="session-timeout-description"
        className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-xl"
      >
        <h2 id="session-timeout-title" className="mb-2 text-lg font-semibold text-gray-900">
          {isLimit ? 'Your sign-in is about to end' : 'Are you still there?'}
        </h2>
        <p id="session-timeout-description" className="mb-6 text-sm text-gray-600">
          For security, you will be signed out in{' '}
          <span className="font-semibold text-gray-900" aria-live="polite">{formatCountdown(remainingMs)}</span>{' '}
          {isLimit
            ? 'because each sign-in lasts at most 12 hours. Save your work, then sign in again.'
            : 'because of inactivity.'}
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Sign out
          </button>
          {isLimit && (
            <button
              type="button"
              autoFocus
              onClick={() => setDismissed(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              OK
            </button>
          )}
          {!isLimit && (
            <button
              type="button"
              autoFocus
              onClick={onStaySignedIn}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Stay signed in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default SessionTimeoutWarning;
