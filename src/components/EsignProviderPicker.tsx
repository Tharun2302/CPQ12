import type { EsignProvider } from '../services/esignDocumentService';

interface EsignProviderPickerProps {
  value: EsignProvider;
  onChange: (provider: EsignProvider) => void;
  disabled?: boolean;
  /** Section wrapper classes. Defaults to the divider used when the picker sits below another section. */
  className?: string;
}

const PROVIDER_OPTIONS: { id: EsignProvider; title: string; blurb: string; isDefault?: boolean }[] = [
  { id: 'cpq', title: 'CPQ e-signature', blurb: 'Built in. Signers get a CPQ link.', isDefault: true },
  { id: 'zoho', title: 'Zoho Sign', blurb: 'Sent through Zoho. Signers get a Zoho email.' },
];

/**
 * Where the sender picks who delivers the signature request. Rendered only where the backend has
 * confirmed Zoho Sign is switched on — with it off there is no choice to make, so the caller
 * leaves this out entirely rather than showing a one-option picker.
 *
 * The choice is the caller's component state and is never persisted: every send starts from the
 * in-house default.
 */
function EsignProviderPicker({
  value,
  onChange,
  disabled = false,
  className = 'border-t border-slate-200 pt-4',
}: EsignProviderPickerProps) {
  return (
    <section className={className} data-testid="esign-provider-picker">
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-900 mb-2">Signing method</h2>
      <div role="radiogroup" aria-label="Signing method" className="space-y-2">
        {PROVIDER_OPTIONS.map((option) => {
          const selected = value === option.id;
          return (
            <label
              key={option.id}
              className={`flex items-start gap-2.5 rounded-xl border-2 px-3 py-2.5 cursor-pointer transition-colors ${
                disabled
                  ? 'border-slate-200 bg-slate-50 cursor-not-allowed'
                  : selected
                    ? 'border-indigo-400 bg-indigo-50'
                    : 'border-slate-300 bg-white hover:border-indigo-300 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="esign-provider"
                value={option.id}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(option.id)}
                className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${disabled ? 'text-slate-500' : 'text-slate-800'}`}>{option.title}</span>
                  {option.isDefault && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Default
                    </span>
                  )}
                </span>
                <span className="block text-xs text-slate-500 mt-0.5">{option.blurb}</span>
              </span>
            </label>
          );
        })}
      </div>
      {value === 'zoho' && (
        <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
          Zoho emails the signers. Reminders and the audit trail come from Zoho. Status updates can take up to 5 minutes.
        </p>
      )}
    </section>
  );
}

export default EsignProviderPicker;
