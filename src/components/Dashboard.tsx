import React, { useEffect } from 'react';
import { useLocation, Navigate, useNavigate } from 'react-router-dom';
import Navigation from './Navigation';
import ConfigurationForm from './ConfigurationForm';
import PricingComparison from './PricingComparison';
import PricingTierConfig from './PricingTierConfig';
import QuoteGenerator from './QuoteGenerator';
import QuoteManager from './QuoteManager';
import TemplateManager from './TemplateManager';
import DealDetails from './DealDetails';
import Settings from './Settings';
import DigitalSignatureForm from './DigitalSignatureForm';
import ApprovalWorkflow from './ApprovalWorkflow';
import { ConfigurationData, PricingCalculation, PricingTier, Quote } from '../types/pricing';
import { getRecommendedTier } from '../utils/pricing';
import { FileText } from 'lucide-react';

interface DashboardProps {
  // All the props that were previously in App component
  configuration: ConfigurationData | undefined;
  setConfiguration: React.Dispatch<React.SetStateAction<ConfigurationData | undefined>>;
  calculations: PricingCalculation[];
  setCalculations: React.Dispatch<React.SetStateAction<PricingCalculation[]>>;
  selectedTier: PricingCalculation | null;
  setSelectedTier: React.Dispatch<React.SetStateAction<PricingCalculation | null>>;
  showPricing: boolean;
  setShowPricing: React.Dispatch<React.SetStateAction<boolean>>;
  pricingTiers: PricingTier[];
  setPricingTiers: React.Dispatch<React.SetStateAction<PricingTier[]>>;
  hubspotState: any;
  setHubspotState: React.Dispatch<React.SetStateAction<any>>;
  companyInfo: any;
  setCompanyInfo: React.Dispatch<React.SetStateAction<any>>;
  selectedTemplate: any;
  setSelectedTemplate: React.Dispatch<React.SetStateAction<any>>;
  templates: any[];
  setTemplates: React.Dispatch<React.SetStateAction<any[]>>;
  quotes: Quote[];
  setQuotes: React.Dispatch<React.SetStateAction<Quote[]>>;
  dealData: any;
  setDealData: React.Dispatch<React.SetStateAction<any>>;
  activeDealData: any;
  setActiveDealData: React.Dispatch<React.SetStateAction<any>>;
  currentClientInfo: any;
  setCurrentClientInfo: React.Dispatch<React.SetStateAction<any>>;
  configureContactInfo: any;
  setConfigureContactInfo: React.Dispatch<React.SetStateAction<any>>;
  signatureFormData: any;
  setSignatureFormData: React.Dispatch<React.SetStateAction<any>>;
  isSignatureForm: boolean;
  setIsSignatureForm: React.Dispatch<React.SetStateAction<boolean>>;
  // Handler functions
  handleConfigurationChange: (config: ConfigurationData) => void;
  handleSubmitConfiguration: () => void;
  handleSelectTier: (calculation: PricingCalculation) => void;
  handleTierUpdate: (updatedTiers: PricingTier[]) => void;
  handleGenerateQuote: (clientInfo: any) => void;
  handleDeleteQuote: (quoteId: string) => void;
  handleUpdateQuoteStatus: (quoteId: string, newStatus: Quote['status']) => void;
  handleUpdateQuote: (quoteId: string, updates: Partial<Quote>) => void;
  handleTemplateSelect: (template: any) => void;
  handleTemplatesUpdate: () => void;
  updateCompanyInfo: (updates: any) => void;
  handleSelectHubSpotContact: (contact: any) => void;
  handleConfigureContactInfoChange: (contactInfo: any) => void;
  handleClientInfoChange: (clientInfo: any) => void;
  refreshDealData: () => void;
  handleUseDealData: (dealData: any) => void;
  handleSignatureFormComplete: (signatureData: any, approvalStatus: string, comments: string) => void;
  getCurrentQuoteData: () => any;
}

const Dashboard: React.FC<DashboardProps> = ({
  configuration,
  setConfiguration,
  calculations,
  setCalculations,
  selectedTier,
  setSelectedTier,
  showPricing,
  setShowPricing,
  pricingTiers,
  setPricingTiers,
  hubspotState,
  setHubspotState,
  companyInfo,
  setCompanyInfo,
  selectedTemplate,
  setSelectedTemplate,
  templates,
  setTemplates,
  quotes,
  setQuotes,
  dealData,
  setDealData,
  activeDealData,
  setActiveDealData,
  currentClientInfo,
  setCurrentClientInfo,
  configureContactInfo,
  setConfigureContactInfo,
  signatureFormData,
  setSignatureFormData,
  isSignatureForm,
  setIsSignatureForm,
  handleConfigurationChange,
  handleSubmitConfiguration,
  handleSelectTier,
  handleTierUpdate,
  handleGenerateQuote,
  handleDeleteQuote,
  handleUpdateQuoteStatus,
  handleUpdateQuote,
  handleTemplateSelect,
  handleTemplatesUpdate,
  updateCompanyInfo,
  handleSelectHubSpotContact,
  handleConfigureContactInfoChange,
  handleClientInfoChange,
  refreshDealData,
  handleUseDealData: originalHandleUseDealData,
  handleSignatureFormComplete,
  getCurrentQuoteData
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Navigation state to track current session
  const [navigationState, setNavigationState] = React.useState({
    previousTab: null as string | null,
    currentTab: 'deal',
    isNavigating: false
  });

  // Get current tab from URL path
  const getCurrentTab = () => {
    const path = location.pathname;
    if (path.startsWith('/dashboard/')) {
      const tab = path.split('/dashboard/')[1] || 'deal';
      
      // Handle backward compatibility for old quotes URL
      if (tab === 'quotes') {
        // Redirect to documents URL
        navigate('/dashboard/documents', { replace: true });
        return 'documents';
      }
      
      return tab;
    }
    return 'deal';
  };

  const currentTab = getCurrentTab();

  // Handle browser back button navigation
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      console.log('🔄 Browser back button pressed, syncing state with URL');
      console.log('🔄 Current URL:', window.location.pathname);
      
      // Restore session state when navigating back
      restoreSessionState();
      
      // Update navigation state to reflect the back navigation
      setNavigationState(prev => ({
        ...prev,
        previousTab: prev.currentTab,
        currentTab: getCurrentTab(),
        isNavigating: true
      }));
      
      // Reset navigation flag after a short delay
      setTimeout(() => {
        setNavigationState(prev => ({
          ...prev,
          isNavigating: false
        }));
      }, 100);
    };

    // Add event listener for browser back/forward buttons
    window.addEventListener('popstate', handlePopState);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Sync state with URL changes
  useEffect(() => {
    const newTab = getCurrentTab();
    console.log('🔄 URL changed, current tab:', newTab);
    console.log('🔄 Location pathname:', location.pathname);
    
    // Update navigation state when URL changes
    setNavigationState(prev => ({
      ...prev,
      previousTab: prev.currentTab,
      currentTab: newTab,
      isNavigating: false
    }));
  }, [location.pathname]);

  // Restore session state on component mount
  useEffect(() => {
    console.log('🔄 Dashboard mounted, checking for saved session state');
    restoreSessionState();
  }, []);

  // Enhanced navigation handler that preserves session state
  const handleNavigation = (tab: string) => {
    console.log('🔄 Navigating to tab:', tab);
    
    // Preserve current session state before navigation
    const currentSessionState = {
      configuration,
      calculations,
      selectedTier,
      showPricing,
      currentClientInfo,
      configureContactInfo
    };
    
    // Store session state in sessionStorage for persistence
    try {
      sessionStorage.setItem('cpq_navigation_state', JSON.stringify({
        previousTab: navigationState.currentTab,
        currentTab: tab,
        sessionState: currentSessionState,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('⚠️ Could not save navigation state:', error);
    }
    
    // Update navigation state
    setNavigationState(prev => ({
      ...prev,
      previousTab: prev.currentTab,
      currentTab: tab,
      isNavigating: true
    }));
    
    // Navigate to the new tab
    navigate(`/dashboard/${tab}`);
    
    // Reset navigation flag
    setTimeout(() => {
      setNavigationState(prev => ({
        ...prev,
        isNavigating: false
      }));
    }, 100);
  };

  // Restore session state when navigating back
  const restoreSessionState = () => {
    try {
      const savedState = sessionStorage.getItem('cpq_navigation_state');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        console.log('🔄 Restoring session state:', parsed);
        
        // Restore state if it's recent (within 5 minutes)
        if (Date.now() - parsed.timestamp < 300000) {
          // Let ConfigurationForm handle all configuration loading - don't restore from navigation state
          // This prevents conflicts between cpq_navigation_state and cpq_configuration_session
          console.log('🔄 Skipping configuration restoration - letting ConfigurationForm handle it');
          
          if (parsed.sessionState.calculations) {
            setCalculations(parsed.sessionState.calculations);
          }
          if (parsed.sessionState.selectedTier) {
            setSelectedTier(parsed.sessionState.selectedTier);
          }
          if (parsed.sessionState.showPricing !== undefined) {
            setShowPricing(parsed.sessionState.showPricing);
          }
          if (parsed.sessionState.currentClientInfo) {
            setCurrentClientInfo(parsed.sessionState.currentClientInfo);
          }
          if (parsed.sessionState.configureContactInfo) {
            setConfigureContactInfo(parsed.sessionState.configureContactInfo);
          }
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not restore session state:', error);
    }
  };

  // Debug wrapper for handleUseDealData
  const handleUseDealData = (dealData: any) => {
    console.log('🔍 Dashboard: handleUseDealData called with:', dealData);
    console.log('🔍 Dashboard: originalHandleUseDealData function:', originalHandleUseDealData);
    
    if (originalHandleUseDealData) {
      console.log('✅ Dashboard: Calling original handleUseDealData function');
      originalHandleUseDealData(dealData);
      console.log('✅ Dashboard: Original function completed successfully');
    } else {
      console.error('❌ Dashboard: originalHandleUseDealData is not defined!');
    }
    
    // Navigate to configure tab after using deal data
    console.log('🔄 Dashboard: Navigating to configure tab...');
    try {
      navigate('/dashboard/configure');
      console.log('✅ Dashboard: Navigation to configure tab successful');
    } catch (error) {
      console.error('❌ Dashboard: Navigation failed:', error);
    }
  };

  // Wrapper for handleSelectTier to add navigation
  const handleSelectTierWithNavigation = (calculation: PricingCalculation) => {
    console.log('🔍 Dashboard: handleSelectTier called with:', calculation);
    if (handleSelectTier) {
      handleSelectTier(calculation);
    } else {
      console.error('❌ Dashboard: handleSelectTier is not defined!');
    }
    // Navigate to quote tab after tier selection
    console.log('🔄 Dashboard: Navigating to quote tab after tier selection...');
    try {
      navigate('/dashboard/quote');
      console.log('✅ Dashboard: Navigation to quote tab successful');
    } catch (error) {
      console.error('❌ Dashboard: Navigation to quote tab failed:', error);
    }
  };

  // Handle signature form display
  if (isSignatureForm && signatureFormData) {
    return (
      <DigitalSignatureForm
        formId={signatureFormData.form_id}
        quoteData={signatureFormData.quote_data}
        clientName={signatureFormData.client_name}
        clientEmail={signatureFormData.client_email}
        onComplete={handleSignatureFormComplete}
      />
    );
  }

  const renderTabContent = () => {
    switch (currentTab) {
      case 'deal':
        return (
          <div className="max-w-7xl mx-auto p-6">
            <div className="mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">Deal Info</h1>
                  <p className="text-gray-600">View and manage deal details from HubSpot</p>
                </div>
              </div>
            </div>
            
            <DealDetails 
              dealData={dealData || {
                dealId: "TEST-12345",
                dealName: "Test Deal - Cloud Migration",
                amount: "$25,000",
                stage: "Proposal",
                closeDate: "2024-12-31",
                ownerId: "user-456",
                company: "Demo Company Inc.",
                companyByContact: "Contact Company Inc.",
                contactName: "John Smith",
                contactEmail: "john.smith@democompany.com",
                contactPhone: "+1 (555) 123-4567",
                contactJobTitle: "IT Director",
                companyDomain: "democompany.com",
                companyPhone: "+1 (555) 987-6543",
                companyAddress: "123 Business Street, City, State 12345"
              }}
              onRefresh={refreshDealData}
              onUseDealData={handleUseDealData}
            />
          </div>
        );

      case 'configure':
        return (
          <div className="space-y-8">
            <ConfigurationForm
              onConfigurationChange={handleConfigurationChange}
              onSubmit={handleSubmitConfiguration}
              dealData={activeDealData}
              onContactInfoChange={handleConfigureContactInfoChange}
              templates={templates}
              selectedTemplate={selectedTemplate}
              onTemplateSelect={handleTemplateSelect}
            />
            
            {showPricing && calculations.length > 0 && (
              <PricingComparison
                calculations={calculations}
                recommendedTier={getRecommendedTier(calculations)}
                onSelectTier={handleSelectTierWithNavigation}
                configuration={configuration}
              />
            )}
          </div>
        );

      case 'pricing-config':
        return (
          <PricingTierConfig
            tiers={pricingTiers}
            onTierUpdate={handleTierUpdate}
          />
        );

      case 'quote':
        if (!selectedTier || !configuration) {
          return (
            <div className="max-w-4xl mx-auto p-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-gray-400" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">No Configuration Selected</h2>
                <p className="text-gray-600 mb-6">
                  Please configure your project and select a pricing tier first to generate a quote.
                </p>
                <div className="space-x-4">
                  <button
                    onClick={() => window.location.href = '/dashboard/configure'}
                    className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                  >
                    Go to Configuration
                  </button>
                </div>
              </div>
            </div>
          );
        }
        
        const fallbackCalculation: PricingCalculation = {
          userCost: 30,
          dataCost: 0,
          migrationCost: 300,
          instanceCost: 0,
          totalCost: 330,
          tier: {
            id: 'default',
            name: 'Basic' as const,
            perUserCost: 30.0,
            perGBCost: 1.00,
            managedMigrationCost: 300,
            instanceCost: 0,
            userLimits: { from: 1, to: 100 },
            gbLimits: { from: 0, to: 1000 },
            features: ['Basic migration support', 'Email support']
          }
        };

        const fallbackConfiguration: ConfigurationData = {
          numberOfUsers: 1,
          instanceType: 'Standard',
          numberOfInstances: 1,
          duration: 1,
          migrationType: 'Messaging',
          dataSizeGB: 0,
          startDate: '',
          endDate: ''
        };

        return (
          <QuoteGenerator
            calculation={selectedTier || fallbackCalculation}
            configuration={configuration || fallbackConfiguration}
            onGenerateQuote={handleGenerateQuote}
            onConfigurationChange={handleConfigurationChange}
            hubspotState={hubspotState}
            onSelectHubSpotContact={handleSelectHubSpotContact}
            companyInfo={companyInfo}
            selectedTemplate={selectedTemplate}
            onClientInfoChange={handleClientInfoChange}
            dealData={activeDealData}
            configureContactInfo={configureContactInfo}
          />
        );

      case 'quotes':
      case 'documents':
        return (
          <QuoteManager
            quotes={quotes}
            onDeleteQuote={handleDeleteQuote}
            onUpdateQuoteStatus={handleUpdateQuoteStatus}
            onUpdateQuote={handleUpdateQuote}
            templates={templates}
          />
        );

      case 'templates':
        return (
          <TemplateManager
            onTemplateSelect={handleTemplateSelect}
            selectedTemplate={selectedTemplate}
            onTemplatesUpdate={handleTemplatesUpdate}
            currentQuoteData={getCurrentQuoteData()}
            templates={templates}
            setTemplates={setTemplates}
          />
        );

      case 'approval':
        return (
          <ApprovalWorkflow
            quotes={quotes}
            onStartWorkflow={(workflowData) => {
              console.log('Starting approval workflow:', workflowData);
              // Here you can add logic to handle the workflow start
              // For example, save to database, send emails, etc.
            }}
            onNavigateToDashboard={() => window.location.href = '/approval-tracking'}
          />
        );


      case 'settings':
        return (
          <Settings
            companyInfo={companyInfo}
            updateCompanyInfo={updateCompanyInfo}
          />
        );

      default:
        return <Navigate to="/dashboard/deal" replace />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-100/50">
      {!isSignatureForm && <Navigation currentTab={currentTab} />}
      
      <main className={`${isSignatureForm ? 'max-w-6xl' : 'max-w-7xl'} mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-10`}>
        {renderTabContent()}
      </main>
    </div>
  );
};

export default Dashboard;
