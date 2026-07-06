import React, { useState, useEffect } from 'react';
import { PricingTier } from '../types/pricing';
import { 
  User, 
  HardDrive, 
  DollarSign, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  X,
  Settings,
  Users,
  Database
} from 'lucide-react';

interface PricingTierConfigProps {
  tiers: PricingTier[];
  onTierUpdate: (tiers: PricingTier[]) => void;
}

const PricingTierConfig: React.FC<PricingTierConfigProps> = ({ tiers, onTierUpdate }) => {
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PricingTier>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTier, setNewTier] = useState<Partial<PricingTier>>({
    name: '',
    perUserCost: 0,
    perGBCost: 0,
    managedMigrationCost: 0,
    instanceCost: 0,
    userLimits: { from: 1, to: 50 },
    gbLimits: { from: 1, to: 100 },
    features: []
  });

  const handleEditStart = (tier: PricingTier) => {
    setEditingTier(tier.id);
    setEditForm({ ...tier });
  };

  const handleEditSave = () => {
    if (editingTier && editForm) {
      const updatedTiers = tiers.map(tier => 
        tier.id === editingTier ? { ...tier, ...editForm } as PricingTier : tier
      );
      onTierUpdate(updatedTiers);
      setEditingTier(null);
      setEditForm({});
    }
  };

  const handleEditCancel = () => {
    setEditingTier(null);
    setEditForm({});
  };

  const handleDelete = (tierId: string) => {
    const updatedTiers = tiers.filter(tier => tier.id !== tierId);
    onTierUpdate(updatedTiers);
  };

  const handleAddTier = () => {
    if (newTier.name && newTier.perUserCost !== undefined && newTier.perGBCost !== undefined) {
      const tier: PricingTier = {
        id: `tier-${Date.now()}`,
        name: newTier.name,
        perUserCost: newTier.perUserCost || 0,
        perGBCost: newTier.perGBCost || 0,
        managedMigrationCost: newTier.managedMigrationCost || 0,
        instanceCost: newTier.instanceCost || 0,
        userLimits: newTier.userLimits || { from: 1, to: 50 },
        gbLimits: newTier.gbLimits || { from: 1, to: 100 },
        features: newTier.features || []
      };
      
      onTierUpdate([...tiers, tier]);
      setNewTier({
        name: '',
        perUserCost: 0,
        perGBCost: 0,
        managedMigrationCost: 0,
        instanceCost: 0,
        userLimits: { from: 1, to: 50 },
        gbLimits: { from: 1, to: 100 },
        features: []
      });
      setShowAddForm(false);
    }
  };

  const handleFeatureAdd = (features: string[], newFeature: string) => {
    if (newFeature.trim()) {
      return [...features, newFeature.trim()];
    }
    return features;
  };

  const handleFeatureRemove = (features: string[], index: number) => {
    return features.filter((_, i) => i !== index);
  };

  return (
    <div className="max-w-6xl mx-auto p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
          <Settings className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Pricing Tier Configuration</h1>
        <p className="text-gray-600">Configure and manage your pricing tiers</p>
      </div>

      {/* Add New Tier Button */}
      <div className="flex justify-between items-center mb-6">
        <div className="text-lg font-semibold text-gray-800">
          {tiers.length} Pricing Tier{tiers.length !== 1 ? 's' : ''}
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Tier
        </button>
      </div>

      {/* Add New Tier Form */}
      {showAddForm && (
        <div className="bg-white border-2 border-blue-200 rounded-xl p-6 mb-6 shadow-lg">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Add New Pricing Tier</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tier Name</label>
              <input
                type="text"
                value={newTier.name || ''}
                onChange={(e) => setNewTier({ ...newTier, name: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Premium"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Per User Cost ($)</label>
              <input
                type="number"
                value={newTier.perUserCost || ''}
                onChange={(e) => setNewTier({ ...newTier, perUserCost: parseFloat(e.target.value) })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Per GB Cost ($)</label>
              <input
                type="number"
                step="0.01"
                value={newTier.perGBCost || ''}
                onChange={(e) => setNewTier({ ...newTier, perGBCost: parseFloat(e.target.value) })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="1.50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Migration Cost ($)</label>
              <input
                type="number"
                value={newTier.managedMigrationCost || ''}
                onChange={(e) => setNewTier({ ...newTier, managedMigrationCost: parseFloat(e.target.value) })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Instance Cost ($)</label>
              <input
                type="number"
                value={newTier.instanceCost || ''}
                onChange={(e) => setNewTier({ ...newTier, instanceCost: parseFloat(e.target.value) })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="500"
              />
            </div>
          </div>
          
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <X className="w-4 h-4 inline mr-1" />
              Cancel
            </button>
            <button
              onClick={handleAddTier}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Save className="w-4 h-4 inline mr-1" />
              Add Tier
            </button>
          </div>
        </div>
      )}

      {/* Existing Tiers */}
      <div className="space-y-6">
        {tiers.map((tier) => (
          <div key={tier.id} className="bg-white rounded-xl border-2 border-gray-200 p-6 shadow-lg hover:shadow-xl transition-all duration-300">
            {editingTier === tier.id ? (
              // Edit Mode
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Edit Pricing Tier</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tier Name</label>
                    <input
                      type="text"
                      value={editForm.name || ''}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Per User Cost ($)</label>
                    <input
                      type="number"
                      value={editForm.perUserCost || ''}
                      onChange={(e) => setEditForm({ ...editForm, perUserCost: parseFloat(e.target.value) })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Per GB Cost ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.perGBCost || ''}
                      onChange={(e) => setEditForm({ ...editForm, perGBCost: parseFloat(e.target.value) })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Migration Cost ($)</label>
                    <input
                      type="number"
                      value={editForm.managedMigrationCost || ''}
                      onChange={(e) => setEditForm({ ...editForm, managedMigrationCost: parseFloat(e.target.value) })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Instance Cost ($)</label>
                    <input
                      type="number"
                      value={editForm.instanceCost || ''}
                      onChange={(e) => setEditForm({ ...editForm, instanceCost: parseFloat(e.target.value) })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={handleEditCancel}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <X className="w-4 h-4 inline mr-1" />
                    Cancel
                  </button>
                  <button
                    onClick={handleEditSave}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Save className="w-4 h-4 inline mr-1" />
                    Save Changes
                  </button>
                </div>
              </div>
            ) : (
              // View Mode
              <div>
                {/* Tier Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                      <DollarSign className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 text-lg">
                        {tier.name}
                      </h3>
                      <p className="text-sm text-gray-500">
                        Pricing tier configuration
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditStart(tier)}
                      className="text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(tier.id)}
                      className="text-red-500 hover:text-red-700 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Pricing Details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-600">Per User</span>
                    </div>
                    <div className="text-lg font-semibold text-gray-800">${tier.perUserCost}</div>
                  </div>
                  
                  <div className="bg-green-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <HardDrive className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-600">Per GB</span>
                    </div>
                    <div className="text-lg font-semibold text-gray-800">${tier.perGBCost}</div>
                  </div>
                  
                  <div className="bg-purple-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Database className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-600">Migration</span>
                    </div>
                    <div className="text-lg font-semibold text-gray-800">${tier.managedMigrationCost}</div>
                  </div>
                  
                  <div className="bg-orange-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Settings className="w-4 h-4 text-orange-600" />
                      <span className="text-sm font-medium text-orange-600">Instance</span>
                    </div>
                    <div className="text-lg font-semibold text-gray-800">${tier.instanceCost}</div>
                  </div>
                </div>

                {/* Limits */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-600">User Limits</span>
                    </div>
                    <div className="text-sm text-gray-800">
                      {tier.userLimits.from} - {tier.userLimits.to} users
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Database className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-600">Data Limits</span>
                    </div>
                    <div className="text-sm text-gray-800">
                      {tier.gbLimits.from} - {tier.gbLimits.to} GB
                    </div>
                  </div>
                </div>

                {/* Features */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-800 mb-2">Features</h4>
                  <div className="flex flex-wrap gap-2">
                    {tier.features.map((feature, index) => (
                      <span key={index} className="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full">
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {tiers.length === 0 && (
        <div className="text-center py-12">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <DollarSign className="w-12 h-12 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">No Pricing Tiers</h3>
          <p className="text-gray-600 mb-6">
            Create your first pricing tier to get started.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
          >
            Add First Tier
          </button>
        </div>
      )}
    </div>
  );
};

export default PricingTierConfig;
