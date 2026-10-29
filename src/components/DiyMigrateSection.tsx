import type { ReactNode } from 'react';
import { Clock, Hourglass, Layers, Users } from 'lucide-react';
import type { ConfigurationData, DiyWorkload } from '../types/pricing';
import {
  DIY_CONSULTING_RATE_PER_HOUR,
  DIY_GB_PER_LICENSE_PER_WORKLOAD,
  DIY_MIN_LICENSES,
  DIY_RATE_BY_WORKLOAD_COUNT,
  DIY_VALIDITY_MONTHS,
  DIY_WORKLOADS,
  diyPricingFromConfig,
  formatCurrency
} from '../utils/pricing';

interface DiyMigrateSectionProps {
  config: ConfigurationData;
  onChange: (patch: Partial<Pick<ConfigurationData, 'numberOfUsers' | 'diyWorkloads' | 'diyConsultingHours'>>) => void;
  discountField?: ReactNode;
}

const INPUT_CLASS = 'w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 hover:border-blue-300 text-lg font-medium';

const WORKLOAD_HINT: Record<DiyWorkload, string> = {
  Mailbox: `${DIY_GB_PER_LICENSE_PER_WORKLOAD} GB per user`,
  Content: `${DIY_GB_PER_LICENSE_PER_WORKLOAD} GB per user`,
  Messages: 'No data cap'
};

const parseCount = (v: string): number => (v === '' ? 0 : Math.max(0, parseInt(v, 10) || 0));

// Migrate DIY: self-serve licences, one per user, with the ticked workloads bundled into its rate.
function DiyMigrateSection({ config, onChange, discountField }: DiyMigrateSectionProps) {
  const workloads = config.diyWorkloads || [];
  const pricing = diyPricingFromConfig(config);

  const toggleWorkload = (w: DiyWorkload) => {
    const next = workloads.includes(w) ? workloads.filter(x => x !== w) : [...workloads, w];
    onChange({ diyWorkloads: DIY_WORKLOADS.filter(x => next.includes(x)) });
  };

  return (
    <div data-section="project-configuration" className="bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/50 rounded-2xl shadow-2xl border border-blue-100/50 p-8 backdrop-blur-sm">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Project Configuration</h3>
        <p className="text-gray-600">Configure your DIY migration licences</p>
      </div>

      <fieldset className="mb-6">
        <legend className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3">
          <Layers className="w-4 h-4 text-blue-600" aria-hidden="true" />
          Number of Workloads
        </legend>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {DIY_WORKLOADS.map(w => (
            <label
              key={w}
              className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${workloads.includes(w) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'}`}
            >
              <input
                type="checkbox"
                className="mt-1 w-5 h-5 accent-blue-600"
                checked={workloads.includes(w)}
                onChange={() => toggleWorkload(w)}
              />
              <span>
                <span className="block font-semibold text-gray-900">{w}</span>
                <span className="block text-xs text-gray-500">{WORKLOAD_HINT[w]}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Per user: 1 workload {formatCurrency(DIY_RATE_BY_WORKLOAD_COUNT[1])}, 2 workloads {formatCurrency(DIY_RATE_BY_WORKLOAD_COUNT[2])}, 3 workloads {formatCurrency(DIY_RATE_BY_WORKLOAD_COUNT[3])}.
        </p>
      </fieldset>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label htmlFor="diy-users" className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Users className="w-4 h-4 text-white" aria-hidden="true" />
            </div>
            Number of Licenses
          </label>
          <input
            id="diy-users"
            type="number"
            min="1"
            step="1"
            value={config.numberOfUsers || ''}
            onChange={(e) => onChange({ numberOfUsers: parseCount(e.target.value) })}
            className={INPUT_CLASS}
            placeholder="Enter number of licenses"
            autoComplete="off"
          />
          {pricing.belowMinimum && (
            <p data-testid="diy-minimum-note" role="note" className="mt-2 text-sm font-medium text-amber-700">
              Minimum purchase is {DIY_MIN_LICENSES} licenses. {pricing.minimumTopUp} more will be billed.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="diy-consulting-hours" className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <Hourglass className="w-4 h-4 text-white" aria-hidden="true" />
            </div>
            Additional Hours
          </label>
          <input
            id="diy-consulting-hours"
            type="number"
            min="0"
            step="1"
            value={config.diyConsultingHours || ''}
            onChange={(e) => onChange({ diyConsultingHours: parseCount(e.target.value) })}
            className={INPUT_CLASS}
            placeholder="Enter consulting hours"
            autoComplete="off"
          />
          <p className="mt-2 text-xs text-gray-500">
            Migration Consulting Services at {formatCurrency(DIY_CONSULTING_RATE_PER_HOUR)} per hour.
          </p>
        </div>
        {discountField && <div>{discountField}</div>}
      </div>

      <p className="mt-4 flex items-center gap-2 text-sm text-gray-600">
        <Clock className="w-4 h-4 text-blue-600" aria-hidden="true" />
        Licenses are valid for {DIY_VALIDITY_MONTHS} months.
      </p>

      {pricing.licenses > 0 && (
        <dl data-testid="diy-summary" className="mt-6 rounded-lg bg-blue-50 p-4 text-sm space-y-1">
          <div className="flex justify-between">
            <dt className="text-gray-700">{pricing.licenses} licenses × {formatCurrency(pricing.ratePerLicense)}</dt>
            <dd className="text-gray-900">{formatCurrency(pricing.licenseCost)}</dd>
          </div>
          {pricing.dataOverageLicenses > 0 && (
            <div className="flex justify-between text-gray-600">
              <dt>includes extra licenses for data</dt>
              <dd>{pricing.dataOverageLicenses}</dd>
            </div>
          )}
          {pricing.consultingHours > 0 && (
            <div className="flex justify-between">
              <dt className="text-gray-700">{pricing.consultingHours} hours × {formatCurrency(pricing.consultingRatePerHour)}</dt>
              <dd data-testid="diy-consulting-cost" className="text-gray-900">{formatCurrency(pricing.consultingCost)}</dd>
            </div>
          )}
          <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-blue-100">
            <dt>DIY total (before discount):</dt>
            <dd data-testid="diy-total">{formatCurrency(pricing.totalCost)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

export default DiyMigrateSection;
