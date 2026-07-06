import React, { useState, useEffect, useRef } from 'react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Parse a YYYY-MM-DD string into { year, month (0-indexed), day } without timezone shift. */
function parseYMD(dateStr: string): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return { year, month: month - 1, day };
}

/** Build a YYYY-MM-DD string from year/month(0-indexed)/day. */
function toYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Display a YYYY-MM-DD value as MM-DD-YYYY for the UI. */
function formatDisplay(dateStr: string): string {
  const p = parseYMD(dateStr);
  if (!p) return '';
  return `${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}-${p.year}`;
}

interface CustomDatePickerProps {
  /** Currently selected date in YYYY-MM-DD format, or empty string. */
  value: string;
  /** Minimum selectable date in YYYY-MM-DD format. Dates strictly before this are disabled. */
  minDate?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Extra classes applied to the trigger/input wrapper (e.g. border colours for error state). */
  className?: string;
  required?: boolean;
}

const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value,
  minDate,
  onChange,
  onBlur,
  className = '',
  required = false,
}) => {
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

  const getInitialView = () => {
    const p = parseYMD(value);
    if (p) return { viewYear: p.year, viewMonth: p.month };
    const m = parseYMD(minDate || '');
    if (m) return { viewYear: m.year, viewMonth: m.month };
    return { viewYear: todayYear, viewMonth: todayMonth };
  };

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(getInitialView().viewYear);
  const [viewMonth, setViewMonth] = useState(getInitialView().viewMonth);
  const containerRef = useRef<HTMLDivElement>(null);

  const minParsed = parseYMD(minDate || '');

  // When the calendar opens, snap the view to the selected date (or minDate/today).
  useEffect(() => {
    if (open) {
      const init = getInitialView();
      setViewYear(init.viewYear);
      setViewMonth(init.viewMonth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (onBlur) onBlur();
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open, onBlur]);

  /** Returns true when the given date falls strictly before minDate. */
  const isDisabled = (y: number, m: number, d: number): boolean => {
    if (!minParsed) return false;
    if (y < minParsed.year) return true;
    if (y > minParsed.year) return false;
    if (m < minParsed.month) return true;
    if (m > minParsed.month) return false;
    return d < minParsed.day;
  };

  const isToday = (y: number, m: number, d: number) =>
    y === todayYear && m === todayMonth && d === todayDay;

  const isSelected = (y: number, m: number, d: number) => {
    const p = parseYMD(value);
    return !!p && p.year === y && p.month === m && p.day === d;
  };

  const handleSelect = (y: number, m: number, d: number) => {
    if (isDisabled(y, m, d)) return;
    onChange(toYMD(y, m, d));
    setOpen(false);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else { setViewMonth(viewMonth - 1); }
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else { setViewMonth(viewMonth + 1); }
  };

  const handleToday = () => {
    if (!isDisabled(todayYear, todayMonth, todayDay)) {
      onChange(toYMD(todayYear, todayMonth, todayDay));
      setOpen(false);
    }
  };

  const handleClear = () => {
    onChange('');
    setOpen(false);
  };

  // Build the grid: empty leading cells + days-in-month cells.
  const firstDOW = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const totalCells = Math.ceil((firstDOW + daysInMonth) / 7) * 7;

  const displayValue = formatDisplay(value);
  const isTodayDisabled = isDisabled(todayYear, todayMonth, todayDay);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* ── Trigger / input display ── */}
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(prev => !prev)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpen(prev => !prev); }}
        className={`w-full px-4 py-2.5 border-2 rounded-lg flex items-center justify-between cursor-pointer bg-white/80 backdrop-blur-sm text-base font-medium select-none ${className}`}
      >
        <span className={displayValue ? 'text-gray-900' : 'text-gray-400'}>
          {displayValue || 'mm-dd-yyyy'}
        </span>
        {/* Calendar icon */}
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>

      {/* Hidden native input for form validation / required support */}
      <input
        type="text"
        tabIndex={-1}
        aria-hidden="true"
        required={required}
        value={value}
        onChange={() => {/* controlled by custom UI */}}
        style={{ position: 'absolute', opacity: 0, height: 0, width: 0, pointerEvents: 'none' }}
      />

      {/* ── Calendar popup ── */}
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl p-4 w-72">

          {/* Header — month / year navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
              aria-label="Previous month"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <span className="text-sm font-semibold text-gray-800">
              {MONTH_NAMES[viewMonth]}, {viewYear}
            </span>

            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
              aria-label="Next month"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Date grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: totalCells }, (_, i) => {
              const dayNum = i - firstDOW + 1;

              // Empty cell (before first day or after last day)
              if (dayNum <= 0 || dayNum > daysInMonth) {
                return <div key={i} className="w-8 h-8" />;
              }

              const disabled = isDisabled(viewYear, viewMonth, dayNum);
              const selected = isSelected(viewYear, viewMonth, dayNum);
              const todayCell = isToday(viewYear, viewMonth, dayNum);

              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelect(viewYear, viewMonth, dayNum)}
                  className={[
                    'w-8 h-8 mx-auto flex items-center justify-center text-sm rounded-full transition-colors',
                    disabled
                      ? 'text-gray-300 cursor-not-allowed pointer-events-none'
                      : selected
                        ? 'bg-blue-600 text-white font-semibold'
                        : todayCell
                          ? 'text-blue-600 font-semibold border border-blue-300 hover:bg-blue-50'
                          : 'text-gray-700 hover:bg-gray-100 cursor-pointer',
                  ].join(' ')}
                  aria-label={`${dayNum} ${MONTH_NAMES[viewMonth]} ${viewYear}${disabled ? ' (unavailable)' : ''}`}
                  aria-disabled={disabled}
                  aria-pressed={selected}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          {/* Footer — Clear / Today */}
          <div className="flex justify-between mt-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors px-1"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleToday}
              disabled={isTodayDisabled}
              className={`text-xs transition-colors px-1 ${
                isTodayDisabled
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-blue-600 hover:text-blue-800'
              }`}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomDatePicker;
