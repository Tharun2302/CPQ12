import React, { useState } from 'react';
import { PRICING_TIERS } from '../utils/pricing';
import { formatCurrency } from '../utils/pricing';
import { Save, RefreshCw, Settings as SettingsIcon, DollarSign, User, Mail } from 'lucide-react';

interface SettingsProps {
  companyInfo?: {
    name: string;
    address: string;
    city: string;
    email: string;
    phone: string;
  };
  updateCompanyInfo?: (updates: any) => void;
}

const Settings: React.FC<SettingsProps> = ({ 
  companyInfo: globalCompanyInfo,
  updateCompanyInfo 
}) => {
  const [pricingTiers, setPricingTiers] = useState(PRICING_TIERS);
  const [companyInfo, setCompanyInfo] = useState(globalCompanyInfo || {
    name: 'CPQ Solutions',
    address: '123 Business St.',
    city: 'City, State 12345',
    email: 'contact@cpqsolutions.com',
    phone: '(555) 123-4567'
  });

  // Update local state when global company info changes
  React.useEffect(() => {
    if (globalCompanyInfo) {
      setCompanyInfo(globalCompanyInfo);
    }
  }, [globalCompanyInfo]);

  const handleSaveCompanyInfo = () => {
    if (updateCompanyInfo) {
      updateCompanyInfo(companyInfo);
      alert('Company information saved successfully!');
    } else {
      // Fallback to localStorage if no global update function
      try {
        localStorage.setItem('companyInfo', JSON.stringify(companyInfo));
        alert('Company information saved successfully!');
      } catch (error) {
        console.error('Error saving company info:', error);
        alert('Error saving company information');
      }
    }
  };

  const updatePricingTier = (tierId: string, field: string, value: number) => {
    setPricingTiers(prev => 
      prev.map(tier => 
        tier.id === tierId 
          ? { ...tier, [field]: value }
          : tier
      )
    );
  };

  const savePricing = () => {
    // In a real app, this would save to database
    console.log('Saving pricing tiers:', pricingTiers);
    alert('Pricing updated successfully!');
  };

  const resetToDefaults = () => {
    setPricingTiers(PRICING_TIERS);
  };

  return (
    <div className="space-y-6">
      {/* Company Information */}
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="flex items-center gap-3 mb-6">
          <User className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">Company Information</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Company Name</label>
            <input
              type="text"
              value={companyInfo.name}
              onChange={(e) => setCompanyInfo({ ...companyInfo, name: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              type="email"
              value={companyInfo.email}
              onChange={(e) => setCompanyInfo({ ...companyInfo, email: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
            <input
              type="text"
              value={companyInfo.address}
              onChange={(e) => setCompanyInfo({ ...companyInfo, address: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">City, State ZIP</label>
            <input
              type="text"
              value={companyInfo.city}
              onChange={(e) => setCompanyInfo({ ...companyInfo, city: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
            <input
              type="text"
              value={companyInfo.phone}
              onChange={(e) => setCompanyInfo({ ...companyInfo, phone: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button 
            onClick={handleSaveCompanyInfo}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Company Info
          </button>
        </div>
      </div>

      {/* Pricing Configuration */}
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <DollarSign className="w-6 h-6 text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-900">Pricing Configuration</h2>
          </div>
          <div className="space-x-3">
            <button
              onClick={resetToDefaults}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reset to Defaults
            </button>
            <button
              onClick={savePricing}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        </div>

        <div className="space-y-8">
          {pricingTiers.map((tier) => (
            <div key={tier.id} className="border border-gray-200 rounded-xl p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">{tier.name} Plan</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Per User Cost ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={tier.perUserCost}
                    onChange={(e) => updatePricingTier(tier.id, 'perUserCost', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Per GB Cost ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={tier.perGBCost}
                    onChange={(e) => updatePricingTier(tier.id, 'perGBCost', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Migration Cost ($)
                  </label>
                  <input
                    type="number"
                    value={tier.managedMigrationCost}
                    onChange={(e) => updatePricingTier(tier.id, 'managedMigrationCost', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Instance Cost ($)
                  </label>
                  <input
                    type="number"
                    value={tier.instanceCost}
                    onChange={(e) => updatePricingTier(tier.id, 'instanceCost', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Pricing Summary</h4>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <span>Per User: {formatCurrency(tier.perUserCost)}</span>
                  <span>Per GB: {formatCurrency(tier.perGBCost)}</span>
                  <span>Migration: {formatCurrency(tier.managedMigrationCost)}</span>
                  <span>Instance: {formatCurrency(tier.instanceCost)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Email Configuration */}
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="flex items-center gap-3 mb-6">
          <Mail className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">Email Configuration</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">SMTP Server</label>
            <input
              type="text"
              placeholder="smtp.gmail.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Port</label>
            <input
              type="number"
              placeholder="587"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
            <input
              type="text"
              placeholder="your-email@gmail.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="password"
              placeholder="Your app password"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex justify-between items-center mt-6">
          <div className="text-sm text-gray-600">
            <p>Use app-specific passwords for Gmail and other providers.</p>
            <p>Test the configuration before saving.</p>
          </div>
          <div className="space-x-3">
            <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              Test Connection
            </button>
            <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
              <Save className="w-4 h-4" />
              Save Email Config
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;