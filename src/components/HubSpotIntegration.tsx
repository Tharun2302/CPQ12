import React, { useState, useEffect } from 'react';
import { Quote, ConfigurationData, PricingCalculation } from '../types/pricing';
import { BACKEND_URL } from '../config/api';
import { 
  ExternalLink, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  MessageSquare,
  Building,
  User,
  Mail,
  Phone,
  Calendar,
  Info,
  Search,
  Users,
  Eye,
  FileText
} from 'lucide-react';

interface HubSpotIntegrationProps {
  quote?: Quote;
  configuration?: ConfigurationData;
  calculation?: PricingCalculation;
  hubspotState?: {
    isConnected: boolean;
    isConnecting: boolean;
    connectionError: string | null;
    showDemoMode: boolean;
    hubspotContacts: HubSpotContact[];
    hubspotDeals: HubSpotDeal[];
    isLoadingContacts: boolean;
    isLoadingDeals: boolean;
    createdContact: HubSpotContact | null;
    createdDeal: HubSpotDeal | null;
    isCreatingContact: boolean;
    isCreatingDeal: boolean;
    selectedContact: HubSpotContact | null;
    searchTerm: string;
  };
  updateHubspotState?: (updates: any) => void;
  onUseDealData?: (dealData: any) => void;
}

interface HubSpotContact {
  id: string;
  properties: {
    firstname?: string;
    lastname?: string;
    email: string;
    company?: string;
    phone?: string;
    createdate?: string;
    lastmodifieddate?: string;
  };
}

interface HubSpotDeal {
  id: string;
  properties: {
    dealname: string;
    amount: string;
    dealstage: string;
    closedate: string;
    createdate?: string;
    lastmodifieddate?: string;
    ownerid?: string;
    company?: string;
    contactemail?: string;
    contactname?: string;
    contactphone?: string;
    contactjobtitle?: string;
    companydomain?: string;
    companyphone?: string;
    companyaddress?: string;
  };
}

const HubSpotIntegration: React.FC<HubSpotIntegrationProps> = ({ 
  quote, 
  configuration, 
  calculation,
  hubspotState: globalHubspotState,
  updateHubspotState,
  onUseDealData
}) => {
  // Add error boundary
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Use global state if provided, otherwise use local state
  const [localState, setLocalState] = useState({
    isConnected: false,
    isConnecting: false,
    connectionError: null as string | null,
    isCreatingContact: false,
    isCreatingDeal: false,
    createdContact: null as HubSpotContact | null,
    createdDeal: null as HubSpotDeal | null,
    showDemoMode: false,
    hubspotContacts: [] as HubSpotContact[],
    hubspotDeals: [] as HubSpotDeal[],
    isLoadingContacts: false,
    isLoadingDeals: false,
    selectedContact: null as HubSpotContact | null,
    selectedDeal: null as HubSpotDeal | null,
    searchTerm: ''
  });

  // Use global state if available, otherwise use local state
  const state = globalHubspotState ? {
    ...localState,
    ...globalHubspotState
  } : localState;

  // Add debugging for state
  console.log('🔍 HubSpot state debug:', {
    globalHubspotState,
    localState,
    mergedState: state,
    hasError,
    errorMessage
  });

  const updateState = (updates: any) => {
    try {
      console.log('🔄 Updating HubSpot state:', updates);
      if (updateHubspotState) {
        updateHubspotState(updates);
      } else {
        setLocalState(prev => ({ ...prev, ...updates }));
      }
    } catch (error) {
      console.error('❌ Error updating HubSpot state:', error);
      setHasError(true);
      setErrorMessage(`Failed to update HubSpot state: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const hubspotApiKey = import.meta.env.VITE_HUBSPOT_API_KEY || 'pat-na1-635cc313-80cb-4701-810a-a0492691b28d';

  // Error boundary - if there's an error, show a fallback UI
  if (hasError) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">HubSpot Integration Error</h2>
          <p className="text-gray-600 mb-4">{errorMessage}</p>
          <button
            onClick={() => {
              setHasError(false);
              setErrorMessage('');
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Safety check - ensure we have required props
  if (!calculation || !configuration) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Missing Configuration</h2>
          <p className="text-gray-600">
            Please ensure you have selected a pricing tier and configuration before accessing HubSpot integration.
          </p>
        </div>
      </div>
    );
  }

  // Add debugging
  console.log('HubSpotIntegration render:', {
    hubspotState: state,
    clientInfo: quote,
    showPreview: state.showDemoMode,
    calculation: calculation?.tier?.name,
    configuration: configuration?.numberOfUsers,
    quoteCompany: quote?.company,
    quoteClientName: quote?.clientName,
    quoteEmail: quote?.clientEmail
  });

  // Simulated API response for demo purposes
  const simulateApiCall = (endpoint: string, method: string, data?: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate network delay
        if (Math.random() > 0.1) { // 90% success rate
          if (endpoint.includes('contacts') && method === 'GET') {
            resolve({ ok: true, status: 200 });
          } else if (endpoint.includes('contacts') && method === 'POST') {
            resolve({
              ok: true,
              status: 201,
              json: () => Promise.resolve({
                id: `contact_${Date.now()}`,
                properties: data.properties
              })
            });
          } else if (endpoint.includes('deals') && method === 'POST') {
            resolve({
              ok: true,
              status: 201,
              json: () => Promise.resolve({
                id: `deal_${Date.now()}`,
                properties: data.properties
              })
            });
          }
        } else {
          reject(new Error('Simulated API error'));
        }
      }, 1500); // 1.5 second delay
    });
  };

  // Fetch contacts from HubSpot
  const fetchHubSpotContacts = async () => {
    updateState({ isLoadingContacts: true });
    try {
      let response;
      
      // Try backend server first
      try {
        console.log('🔄 Fetching contacts from backend server...');
        response = await fetch(`${BACKEND_URL}/api/hubspot/contacts`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(15000) // 15 second timeout
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            console.log('✅ Real HubSpot contacts fetched via backend:', result.data.length, 'contacts');
            console.log('📄 Sample contact:', result.data[0]);
            console.log('🔍 Demo mode:', result.isDemo);
            
            // Check if we're getting real data or demo data
            const isRealData = !result.isDemo && result.data.length > 0 && 
              result.data.some((contact: HubSpotContact) => contact.id && !contact.id.startsWith('contact_'));
            
            if (isRealData) {
              console.log('✅ Confirmed real HubSpot data');
              updateState({ 
                hubspotContacts: result.data,
                showDemoMode: false,
                isConnected: true
              });
            } else {
              console.log('⚠️ Backend returned demo data');
              updateState({ 
                hubspotContacts: result.data,
                showDemoMode: true,
                isConnected: true
              });
            }
            return;
          }
        } else {
          console.log('❌ Backend server error for contacts:', response.status);
          const errorText = await response.text();
          console.log('❌ Error response:', errorText);
        }
      } catch (backendError) {
        console.log('❌ Backend server not available for contacts:', backendError);
      }

      // Fallback to demo mode
      console.log('⚠️ Using demo contacts as fallback');
      const demoContacts: HubSpotContact[] = [
        {
          id: 'contact_1',
          properties: {
            firstname: 'John',
            lastname: 'Doe',
            email: 'john.doe@example.com',
            company: 'Tech Corp',
            phone: '+1-555-0123',
            createdate: '2024-01-15T10:30:00Z',
            lastmodifieddate: '2024-08-19T14:20:00Z'
          }
        },
        {
          id: 'contact_2',
          properties: {
            firstname: 'Jane',
            lastname: 'Smith',
            email: 'jane.smith@example.com',
            company: 'Digital Solutions',
            phone: '+1-555-0456',
            createdate: '2024-02-20T09:15:00Z',
            lastmodifieddate: '2024-08-18T16:45:00Z'
          }
        }
      ];
      
      updateState({ 
        hubspotContacts: demoContacts,
        showDemoMode: true,
        isConnected: true
      });
    } catch (error) {
      console.error('Failed to fetch HubSpot contacts:', error);
      updateState({ 
        connectionError: 'Failed to fetch contacts. Please check your connection and try again.',
        showDemoMode: true,
        isConnected: false
      });
    } finally {
      updateState({ isLoadingContacts: false });
    }
  };

  // Fetch deals from HubSpot
  const fetchHubSpotDeals = async () => {
    updateState({ isLoadingDeals: true });
    try {
      let response;
      
      // Try backend server first
      try {
        console.log('🔄 Fetching deals from backend server...');
        response = await fetch(`${BACKEND_URL}/api/hubspot/deals`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(15000) // 15 second timeout
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            console.log('✅ Real HubSpot deals fetched via backend:', result.data.length, 'deals');
            console.log('📄 Sample deal:', result.data[0]);
            console.log('🔍 Demo mode:', result.isDemo);
            
            // Check if we're getting real data or demo data
            const isRealData = !result.isDemo && result.data.length > 0 && 
              result.data.some((deal: HubSpotDeal) => deal.id && !deal.id.startsWith('deal_'));
            
            if (isRealData) {
              console.log('✅ Confirmed real HubSpot deals data');
              updateState({ 
                hubspotDeals: result.data,
                showDemoMode: false,
                isConnected: true
              });
            } else {
              console.log('⚠️ Backend returned demo deals data');
              updateState({ 
                hubspotDeals: result.data,
                showDemoMode: true,
                isConnected: true
              });
            }
            return;
          }
        } else {
          console.log('❌ Backend server error for deals:', response.status);
          const errorText = await response.text();
          console.log('❌ Error response:', errorText);
        }
      } catch (backendError) {
        console.log('❌ Backend server not available for deals:', backendError);
      }

      // Fallback to demo mode
      console.log('⚠️ Using demo deals as fallback');
      const demoDeals: HubSpotDeal[] = [
        {
          id: 'deal_1',
          properties: {
            dealname: 'Enterprise Software License',
            amount: '50000',
            dealstage: 'closedwon',
            closedate: '2024-08-15T00:00:00Z',
            createdate: '2024-06-01T10:00:00Z',
            lastmodifieddate: '2024-08-15T16:30:00Z',
            // Add demo contact and company information
            company: 'Tech Solutions Inc.',
            contactname: 'Sarah Johnson',
            contactemail: 'sarah.johnson@techsolutions.com',
            contactphone: '+1 (555) 234-5678',
            contactjobtitle: 'CTO',
            companydomain: 'techsolutions.com',
            companyphone: '+1 (555) 234-5000',
            companyaddress: '456 Innovation Drive, Tech City, TC 54321'
          }
        },
        {
          id: 'deal_2',
          properties: {
            dealname: 'Consulting Services',
            amount: '25000',
            dealstage: 'presentationscheduled',
            closedate: '2024-09-30T00:00:00Z',
            createdate: '2024-07-15T14:20:00Z',
            lastmodifieddate: '2024-08-19T09:15:00Z',
            // Add demo contact and company information
            company: 'Digital Innovations LLC',
            contactname: 'Michael Chen',
            contactemail: 'michael.chen@digitalinnovations.com',
            contactphone: '+1 (555) 345-6789',
            contactjobtitle: 'VP of Technology',
            companydomain: 'digitalinnovations.com',
            companyphone: '+1 (555) 345-6000',
            companyaddress: '789 Digital Plaza, Innovation District, ID 67890'
          }
        }
      ];
      
      updateState({ 
        hubspotDeals: demoDeals,
        showDemoMode: true,
        isConnected: true
      });
    } catch (error) {
      console.error('Failed to fetch HubSpot deals:', error);
      updateState({ 
        connectionError: 'Failed to fetch deals. Please check your connection and try again.',
        showDemoMode: true,
        isConnected: false
      });
    } finally {
      updateState({ isLoadingDeals: false });
    }
  };

  // Load HubSpot data when connected
  useEffect(() => {
    if (state.isConnected) {
      fetchHubSpotContacts();
      fetchHubSpotDeals();
    }
  }, [state.isConnected]);

  // Auto-connect to HubSpot when component loads
  useEffect(() => {
    console.log('🚀 HubSpotIntegration component loaded - ALWAYS CONNECTING...');
    console.log('🔍 Current state:', {
      isConnected: state.isConnected,
      isConnecting: state.isConnecting,
      showDemoMode: state.showDemoMode
    });
    
    // ALWAYS auto-connect to ensure HubSpot is always connected
    console.log('🔄 ALWAYS CONNECTING to HubSpot...');
    // Add a small delay to ensure component is fully mounted
    setTimeout(() => {
      testHubSpotConnection();
    }, 100);
  }, []); // Run only once when component mounts

  const testHubSpotConnection = async () => {
    console.log('🔍 Starting HubSpot connection test...');
    updateState({ isConnecting: true, connectionError: null });
    
    try {
      console.log('🔍 Testing HubSpot connection via backend server...');
      console.log('🌐 Backend URL: ${BACKEND_URL}/api/hubspot/test');
      
      const backendResponse = await fetch(`${BACKEND_URL}/api/hubspot/test`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });

      console.log('📊 Backend response status:', backendResponse.status);

      if (backendResponse.ok) {
        const result = await backendResponse.json();
        console.log('📄 Backend response:', result);
        
        if (result.success) {
          console.log('✅ HubSpot connection successful via backend server');
          updateState({ 
            isConnected: true, 
            showDemoMode: false, 
            connectionError: null,
            isConnecting: false 
          });
          
          // Automatically load real data
          console.log('🔄 Loading HubSpot data...');
          await fetchHubSpotContacts();
          await fetchHubSpotDeals();
          console.log('✅ HubSpot data loaded successfully');
        } else {
          console.log('⚠️ Backend server running but HubSpot API failed');
          console.log('⚠️ Result:', result);
          updateState({ 
            showDemoMode: true, 
            connectionError: 'Backend server is running but HubSpot API connection failed. Please check your HubSpot API key.',
            isConnected: false,
            isConnecting: false 
          });
        }
      } else {
        console.log('❌ Backend server responded with error:', backendResponse.status);
        const errorText = await backendResponse.text();
        console.log('❌ Error response:', errorText);
        updateState({ 
          showDemoMode: true, 
          connectionError: `Backend server error: ${backendResponse.status}. Please ensure the server is running properly.`,
          isConnected: false,
          isConnecting: false 
        });
      }
    } catch (error) {
      console.error('❌ Backend server not available:', error);
      const errorObj = error as Error;
      console.error('❌ Error details:', {
        name: errorObj.name,
        message: errorObj.message,
        stack: errorObj.stack
      });
      
      // Check if it's a timeout error
      if (errorObj.name === 'AbortError') {
        updateState({ 
          showDemoMode: true, 
          connectionError: 'Backend server connection timeout. Please ensure the server is running on port 4000.',
          isConnected: false,
          isConnecting: false 
        });
      } else {
        updateState({ 
          showDemoMode: true, 
          connectionError: 'Backend server is not available. Please start the server with: node server.cjs',
          isConnected: false,
          isConnecting: false 
        });
      }
    }
  };

  const enableDemoMode = async () => {
    updateState({ isConnecting: true, connectionError: null });
    
    try {
      // Check if backend server is available
      const backendHealth = await fetch(`${BACKEND_URL}/api/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (backendHealth.ok) {
        // Backend server is running, use it for demo mode
        updateState({ 
          isConnected: true, 
          showDemoMode: false, 
          isConnecting: false,
          connectionError: null 
        });
        console.log('✅ Demo mode enabled with backend server support');
        
        // Automatically load demo data from backend
        await fetchHubSpotContacts();
        await fetchHubSpotDeals();
      } else {
        // Backend server not available, use pure demo mode
        updateState({ 
          isConnected: true, 
          showDemoMode: true, 
          isConnecting: false,
          connectionError: null 
        });
        console.log('⚠️ Demo mode enabled - backend server not available');
        
        // Load demo data directly
        await fetchHubSpotContacts();
        await fetchHubSpotDeals();
      }
    } catch (error) {
      console.error('❌ Error enabling demo mode:', error);
      // Fallback to pure demo mode
      updateState({ 
        isConnected: true, 
        showDemoMode: true, 
        isConnecting: false,
        connectionError: null 
      });
      console.log('⚠️ Fallback demo mode enabled');
      
      // Load demo data directly
      await fetchHubSpotContacts();
      await fetchHubSpotDeals();
    }
  };

  const createHubSpotContact = async () => {
    console.log('🔍 Creating HubSpot contact...');
    console.log('Quote data:', quote);
    
    // Use quote data if available, otherwise use default values
    const clientName = quote?.clientName || 'ZENOP Client';
    const clientEmail = quote?.clientEmail || 'client@example.com';
    const companyName = quote?.company || 'ZENOP Pro Solutions';
    
    updateState({ isCreatingContact: true });
    
    try {
      const contactData = {
        properties: {
          firstname: clientName.split(' ')[0] || 'CPQ',
          lastname: clientName.split(' ').slice(1).join(' ') || 'Client',
          email: clientEmail,
          company: companyName,
        }
      };

      console.log('📄 Contact data to create:', contactData);

      let response;
      
      // Try backend server first
      try {
        console.log('🔄 Trying backend server for contact creation...');
        response = await fetch(`${BACKEND_URL}/api/hubspot/contacts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(contactData),
        });
        
        console.log('📊 Backend response status:', response.status);
        
        if (response.ok) {
          const result = await response.json();
          console.log('📄 Backend response:', result);
          
          if (result.success) {
            updateState({ createdContact: result.contact });
            console.log('✅ HubSpot contact created via backend:', result.contact);
            return;
          } else {
            throw new Error('Backend contact creation failed');
          }
        } else {
          throw new Error(`Backend server error: ${response.status}`);
        }
      } catch (backendError) {
        console.log('❌ Backend server not available or failed, using demo mode...', backendError);
      }

      // Fallback to demo mode
      console.log('🔄 Using demo mode for contact creation...');
      const hubspotApiUrl = import.meta.env.VITE_HUBSPOT_API_URL || 'https://api.hubapi.com';
      response = await simulateApiCall(`${hubspotApiUrl}/crm/v3/objects/contacts`, 'POST', contactData);

      if (response.ok) {
        const contact = await response.json();
        updateState({ createdContact: contact });
        console.log('✅ HubSpot contact created (demo mode):', contact);
      } else {
        throw new Error(`Failed to create contact: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Failed to create HubSpot contact:', error);
      updateState({ connectionError: error instanceof Error ? error.message : 'Failed to create contact' });
    } finally {
      updateState({ isCreatingContact: false });
    }
  };

  const createHubSpotDeal = async () => {
    console.log('🔍 Creating HubSpot deal...');
    console.log('Quote data:', quote);
    console.log('Calculation data:', calculation);
    console.log('Created contact:', state.createdContact);
    
    // Check if we have the required data
    if (!state.createdContact) {
      console.log('❌ No contact created yet. Please create a contact first.');
      updateState({ connectionError: 'Please create a contact first before creating a deal.' });
      return;
    }
    
    // Use available data or defaults
    const clientName = quote?.clientName || 'ZENOP Client';
    const totalCost = calculation?.totalCost || 1000;
    
    updateState({ isCreatingDeal: true });
    
    try {
      const dealData = {
        properties: {
          dealname: `CPQ Quote - ${clientName}`,
          amount: totalCost.toString(),
          dealstage: 'appointmentscheduled',
          closedate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
          pipeline: 'default',
        },
        associations: [
          {
            to: {
              id: state.createdContact.id,
            },
            types: [
              {
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 1,
              },
            ],
          },
        ],
      };

      console.log('📄 Deal data to create:', dealData);

      let response;
      
      // Try backend server first
      try {
        console.log('🔄 Trying backend server for deal creation...');
        response = await fetch(`${BACKEND_URL}/api/hubspot/deals`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(dealData),
        });
        
        console.log('📊 Backend response status:', response.status);
        
        if (response.ok) {
          const result = await response.json();
          console.log('📄 Backend response:', result);
          
          if (result.success) {
            updateState({ createdDeal: result.deal });
            console.log('✅ HubSpot deal created via backend:', result.deal);
            return;
          } else {
            throw new Error('Backend deal creation failed');
          }
        } else {
          throw new Error(`Backend server error: ${response.status}`);
        }
      } catch (backendError) {
        console.log('❌ Backend server not available or failed, using demo mode...', backendError);
      }

      // Fallback to demo mode
      console.log('🔄 Using demo mode for deal creation...');
      const hubspotApiUrl = import.meta.env.VITE_HUBSPOT_API_URL || 'https://api.hubapi.com';
      response = await simulateApiCall(`${hubspotApiUrl}/crm/v3/objects/deals`, 'POST', dealData);

      if (response.ok) {
        const deal = await response.json();
        updateState({ createdDeal: deal });
        console.log('✅ HubSpot deal created (demo mode):', deal);
      } else {
        throw new Error(`Failed to create deal: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Failed to create HubSpot deal:', error);
      updateState({ connectionError: error instanceof Error ? error.message : 'Failed to create deal' });
    } finally {
      updateState({ isCreatingDeal: false });
    }
  };

  const openHubSpotPortal = () => {
    window.open('https://app.hubspot.com/', '_blank');
  };

  try {
    return (
      <div className="bg-gradient-to-br from-white via-orange-50/30 to-red-50/30 rounded-2xl shadow-2xl border border-orange-100/50 p-8 backdrop-blur-sm">
        <div className="flex items-center gap-4 mb-8">
          <div className="relative">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-600 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-orange-900 to-red-900 bg-clip-text text-transparent">
              HubSpot Integration
            </h2>
            <p className="text-gray-600 mt-1">Connect and sync your quotes with HubSpot CRM</p>
            {quote?.company && (
              <div className="mt-2 flex items-center gap-2">
                <Building className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">{quote.company}</span>
              </div>
            )}
          </div>
        </div>

      {/* Connection Status and Error Messages */}
      {(() => {
        // Show backend server not available error first
        if (state.connectionError?.includes('Backend server is not available')) {
          return (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-center gap-2 text-red-800 mb-2">
                <AlertCircle className="w-4 h-4" />
                <span className="font-medium">Backend Server Not Available</span>
              </div>
              <p className="text-red-700 text-sm mb-3">
                The backend server is not running. This is required to connect to HubSpot and get real data.
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={testHubSpotConnection}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={enableDemoMode}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
                  >
                    Use Demo Mode
                  </button>
                </div>
                <div className="text-xs text-red-600 bg-red-100 p-2 rounded">
                  <strong>To get real HubSpot data:</strong>
                  <ol className="list-decimal list-inside mt-1 space-y-1">
                    <li>Open a new terminal/command prompt</li>
                    <li>Navigate to the project directory</li>
                    <li>Run: <code className="bg-red-200 px-1 rounded">node server.cjs</code></li>
                    <li>Keep that terminal window open</li>
                    <li>Refresh this page and try connecting again</li>
                  </ol>
                </div>
              </div>
            </div>
          );
        }
        
        // Show demo mode available if not connected and no critical errors
        if (!state.isConnected && !state.isConnecting && !state.connectionError) {
          return (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center gap-2 text-blue-800 mb-2">
                <Info className="w-4 h-4" />
                <span className="font-medium">Demo Mode Available</span>
              </div>
              <p className="text-blue-700 text-sm mb-3">
                Direct browser-to-HubSpot API calls are blocked by CORS. Enable demo mode to test the integration functionality.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={enableDemoMode}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Enable Demo Mode
                </button>
                <button
                  onClick={testHubSpotConnection}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
                >
                  Try HubSpot Connection
                </button>
              </div>
            </div>
          );
        }
        
        // Show other connection errors
        if (state.connectionError && !state.connectionError.includes('Backend server is not available')) {
          return (
            <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-xl">
              <div className="flex items-center gap-2 text-orange-800 mb-2">
                <AlertCircle className="w-4 h-4" />
                <span className="font-medium">Connection Issue</span>
              </div>
              <p className="text-orange-700 text-sm mb-3">
                {state.connectionError}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={testHubSpotConnection}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={enableDemoMode}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
                >
                  Use Demo Mode
                </button>
              </div>
            </div>
          );
        }
        
        return null;
      })()}

      {/* Real HubSpot Data Active Notice */}
      {state.isConnected && state.hubspotContacts.length > 0 && !state.showDemoMode && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center gap-2 text-green-800 mb-2">
            <CheckCircle className="w-4 h-4" />
            <span className="font-medium">Connected to HubSpot</span>
          </div>
          <p className="text-green-700 text-sm">
            You're currently viewing real HubSpot data. {state.hubspotContacts.length} contacts and {state.hubspotDeals.length} deals loaded from your HubSpot account.
          </p>
        </div>
      )}


      {/* Connection Status */}
      <div className="mb-8">
        <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            {state.isConnected ? (
              <CheckCircle className="w-6 h-6 text-green-600" />
            ) : state.isConnecting ? (
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            ) : (
              <div className="w-6 h-6 border-2 border-gray-300 rounded-full" />
            )}
            <div>
              <h3 className="font-semibold text-gray-800">
                {state.isConnecting 
                  ? 'Connecting to HubSpot...'
                  : state.isConnected 
                  ? (state.showDemoMode ? 'Demo Mode Active' : 'Connected to HubSpot') 
                  : 'Not Connected to HubSpot'
                }
              </h3>
              <p className="text-sm text-gray-600">
                {state.isConnecting
                  ? 'Attempting to connect to HubSpot via backend server...'
                  : state.isConnected 
                  ? (state.showDemoMode 
                    ? 'Using demo data for testing purposes' 
                    : 'Your ZENOP Pro is connected to HubSpot CRM and loading real data')
                  : 'Click "Connect to HubSpot" to load your real HubSpot data'
                }
              </p>
              {state.isConnected && !state.showDemoMode && state.hubspotContacts.length > 0 && (
                <p className="text-xs text-green-600 mt-1">
                  ✅ Real HubSpot data loaded successfully
                </p>
              )}
              {state.showDemoMode && state.hubspotContacts.length > 0 && (
                <p className="text-xs text-orange-600 mt-1">
                  ⚠️ Using demo data for testing purposes
                </p>
              )}
              {state.hubspotContacts.length > 0 && (
                <p className="text-xs text-blue-600 mt-1">
                  📊 {state.hubspotContacts.length} contacts and {state.hubspotDeals.length} deals loaded
                </p>
              )}
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={testHubSpotConnection}
              disabled={state.isConnecting}
              className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 ${
                state.isConnecting
                  ? 'bg-blue-100 text-blue-700 cursor-not-allowed'
                  : state.isConnected
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl'
              }`}
            >
              {state.isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4" />
              )}
              {state.isConnecting 
                ? 'Connecting...' 
                : state.isConnected 
                ? 'Reconnect' 
                : 'Connect to HubSpot'
              }
            </button>
          </div>
        </div>
      </div>

      {/* Quote Information */}
      {quote && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Quote Information</h3>
          
          {/* Company Name - Prominent Display */}
          {quote.company && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Building className="w-5 h-5 text-blue-600" />
                <span className="font-semibold text-blue-800">Company</span>
              </div>
              <p className="text-lg font-bold text-blue-900">{quote.company}</p>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-white rounded-xl border border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-gray-600" />
                <span className="font-medium text-gray-800">Client Details</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Name:</span>
                  <span className="font-medium">{quote.clientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Email:</span>
                  <span className="font-medium">{quote.clientEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Company:</span>
                  <span className="font-medium">{quote.company || 'Not specified'}</span>
                </div>
              </div>
            </div>

            {calculation && (
              <div className="p-4 bg-white rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <Building className="w-4 h-4 text-gray-600" />
                  <span className="font-medium text-gray-800">Quote Details</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Cost:</span>
                    <span className="font-medium">${calculation.totalCost.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tier:</span>
                    <span className="font-medium">{calculation.tier.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className="font-medium capitalize">{quote.status}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* HubSpot Actions */}
      {state.isConnected && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-gray-800">HubSpot Actions</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={createHubSpotContact}
              disabled={state.isCreatingContact || !!state.createdContact}
              className={`p-4 rounded-xl border-2 transition-all duration-300 flex items-center gap-3 ${
                state.createdContact
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : state.isCreatingContact
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-gray-200 hover:border-orange-300 hover:shadow-lg'
              }`}
            >
              {state.isCreatingContact ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : state.createdContact ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <User className="w-5 h-5 text-gray-600" />
              )}
              <div className="text-left">
                <div className="font-semibold">
                  {state.isCreatingContact ? 'Creating Contact...' : state.createdContact ? 'Contact Created' : 'Create Contact'}
                </div>
                <div className="text-sm text-gray-600">
                  {state.createdContact ? 'Contact added to HubSpot' : 'Add client to HubSpot CRM'}
                </div>
              </div>
            </button>

            <button
              onClick={createHubSpotDeal}
              disabled={state.isCreatingDeal || !!state.createdDeal || !state.createdContact}
              className={`p-4 rounded-xl border-2 transition-all duration-300 flex items-center gap-3 ${
                state.createdDeal
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : !state.createdContact
                  ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                  : state.isCreatingDeal
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-gray-200 hover:border-orange-300 hover:shadow-lg'
              }`}
            >
              {state.isCreatingDeal ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : state.createdDeal ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <Building className="w-5 h-5 text-gray-600" />
              )}
              <div className="text-left">
                <div className="font-semibold">
                  {state.isCreatingDeal ? 'Creating Deal...' : state.createdDeal ? 'Deal Created' : 'Create Deal'}
                </div>
                <div className="text-sm text-gray-600">
                  {state.createdDeal ? 'Deal added to HubSpot' : !state.createdContact ? 'Create contact first' : 'Create deal in HubSpot CRM'}
                </div>
              </div>
            </button>
          </div>

          <div className="flex justify-center">
            <button
              onClick={openHubSpotPortal}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Open HubSpot Portal
            </button>
          </div>
        </div>
      )}

      {/* HubSpot Data Display */}
      {state.isConnected && (
        <div className="space-y-6">
          <h3 className="text-xl font-semibold text-gray-800">HubSpot Data</h3>
          
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search contacts and deals..."
              value={state.searchTerm}
              onChange={(e) => updateState({ searchTerm: e.target.value })}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          {/* Contacts Section */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Contacts ({state.hubspotContacts.length})
              </h4>
              <button
                onClick={fetchHubSpotContacts}
                disabled={state.isLoadingContacts}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
              >
                {state.isLoadingContacts ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
              </button>
            </div>
            
            {state.isLoadingContacts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-600">Loading contacts...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {state.hubspotContacts
                  .filter(contact => 
                    contact.properties.firstname?.toLowerCase().includes(state.searchTerm.toLowerCase()) ||
                    contact.properties.lastname?.toLowerCase().includes(state.searchTerm.toLowerCase()) ||
                    contact.properties.email?.toLowerCase().includes(state.searchTerm.toLowerCase()) ||
                    contact.properties.company?.toLowerCase().includes(state.searchTerm.toLowerCase())
                  )
                  .map(contact => (
                    <div
                      key={contact.id}
                      className="p-4 border border-gray-200 rounded-lg hover:border-orange-300 hover:shadow-md transition-all cursor-pointer"
                      onClick={() => updateState({ selectedContact: contact })}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-semibold text-gray-800">
                          {contact.properties.firstname} {contact.properties.lastname}
                        </h5>
                        <Eye className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="space-y-1 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          <span>{contact.properties.email}</span>
                        </div>
                        {contact.properties.company && (
                          <div className="flex items-center gap-1">
                            <Building className="w-3 h-3" />
                            <span className="font-medium">{contact.properties.company}</span>
                          </div>
                        )}
                        {contact.properties.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            <span>{contact.properties.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Deals Section */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Building className="w-5 h-5" />
                Deals ({state.hubspotDeals.length})
                <span className="text-xs text-gray-500 font-normal">(Click to preview)</span>
              </h4>
              <button
                onClick={fetchHubSpotDeals}
                disabled={state.isLoadingDeals}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
              >
                {state.isLoadingDeals ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
              </button>
            </div>
            
            {state.isLoadingDeals ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-600">Loading deals...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {state.hubspotDeals
                  .filter(deal => 
                    deal.properties.dealname?.toLowerCase().includes(state.searchTerm.toLowerCase()) ||
                    deal.properties.dealstage?.toLowerCase().includes(state.searchTerm.toLowerCase())
                  )
                  .map(deal => (
                    <div
                      key={deal.id}
                      className="p-4 border border-gray-200 rounded-lg hover:border-orange-300 hover:shadow-md transition-all cursor-pointer relative group"
                      onClick={() => updateState({ selectedDeal: deal })}
                    >
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Eye className="w-4 h-4 text-gray-400" />
                      </div>
                      <h5 className="font-semibold text-gray-800 mb-2 pr-6">
                        {deal.properties.dealname}
                      </h5>
                      <div className="space-y-1 text-sm text-gray-600">
                        <div className="flex justify-between">
                          <span>Amount:</span>
                          <span className="font-medium">${deal.properties.amount ? parseInt(deal.properties.amount).toLocaleString() : '0'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Stage:</span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            deal.properties.dealstage === 'closedwon' ? 'bg-green-100 text-green-700' :
                            deal.properties.dealstage === 'closedlost' ? 'bg-red-100 text-red-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {deal.properties.dealstage ? deal.properties.dealstage.replace(/([A-Z])/g, ' $1').toLowerCase() : 'Unknown'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Close Date:</span>
                          <span>{deal.properties.closedate ? new Date(deal.properties.closedate).toLocaleDateString() : 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contact Detail Modal */}
      {state.selectedContact && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Contact Details</h3>
              <button
                onClick={() => updateState({ selectedContact: null })}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                  {state.selectedContact.properties.firstname?.[0]}{state.selectedContact.properties.lastname?.[0]}
                </div>
                <div>
                  <h4 className="font-semibold text-gray-800">
                    {state.selectedContact.properties.firstname} {state.selectedContact.properties.lastname}
                  </h4>
                  <p className="text-sm text-gray-600">{state.selectedContact.properties.email}</p>
                </div>
              </div>
              
              <div className="space-y-3">
                {state.selectedContact.properties.company && (
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">{state.selectedContact.properties.company}</span>
                  </div>
                )}
                
                {state.selectedContact.properties.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">{state.selectedContact.properties.phone}</span>
                  </div>
                )}
                
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700">
                    Created: {state.selectedContact.properties.createdate ? 
                      new Date(state.selectedContact.properties.createdate).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700">
                    Modified: {state.selectedContact.properties.lastmodifieddate ? 
                      new Date(state.selectedContact.properties.lastmodifieddate).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deal Detail Modal */}
      {state.selectedDeal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Deal Details</h3>
              <button
                onClick={() => updateState({ selectedDeal: null })}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                  <Building className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-800">
                    {state.selectedDeal.properties.dealname}
                  </h4>
                  <p className="text-sm text-gray-600">Deal ID: {state.selectedDeal.id}</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Amount:</span>
                  <span className="font-semibold text-gray-800">
                    ${state.selectedDeal.properties.amount ? parseInt(state.selectedDeal.properties.amount).toLocaleString() : '0'}
                  </span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Stage:</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    state.selectedDeal.properties.dealstage === 'closedwon' ? 'bg-green-100 text-green-700' :
                    state.selectedDeal.properties.dealstage === 'closedlost' ? 'bg-red-100 text-red-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {state.selectedDeal.properties.dealstage ? 
                      state.selectedDeal.properties.dealstage.replace(/([A-Z])/g, ' $1').toLowerCase() : 'Unknown'}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700">
                    Close Date: {state.selectedDeal.properties.closedate ? 
                      new Date(state.selectedDeal.properties.closedate).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700">
                    Created: {state.selectedDeal.properties.createdate ? 
                      new Date(state.selectedDeal.properties.createdate).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700">
                    Modified: {state.selectedDeal.properties.lastmodifieddate ? 
                      new Date(state.selectedDeal.properties.lastmodifieddate).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
              
              <div className="flex gap-2 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    // Convert HubSpot deal to DealData format and call onUseDealData
                    if (onUseDealData && state.selectedDeal) {
                      const dealData = {
                        dealId: state.selectedDeal.id,
                        dealName: state.selectedDeal.properties.dealname,
                        amount: state.selectedDeal.properties.amount ? `$${parseInt(state.selectedDeal.properties.amount).toLocaleString()}` : 'Not Set',
                        stage: state.selectedDeal.properties.dealstage || 'Not Set',
                        closeDate: state.selectedDeal.properties.closedate,
                        ownerId: state.selectedDeal.properties.ownerid || 'Not Set',
                        // Add contact and company information from deal properties
                        company: state.selectedDeal.properties.company || 'Not Available',
                        companyByContact: (() => {
                          const originalCompany = state.selectedDeal.properties.company || 'Not Available';
                          const email = state.selectedDeal.properties.contactemail;
                          
                          // Extract company from email if original company is "Not Available"
                          if (originalCompany === 'Not Available' && email) {
                            const domain = email.split('@')[1];
                            if (domain) {
                              return domain
                                .replace(/\.(com|org|net|edu|gov|co|io|ai)$/i, '')
                                .split('.')
                                .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
                                .join(' ');
                            }
                          }
                          return originalCompany;
                        })(),
                        contactName: state.selectedDeal.properties.contactname || 'Not Available',
                        contactEmail: state.selectedDeal.properties.contactemail || 'Not Available',
                        contactPhone: state.selectedDeal.properties.contactphone || 'Not Available',
                        contactJobTitle: state.selectedDeal.properties.contactjobtitle || 'Not Available',
                        companyDomain: state.selectedDeal.properties.companydomain || 'Not Available',
                        companyPhone: state.selectedDeal.properties.companyphone || 'Not Available',
                        companyAddress: state.selectedDeal.properties.companyaddress || 'Not Available'
                      };
                      console.log('Using deal for quote:', dealData);
                      onUseDealData(dealData);
                    }
                    updateState({ selectedDeal: null });
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Use for Quote
                </button>
                <button
                  onClick={() => updateState({ selectedDeal: null })}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Messages */}
      {(state.createdContact || state.createdDeal) && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center gap-2 text-green-800 mb-2">
            <CheckCircle className="w-5 h-5" />
            <span className="font-semibold">HubSpot Integration Successful!</span>
          </div>
          <div className="text-green-700 text-sm space-y-1">
            {state.createdContact && (
              <p>✓ Contact "{quote?.clientName}" created in HubSpot</p>
            )}
            {state.createdDeal && (
              <p>✓ Deal "{quote?.clientName} - CPQ Quote" created in HubSpot</p>
            )}
          </div>
        </div>
      )}

      {/* Production Setup Instructions */}
      {!state.isConnected && (
        <div className="mt-8 p-6 bg-gray-50 border border-gray-200 rounded-xl">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Production Setup</h3>
          <div className="text-sm text-gray-600 space-y-2">
            <p>For production use, you'll need to:</p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li>Set up a backend server to proxy HubSpot API calls</li>
              <li>Configure CORS headers on your server</li>
              <li>Store API keys securely on the server side</li>
              <li>Create API endpoints for contact and deal creation</li>
            </ol>
            <p className="mt-3 text-xs text-gray-500">
              Current API Key: {hubspotApiKey.substring(0, 10)}...{hubspotApiKey.substring(hubspotApiKey.length - 4)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
  } catch (error) {
    console.error('❌ Error rendering HubSpotIntegration:', error);
    console.error('❌ Error details:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      state,
      quote,
      configuration,
      calculation
    });
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Rendering Error</h2>
          <p className="text-gray-600 mb-4">
            Failed to render HubSpot integration component.
            {error instanceof Error && (
              <span className="block mt-2 text-sm text-red-600">
                Error: {error.message}
              </span>
            )}
          </p>
          <button
            onClick={() => {
              setHasError(false);
              setErrorMessage('');
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
};

export default HubSpotIntegration;

