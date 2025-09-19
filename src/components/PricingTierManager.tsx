import React, { useState, useEffect } from 'react';
import { PricingTierConfiguration } from '../types/pricing';
import { 
  Plus, 
  Trash2, 
  Eye, 
  Download, 
  Upload,
  Calendar,
  Settings,
  CheckCircle,
  Clock,
  Archive
} from 'lucide-react';

interface PricingTierManagerProps {
  onSelectConfiguration?: (config: PricingTierConfiguration) => void;
  currentConfiguration?: PricingTierConfiguration;
}

const PricingTierManager: React.FC<PricingTierManagerProps> = ({
  onSelectConfiguration,
  currentConfiguration
}) => {
  const [configurations, setConfigurations] = useState<PricingTierConfiguration[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<PricingTierConfiguration | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Load configurations from localStorage on component mount
  useEffect(() => {
    const savedConfigs = localStorage.getItem('pricingTierConfigurations');
    if (savedConfigs) {
      try {
        const parsedConfigs = JSON.parse(savedConfigs);
        const configsWithDates = parsedConfigs.map((config: any) => ({
          ...config,
          createdAt: new Date(config.createdAt),
          updatedAt: new Date(config.updatedAt)
        }));
        setConfigurations(configsWithDates);
      } catch (error) {
        console.error('Error loading pricing configurations:', error);
      }
    }
  }, []);

  // Save configurations to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('pricingTierConfigurations', JSON.stringify(configurations));
    } catch (error) {
      console.error('Error saving pricing configurations:', error);
    }
  }, [configurations]);

  const handleCreateConfiguration = () => {
    setShowCreateModal(true);
  };

  const handleDeleteConfiguration = (configId: string) => {
    setConfigurations(prev => prev.filter(config => config.id !== configId));
    setShowDeleteConfirm(null);
  };

  const handleSelectConfiguration = (config: PricingTierConfiguration) => {
    if (onSelectConfiguration) {
      onSelectConfiguration(config);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusIcon = (config: PricingTierConfiguration) => {
    if (currentConfiguration && currentConfiguration.id === config.id) {
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    }
    return <Clock className="w-4 h-4 text-gray-400" />;
  };

  const getStatusColor = (config: PricingTierConfiguration) => {
    if (currentConfiguration && currentConfiguration.id === config.id) {
      return 'bg-green-100 text-green-700 border-green-200';
    }
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  return (
    <div className="max-w-6xl mx-auto p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
          <Settings className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Pricing Configuration Manager</h1>
        <p className="text-gray-600">Manage and organize your pricing tier configurations</p>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center mb-6">
        <div className="text-lg font-semibold text-gray-800">
          {configurations.length} Configuration{configurations.length !== 1 ? 's' : ''}
        </div>
        <button
          onClick={handleCreateConfiguration}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create Configuration
        </button>
      </div>

      {/* Configurations Grid */}
      <div className="space-y-6">
        {configurations.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Archive className="w-12 h-12 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">No Configurations Yet</h3>
            <p className="text-gray-600 mb-6">
              Create your first pricing configuration to get started.
            </p>
            <button
              onClick={handleCreateConfiguration}
              className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors font-semibold"
            >
              Create First Configuration
            </button>
          </div>
        ) : (
          configurations.map((config) => (
            <div
              key={config.id}
              className={`bg-white rounded-xl border-2 p-6 shadow-lg hover:shadow-xl transition-all duration-300 ${getStatusColor(config)}`}
            >
              {/* Configuration Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <Settings className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 text-lg">
                      {config.name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {config.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 border ${getStatusColor(config)}`}>
                    {getStatusIcon(config)}
                    {currentConfiguration && currentConfiguration.id === config.id ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={() => setShowDeleteConfirm(config.id)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Configuration Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">Created: {formatDate(config.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">Updated: {formatDate(config.updatedAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">{config.tiers.length} Tier{config.tiers.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Pricing Tiers Preview */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-gray-800 mb-2">Pricing Tiers</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {config.tiers.map((tier, index) => (
                    <div key={tier.id} className="bg-white p-3 rounded border">
                      <div className="font-medium text-sm">{tier.name}</div>
                      <div className="text-xs text-gray-600">
                        ${tier.perUserCost}/user • ${tier.perGBCost}/GB
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedConfig(config)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  View Details
                </button>
                
                <button
                  onClick={() => handleSelectConfiguration(config)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Use Configuration
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Delete Configuration</h2>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete this pricing configuration? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteConfiguration(showDeleteConfirm)}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Details Modal */}
      {selectedConfig && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-4xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Configuration Details</h2>
              <button
                onClick={() => setSelectedConfig(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">{selectedConfig.name}</h3>
                <p className="text-gray-600">{selectedConfig.description}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Created</label>
                  <p className="text-gray-800">{formatDate(selectedConfig.createdAt)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Last Updated</label>
                  <p className="text-gray-800">{formatDate(selectedConfig.updatedAt)}</p>
                </div>
              </div>
              
              <div>
                <h4 className="text-lg font-semibold text-gray-800 mb-4">Pricing Tiers</h4>
                <div className="space-y-4">
                  {selectedConfig.tiers.map((tier) => (
                    <div key={tier.id} className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <h5 className="font-semibold text-gray-800">{tier.name}</h5>
                        <div className="text-right text-sm text-gray-600">
                          <div>${tier.perUserCost}/user</div>
                          <div>${tier.perGBCost}/GB</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Users:</span> {tier.userLimits.from}-{tier.userLimits.to}
                        </div>
                        <div>
                          <span className="text-gray-600">Data:</span> {tier.gbLimits.from}-{tier.gbLimits.to} GB
                        </div>
                        <div>
                          <span className="text-gray-600">Migration:</span> ${tier.managedMigrationCost}
                        </div>
                        <div>
                          <span className="text-gray-600">Instance:</span> ${tier.instanceCost}
                        </div>
                      </div>
                      <div className="mt-2">
                        <span className="text-gray-600 text-sm">Features:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {tier.features.map((feature, index) => (
                            <span key={index} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                              {feature}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PricingTierManager;
