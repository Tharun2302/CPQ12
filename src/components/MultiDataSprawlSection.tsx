import { Database } from 'lucide-react';
import ExhibitSelector from './ExhibitSelector';
import SprawlGroupCard from './SprawlGroupCard';
import { ConfigurationData, ManageSprawlConfig } from '../types/pricing';
import { formatCurrency, isMultiWithSprawl, multiSprawlTotal, normalizeSprawlConfigs } from '../utils/pricing';

interface MultiDataSprawlSectionProps {
  config: ConfigurationData;
  label: string;
  onExhibitsChange: (exhibitIds: string[]) => void;
  onGroupChange: (exhibitId: string, patch: Partial<Pick<ManageSprawlConfig, 'users' | 'quantity'>>) => void;
}

const EMPTY: string[] = [];

// Data Sprawl ticked alongside Multi-Combination: its own exhibits and inputs. Its term is the
// migration's Duration (Months), so it has no duration field of its own.
function MultiDataSprawlSection({ config, label, onExhibitsChange, onGroupChange }: MultiDataSprawlSectionProps) {
  if (!isMultiWithSprawl(config)) return null;
  const groups = normalizeSprawlConfigs(config);

  return (
    <div data-section="multi-data-sprawl" className="bg-gradient-to-br from-white via-emerald-50/30 to-teal-50/50 rounded-2xl shadow-lg border border-emerald-100 p-6 mb-6">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
          <Database className="w-5 h-5 text-white" aria-hidden="true" />
        </span>
        <h3 className="text-lg font-bold text-gray-900">{label}</h3>
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Pick the {label} exhibits for this agreement. It uses the Duration (Months) entered for the migration above, and one discount applies to the combined total.
      </p>

      <div className="mt-6">
        <ExhibitSelector
          combination={config.dataSprawlCombination || ''}
          restrictToCombination
          sprawlGrouping
          selectedExhibits={config.dataSprawlExhibitIds || EMPTY}
          onExhibitsChange={onExhibitsChange}
          selectedTier={null}
        />

        {groups.length > 0 && (
          <div className="mt-6">
            {groups.map((group, i) => (
              <SprawlGroupCard key={group.exhibitId} group={group} index={i} onChange={onGroupChange} />
            ))}
            <div className="mt-6 flex justify-between items-center rounded-lg bg-emerald-100 p-3 text-sm">
              <span className="font-bold text-gray-900">{label} total (before discount):</span>
              <span data-testid="multi-data-sprawl-total" className="font-bold text-gray-900">{formatCurrency(multiSprawlTotal(config))}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MultiDataSprawlSection;
