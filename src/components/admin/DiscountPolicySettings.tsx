import React, { useEffect, useState } from 'react';
import { Percent, RotateCcw, Save } from 'lucide-react';

import { useDiscountPolicy } from '../../hooks/useDiscountPolicy';
import { ABSOLUTE_MAX_DISCOUNT_PERCENT, DEFAULT_MAX_DISCOUNT_PERCENT } from '../../utils/discount';

const TWO_DECIMALS = /^\d+(\.\d{1,2})?$/;

export function validateMaxDiscountInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return 'Enter a maximum discount.';
  if (!TWO_DECIMALS.test(trimmed)) return 'Use a number with at most 2 decimal places.';
  const n = Number(trimmed);
  if (n < 0 || n > ABSOLUTE_MAX_DISCOUNT_PERCENT) return `Must be between 0 and ${ABSOLUTE_MAX_DISCOUNT_PERCENT}.`;
  return null;
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

type Status = { kind: 'success' | 'error'; message: string } | null;

function DiscountPolicySettings() {
  const { maxDiscountPercent, isLoading, error: loadError, updatedAt, updatedBy, updateMaxDiscount } = useDiscountPolicy();
  const [value, setValue] = useState<string>(String(maxDiscountPercent));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Keep the field in step with the live policy until the admin starts editing it
  useEffect(() => {
    if (!isDirty) setValue(String(maxDiscountPercent));
  }, [maxDiscountPercent, isDirty]);

  const save = async (raw: string) => {
    const problem = validateMaxDiscountInput(raw);
    setValidationError(problem);
    setStatus(null);
    if (problem) return;
    setIsSaving(true);
    try {
      const result = await updateMaxDiscount(Number(raw.trim()));
      if (result.success && result.data) {
        setIsDirty(false);
        setValue(String(result.data.maxDiscountPercent));
        setStatus({ kind: 'success', message: `Maximum discount saved as ${result.data.maxDiscountPercent}%.` });
      } else {
        setStatus({ kind: 'error', message: result.error || 'Failed to update discount policy' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    save(value);
  };

  const handleReset = () => {
    const defaultValue = String(DEFAULT_MAX_DISCOUNT_PERCENT);
    setValue(defaultValue);
    setIsDirty(true);
    save(defaultValue);
  };

  const inputId = 'max-discount-percent';
  const errorId = `${inputId}-error`;

  return (
    <section className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-4 shadow-lg sm:p-6" aria-labelledby="discount-policy-heading">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-600">
          <Percent className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <h2 id="discount-policy-heading" className="text-lg font-bold text-gray-900">Discount Policy</h2>
          <p className="text-sm text-gray-600">The highest discount anyone can enter on a new quote. Saved quotes are not changed.</p>
        </div>
      </div>

      {loadError && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
          Could not load the current policy ({loadError}). Showing {maxDiscountPercent}%.
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor={inputId} className="mb-2 block text-sm font-semibold text-gray-800">
            Maximum Discount (%)
          </label>
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            min={0}
            max={ABSOLUTE_MAX_DISCOUNT_PERCENT}
            step={0.01}
            value={value}
            disabled={isLoading || isSaving}
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? errorId : undefined}
            onChange={(e) => {
              setValue(e.target.value);
              setIsDirty(true);
              setValidationError(null);
              setStatus(null);
            }}
            className={`w-full rounded-xl border-2 bg-white px-4 py-3 text-lg font-medium transition-colors focus:outline-none focus:ring-4 sm:max-w-xs ${
              validationError
                ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                : 'border-gray-200 focus:border-blue-500 focus:ring-blue-500/20'
            }`}
          />
          <p className="mt-1 text-xs text-gray-500">0–{ABSOLUTE_MAX_DISCOUNT_PERCENT}, up to 2 decimal places. Default {DEFAULT_MAX_DISCOUNT_PERCENT}%.</p>
          {validationError && (
            <p id={errorId} className="mt-1 text-sm font-medium text-red-600" role="alert">{validationError}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="submit"
            disabled={isLoading || isSaving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {isSaving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={isLoading || isSaving}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Reset to default ({DEFAULT_MAX_DISCOUNT_PERCENT}%)
          </button>
        </div>

        {status && (
          <p
            role={status.kind === 'error' ? 'alert' : 'status'}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              status.kind === 'success' ? 'border border-green-300 bg-green-50 text-green-800' : 'border border-red-300 bg-red-50 text-red-700'
            }`}
          >
            {status.message}
          </p>
        )}

        <p className="text-xs text-gray-500">
          {updatedBy || updatedAt
            ? `Last updated${updatedBy ? ` by ${updatedBy}` : ''}${updatedAt ? ` at ${formatUpdatedAt(updatedAt)}` : ''}`
            : `Not changed yet — using the default of ${DEFAULT_MAX_DISCOUNT_PERCENT}%.`}
        </p>
      </form>
    </section>
  );
}

export default DiscountPolicySettings;
