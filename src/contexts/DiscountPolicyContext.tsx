import { createContext, useCallback, useEffect, useMemo, useRef, useState, ReactNode } from 'react';

import { useAuth } from '../hooks/useAuth';
import { getDiscountPolicy, updateDiscountPolicy, DiscountPolicyResult } from '../services/discountPolicyService';
import { DEFAULT_MAX_DISCOUNT_PERCENT, clampMaxDiscount } from '../utils/discount';
import {
  DISCOUNT_POLICY_STORAGE_KEY,
  clampInProgressDiscounts,
  readCachedMaxDiscount,
  writeCachedMaxDiscount,
} from '../utils/discountSession';

const CLAMP_NOTICE_MS = 6000;

export interface DiscountPolicyState {
  maxDiscountPercent: number;
  isLoading: boolean;
  error: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface DiscountPolicyContextValue extends DiscountPolicyState {
  updateMaxDiscount: (maxDiscountPercent: number) => Promise<DiscountPolicyResult>;
  refresh: () => Promise<void>;
  notifyDiscountClamped: () => void;
}

export const DEFAULT_DISCOUNT_POLICY_VALUE: DiscountPolicyContextValue = {
  maxDiscountPercent: DEFAULT_MAX_DISCOUNT_PERCENT,
  isLoading: false,
  error: null,
  updatedAt: null,
  updatedBy: null,
  updateMaxDiscount: async () => ({ success: false, error: 'Discount policy is unavailable' }),
  refresh: async () => undefined,
  notifyDiscountClamped: () => undefined,
};

export const DiscountPolicyContext = createContext<DiscountPolicyContextValue | undefined>(undefined);

const fallbackMax = (): number => readCachedMaxDiscount() ?? DEFAULT_MAX_DISCOUNT_PERCENT;

function useClampNotice() {
  const [notice, setNotice] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const show = useCallback((message: string) => {
    setNotice(message);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setNotice(null), CLAMP_NOTICE_MS);
  }, []);

  return { notice, show };
}

interface DiscountPolicyProviderProps {
  children: ReactNode;
}

export function DiscountPolicyProvider({ children }: DiscountPolicyProviderProps) {
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const [state, setState] = useState<DiscountPolicyState>(() => ({
    maxDiscountPercent: fallbackMax(),
    isLoading: true,
    error: null,
    updatedAt: null,
    updatedBy: null,
  }));
  const requestIdRef = useRef(0);
  const { notice, show } = useClampNotice();
  const userEmail = user?.email;

  const refresh = useCallback(async () => {
    if (authLoading) return;
    const requestId = ++requestIdRef.current;
    if (!isAuthenticated) {
      setState((prev) => ({ ...prev, maxDiscountPercent: fallbackMax(), isLoading: false }));
      return;
    }
    const result = await getDiscountPolicy();
    // A slower, older response must not overwrite a newer one (e.g. focus refetch racing a save)
    if (requestId !== requestIdRef.current) return;
    if (result.success && result.data) {
      const policy = result.data;
      writeCachedMaxDiscount(policy.maxDiscountPercent);
      setState({ ...policy, isLoading: false, error: null });
      return;
    }
    setState((prev) => ({
      ...prev,
      maxDiscountPercent: fallbackMax(),
      isLoading: false,
      error: result.error || 'Failed to load discount policy',
    }));
    // userEmail is listed on purpose: switching accounts must refetch the policy
  }, [authLoading, isAuthenticated, userEmail]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handleFocus = () => {
      refresh();
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== DISCOUNT_POLICY_STORAGE_KEY || e.newValue === null) return;
      setState((prev) => ({ ...prev, maxDiscountPercent: clampMaxDiscount(e.newValue) }));
    };
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
    };
  }, [refresh]);

  const notifyDiscountClamped = useCallback(() => {
    show(`Discount reduced to the maximum allowed (${state.maxDiscountPercent}%).`);
  }, [show, state.maxDiscountPercent]);

  // Wait for the first answer so a stale cached cap never trims a discount the live policy allows
  useEffect(() => {
    if (state.isLoading) return;
    if (clampInProgressDiscounts(state.maxDiscountPercent)) notifyDiscountClamped();
  }, [state.isLoading, state.maxDiscountPercent, notifyDiscountClamped]);

  const updateMaxDiscount = useCallback(async (maxDiscountPercent: number) => {
    const result = await updateDiscountPolicy(maxDiscountPercent);
    if (result.success && result.data) {
      requestIdRef.current += 1;
      writeCachedMaxDiscount(result.data.maxDiscountPercent);
      setState({ ...result.data, isLoading: false, error: null });
    }
    return result;
  }, []);

  const value = useMemo<DiscountPolicyContextValue>(
    () => ({ ...state, updateMaxDiscount, refresh, notifyDiscountClamped }),
    [state, updateMaxDiscount, refresh, notifyDiscountClamped],
  );

  return (
    <DiscountPolicyContext.Provider value={value}>
      {children}
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-[100] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 shadow-lg"
        >
          {notice}
        </div>
      )}
    </DiscountPolicyContext.Provider>
  );
}

export default DiscountPolicyProvider;
