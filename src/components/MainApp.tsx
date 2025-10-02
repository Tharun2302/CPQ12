import React, { useState, useEffect, useCallback } from 'react';
import { 
  Settings, 
  FileText, 
  Upload, 
  File,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { QuoteData, ClientDetails, ConfigurationInputs, UIState } from '../types';
import { ConfigurationData, PricingCalculation } from '../types/pricing';
import { LocalStorageHelper } from '../utils/helpers';
import { calculatePricing, PRICING_TIERS } from '../utils/pricing';
import QuoteGenerator from './QuoteGenerator';
import { TemplateProcessor } from './TemplateProcessor';
import { DocxTemplates } from './DocxTemplates';
import { sanitizeTextInput, sanitizeNameInput, sanitizeCompanyInput } from '../utils/emojiSanitizer';

// Helper function to limit consecutive spaces to maximum 5
function limitConsecutiveSpaces(value: string, maxSpaces: number = 5): string {
  // Replace any sequence of more than maxSpaces spaces with exactly maxSpaces spaces
  const spaceRegex = new RegExp(`\\s{${maxSpaces + 1},}`, 'g');
  return value.replace(spaceRegex, ' '.repeat(maxSpaces));
}

// Helper function to sanitize Contact Name input (remove special characters and emojis)
function sanitizeContactName(value: string): string {
  // Remove special characters, emojis, and keep only letters, spaces, hyphens, apostrophes, and periods
  return value.replace(/[^a-zA-Z\s\-'\.]/g, '');
}

// Helper function to sanitize Contact Email input (remove emojis and special characters)
function sanitizeContactEmail(value: string): string {
  // Remove emojis and special characters, keep only valid email characters
  return value.replace(/[^\w@\.\-]/g, '');
}

export const MainApp: React.FC = () => {
  const [uiState, setUIState] = useState<UIState>({
    activeTab: 'configure',
    isLoading: false,
    error: null,
    success: null,
    processingStatus: {
      isProcessing: false,
      currentStep: '',
      progress: 0,
      totalSteps: 0,
      warnings: []
    }
  });

  const [clientDetails, setClientDetails] = useState<ClientDetails>({
    companyName: '',
    clientName: '',
    clientEmail: '',
    phone: '',
    address: '',
    website: ''
  });

  const [configuration, setConfiguration] = useState<ConfigurationInputs>({
    numberOfUsers: 10,
    instanceType: 'Standard',
    numberOfInstances: 1,
    duration: 6,
    migrationType: 'Messaging',
    dataSizeGB: 10
  });

  const [generatedQuote, setGeneratedQuote] = useState<QuoteData | null>(null);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedClientDetails = LocalStorageHelper.load<ClientDetails>('clientDetails');
    const savedConfiguration = LocalStorageHelper.load<ConfigurationInputs>('configuration');
    const savedQuote = LocalStorageHelper.load<QuoteData>('generatedQuote');

    if (savedClientDetails) setClientDetails(savedClientDetails);
    if (savedConfiguration) setConfiguration(savedConfiguration);
    if (savedQuote) setGeneratedQuote(savedQuote);
  }, []);

  // Save data to localStorage when it changes
  useEffect(() => {
    LocalStorageHelper.save('clientDetails', clientDetails);
  }, [clientDetails]);

  useEffect(() => {
    LocalStorageHelper.save('configuration', configuration);
  }, [configuration]);

  useEffect(() => {
    if (generatedQuote) {
      LocalStorageHelper.save('generatedQuote', generatedQuote);
    }
  }, [generatedQuote]);

  const handleError = useCallback((error: string) => {
    setUIState(prev => ({
      ...prev,
      error,
      success: null,
      isLoading: false
    }));
  }, []);

  const handleSuccess = useCallback((message: string) => {
    setUIState(prev => ({
      ...prev,
      success: message,
      error: null,
      isLoading: false
    }));
  }, []);

  const handleQuoteGenerated = useCallback((quote: QuoteData) => {
    setGeneratedQuote(quote);
    setUIState(prev => ({
      ...prev,
      activeTab: 'quote',
      success: 'Quote generated successfully!'
    }));
  }, []);

  const clearMessages = useCallback(() => {
    setUIState(prev => ({
      ...prev,
      error: null,
      success: null
    }));
  }, []);

  // Convert ConfigurationInputs to ConfigurationData
  const convertToConfigurationData = useCallback((config: ConfigurationInputs): ConfigurationData => {
    const instanceTypeMap: Record<string, 'Small' | 'Standard' | 'Large' | 'Extra Large'> = {
      'Basic': 'Small',
      'Standard': 'Standard', 
      'Premium': 'Large',
      'Enterprise': 'Extra Large'
    };

    return {
      ...config,
      instanceType: instanceTypeMap[config.instanceType] || 'Standard'
    };
  }, []);

  // Create pricing calculation
  const pricingCalculation = useCallback((): PricingCalculation => {
    const configData = convertToConfigurationData(configuration);
    const tier = PRICING_TIERS[1]; // Use Standard tier by default
    return calculatePricing(configData, tier);
  }, [configuration, convertToConfigurationData]);

  const tabs = [
    { id: 'configure', label: 'Configure', icon: Settings },
    { id: 'quote', label: 'Quote', icon: FileText },
    { id: 'template', label: 'PDF Template', icon: Upload },
    { id: 'templates', label: 'DOCX Templates', icon: File }
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <FileText className="h-8 w-8 text-blue-600" />
              <h1 className="ml-2 text-xl font-bold text-gray-900">ZENOP System</h1>
            </div>
            <div className="flex items-center space-x-4">
              {uiState.isLoading && (
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setUIState(prev => ({ ...prev, activeTab: tab.id as any }))}
                  className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    uiState.activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Messages */}
      {(uiState.error || uiState.success) && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {uiState.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
                <span className="text-red-800">{uiState.error}</span>
                <button
                  onClick={clearMessages}
                  className="ml-auto text-red-400 hover:text-red-600"
                >
                  ×
                </button>
              </div>
            </div>
          )}
          {uiState.success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                <span className="text-green-800">{uiState.success}</span>
                <button
                  onClick={clearMessages}
                  className="ml-auto text-green-400 hover:text-green-600"
                >
                  ×
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {uiState.activeTab === 'configure' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Configuration</h2>
            
            {/* Client Details Form */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Client Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={clientDetails.companyName}
                    onChange={(e) => {
                      const sanitized = sanitizeCompanyInput(e.target.value);
                      setClientDetails(prev => ({ ...prev, companyName: sanitized }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter company name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client Name
                  </label>
                  <input
                    type="text"
                    value={clientDetails.clientName}
                    onChange={(e) => {
                      const sanitized = sanitizeNameInput(e.target.value);
                      const processed = limitConsecutiveSpaces(sanitized);
                      setClientDetails(prev => ({ ...prev, clientName: processed }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter client name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client Email
                  </label>
                  <input
                    type="email"
                    value={clientDetails.clientEmail}
                    onChange={(e) => {
                      const sanitized = sanitizeContactEmail(e.target.value);
                      setClientDetails(prev => ({ ...prev, clientEmail: sanitized }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter client email"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone (Optional)
                  </label>
                  <input
                    type="tel"
                    value={clientDetails.phone || ''}
                    onChange={(e) => setClientDetails(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter phone number"
                  />
                </div>
              </div>
            </div>

            {/* Configuration Form */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Number of Users
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={configuration.numberOfUsers}
                    onChange={(e) => setConfiguration(prev => ({ ...prev, numberOfUsers: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Instance Type
                  </label>
                  <select
                    value={configuration.instanceType}
                    onChange={(e) => setConfiguration(prev => ({ ...prev, instanceType: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="Basic">Basic</option>
                    <option value="Standard">Standard</option>
                    <option value="Premium">Premium</option>
                    <option value="Enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Number of Instances
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={configuration.numberOfInstances}
                    onChange={(e) => setConfiguration(prev => ({ ...prev, numberOfInstances: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duration (months)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={configuration.duration}
                    onChange={(e) => setConfiguration(prev => ({ ...prev, duration: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Migration Type
                  </label>
                  <select
                    value={configuration.migrationType}
                    onChange={(e) => setConfiguration(prev => ({ ...prev, migrationType: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="Messaging">Messaging</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Size (GB)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={configuration.dataSizeGB}
                    onChange={(e) => setConfiguration(prev => ({ ...prev, dataSizeGB: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {uiState.activeTab === 'quote' && (
          <QuoteGenerator
            calculation={pricingCalculation()}
            configuration={convertToConfigurationData(configuration)}
            onGenerateQuote={(quote) => {
              // Convert Quote to QuoteData format
              const quoteData: QuoteData = {
                id: quote.id,
                client: {
                  companyName: quote.company,
                  clientName: quote.clientName,
                  clientEmail: quote.clientEmail
                },
                configuration: {
                  numberOfUsers: quote.configuration.numberOfUsers,
                  instanceType: quote.configuration.instanceType,
                  numberOfInstances: quote.configuration.numberOfInstances,
                  duration: quote.configuration.duration,
                  migrationType: quote.configuration.migrationType,
                  dataSizeGB: quote.configuration.dataSizeGB
                },
                costs: {
                  userCost: quote.calculation.userCost,
                  dataCost: quote.calculation.dataCost,
                  migrationCost: quote.calculation.migrationCost,
                  instanceCost: quote.calculation.instanceCost,
                  totalCost: quote.calculation.totalCost
                },
                selectedPlan: {
                  name: quote.selectedTier.name,
                  price: quote.calculation.totalCost,
                  features: quote.selectedTier.features
                },
                quoteId: quote.id,
                generatedDate: quote.createdAt,
                status: quote.status === 'viewed' ? 'sent' : quote.status
              };
              handleQuoteGenerated(quoteData);
            }}
          />
        )}

        {uiState.activeTab === 'template' && (
          <TemplateProcessor
            quoteData={generatedQuote}
            onError={handleError}
            onSuccess={handleSuccess}
          />
        )}

        {uiState.activeTab === 'templates' && (
          <DocxTemplates
            quoteData={generatedQuote}
            onError={handleError}
            onSuccess={handleSuccess}
          />
        )}
      </main>
    </div>
  );
};
