import type { ReactNode } from 'react';
import { Clock, Server } from 'lucide-react';
import { ConfigurationData } from '../types/pricing';
import { formatCurrency, overageAddOnCost, sharedMigrateDuration } from '../utils/pricing';
import type { OverageAddOn } from '../utils/migrateSelection';

interface OverageAddOnSectionProps {
  config: ConfigurationData;
  onChange: (addOn: OverageAddOn) => void;
  // Shared quote fields, passed only when no other section on the page already shows them.
  customerLocationField?: ReactNode;
  discountField?: ReactNode;
  // The quote's one Duration (Months), when no other section on the page shows it yet.
  durationField?: ReactNode;
}

const INSTANCE_TYPES: OverageAddOn['instanceType'][] = ['Small', 'Standard', 'Large', 'Extra Large'];
const INPUT_CLASS = 'w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 hover:border-blue-300 text-lg font-medium';

const parseCount = (v: string): number => (v === '' ? 0 : Math.max(0, parseInt(v, 10) || 0));

// Overage ticked alongside Multi-Combination or Data Sprawl: the instances it bills.
// Its months are the quote's shared Duration, so it has no duration input of its own.
function OverageAddOnSection({ config, onChange, customerLocationField, discountField, durationField }: OverageAddOnSectionProps) {
  const addOn = config.overageAddOn;
  if (!addOn) return null;
  const update = (patch: Partial<OverageAddOn>) => onChange({ ...addOn, ...patch });
  const months = sharedMigrateDuration(config);

  return (
    <div data-section="overage-add-on" className="bg-gradient-to-br from-white via-purple-50/30 to-violet-50/50 rounded-2xl shadow-lg border border-purple-100 p-6 mb-6">
      <h3 className="text-lg font-bold text-gray-900 mb-1">Overage Agreement</h3>
      <p className="text-sm text-gray-600 mb-6">Billed instances added to this agreement.</p>
      {customerLocationField && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {customerLocationField}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="overage-add-on-type" className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3">
            <Server className="w-4 h-4 text-purple-600" aria-hidden="true" />
            Instance Type
          </label>
          <select
            id="overage-add-on-type"
            value={addOn.instanceType}
            onChange={(e) => update({ instanceType: e.target.value as OverageAddOn['instanceType'] })}
            className={INPUT_CLASS}
          >
            {INSTANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="overage-add-on-instances" className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3">
            <Server className="w-4 h-4 text-purple-600" aria-hidden="true" />
            Number of Instances
          </label>
          <input
            id="overage-add-on-instances"
            type="number"
            min="1"
            step="1"
            value={addOn.numberOfInstances || ''}
            onChange={(e) => update({ numberOfInstances: parseCount(e.target.value) })}
            className={INPUT_CLASS}
            placeholder="Enter number of instances"
            autoComplete="off"
          />
        </div>
      </div>
      {durationField ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">{durationField}</div>
      ) : (
        <p data-testid="overage-add-on-duration" className="mt-4 flex items-center gap-2 text-sm text-gray-600">
          <Clock className="w-4 h-4 text-purple-600" aria-hidden="true" />
          {months > 0
            ? `Valid for ${months} Month${months === 1 ? '' : 's'}, the Duration (Months) entered above.`
            : 'Uses the Duration (Months) entered above.'}
        </p>
      )}
      {discountField && <div className="mt-6">{discountField}</div>}
      <div className="mt-6 flex justify-between items-center rounded-lg bg-purple-100 p-3 text-sm">
        <span className="font-bold text-gray-900">Overage total (before discount):</span>
        <span data-testid="overage-add-on-total" className="font-bold text-gray-900">{formatCurrency(overageAddOnCost(config))}</span>
      </div>
    </div>
  );
}

export default OverageAddOnSection;
