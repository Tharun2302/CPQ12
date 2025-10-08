import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Dashboard from './components/Dashboard';
import { ConfigurationData, PricingCalculation, PricingTier, Quote } from './types/pricing';
import { calculateAllTiers, PRICING_TIERS } from './utils/pricing';

// Import authentication page components
import LandingPage from './pages/LandingPage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import MicrosoftCallback from './pages/MicrosoftCallback';
import HubSpotAuthHandler from './components/auth/HubSpotAuthHandler';
import ProtectedRoute from './components/auth/ProtectedRoute';
import ApprovalDashboard from './components/ApprovalDashboard';
import ApprovalDashboardTest from './components/ApprovalDashboardTest';

function App() {
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
    name: 'Zenop.ai Pro Solutions',
    address: '123 Business St.',
    city: 'City, State 12345',
    email: 'contact@zenopsolutions.com',
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
    // Navigation is now handled by React Router
    
    // Clear any saved contact info to ensure deal data takes priority
    try {
      localStorage.removeItem('cpq_contact_info');
      console.log('🧹 Cleared saved contact info to prioritize deal data');
    } catch (error) {
      console.warn('⚠️ Could not clear saved contact info:', error);
    }
    
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
      
      // Deal data is present - user can navigate to deal tab via URL
      
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

  // Load templates from database and localStorage on component mount
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        // First try to load from database
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        const response = await fetch(`${backendUrl}/api/templates`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.templates && data.templates.length > 0) {
            console.log('📋 Templates loaded from database:', data.templates.length);
            
            // Convert database templates to frontend format with File objects
            const templatesWithFiles = data.templates.map((template: any) => {
              // Convert base64 fileData to File object
              let file = null;
              if (template.fileData) {
                try {
                  // Convert raw base64 to data URL format
                  const mimeType = template.fileType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                  const dataURL = `data:${mimeType};base64,${template.fileData}`;
                  file = dataURLtoFile(dataURL, template.fileName || 'template.docx');
                } catch (error) {
                  console.error('Error converting fileData to File:', error);
                }
              }
              
              return {
                ...template,
                file,
                uploadDate: new Date(template.createdAt || template.uploadDate || Date.now()),
                content: null
              };
            });
            
            setTemplates(templatesWithFiles);
            console.log('✅ Database templates converted to frontend format:', templatesWithFiles.length);
            return;
          }
        }
      } catch (error) {
        console.log('⚠️ Database templates not available, falling back to localStorage:', error);
      }

      // Fallback to localStorage if database fails
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
          console.log('📋 Templates loaded from localStorage:', templatesWithFiles.length);
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

  // Reset configure session when configuration changes
  useEffect(() => {
    if (configuration) {
      console.log('🔄 Configuration changed - checking if reset is needed');
      
      // Only reset pricing state if core configuration fields have changed
      // Don't reset for date-only changes
      const hasCoreConfig = configuration.migrationType && configuration.numberOfUsers > 0;
      
      if (hasCoreConfig) {
        console.log('🔄 Recalculating pricing for existing configuration');
        const newCalculations = calculateAllTiers(configuration, PRICING_TIERS);
        setCalculations(newCalculations);
      } else {
        // Only reset if we truly don't have a valid configuration
        console.log('🔄 No valid configuration - resetting session state');
        setShowPricing(false);
        setSelectedTier(null);
        setCalculations([]);
      }
    }
  }, [configuration]);

  // Navigation is now handled by React Router URLs

  const handleConfigurationChange = (config: ConfigurationData) => {
    console.log('🔧 handleConfigurationChange called with:', config);
    console.log('🔧 handleConfigurationChange - combination field:', config.combination);
    
    // Check if migration type has changed
    const migrationTypeChanged = configuration && configuration.migrationType !== config.migrationType;
    
    // Check if combination has changed
    const combinationChanged = configuration && configuration.combination !== config.combination;
    
    setConfiguration(config);
    
    // If migration type changed, reset pricing display
    if (migrationTypeChanged) {
      console.log('🔄 Migration type changed, resetting pricing display');
      setShowPricing(false);
    }
    
    // If combination changed, trigger template re-selection
    if (combinationChanged && selectedTier) {
      console.log('🔄 Combination changed, re-selecting template for current tier:', {
        oldCombination: configuration?.combination,
        newCombination: config.combination,
        currentTier: selectedTier.tier.name
      });
      
      // Re-select template based on current tier and new combination
      const auto = autoSelectTemplateForPlan(selectedTier.tier.name, config);
      if (auto) {
        console.log('✅ Auto-selected new template for combination change:', {
          combination: config.combination,
          template: { id: auto.id, name: auto.name, hasFile: !!auto.file }
        });
        setSelectedTemplate(auto);
      } else {
        console.log('⚠️ No matching template found for new combination, keeping current selection.');
      }
    }
    
    const newCalculations = calculateAllTiers(config, pricingTiers);
    setCalculations(newCalculations);
    console.log('✅ Configuration updated successfully');
  };

  const handleSubmitConfiguration = () => {
    setShowPricing(true);
  };

  // Auto-select a template based on chosen tier and configuration
  const autoSelectTemplateForPlan = (tierName: string, config?: ConfigurationData): any | null => {
    if (!templates || templates.length === 0) return null;

    const safeTier = (tierName || '').toLowerCase();
    const migration = (config?.migrationType || '').toLowerCase();
    const combination = (config?.combination || '').toLowerCase();

    console.log('🔍 Auto-selecting template for:', { tierName: safeTier, migration, combination, availableTemplates: templates.length });
    console.log('🔍 Full config object:', config);
    console.log('🔍 Available templates:', templates.map(t => ({ name: t.name, planType: t.planType, combination: t.combination })));

    // First priority: Match by planType field AND combination (most reliable)
    const planTypeMatches = templates.filter(t => {
      const planType = (t?.planType || '').toLowerCase();
      const templateCombination = (t?.combination || '').toLowerCase();
      const matchesPlanType = planType === safeTier;
      const matchesCombination = !combination || templateCombination === combination;
      
      console.log('🎯 Plan type matching:', { 
        templateName: t?.name, 
        templatePlanType: planType, 
        templateCombination,
        targetTier: safeTier,
        selectedCombination: combination,
        matchesPlanType,
        matchesCombination,
        finalMatch: matchesPlanType && matchesCombination
      });
      
      return matchesPlanType && matchesCombination;
    });

    if (planTypeMatches.length > 0) {
      console.log('✅ Found planType match:', planTypeMatches[0].name);
      return planTypeMatches[0];
    }

    // Second priority: Try exact match for SLACK TO TEAMS and SLACK TO GOOGLE CHAT templates by name
    const exactMatches = templates.filter(t => {
      const name = (t?.name || '').toLowerCase();
      
      // Look for exact pattern: "slack to teams [plan]" or "slack to google chat [plan]"
      const isSlackToTeams = name.includes('slack') && name.includes('teams');
      const isSlackToGoogleChat = name.includes('slack') && name.includes('google') && name.includes('chat');
      const matchesPlan = name.includes(safeTier);
      
      // Check if the template matches the selected combination
      const matchesCombination = !combination || 
        (combination === 'slack-to-teams' && isSlackToTeams) ||
        (combination === 'slack-to-google-chat' && isSlackToGoogleChat);
      
      console.log('🔍 Name-based template matching:', { 
        templateName: name, 
        isSlackToTeams, 
        isSlackToGoogleChat,
        matchesPlan, 
        matchesCombination,
        safeTier,
        combination,
        planType: t?.planType 
      });
      
      return (isSlackToTeams || isSlackToGoogleChat) && matchesPlan && matchesCombination;
    });

    if (exactMatches.length > 0) {
      console.log('✅ Found exact name match:', exactMatches[0].name);
      return exactMatches[0];
    }

    // Fallback to scoring system for other cases
    const scoreTemplate = (t: any): number => {
      const name = (t?.name || '').toLowerCase();
      const desc = (t?.description || '').toLowerCase();
      let score = 0;
      
      // Use planType field if available (most reliable)
      if (t?.planType && t.planType.toLowerCase() === safeTier) {
        score += 15; // Highest priority for planType match
        console.log('🎯 PlanType match found:', { planType: t.planType, safeTier });
      }
      
      // Exact plan type match gets high priority
      if (safeTier === 'basic' && name.includes('basic')) score += 10;
      if (safeTier === 'advanced' && name.includes('advanced')) score += 10;
      
      // SLACK TO TEAMS combination gets high priority
      if (name.includes('slack') && name.includes('teams')) score += 8;
      
      // SLACK TO GOOGLE CHAT combination gets high priority
      if (name.includes('slack') && name.includes('google') && name.includes('chat')) score += 8;
      
      // Bonus for matching the selected combination
      if (combination === 'slack-to-teams' && name.includes('slack') && name.includes('teams')) score += 5;
      if (combination === 'slack-to-google-chat' && name.includes('slack') && name.includes('google') && name.includes('chat')) score += 5;
      
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
      console.log('🔍 handleSelectTier called with:', {
        tierName: calculation?.tier?.name,
        configuration: configuration,
        combination: configuration?.combination
      });
      const auto = autoSelectTemplateForPlan(calculation?.tier?.name || '', configuration);
      if (auto) {
        console.log('🔍 Auto-selected template details:', {
          id: auto.id,
          name: auto.name,
          hasFile: !!auto.file,
          fileType: auto.file?.type,
          fileName: auto.file?.name,
          fileSize: auto.file?.size
        });
        
        setSelectedTemplate(auto);
        console.log('✅ Auto-selected template for plan:', {
          plan: calculation?.tier?.name,
          template: { id: auto.id, name: auto.name, hasFile: !!auto.file }
        });
      } else {
        console.log('⚠️ No matching template found for plan, keeping current selection.');
      }
    } catch (e) {
      console.warn('Auto-select template failed:', e);
    }

    // Navigate to quote tab after selecting tier
    console.log('🔄 Navigating to quote tab after tier selection...');
    // Note: Navigation will be handled by the Dashboard component
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

   return (
    <Router>
      <AuthProvider>
        <HubSpotAuthHandler>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/auth/microsoft/callback" element={<MicrosoftCallback />} />
            <Route path="/auth/microsoft/callback/" element={<MicrosoftCallback />} />
            
            {/* Protected Routes - Dashboard with URL-based tab navigation */}
            <Route path="/dashboard" element={<Navigate to="/dashboard/deal" replace />} />
            <Route path="/approval-tracking" element={
              <ProtectedRoute>
                <ApprovalDashboard onBackToDashboard={() => window.location.href = '/dashboard/approval'} />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/*" element={
              <ProtectedRoute>
                <Dashboard
                  configuration={configuration}
                  setConfiguration={setConfiguration}
                  calculations={calculations}
                  setCalculations={setCalculations}
                  selectedTier={selectedTier}
                  setSelectedTier={setSelectedTier}
                  showPricing={showPricing}
                  setShowPricing={setShowPricing}
                  pricingTiers={pricingTiers}
                  setPricingTiers={setPricingTiers}
                  hubspotState={hubspotState}
                  setHubspotState={setHubspotState}
                  companyInfo={companyInfo}
                  setCompanyInfo={setCompanyInfo}
                  selectedTemplate={selectedTemplate}
                  setSelectedTemplate={setSelectedTemplate}
                  templates={templates}
                  setTemplates={setTemplates}
                  quotes={quotes}
                  setQuotes={setQuotes}
                  dealData={dealData}
                  setDealData={setDealData}
                  activeDealData={activeDealData}
                  setActiveDealData={setActiveDealData}
                  currentClientInfo={currentClientInfo}
                  setCurrentClientInfo={setCurrentClientInfo}
                  configureContactInfo={configureContactInfo}
                  setConfigureContactInfo={setConfigureContactInfo}
                  signatureFormData={signatureFormData}
                  setSignatureFormData={setSignatureFormData}
                  isSignatureForm={isSignatureForm}
                  setIsSignatureForm={setIsSignatureForm}
                  handleConfigurationChange={handleConfigurationChange}
                  handleSubmitConfiguration={handleSubmitConfiguration}
                  handleSelectTier={handleSelectTier}
                  handleTierUpdate={handleTierUpdate}
                  handleGenerateQuote={handleGenerateQuote}
                  handleDeleteQuote={handleDeleteQuote}
                  handleUpdateQuoteStatus={handleUpdateQuoteStatus}
                  handleUpdateQuote={handleUpdateQuote}
                  handleTemplateSelect={handleTemplateSelect}
                  handleTemplatesUpdate={handleTemplatesUpdate}
                  updateCompanyInfo={updateCompanyInfo}
                  handleSelectHubSpotContact={handleSelectHubSpotContact}
                  handleConfigureContactInfoChange={handleConfigureContactInfoChange}
                  handleClientInfoChange={handleClientInfoChange}
                  refreshDealData={refreshDealData}
                  handleUseDealData={handleUseDealData}
                  handleSignatureFormComplete={handleSignatureFormComplete}
                  getCurrentQuoteData={getCurrentQuoteData}
                />
              </ProtectedRoute>
            } />
            
            {/* Redirect any other routes to landing page */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HubSpotAuthHandler>
      </AuthProvider>
    </Router>
  );
}

export default App;