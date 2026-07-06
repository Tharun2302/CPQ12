import React, { useState } from 'react';
import { Users, Server, Clock, Database } from 'lucide-react';

interface EmailMigrationConfigProps {
  onConfigurationChange?: (config: {
    numberOfMailboxes: number;
    instanceType: 'Small' | 'Standard' | 'Large' | 'Extra Large';
    numberOfInstances: number;
    duration: number;
    dataSizeGB: number;
  }) => void;
  initialValues?: {
    numberOfMailboxes?: number;
    instanceType?: 'Small' | 'Standard' | 'Large' | 'Extra Large';
    numberOfInstances?: number;
    duration?: number;
    dataSizeGB?: number;
  };
}

const EmailMigrationConfig: React.FC<EmailMigrationConfigProps> = ({
  onConfigurationChange,
  initialValues = {}
}) => {
  const [config, setConfig] = useState({
    numberOfMailboxes: initialValues.numberOfMailboxes ?? 12,
    instanceType: initialValues.instanceType ?? 'Small' as 'Small' | 'Standard' | 'Large' | 'Extra Large',
    numberOfInstances: initialValues.numberOfInstances ?? 12,
    duration: initialValues.duration ?? 12,
    dataSizeGB: initialValues.dataSizeGB ?? 5
  });

  const updateConfig = (updates: Partial<typeof config>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onConfigurationChange?.(newConfig);
  };

  const handleNumberInputChange = (
    field: keyof typeof config,
    value: string
  ) => {
    const numValue = value === '' ? 0 : Number(value);
    updateConfig({ [field]: numValue });
  };

  const incrementValue = (field: 'numberOfMailboxes' | 'numberOfInstances' | 'duration' | 'dataSizeGB') => {
    const currentValue = config[field];
    const increment = field === 'dataSizeGB' ? 0.1 : 1;
    updateConfig({ [field]: currentValue + increment });
  };

  const decrementValue = (field: 'numberOfMailboxes' | 'numberOfInstances' | 'duration' | 'dataSizeGB') => {
    const currentValue = config[field];
    const decrement = field === 'dataSizeGB' ? 0.1 : 1;
    const newValue = Math.max(0, currentValue - decrement);
    updateConfig({ [field]: newValue });
  };

  return (
    <div className="bg-white rounded-lg p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Number of Mailboxes */}
          <div className="group">
            <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
              <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-white" />
              </div>
              <span>Number of Mailboxes</span>
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={config.numberOfMailboxes}
              onChange={(e) => handleNumberInputChange('numberOfMailboxes', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white text-base"
              placeholder="Enter number of mailboxes"
            />
          </div>

          {/* Number of Instances */}
          <div className="group">
            <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
              <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                <Server className="w-4 h-4 text-white" />
              </div>
              <span>Number of Instances</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="1"
                value={config.numberOfInstances}
                onChange={(e) => handleNumberInputChange('numberOfInstances', e.target.value)}
                className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white text-base"
                placeholder="Enter number of instances"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => incrementValue('numberOfInstances')}
                  className="w-6 h-3 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                  aria-label="Increment"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => decrementValue('numberOfInstances')}
                  className="w-6 h-3 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                  aria-label="Decrement"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Data Size (GB) */}
          <div className="group">
            <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
              <div className="w-8 h-8 bg-teal-500 rounded-full flex items-center justify-center flex-shrink-0">
                <Database className="w-4 h-4 text-white" />
              </div>
              <span>Data Size (GB)</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={config.dataSizeGB}
              onChange={(e) => handleNumberInputChange('dataSizeGB', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white text-base"
              placeholder="Enter data size in GB"
            />
            <p className="text-xs text-gray-500 mt-2">
              Data size in gigabytes for the email migration (optional).
            </p>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Instance Type */}
          <div className="group relative">
            <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                <Server className="w-4 h-4 text-white" />
              </div>
              <span>Instance Type</span>
            </label>
            <div className="relative">
              <select
                value={config.instanceType}
                onChange={(e) => updateConfig({ instanceType: e.target.value as typeof config.instanceType })}
                className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white text-base appearance-none cursor-pointer"
              >
                <option value="Small">Small</option>
                <option value="Standard">Standard</option>
                <option value="Large">Large</option>
                <option value="Extra Large">Extra Large</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Duration (Months) */}
          <div className="group">
            <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
              <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-white" />
              </div>
              <span>Duration (Months)</span>
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={config.duration}
              onChange={(e) => handleNumberInputChange('duration', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white text-base"
              placeholder="Enter duration in months"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailMigrationConfig;

