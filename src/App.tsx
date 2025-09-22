import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Navigation from './components/Navigation';
import ConfigurationForm from './components/ConfigurationForm';
import PricingComparison from './components/PricingComparison';
import PricingTierConfig from './components/PricingTierConfig';

import QuoteGenerator from './components/QuoteGenerator';
import QuoteManager from './components/QuoteManager';
import TemplateManager from './components/TemplateManager';
import DealDetails from './components/DealDetails';

import Settings from './components/Settings';
import DigitalSignatureForm from './components/DigitalSignatureForm';
import { ConfigurationData, PricingCalculation, PricingTier, Quote } from './types/pricing';
import { calculateAllTiers, getRecommendedTier, PRICING_TIERS } from './utils/pricing';
import { FileText } from 'lucide-react';

// Import authentication page components
import LandingPage from './pages/LandingPage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import MicrosoftCallback from './pages/MicrosoftCallback';
import DebugEnv from './pages/DebugEnv';
import ProtectedRoute from './components/auth/ProtectedRoute';

function App() {
  const [activeTab, setActiveTab] = useState('configure');
  const [configuration, setConfiguration] = useState<ConfigurationData | undefined>(undefined);
  const [calculations, setCalculations] = useState<PricingCalculation[]>([]);
  const [selectedTier, setSelectedTier] = useState<PricingCalculation | null>(null);
  const [showPricing, setShowPricing] = useState(false);
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>(PRICING_TIERS);

  
  // HubSpot state management - ALWAYS CONNECTED by default
  const [hubspotState, setHubspotState] = useState({
    isConnected: true, // Always start as connected
    isConnecting: false,
    connectionError: null as string | null,
    showDemoMode: true, // Start in demo mode, will switch to real data if available
    hubspotContacts: [] as any[],
    hubspotDeals: [] as any[],
    isLoadingContacts: false,
    isLoadingDeals: false,
    createdContact: null as any,
    createdDeal: null as any,
    isCreatingContact: false,
    isCreatingDeal: false,
    selectedContact: null as any,
    searchTerm: ''
  });

  // Company information state management
  const [companyInfo, setCompanyInfo] = useState({
    name: 'CPQ Pro Solutions',
    address: '123 Business St.',
    city: 'City, State 12345',
    email: 'contact@cpqsolutions.com',
    phone: '(555) 123-4567'
  });

  // Template state management
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);

  // Load selected template from localStorage on app start
  useEffect(() => {
    const loadSelectedTemplate = async () => {
      const savedSelectedTemplate = localStorage.getItem('cpq_selected_template');
      if (savedSelectedTemplate) {
        try {
          const parsedTemplate = JSON.parse(savedSelectedTemplate);
          console.log('🔍 Loaded selected template from localStorage:', {
            id: parsedTemplate.id,
            name: parsedTemplate.name,
            hasFile: !!parsedTemplate.file,
            hasFileData: !!parsedTemplate.fileData,
            fileName: parsedTemplate.fileName
          });
          
          // Convert data URLs back to File objects
          const templateWithFiles = {
            ...parsedTemplate,
            file: parsedTemplate.fileData ? dataURLtoFile(parsedTemplate.fileData, parsedTemplate.fileName) : null,
            wordFile: parsedTemplate.wordFileData ? dataURLtoFile(parsedTemplate.wordFileData, parsedTemplate.wordFileName) : null,
            uploadDate: parsedTemplate.uploadDate ? new Date(parsedTemplate.uploadDate) : new Date()
          };
          
          setSelectedTemplate(templateWithFiles);
          console.log('✅ Loaded selected template from localStorage:', parsedTemplate.name);
        } catch (error) {
          console.error('❌ Error loading selected template from localStorage:', error);
          localStorage.removeItem('cpq_selected_template');
        }
      }
    };
    
    loadSelectedTemplate();
  }, []);

  // Helper function to convert base64 data URL back to File
  const dataURLtoFile = (dataURL: string, fileName: string): File | null => {
    try {
      if (!dataURL || !fileName) {
        console.warn('⚠️ Invalid dataURL or fileName for file conversion');
        return null;
      }

      const arr = dataURL.split(',');
      if (arr.length !== 2) {
        console.warn('⚠️ Invalid dataURL format');
        return null;
      }

      const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }

      const file = new File([u8arr], fileName, { type: mime });
      console.log('✅ File converted successfully:', fileName, 'Size:', file.size, 'bytes');
      return file;
    } catch (error) {
      console.error('❌ Error converting dataURL to File:', error);
      return null;
    }
  };

  // Load templates from localStorage on app start
  useEffect(() => {
    const loadTemplates = () => {
      const savedTemplates = localStorage.getItem('cpq_templates');
      if (savedTemplates) {
        try {
          const parsedTemplates = JSON.parse(savedTemplates);
          // Convert base64 strings back to File objects with validation
          const templatesWithFiles = parsedTemplates.map((template: any) => {
            const file = template.fileData ? dataURLtoFile(template.fileData, template.fileName) : null;
            const wordFile = template.wordFileData ? dataURLtoFile(template.wordFileData, template.wordFileName) : null;
            
            // Validate template has required data
            if (!template.id || !template.name) {
              console.warn('⚠️ Invalid template data:', template);
              return null;
            }
            
            return {
              ...template,
              file,
              wordFile,
              uploadDate: template.uploadDate ? new Date(template.uploadDate) : new Date(),
              content: template.content || null
            };
          }).filter((template: any) => template !== null); // Remove invalid templates
          
          setTemplates(templatesWithFiles);
          console.log('✅ Loaded templates from localStorage:', templatesWithFiles.length, 'templates');
        } catch (error) {
          console.error('❌ Error loading templates from localStorage:', error);
        }
      }
    };

    loadTemplates();

    // Listen for template updates from TemplateManager
    const handleTemplatesUpdated = () => {
      console.log('🔄 Templates updated event received, reloading...');
      loadTemplates();
    };

    window.addEventListener('templatesUpdated', handleTemplatesUpdated);
    
    return () => {
      window.removeEventListener('templatesUpdated', handleTemplatesUpdated);
    };
  }, []);

  // Sync selected template with loaded templates
  useEffect(() => {
    if (selectedTemplate && templates.length > 0) {
      // Check if the selected template still exists in the loaded templates
      const templateExists = templates.find(t => t.id === selectedTemplate.id);
      if (!templateExists) {
        console.log('⚠️ Selected template no longer exists, clearing selection');
        setSelectedTemplate(null);
      } else {
        // Check if the selected template has a file, if not, use the one from templates array
        const templateToUse = selectedTemplate.file ? selectedTemplate : templateExists;
        
        console.log('🔍 Syncing selected template with loaded template:', {
          id: templateToUse.id,
          name: templateToUse.name,
          hasFile: !!templateToUse.file,
          fileType: templateToUse.file?.type,
          fileName: templateToUse.file?.name,
          usingFallback: !selectedTemplate.file
        });
        
        setSelectedTemplate(templateToUse);
        console.log('✅ Synced selected template with loaded templates:', templateToUse.name);
      }
    }
  }, [templates, selectedTemplate]);

  // Helper function to convert File to data URL
  const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        if (!file || file.size === 0) {
          reject(new Error('Invalid file provided'));
          return;
        }
        
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          console.log('✅ File converted to dataURL:', file.name, 'Size:', file.size, 'bytes');
          resolve(result);
        };
        reader.onerror = (error) => {
          console.error('❌ Error reading file:', error);
          reject(error);
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error('❌ Error in fileToDataURL:', error);
        reject(error);
      }
    });
  };

  // Save selected template to localStorage whenever it changes
  useEffect(() => {
    if (selectedTemplate) {
      try {
        console.log('🔍 Saving selected template to localStorage:', {
          id: selectedTemplate.id,
          name: selectedTemplate.name,
          hasFile: !!selectedTemplate.file,
          fileType: selectedTemplate.file?.type,
          fileName: selectedTemplate.file?.name
        });
        
        // Convert File objects to data URLs for storage
        const saveTemplate = async () => {
          try {
            const templateForStorage = {
              ...selectedTemplate,
              fileData: selectedTemplate.file ? await fileToDataURL(selectedTemplate.file) : null,
              fileName: selectedTemplate.file ? selectedTemplate.file.name : null,
              wordFileData: selectedTemplate.wordFile ? await fileToDataURL(selectedTemplate.wordFile) : null,
              wordFileName: selectedTemplate.wordFile ? selectedTemplate.wordFile.name : null,
              file: undefined, // Remove file object as it can't be serialized
              wordFile: undefined
            };
            
            // Check localStorage size before saving
            const templateString = JSON.stringify(templateForStorage);
            const sizeInBytes = new Blob([templateString]).size;
            const maxSize = 2 * 1024 * 1024; // 2MB limit for selected template
            
            if (sizeInBytes > maxSize) {
              console.warn('⚠️ Selected template too large for localStorage, saving without file data');
              const templateWithoutFiles = {
                ...templateForStorage,
                fileData: null,
                wordFileData: null
              };
              localStorage.setItem('cpq_selected_template', JSON.stringify(templateWithoutFiles));
            } else {
              localStorage.setItem('cpq_selected_template', templateString);
            }
            
            console.log('✅ Saved selected template to localStorage:', selectedTemplate.name);
          } catch (error) {
            console.error('❌ Error saving selected template:', error);
            // Try to save without file data as fallback
            try {
              const templateWithoutFiles = {
                ...selectedTemplate,
                fileData: null,
                wordFileData: null,
                file: undefined,
                wordFile: undefined
              };
              localStorage.setItem('cpq_selected_template', JSON.stringify(templateWithoutFiles));
              console.log('✅ Saved selected template without file data as fallback');
            } catch (fallbackError) {
              console.error('❌ Failed to save selected template even without file data:', fallbackError);
            }
          }
        };
        
        saveTemplate();
      } catch (error) {
        console.error('❌ Error saving selected template to localStorage:', error);
      }
    } else {
      localStorage.removeItem('cpq_selected_template');
      console.log('🗑️ Removed selected template from localStorage');
    }
  }, [selectedTemplate]);

  // Current client info state with enhanced fields
  const [currentClientInfo, setCurrentClientInfo] = useState({
    clientName: 'John Smith',
    clientEmail: 'john.smith@democompany.com',
    company: 'Demo Company Inc.',
    phone: '+1 (555) 123-4567',
    jobTitle: 'IT Director',
    companyDomain: 'democompany.com',
    companyPhone: '+1 (555) 987-6543',
    companyAddress: '123 Business Street, City, State 12345'
  });

  // Deal data state
  const [dealData, setDealData] = useState<any>(null);
  const [activeDealData, setActiveDealData] = useState<any>(null);
  
  // Contact info from configure session
  const [configureContactInfo, setConfigureContactInfo] = useState<{
    clientName: string;
    clientEmail: string;
    company: string;
  } | null>(null);

  // Debug configureContactInfo changes
  useEffect(() => {
    console.log('🔍 App: configureContactInfo state changed:', configureContactInfo);
  }, [configureContactInfo]);

  // Function to get deal information from URL parameters or localStorage
  const getDealInfo = () => {
    const dealInfo = localStorage.getItem('dealInfo');
    if (dealInfo) {
      try {
        return JSON.parse(dealInfo);
      } catch (error) {
        console.error('Error parsing deal info:', error);
        return null;
      }
    }
    return null;
  };

  // Function to clear deal information
  const clearDealInfo = () => {
    localStorage.removeItem('dealInfo');
    console.log('🗑️ Deal information cleared');
  };

  // Function to update deal information
  const updateDealInfo = (dealData: { dealId?: string; dealName?: string; amount?: number }) => {
    const currentDealInfo = getDealInfo() || {};
    const updatedDealInfo = { ...currentDealInfo, ...dealData };
    localStorage.setItem('dealInfo', JSON.stringify(updatedDealInfo));
    console.log('📝 Deal information updated:', updatedDealInfo);
  };

  // Function to debug and display current deal information
  const debugDealInfo = () => {
    const dealInfo = getDealInfo();
    console.log('🔍 Current Deal Information:');
    if (dealInfo) {
      console.log('   Deal ID:', dealInfo.dealId);
      console.log('   Deal Name:', dealInfo.dealName);
      console.log('   Amount:', dealInfo.amount);
    } else {
      console.log('   No deal information found');
    }
    return dealInfo;
  };

  // Parse deal parameters from URL (HubSpot Integration)
  const parseDealParameters = () => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Deal Information (from HubSpot CPQ TOOL property)
    const dealId = urlParams.get('dealId');
    const dealName = urlParams.get('dealName');
    const amount = urlParams.get('amount');
    const closeDate = urlParams.get('closeDate');
    const stage = urlParams.get('stage');
    const ownerId = urlParams.get('ownerId');
    
    // Contact Information (from fetched_objects.fetched_object_176195683)
    const contactEmail = urlParams.get('ContactEmail') || urlParams.get('contactEmail');
    const contactFirstName = urlParams.get('ContactFirstName') || urlParams.get('contactFirstName');
    const contactLastName = urlParams.get('ContactLastName') || urlParams.get('contactLastName');
    
    // Company Information (from fetched_objects.fetched_object_176195685)
    const companyName = urlParams.get('CompanyName') || urlParams.get('companyName');
    const companyByContact = urlParams.get('CompanyByContact') || urlParams.get('CompanyFromContact') || urlParams.get('companyByContact');
    
    // Additional HubSpot parameters (if available)
    const dealAmount = urlParams.get('deal.amount');
    const contactEmailBDM = urlParams.get('ContactEmailBDM');
    const contactPhone = urlParams.get('contactPhone');
    const contactJobTitle = urlParams.get('contactJobTitle');
    const companyDomain = urlParams.get('companyDomain');
    const companyPhone = urlParams.get('companyPhone');
    const companyAddress = urlParams.get('companyAddress');
    
    // Debug: Log all URL parameters
    console.log('🔍 All URL parameters:', Object.fromEntries(urlParams.entries()));
    
    console.log('🔍 Parsing URL parameters:', {
      dealId,
      dealName,
      amount,
      closeDate,
      stage,
      ownerId,
      // Contact Information (from HubSpot)
      contactEmail,
      contactFirstName,
      contactLastName,
      // Company Information (from HubSpot)
      companyName,
      companyByContact,
      // Additional HubSpot parameters
      dealAmount,
      contactEmailBDM,
      contactPhone,
      contactJobTitle,
      companyDomain,
      companyPhone,
      companyAddress
    });
    
    // Create deal data if we have any deal information OR contact/company information
    if (dealId || contactEmail || contactFirstName || contactLastName || companyName || companyByContact) {
      const dealData = {
        dealId: dealId || 'HUBSPOT-' + Date.now(),
        dealName: dealName || 'HubSpot Deal',
        amount: dealAmount || amount || 'Not Set',
        closeDate: closeDate || '',
        stage: stage || 'Not Set',
        ownerId: ownerId || 'Not Set',
        // Contact Information from HubSpot
        company: companyName || 'Not Available',
        companyByContact: companyByContact || 'Not Available',
        contactName: (contactFirstName && contactLastName ? `${contactFirstName} ${contactLastName}`.trim() : 
                     contactFirstName || contactLastName || 
                     urlParams.get('contactName') || 
                     urlParams.get('ContactName') || 
                     'Not Available'),
        contactEmail: contactEmail || 'Not Available',
        contactPhone: contactPhone || '+1 (555) 123-4567',
        contactJobTitle: contactJobTitle || 'Position from HubSpot',
        companyDomain: companyDomain || 'hubspot.com',
        companyPhone: companyPhone || '+1 (555) 987-6543',
        companyAddress: companyAddress || 'Address from HubSpot'
      };
      
      console.log('📋 Created deal data:', dealData);
      setDealData(dealData);
      console.log('✅ Deal data set in state');
      return dealData;
    }
    return null;
  };

  // Refresh deal data from HubSpot
  const refreshDealData = async () => {
    if (dealData?.dealId) {
      try {
        console.log('🔄 Refreshing deal data for ID:', dealData.dealId);
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        const response = await fetch(`${backendUrl}/api/hubspot/deal/${dealData.dealId}`);
        
        if (response.ok) {
          const result = await response.json();
          console.log('📥 HubSpot API response:', result);
          
          if (result.success && result.data) {
            // Extract properties from HubSpot response
            const properties = result.data.properties || result.data;
            
            // Create updated deal data with enhanced contact and company information
            const updatedDealData = {
              dealId: dealData.dealId,
              dealName: properties.dealname || properties.dealName || dealData.dealName || 'Not Set',
              amount: properties.amount || dealData.amount || 'Not Set',
              stage: properties.dealstage || properties.stage || dealData.stage || 'Not Set',
              closeDate: properties.closedate || properties.closeDate || dealData.closeDate || '',
              ownerId: properties.hubspot_owner_id || properties.ownerId || dealData.ownerId || 'Not Set',
              // Enhanced company information
              company: properties.company || dealData.company || '',
              companyDomain: properties.company_domain || properties.companyDomain || '',
              companyPhone: properties.company_phone || properties.companyPhone || '',
              companyAddress: properties.company_address || properties.companyAddress || '',
              // Enhanced contact information
              contactName: properties.contact_name || properties.contactName || dealData.contactName || '',
              contactEmail: properties.contact_email || properties.contactEmail || dealData.contactEmail || '',
              contactPhone: properties.contact_phone || properties.contactPhone || '',
              contactJobTitle: properties.contact_job_title || properties.contactJobTitle || ''
            };
            
            console.log('✅ Updated deal data:', updatedDealData);
            
            // Update both dealData and activeDealData if they match
            setDealData(updatedDealData);
            if (activeDealData && activeDealData.dealId === dealData.dealId) {
              setActiveDealData(updatedDealData);
            }
            
            // Update localStorage
            localStorage.setItem('dealInfo', JSON.stringify(updatedDealData));
            
            // Auto-fill client details from HubSpot data
            const enhancedClientInfo = {
              clientName: updatedDealData.contactName || '',
              clientEmail: updatedDealData.contactEmail || '',
              company: updatedDealData.company || '',
              phone: updatedDealData.contactPhone || '',
              jobTitle: updatedDealData.contactJobTitle || '',
              companyDomain: updatedDealData.companyDomain || '',
              companyPhone: updatedDealData.companyPhone || '',
              companyAddress: updatedDealData.companyAddress || ''
            };
            
            setCurrentClientInfo(enhancedClientInfo);
            localStorage.setItem('cpq_client_info', JSON.stringify(enhancedClientInfo));
            
            console.log('✅ Client details auto-filled from HubSpot:', enhancedClientInfo);
            
            // Show success message
            console.log('🎉 Deal data refreshed successfully from HubSpot with contact details!');
          } else {
            console.warn('⚠️ HubSpot API returned no data for deal:', dealData.dealId);
          }
        } else {
          console.error('❌ HubSpot API error:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('❌ Error refreshing deal data:', error);
      }
    } else {
      console.warn('⚠️ No deal ID available for refresh');
    }
  };

  // Handle using deal data in configuration and quote generation
  const handleUseDealData = (dealData: any) => {
    setActiveDealData(dealData);
    setActiveTab('configure');
    console.log('✅ Deal data activated for configuration:', dealData);
  };

  // Handle contact info changes from configure session
  const handleConfigureContactInfoChange = useCallback((contactInfo: { clientName: string; clientEmail: string; company: string }) => {
    console.log('🔍 App: Received contact info change from configure session:', contactInfo);
    setConfigureContactInfo(contactInfo);
    console.log('✅ App: Contact info updated from configure session:', contactInfo);
  }, []);

  // Handle client info changes from quote generator
  const handleClientInfoChange = useCallback((clientInfo: { clientName: string; clientEmail: string; company: string }) => {
    console.log('🔍 App: Received client info change from quote generator:', clientInfo);
    setCurrentClientInfo({
      clientName: clientInfo.clientName,
      clientEmail: clientInfo.clientEmail,
      company: clientInfo.company,
      phone: '',
      jobTitle: '',
      companyDomain: '',
      companyPhone: '',
      companyAddress: ''
    });
    console.log('✅ App: Client info updated from quote generator:', clientInfo);
  }, []);

  // Handle HubSpot contact selection - moved after updateHubspotState declaration

  // Auto-load HubSpot data after successful connection
  const autoLoadHubSpotData = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      
      // Load contacts
      console.log('🔄 Auto-loading HubSpot contacts...');
      setHubspotState(prev => ({ ...prev, isLoadingContacts: true }));
      
      const contactsResponse = await fetch(`${backendUrl}/api/hubspot/contacts`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000)
      });
      
      if (contactsResponse.ok) {
        const contactsResult = await contactsResponse.json();
        if (contactsResult.success && contactsResult.data) {
          console.log('✅ Auto-loaded contacts:', contactsResult.data.length);
          setHubspotState(prev => ({ 
            ...prev, 
            hubspotContacts: contactsResult.data,
            isLoadingContacts: false 
          }));
        }
      }
      
      // Load deals
      console.log('🔄 Auto-loading HubSpot deals...');
      setHubspotState(prev => ({ ...prev, isLoadingDeals: true }));
      
      const dealsResponse = await fetch(`${backendUrl}/api/hubspot/deals`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000)
      });
      
      if (dealsResponse.ok) {
        const dealsResult = await dealsResponse.json();
        if (dealsResult.success && dealsResult.data) {
          console.log('✅ Auto-loaded deals:', dealsResult.data.length);
          setHubspotState(prev => ({ 
            ...prev, 
            hubspotDeals: dealsResult.data,
            isLoadingDeals: false 
          }));
        }
      }
      
      console.log('✅ HubSpot data auto-loading completed');
    } catch (error) {
      console.log('⚠️ Error auto-loading HubSpot data:', error);
      setHubspotState(prev => ({ 
        ...prev, 
        isLoadingContacts: false,
        isLoadingDeals: false 
      }));
    }
  };

  // Handle URL parameters on component mount
  useEffect(() => {
    console.log('🔍 App component mounted, parsing URL parameters...');
    console.log('🔍 Current URL:', window.location.href);
    console.log('🔍 URL search params:', window.location.search);
    
    const dealParams = parseDealParameters();
    
    console.log('🔍 Deal params result:', dealParams);
    
    if (dealParams) {
      console.log('✅ Deal parameters found, processing...');
      // Auto-populate the configuration form with deal data
      setConfiguration(prev => {
        if (prev) {
          return {
            ...prev,
            clientName: dealParams.dealName,
          };
        }
        return prev;
      });
      
      // Auto-fill client information from deal data
      const enhancedClientInfo = {
        clientName: dealParams.contactName || 'Not Available',
        clientEmail: dealParams.contactEmail || 'Not Available',
        company: dealParams.company || 'Not Available',
        phone: '',
        jobTitle: '',
        companyDomain: '',
        companyPhone: '',
        companyAddress: ''
      };
      
      setCurrentClientInfo(enhancedClientInfo);
      localStorage.setItem('cpq_client_info', JSON.stringify(enhancedClientInfo));
      
      console.log('✅ Client info auto-filled from deal parameters:', enhancedClientInfo);
      
      // Store deal info for later use
      localStorage.setItem('dealInfo', JSON.stringify(dealParams));
      
      // Set active tab to 'deal' when deal data is present
      setActiveTab('deal');
      
      // Automatically refresh deal data from HubSpot to get real values
      console.log('🚀 Auto-refreshing deal data from HubSpot...');
      setTimeout(() => {
        refreshDealData();
      }, 1000); // Small delay to ensure component is fully mounted
    } else {
      console.log('⚠️ No deal parameters found in URL');
    }
  }, []);

  // Make deal functions available globally for debugging
  useEffect(() => {
    (window as any).dealFunctions = {
      getDealInfo,
      updateDealInfo,
      clearDealInfo,
      debugDealInfo,
      parseDealParameters,
      testUrlParams: () => {
        console.log('🧪 Testing URL parameter parsing...');
        const testUrl = '?dealId=123&dealName=Test%20Deal&ContactEmail=test@example.com&ContactFirstName=John&ContactLastName=Smith&CompanyName=Test%20Company&CompanyByContact=Test%20Company%20By%20Contact';
        const originalUrl = window.location.href;
        window.history.replaceState({}, '', testUrl);
        const result = parseDealParameters();
        window.history.replaceState({}, '', originalUrl);
        console.log('🧪 Test result:', result);
        return result;
      }
    };
    console.log('🔧 Deal functions available in console:');
    console.log('   window.dealFunctions.getDealInfo()');
    console.log('   window.dealFunctions.updateDealInfo({dealId: "123", dealName: "Test Deal"})');
    console.log('   window.dealFunctions.clearDealInfo()');
    console.log('   window.dealFunctions.debugDealInfo()');
  }, []);

  // Function to get current quote data for template processing
  const getCurrentQuoteData = () => {
    if (!configuration || !selectedTier) {
      return null;
    }

    return {
      id: `quote-001`,
      clientName: currentClientInfo.clientName || 'Current Client',
      clientEmail: currentClientInfo.clientEmail || 'client@example.com',
      company: currentClientInfo.company || 'Current Company',
      configuration: configuration,
      calculation: selectedTier,
      selectedTier: selectedTier,
      status: 'draft' as const,
      createdAt: new Date(),
      templateUsed: selectedTemplate ? {
        id: selectedTemplate.id,
        name: selectedTemplate.name
      } : null
    };
  };

  // Quote state management
  const [quotes, setQuotes] = useState<Quote[]>([]);

  // Signature form state management
  const [signatureFormData, setSignatureFormData] = useState<any>(null);
  const [isSignatureForm, setIsSignatureForm] = useState(false);

  // Load pricing tiers from localStorage on component mount
  useEffect(() => {
    // Clear old pricing cache and force use of new pricing tiers
    localStorage.removeItem('pricingTiers');
    
    // Fetch URL parameters for deal information
    const urlParams = new URLSearchParams(window.location.search);
    const dealId = urlParams.get('dealId');
    const dealName = urlParams.get('dealName');
    const amount = urlParams.get('amount');
    
    // Log the fetched parameters
    if (dealId || dealName || amount) {
      console.log('🔍 URL Parameters detected:');
      console.log('   Deal ID:', dealId);
      console.log('   Deal Name:', dealName);
      console.log('   Amount:', amount);
      
      // You can use these values to pre-populate forms or set state
      // For example, if you want to set the current client info based on deal data
      if (dealName) {
        setCurrentClientInfo(prev => ({
          ...prev,
          clientName: dealName,
          company: dealName.split(' ')[0] + ' Inc.' // Extract company name from deal name
        }));
      }
      
      // Store deal information in localStorage for later use
      if (dealId || dealName || amount) {
        localStorage.setItem('dealInfo', JSON.stringify({
          dealId,
          dealName,
          amount: amount ? parseFloat(amount) : null
        }));
      }
    }

    localStorage.removeItem('pricingTierConfigurations');
    
    console.log('🔄 Loading updated pricing tiers...');
    setPricingTiers(PRICING_TIERS);
    
    // If we have a configuration, recalculate with new tiers
    if (configuration) {
      const newCalculations = calculateAllTiers(configuration, PRICING_TIERS);
      setCalculations(newCalculations);
      console.log('✅ Recalculated pricing with new tiers');
    }
  }, []);

  // Load HubSpot state from localStorage on component mount
  useEffect(() => {
    const savedHubspotState = localStorage.getItem('hubspotState');
    if (savedHubspotState) {
      try {
        const parsedState = JSON.parse(savedHubspotState);
        setHubspotState(prevState => ({
          ...prevState,
          ...parsedState,
          // ALWAYS ensure we're connected
          isConnected: true,
          // Reset loading states when loading from storage
          isConnecting: false,
          isLoadingContacts: false,
          isLoadingDeals: false,
          isCreatingContact: false,
          isCreatingDeal: false
        }));
        console.log('✅ Loaded HubSpot state from localStorage - ALWAYS CONNECTED');
      } catch (error) {
        console.error('Error loading saved HubSpot state:', error);
        // Even if loading fails, ensure we're connected
        setHubspotState(prev => ({ ...prev, isConnected: true }));
      }
    } else {
      console.log('✅ No saved HubSpot state - starting ALWAYS CONNECTED');
    }
  }, []);

  // Auto-connect to HubSpot in demo mode on app startup
  useEffect(() => {
    const autoConnectToHubSpot = async () => {
      console.log('🚀 AUTO-CONNECTING to HubSpot in demo mode...');
      
      // Always connect to HubSpot in demo mode
      setHubspotState(prev => ({ 
        ...prev, 
        isConnected: true, 
        showDemoMode: true, 
        connectionError: null,
        isConnecting: false 
      }));
      console.log('✅ HubSpot auto-connected in demo mode');
      
      // Auto-load HubSpot data
      console.log('🔄 Auto-loading HubSpot data...');
      await autoLoadHubSpotData();
    };

    // Add a small delay to ensure the app is fully loaded
    const timer = setTimeout(autoConnectToHubSpot, 1000);
    return () => clearTimeout(timer);
  }, []); // Run only once on app startup

  // Save HubSpot state to localStorage whenever it changes

  // Handle URL-based routing for signature forms
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/signature-form/')) {
      const formId = path.split('/signature-form/')[1];
      if (formId) {
        // Fetch signature form data
        fetchSignatureFormData(formId);
      }
    } else {
      setIsSignatureForm(false);
      setSignatureFormData(null);
    }
  }, []);

  const fetchSignatureFormData = async (formId: string) => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/signature/form/${formId}`);
      if (response.ok) {
        const data = await response.json();
        setSignatureFormData(data.form);
        setIsSignatureForm(true);
      } else {
        console.error('Failed to fetch signature form data');
        alert('Signature form not found or has expired.');
      }
    } catch (error) {
      console.error('Error fetching signature form:', error);
      alert('Error loading signature form. Please try again.');
    }
  };

  const handleSignatureFormComplete = (_signatureData: any, approvalStatus: string, _comments: string) => {
    alert(`Thank you! Your ${approvalStatus === 'approved' ? 'approval' : 'response'} has been submitted successfully.`);
    // Redirect to a thank you page or close the form
    window.location.href = '/';
  };
  useEffect(() => {
    try {
      localStorage.setItem('hubspotState', JSON.stringify(hubspotState));
    } catch (error) {
      console.error('Error saving HubSpot state to localStorage:', error);
    }
  }, [hubspotState]);

  // Load company information from localStorage on component mount
  useEffect(() => {
    const savedCompanyInfo = localStorage.getItem('companyInfo');
    if (savedCompanyInfo) {
      try {
        const parsedInfo = JSON.parse(savedCompanyInfo);
        setCompanyInfo(parsedInfo);
      } catch (error) {
        console.error('Error loading saved company info:', error);
      }
    }
  }, []);

  // Load quotes from database and localStorage on component mount
  useEffect(() => {
    const loadQuotes = async () => {
      try {
        // First try to load from database
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        const response = await fetch(`${backendUrl}/api/quotes`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.quotes) {
            // Convert date strings back to Date objects
            const quotesWithDates = data.quotes.map((quote: any) => ({
              ...quote,
              createdAt: new Date(quote.created_at),
              templateUsed: {
                id: 'default',
                name: 'Default Template',
                isDefault: true
              }
            }));
            setQuotes(quotesWithDates);
            console.log('✅ Quotes loaded from database:', quotesWithDates.length);
            return; // Exit early if database load was successful
          }
        }
      } catch (error) {
        console.log('⚠️ Could not load quotes from database, falling back to localStorage:', error);
      }

      // Fallback to localStorage if database fails
      const savedQuotes = localStorage.getItem('cpq_quotes');
      if (savedQuotes) {
        try {
          const parsedQuotes = JSON.parse(savedQuotes);
          // Convert date strings back to Date objects
          const quotesWithDates = parsedQuotes.map((quote: any) => ({
            ...quote,
            createdAt: new Date(quote.createdAt)
          }));
          setQuotes(quotesWithDates);
          console.log('✅ Quotes loaded from localStorage:', quotesWithDates.length);
        } catch (error) {
          console.error('Error loading saved quotes from localStorage:', error);
        }
      }
    };

    loadQuotes();
  }, []);

  // Load templates from localStorage on component mount
  useEffect(() => {
    const loadTemplates = () => {
      try {
        const savedTemplates = localStorage.getItem('cpq_templates');
        if (savedTemplates) {
          const parsedTemplates = JSON.parse(savedTemplates);
          // Convert base64 strings back to File objects
          const templatesWithFiles = parsedTemplates.map((template: any) => ({
            ...template,
            file: template.fileData ? dataURLtoFile(template.fileData, template.fileName) : null,
            wordFile: template.wordFileData ? dataURLtoFile(template.wordFileData, template.wordFileName) : null,
            uploadDate: new Date(template.uploadDate)
          }));
          setTemplates(templatesWithFiles);
          console.log('📋 Templates loaded in App:', templatesWithFiles.length);
        }
      } catch (error) {
        console.error('Error loading templates:', error);
        setTemplates([]);
      }
    };

    loadTemplates();

    // Listen for template updates from TemplateManager
    const handleTemplateUpdate = () => {
      console.log('🔄 Template update detected, reloading templates...');
      loadTemplates();
    };

    // Add event listener for template updates
    window.addEventListener('templatesUpdated', handleTemplateUpdate);

    // Cleanup event listener
    return () => {
      window.removeEventListener('templatesUpdated', handleTemplateUpdate);
    };
  }, []);


  // Save company information to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('companyInfo', JSON.stringify(companyInfo));
    } catch (error) {
      console.error('Error saving company info to localStorage:', error);
    }
  }, [companyInfo]);

  // Save quotes to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('cpq_quotes', JSON.stringify(quotes));
    } catch (error) {
      console.error('Error saving quotes to localStorage:', error);
    }
  }, [quotes]);

  // Reset configure session when returning to configure tab
  useEffect(() => {
    if (activeTab === 'configure') {
      console.log('🔄 Returning to configure tab - resetting session state');
      // Reset pricing display to show initial configuration form
      setShowPricing(false);
      // Reset selected tier
      setSelectedTier(null);
      // Reset calculations
      setCalculations([]);
    }
  }, [activeTab]);

  // Listen for navigation events from QuoteGenerator
  useEffect(() => {
    const handleNavigateToTab = (event: CustomEvent) => {
      const tabName = event.detail;
      console.log('🔄 Navigating to tab:', tabName);
      setActiveTab(tabName);
    };

    window.addEventListener('navigateToTab', handleNavigateToTab as EventListener);
    
    return () => {
      window.removeEventListener('navigateToTab', handleNavigateToTab as EventListener);
    };
  }, []);

  const handleConfigurationChange = (config: ConfigurationData) => {
    // Check if migration type has changed
    const migrationTypeChanged = configuration && configuration.migrationType !== config.migrationType;
    
    setConfiguration(config);
    
    // If migration type changed, reset pricing display
    if (migrationTypeChanged) {
      setShowPricing(false);
    }
    
    const newCalculations = calculateAllTiers(config, pricingTiers);
    setCalculations(newCalculations);
  };

  const handleSubmitConfiguration = () => {
    setShowPricing(true);
  };

  // Auto-select a template based on chosen tier and configuration
  const autoSelectTemplateForPlan = (tierName: string, config?: ConfigurationData): any | null => {
    if (!templates || templates.length === 0) return null;

    const safeTier = (tierName || '').toLowerCase();
    const migration = (config?.migrationType || '').toLowerCase();

    console.log('🔍 Auto-selecting template for:', { tierName: safeTier, migration, availableTemplates: templates.length });

    // First, try exact match for SLACK TO TEAMS templates
    const exactMatches = templates.filter(t => {
      const name = (t?.name || '').toLowerCase();
      
      // Look for exact pattern: "slack to teams [plan]"
      const isSlackToTeams = name.includes('slack') && name.includes('teams');
      const matchesPlan = name.includes(safeTier);
      
      return isSlackToTeams && matchesPlan;
    });

    if (exactMatches.length > 0) {
      console.log('✅ Found exact template match:', exactMatches[0].name);
      return exactMatches[0];
    }

    // Fallback to scoring system for other cases
    const scoreTemplate = (t: any): number => {
      const name = (t?.name || '').toLowerCase();
      const desc = (t?.description || '').toLowerCase();
      let score = 0;
      
      // Exact plan type match gets highest priority
      if (safeTier === 'basic' && name.includes('basic')) score += 10;
      if (safeTier === 'advanced' && name.includes('advanced')) score += 10;
      
      // SLACK TO TEAMS combination gets high priority
      if (name.includes('slack') && name.includes('teams')) score += 8;
      
      // Migration type match
      if (migration && (name.includes(migration) || desc.includes(migration))) score += 5;
      
      // General tier keywords
      if (safeTier && (name.includes(safeTier) || desc.includes(safeTier))) score += 3;
      
      // Prefer DOCX templates
      const fileType = t?.wordFile?.type || t?.file?.type || '';
      if (typeof fileType === 'string' && fileType.includes('wordprocessingml')) score += 2;
      
      // Default flag bonus
      if (t?.isDefault) score += 1;
      
      return score;
    };

    // Find best template using scoring
    let best: any | null = null;
    let bestScore = -1;
    for (const t of templates) {
      const s = scoreTemplate(t);
      console.log(`📊 Template "${t.name}" scored: ${s}`);
      if (s > bestScore) {
        best = t;
        bestScore = s;
      }
    }

    if (best) {
      console.log('✅ Auto-selected template via scoring:', { name: best.name, score: bestScore });
    } else {
      console.log('❌ No suitable template found for auto-selection');
    }

    return best;
  };

  const handleSelectTier = (calculation: PricingCalculation) => {
    setSelectedTier(calculation);

    // Attempt to auto-select a template matching the chosen plan
    try {
      const auto = autoSelectTemplateForPlan(calculation?.tier?.name || '');
      if (auto) {
        setSelectedTemplate(auto);
        console.log('✅ Auto-selected template for plan:', {
          plan: calculation?.tier?.name,
          template: { id: auto.id, name: auto.name }
        });
      } else {
        console.log('⚠️ No matching template found for plan, keeping current selection.');
      }
    } catch (e) {
      console.warn('Auto-select template failed:', e);
    }

    setActiveTab('quote');
  };

  const handleTierUpdate = (updatedTiers: PricingTier[]) => {
    setPricingTiers(updatedTiers);
    
    // Save to localStorage for persistence
    try {
      localStorage.setItem('pricingTiers', JSON.stringify(updatedTiers));
      console.log('Pricing tiers saved to localStorage');
    } catch (error) {
      console.error('Error saving pricing tiers to localStorage:', error);
    }
    
    // Recalculate if we have a configuration
    if (configuration) {
      const newCalculations = calculateAllTiers(configuration, updatedTiers);
      setCalculations(newCalculations);
    }
  };



  // HubSpot state update functions
  const updateHubspotState = (updates: Partial<typeof hubspotState>) => {
    setHubspotState(prevState => ({
      ...prevState,
      ...updates
    }));
  };

  // Handle HubSpot contact selection
  const handleSelectHubSpotContact = useCallback((contact: any) => {
    updateHubspotState({ selectedContact: contact });
  }, [updateHubspotState]);


  // Company information update function
  const updateCompanyInfo = (updates: Partial<typeof companyInfo>) => {
    setCompanyInfo(prevInfo => ({
      ...prevInfo,
      ...updates
    }));
  };

  const handleGenerateQuote = async (clientInfo: any) => {
    if (!selectedTier || !configuration) {
      console.error('Cannot generate quote: missing tier or configuration');
      return;
    }

    // Create a new quote
    const newQuote: Quote = {
      id: `quote-001`,
      clientName: clientInfo.clientName,
      clientEmail: clientInfo.clientEmail,
      company: clientInfo.company,
      configuration: configuration,
      selectedTier: selectedTier.tier,
      calculation: selectedTier,
      createdAt: new Date(),
      status: 'draft',
      templateUsed: {
        id: 'default',
        name: 'Default Template',
        isDefault: true
      },
      dealData: activeDealData || null
    };

    // Add quote to state (localStorage)
    setQuotes(prevQuotes => [newQuote, ...prevQuotes]);

    // Save quote to database
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/quotes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: newQuote.id,
          clientName: newQuote.clientName,
          clientEmail: newQuote.clientEmail,
          company: newQuote.company,
          configuration: newQuote.configuration,
          selectedTier: newQuote.selectedTier,
          calculation: newQuote.calculation,
          status: newQuote.status,
          dealData: newQuote.dealData
        })
      });

      if (response.ok) {
        console.log('✅ Quote saved to database successfully');
      } else {
        console.error('❌ Failed to save quote to database:', response.statusText);
      }
    } catch (error) {
      console.error('❌ Error saving quote to database:', error);
    }

    console.log('✅ Quote generated and saved:', newQuote);
    console.log('📊 Total quotes:', quotes.length + 1);
  };

  const handleDeleteQuote = async (quoteId: string) => {
    setQuotes(prevQuotes => prevQuotes.filter(quote => quote.id !== quoteId));
    
    // Delete from database
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/quotes/${quoteId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        console.log('✅ Quote deleted from database:', quoteId);
      } else {
        console.error('❌ Failed to delete quote from database:', response.statusText);
      }
    } catch (error) {
      console.error('❌ Error deleting quote from database:', error);
    }
    
    console.log('🗑️ Quote deleted:', quoteId);
  };

  const handleUpdateQuoteStatus = async (quoteId: string, newStatus: Quote['status']) => {
    setQuotes(prevQuotes => 
      prevQuotes.map(quote => 
        quote.id === quoteId ? { ...quote, status: newStatus } : quote
      )
    );
    
    // Update in database
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/quotes/${quoteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus })
      });
      
      if (response.ok) {
        console.log('✅ Quote status updated in database:', quoteId, 'to', newStatus);
      } else {
        console.error('❌ Failed to update quote status in database:', response.statusText);
      }
    } catch (error) {
      console.error('❌ Error updating quote status in database:', error);
    }
    
    console.log('📝 Quote status updated:', quoteId, 'to', newStatus);
  };

  const handleUpdateQuote = (quoteId: string, updates: Partial<Quote>) => {
    setQuotes(prevQuotes => 
      prevQuotes.map(quote => 
        quote.id === quoteId ? { ...quote, ...updates } : quote
      )
    );
    console.log('📝 Quote updated:', quoteId, 'with updates:', updates);
  };

  const handleTemplatesUpdate = () => {
    // This function will be called when templates are updated
    // The actual reloading is handled by the event listener in useEffect
    console.log('🔄 Templates updated, reloading...');
  };

  // Handle template selection from TemplateManager
  const handleTemplateSelect = (template: any) => {
    console.log('🎯 Template selected:', template?.name || 'None');
    console.log('🔍 Template details:', {
      id: template?.id,
      name: template?.name,
      hasFile: !!template?.file,
      fileType: template?.file?.type,
      fileName: template?.file?.name
    });
    setSelectedTemplate(template);
  };

  const renderContent = () => {
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

    switch (activeTab) {
      case 'deal':
        return (
          <div className="max-w-7xl mx-auto p-6">
            <div className="mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">Deal Information</h1>
                  <p className="text-gray-600">View and manage deal details from HubSpot</p>
                </div>
              </div>
            </div>
            
            {/* Show DealDetails component with real or test data */}
            <DealDetails 
              dealData={dealData || {
                dealId: "TEST-12345",
                dealName: "Test Deal - Cloud Migration",
                amount: "$25,000",
                stage: "Proposal",
                closeDate: "2024-12-31",
                ownerId: "user-456",
                // Add demo contact and company information
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
                onSelectTier={handleSelectTier}
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
        // Debug logging removed to prevent console spam
        
        if (!selectedTier || !configuration) {
          console.log('❌ Quote tab: Missing selectedTier or configuration');
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
                    onClick={() => setActiveTab('configure')}
                    className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                  >
                    Go to Configuration
                  </button>
                  <button
                    onClick={() => setActiveTab('pricing')}
                    className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-semibold"
                  >
                    View Pricing
                  </button>
                </div>
              </div>
            </div>
          );
        }
        
        // Create a fallback calculation if no tier is selected
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

        // Debug: Check what calculation is being passed (reduced logging)
        if (!selectedTier) {
          console.log('🔍 App.tsx - Using fallback calculation (no tier selected)');
        }

        // Create a fallback configuration if none exists
        const fallbackConfiguration: ConfigurationData = {
          numberOfUsers: 1,
          instanceType: 'Standard',
          numberOfInstances: 1,
          duration: 1,
          migrationType: 'Messaging',
          dataSizeGB: 0
        };

        return (
          <QuoteGenerator
            calculation={selectedTier || fallbackCalculation}
            configuration={configuration || fallbackConfiguration}
            onGenerateQuote={handleGenerateQuote}
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
        return null;
    }
  };

   return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/auth/microsoft/callback" element={<MicrosoftCallback />} />
          <Route path="/auth/microsoft/callback/" element={<MicrosoftCallback />} />
          <Route path="/debug-env" element={<DebugEnv />} />
          
          {/* Protected Routes - Original CPQ App */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-100/50">
                {!isSignatureForm && <Navigation activeTab={activeTab} onTabChange={setActiveTab} />}
                
                <main className={`${isSignatureForm ? 'max-w-6xl' : 'max-w-7xl'} mx-auto px-4 sm:px-6 lg:px-8 py-10`}>
                  {renderContent()}
                </main>
              </div>
            </ProtectedRoute>
          } />
          
          {/* Redirect any other routes to landing page */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;