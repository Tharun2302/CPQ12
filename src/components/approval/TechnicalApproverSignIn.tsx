import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, LogIn, ShieldAlert, UserCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { BACKEND_URL } from '../../config/api';
import { getAuthHeaders } from '../../utils/authUtils';
import {
  TechSignInStatus,
  describeIdentity,
  techSignInReasonMessage,
} from '../../utils/technicalSignIn';

interface TechnicalApproverSignInProps {
  children: React.ReactNode;
}

type GateState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; status: TechSignInStatus };

const STATUS_URL = `${BACKEND_URL}/api/approval-workflows/technical-signin-status`;

const STATUS_ERROR_MESSAGE = "Couldn't check your sign-in. You can still review this request; approving may ask you to sign in.";

async function fetchSignInStatus(signal?: AbortSignal): Promise<TechSignInStatus> {
  const res = await fetch(STATUS_URL, { headers: getAuthHeaders(), signal });
  if (!res.ok) throw new Error(`Sign-in status request failed (HTTP ${res.status})`);
  return (await res.json()) as TechSignInStatus;
}

const TechnicalApproverSignIn: React.FC<TechnicalApproverSignInProps> = ({ children }) => {
  const { loginWithMicrosoft } = useAuth();
  const [state, setState] = useState<GateState>({ kind: 'loading' });
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const checkStatus = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: 'loading' });
    try {
      const status = await fetchSignInStatus(controller.signal);
      if (!controller.signal.aborted) setState({ kind: 'ready', status });
    } catch {
      if (controller.signal.aborted) return;
      setState({ kind: 'error', message: STATUS_ERROR_MESSAGE });
    }
  }, []);

  useEffect(() => {
    checkStatus();
    return () => abortRef.current?.abort();
  }, [checkStatus]);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setSignInError(null);
    try {
      const ok = await loginWithMicrosoft();
      if (!ok) setSignInError('Microsoft sign-in was cancelled or did not complete. Please try again.');
      await checkStatus();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setSignInError(code === 'NOT_CONFIGURED'
        ? 'Microsoft sign-in is not configured. Please contact your administrator.'
        : 'Microsoft sign-in failed. Please try again.');
    } finally {
      setIsSigningIn(false);
    }
  };

  if (state.kind === 'ready' && (state.status.enforced === false || state.status.allowed)) {
    const { status } = state;
    return (
      <>
        {status.enforced !== false && (status.email || status.name) && (
          <div className="flex items-center justify-center gap-2 bg-green-50 border-b border-green-200 px-4 py-2 text-sm text-green-800" role="status">
            <UserCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Signed in as {describeIdentity(status)}</span>
          </div>
        )}
        {children}
      </>
    );
  }

  // The server still enforces sign-in on every decision, so a failed check must not hide a portal that worked before.
  if (state.kind === 'error') {
    return (
      <>
        <div className="flex flex-wrap items-center justify-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800" role="alert">
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
          <button type="button" onClick={checkStatus} className="font-medium underline hover:text-amber-900">
            Try again
          </button>
        </div>
        {children}
      </>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center" role="status">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" aria-hidden="true" />
          <p className="text-gray-600">Checking your sign-in...</p>
        </div>
      </div>
    );
  }

  const { status } = state;
  const wrongAccount = status.reason === 'NOT_ON_LIST' || status.reason === 'WRONG_TENANT';
  const canSignIn = status.reason !== 'NOT_CONFIGURED';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-gray-200 p-6 sm:p-8 text-center">
        <ShieldAlert className="w-14 h-14 text-blue-600 mx-auto mb-4" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Sign in to approve</h1>
        <p className="text-gray-600 mb-6">{techSignInReasonMessage(status)}</p>

        {signInError && (
          <p className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700" role="alert">
            {signInError}
          </p>
        )}

        {canSignIn ? (
          <button
            type="button"
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
          >
            {isSigningIn
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <LogIn className="h-4 w-4" aria-hidden="true" />}
            {wrongAccount ? 'Use a different account' : 'Sign in with Microsoft'}
          </button>
        ) : (
          <button
            type="button"
            onClick={checkStatus}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
};

export default TechnicalApproverSignIn;
