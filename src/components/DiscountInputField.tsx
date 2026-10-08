import React, { useId, useState } from 'react';
import { Percent } from 'lucide-react';

import { discountExceededMessage } from '../utils/discount';

interface DiscountInputFieldProps {
  value: string;
  onChange: (raw: string) => void;
  maxDiscountPercent: number;
  exceeded?: boolean;
  layout?: 'stacked' | 'inline';
  extraRules?: string[];
  disabled?: boolean;
}

interface DiscountLimitNotesProps {
  helpId: string;
  errorId: string;
  maxDiscountPercent: number;
  exceeded: boolean;
}

export function DiscountLimitNotes({ helpId, errorId, maxDiscountPercent, exceeded }: DiscountLimitNotesProps) {
  return (
    <>
      <p id={helpId} className="text-xs text-gray-500 mt-1">Allowed: 0–{maxDiscountPercent}%</p>
      {exceeded && (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-600 mt-1">
          {discountExceededMessage(maxDiscountPercent)}
        </p>
      )}
    </>
  );
}

const INPUT_BASE =
  'px-5 py-4 border-2 rounded-xl focus:ring-4 transition-all duration-300 bg-white/80 backdrop-blur-sm text-lg font-medium border-gray-200 focus:ring-blue-500/20 focus:border-blue-500 hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-60';

function DiscountInputField({
  value,
  onChange,
  maxDiscountPercent,
  exceeded = false,
  layout = 'stacked',
  extraRules = [],
  disabled = false,
}: DiscountInputFieldProps) {
  const [showRules, setShowRules] = useState(false);
  const inputId = useId();
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const isInline = layout === 'inline';

  const label = (
    <label
      htmlFor={inputId}
      className={`flex items-center gap-3 text-sm font-semibold text-gray-800 ${isInline ? 'whitespace-nowrap shrink-0' : 'mb-3'}`}
    >
      <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-rose-600 rounded-lg flex items-center justify-center">
        <Percent className="w-4 h-4 text-white" aria-hidden="true" />
      </div>
      Discount (%)
    </label>
  );

  const input = (
    <input
      id={inputId}
      type="number"
      min={0}
      step={0.01}
      max={maxDiscountPercent}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-busy={disabled || undefined}
      aria-invalid={exceeded}
      aria-describedby={exceeded ? `${helpId} ${errorId}` : helpId}
      className={isInline ? `no-spinner flex-1 min-w-0 ${INPUT_BASE}` : `w-full ${INPUT_BASE}`}
      placeholder="Enter discount percentage"
    />
  );

  return (
    <div className="group">
      {isInline ? (
        <div className="flex items-center gap-3">
          {label}
          {input}
        </div>
      ) : (
        <>
          {label}
          {input}
        </>
      )}
      <DiscountLimitNotes helpId={helpId} errorId={errorId} maxDiscountPercent={maxDiscountPercent} exceeded={exceeded} />
      <button
        type="button"
        onClick={() => setShowRules((prev) => !prev)}
        aria-expanded={showRules}
        className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-2 cursor-pointer flex items-center gap-1"
      >
        {showRules ? '▼' : '▶'} Discount Rules
      </button>
      {showRules && (
        <p className="text-xs text-gray-600 mt-2 ml-4 border-l-2 border-blue-300 pl-3">
          • Discount available at any amount (no minimum)
          <br />• Up to {maxDiscountPercent}% (set by admin)
          {extraRules.map((rule) => (
            <React.Fragment key={rule}>
              <br />• {rule}
            </React.Fragment>
          ))}
        </p>
      )}
    </div>
  );
}

export default DiscountInputField;
