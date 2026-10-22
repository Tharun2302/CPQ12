import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { MigrateKind } from '../utils/migrateSelection';

export interface MigrateOption {
  value: string;
  label: string;
  kind: MigrateKind;
}

interface MigrateOptionPickerProps {
  options: MigrateOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}

// Tick any mix of the Migrate options; only one option per kind can be on at a time.
function MigrateOptionPicker({ options, selected, onChange }: MigrateOptionPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (option: MigrateOption) => {
    if (selected.includes(option.value)) {
      onChange(selected.filter(v => v !== option.value));
      return;
    }
    const sameKind = new Set(options.filter(o => o.kind === option.kind).map(o => o.value));
    onChange([...selected.filter(v => !sameKind.has(v)), option.value]);
  };

  const labels = options.filter(o => selected.includes(o.value)).map(o => o.label);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Migrate options"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 border-2 border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white hover:border-slate-300 text-base font-medium text-left"
      >
        <span className="truncate">{labels.length > 0 ? labels.join(' + ') : 'Select Combination'}</span>
        <ChevronDown className={`w-5 h-5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true" aria-label="Migrate options" className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-lg p-2">
          <p className="px-3 py-2 text-xs text-slate-500">Tick one or more. They are quoted in one agreement.</p>
          {options.map(option => (
            <label key={option.value} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                className="w-5 h-5 accent-blue-600"
                data-value={option.value}
                checked={selected.includes(option.value)}
                onChange={() => toggle(option)}
              />
              <span className="text-base text-slate-800">{option.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default MigrateOptionPicker;
