import React, { useState, useEffect } from 'react';
import { ConfigurationData } from '../types/pricing';
import { ArrowRight, Users, Server, Clock, Database, FileText, Calculator, Sparkles, Calendar, Percent, MessageSquare, Search, X } from 'lucide-react';
import { trackConfiguration } from '../analytics/clarity';

interface ConfigurationFormProps {
  onConfigurationChange: (config: ConfigurationData) => void;
  onSubmit: () => void;
  dealData?: {
    dealId?: string;
    dealName?: string;
    contactName?: string;
    contactEmail?: string;
    company?: string;
    companyByContact?: string;
  };
  onContactInfoChange?: (contactInfo: { clientName: string; clientEmail: string; company: string; companyName2: string }) => void;
  templates?: any[];
  selectedTemplate?: any;
  onTemplateSelect?: (template: any | null) => void;
}


const ConfigurationForm: React.FC<ConfigurationFormProps> = ({ 
  onConfigurationChange, 
  onSubmit, 
  dealData, 
  onContactInfoChange,
  templates = [],
  selectedTemplate,
  onTemplateSelect
}) => {
  const [config, setConfig] = useState<ConfigurationData>({
    numberOfUsers: 0,
    instanceType: 'Small',
    numberOfInstances: 0,
    duration: 0,
    migrationType: '' as any, // Start with empty to hide other fields
    dataSizeGB: 0,
    messages: 0,
    combination: ''
  });

  // Contact information state - start with undefined so fields can fall back to dealData initially
  const [contactInfo, setContactInfo] = useState<{
    clientName?: string;
    clientEmail?: string;
    company?: string;
    companyName2?: string;
  }>({
    clientName: undefined,
    clientEmail: undefined,
    company: undefined,
    companyName2: undefined
  });

  // Track if this is the initial load vs navigation return
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Discount state for proper display
  const [discountValue, setDiscountValue] = useState<string>('');
  // Combination selection state
  const [combination, setCombination] = useState<string>('');
  // Search state for combinations
  const [combinationSearch, setCombinationSearch] = useState<string>('');
  // Track if user actually entered values in project configuration fields
  const [fieldTouched, setFieldTouched] = useState({
    users: false,
    instances: false,
    duration: false,
    dataSize: false,
    messages: false
  });
  
  // Contact information validation state
  const [contactValidationErrors, setContactValidationErrors] = useState({
    clientName: false,
    clientEmail: false,
    company: false
  });

  // Extract company name from email domain if company field is "Not Available"
  const extractCompanyFromEmail = (email: string): string => {
    if (!email) return '';
    const domain = email.split('@')[1];
    if (!domain) return '';
    
    // Remove common TLDs and format as company name
    const companyName = domain
      .replace(/\.(com|org|net|edu|gov|co|io|ai)$/i, '')
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    
    return companyName;
  };

  // Get the effective company name (extracted from email if needed)
  const getEffectiveCompanyName = (originalCompany?: string, email?: string): string => {
    if (originalCompany && originalCompany !== 'Not Available') {
      return originalCompany;
    }
    if (email) {
      const extracted = extractCompanyFromEmail(email);
      return extracted || 'Not Available';
    }
    return 'Not Available';
  };

  // Helper function to get display label for combination value
  const getCombinationLabel = (combinationValue: string): string => {
    const combinationLabels: Record<string, string> = {
      'dropbox-to-microsoft': 'DROPBOX TO MICROSOFT (ONEDRIVE/SHAREPOINT)',
      'dropbox-to-google': 'DROPBOX TO GOOGLE (SHARED DRIVE/MYDRIVE)',
      'box-to-box': 'BOX TO BOX',
      'box-to-microsoft': 'BOX TO MICROSOFT (ONEDRIVE/SHAREPOINT)',
      'box-to-google': 'BOX TO GOOGLE (SHARED DRIVE/MYDRIVE)',
      'google-sharedrive-to-egnyte': 'GOOGLE SHARED DRIVE TO EGNYTE',
      'google-sharedrive-to-google-sharedrive': 'GOOGLE SHARED DRIVE TO GOOGLE SHARED DRIVE',
      'google-sharedrive-to-onedrive': 'GOOGLE SHARED DRIVE TO ONEDRIVE',
      'google-sharedrive-to-sharepoint': 'GOOGLE SHARED DRIVE TO SHAREPOINT',
      'google-mydrive-to-dropbox': 'GOOGLE MYDRIVE TO DROPBOX',
      'google-mydrive-to-egnyte': 'GOOGLE MYDRIVE TO EGNYTE',
      'google-mydrive-to-onedrive': 'GOOGLE MYDRIVE TO ONEDRIVE',
      'google-mydrive-to-sharepoint': 'GOOGLE MYDRIVE TO SHAREPOINT',
      'google-mydrive-to-google-sharedrive': 'GOOGLE MYDRIVE TO GOOGLE SHARED DRIVE',
      'google-mydrive-to-google-mydrive': 'GOOGLE MYDRIVE TO GOOGLE MYDRIVE',
      'sharefile-to-google-mydrive': 'SHAREFILE TO GOOGLE MYDRIVE',
      'sharefile-to-google-sharedrive': 'SHAREFILE TO GOOGLE SHARED DRIVE',
      'sharefile-to-onedrive': 'SHAREFILE TO ONEDRIVE',
      'sharefile-to-sharefile': 'SHAREFILE TO SHAREFILE',
      'overage-agreement': 'OVERAGE AGREEMENT',
      'slack-to-teams': 'SLACK TO TEAMS',
      'slack-to-google-chat': 'SLACK TO GOOGLE CHAT'
    };
    
    return combinationLabels[combinationValue] || combinationValue.replace(/-/g, ' ').toUpperCase();
  };

  // Helper function to limit consecutive spaces to maximum 5
  const limitConsecutiveSpaces = (value: string, maxSpaces: number = 5): string => {
    const pattern = new RegExp(`\\s{${maxSpaces + 1},}`, 'g');
    return value.replace(pattern, ' '.repeat(maxSpaces));
  };

  // Helper function to sanitize email (remove emojis, special characters, and trailing numbers after domain)
  const sanitizeEmail = (value: string): string => {
    // Remove emojis and special characters, keep only valid email characters
    let cleaned = value.replace(/[^\w@\.\-]/g, '');
    // Remove trailing digits after domain extension (e.g., .com3333 -> .com)
    cleaned = cleaned.replace(/(\.[a-z]{2,})\d+$/gi, '$1');
    return cleaned;
  };

  // Helper function to sanitize company name (remove trailing number sequences)
  const sanitizeCompanyName = (value: string): string => {
    // Remove emojis first
    let cleaned = value.replace(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}]/gu, '');
    // Remove trailing digits (any trailing digits after dots, spaces, or at end)
    cleaned = cleaned.replace(/[\.\s]\d+$/g, ''); // Remove digits after dot or space
    cleaned = cleaned.replace(/\d+$/g, ''); // Remove any remaining trailing digits
    return cleaned;
  };

  // Initialize contact info from deal data
  useEffect(() => {
    // Load previously saved configuration from sessionStorage (only for current session)
    // This ensures project configuration fields are empty on page refresh but retained during navigation
    try {
      const savedConfig = sessionStorage.getItem('cpq_configuration_session');
      console.log('📋 === CONFIGURATION LOADING START ===');
      console.log('📋 Raw sessionStorage value:', savedConfig);
      
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        console.log('📋 Parsed sessionStorage data:', parsed);
        console.log('📋 Combination in parsed data:', parsed.combination);
        
        const merged = {
          numberOfUsers: typeof parsed.numberOfUsers === 'number' ? parsed.numberOfUsers : 0,
          instanceType: parsed.instanceType || 'Small',
          numberOfInstances: typeof parsed.numberOfInstances === 'number' ? parsed.numberOfInstances : 0,
          duration: typeof parsed.duration === 'number' ? parsed.duration : 0,
          migrationType: parsed.migrationType || ('' as any),
          dataSizeGB: typeof parsed.dataSizeGB === 'number' ? parsed.dataSizeGB : 0,
          messages: typeof parsed.messages === 'number' ? parsed.messages : 0,
          combination: parsed.combination || '' // Preserve previously selected combination
        } as ConfigurationData;
        
        console.log('📋 === CRITICAL CHECK ===');
        console.log('📋 Merged combination value:', merged.combination);
        console.log('📋 Full merged config:', merged);
        console.log('📋 ========================');
        
        setConfig(merged);
        onConfigurationChange(merged);
        console.log('📋 Configuration set and parent notified');
        
        // Force combination sync after config is loaded
        if (merged.combination && merged.combination !== '') {
          setCombination(merged.combination);
          console.log('📋 Force syncing combination state:', merged.combination);
        }
        
        console.log('📋 === CONFIGURATION LOADING END ===');
      } else {
        console.log('📋 No session configuration found, starting with empty project configuration fields');
      }
    } catch (error) {
      console.log('📋 Error loading session configuration, starting with empty fields:', error);
    }

    // Load persisted contact info if available (user may have edited manually earlier)
    let savedContactInfo = null;
    try {
      // First try sessionStorage (preferred for current session)
      const savedContactSession = sessionStorage.getItem('cpq_configure_contact_info');
      if (savedContactSession) {
        savedContactInfo = JSON.parse(savedContactSession);
        console.log('🔍 ConfigurationForm: Loaded contact info from sessionStorage:', savedContactInfo);
      } else {
        // Fallback to localStorage
        const savedContact = localStorage.getItem('cpq_contact_info');
        if (savedContact) {
          savedContactInfo = JSON.parse(savedContact);
          console.log('🔍 ConfigurationForm: Loaded contact info from localStorage:', savedContactInfo);
        }
      }
    } catch (error) {
      console.warn('Could not load contact info from storage:', error);
    }

    // Priority 1: Use manually edited contact info if it exists (override dealData)
    if (savedContactInfo && (savedContactInfo.clientName !== undefined || savedContactInfo.clientEmail !== undefined || savedContactInfo.company !== undefined)) {
      const finalContactInfo = {
        clientName: savedContactInfo.clientName,
        clientEmail: savedContactInfo.clientEmail,
        company: savedContactInfo.company,
        companyName2: savedContactInfo.companyName2 ?? savedContactInfo.company
      };
      setContactInfo(finalContactInfo);
      console.log('🔍 ConfigurationForm: Using manually edited contact info from storage:', finalContactInfo);
    }
    // Priority 2: Use deal data if available and no manual edits
    else if (dealData && (dealData.contactName || dealData.contactEmail || dealData.company || dealData.companyByContact)) {
      // Don't set contactInfo state - let it remain undefined so nullish coalescing in value prop works
      console.log('🔍 ConfigurationForm: Will use deal data via nullish coalescing (no user edits)');
      console.log('🏢 Company extraction applied:', {
        original: dealData.companyByContact,
        email: dealData.contactEmail,
        extracted: getEffectiveCompanyName(dealData.companyByContact, dealData.contactEmail)
      });
    }
    // Otherwise, start with undefined values
    else {
      console.log('🔍 ConfigurationForm: Starting with undefined contact info (no deal data or user edits)');
    }

    // Mark that we've completed the initial load
    setIsInitialLoad(false);
  }, []); // Run only once on mount

  // Clear validation errors when dealData has valid values
  useEffect(() => {
    const isNotAvailable = (value: string | undefined) => {
      if (!value || value.trim() === '') return true;
      const normalized = value.trim().toLowerCase();
      return normalized === 'not available' || normalized === 'n/a' || normalized === 'na';
    };
    
    // Get effective values (from contactInfo or dealData fallback)
    const effectiveContactName = contactInfo.clientName ?? dealData?.contactName;
    const effectiveContactEmail = contactInfo.clientEmail ?? dealData?.contactEmail;
    const effectiveCompanyName = contactInfo.company ?? contactInfo.companyName2 ?? dealData?.companyByContact ?? dealData?.company;
    
    // Clear errors if fields have valid values
    if (effectiveContactName && !isNotAvailable(effectiveContactName)) {
      setContactValidationErrors(prev => ({ ...prev, clientName: false }));
    }
    if (effectiveContactEmail && !isNotAvailable(effectiveContactEmail)) {
      setContactValidationErrors(prev => ({ ...prev, clientEmail: false }));
    }
    if (effectiveCompanyName && !isNotAvailable(effectiveCompanyName)) {
      setContactValidationErrors(prev => ({ ...prev, company: false }));
    }
  }, [dealData, contactInfo.clientName, contactInfo.clientEmail, contactInfo.company, contactInfo.companyName2]);

  // Sync contact info to parent whenever dealData or contact info changes
  useEffect(() => {
    if (contactInfo.clientName || contactInfo.clientEmail || contactInfo.company) {
      const parentContactInfo = {
        clientName: contactInfo.clientName,
        clientEmail: contactInfo.clientEmail,
        company: contactInfo.company,
        companyName2: contactInfo.companyName2 || contactInfo.company
      };
      console.log('✅ ConfigurationForm: Syncing contact info to parent (user edited or deal data):', parentContactInfo);
      
      // Also notify parent if available
      if (onContactInfoChange) {
        onContactInfoChange(parentContactInfo);
      }
    } else if (dealData && (dealData.contactName || dealData.contactEmail || dealData.companyByContact)) {
      const parentContactInfo = {
        clientName: dealData.contactName || '',
        clientEmail: dealData.contactEmail || '',
        company: dealData.companyByContact || dealData.company || '',
        companyName2: getEffectiveCompanyName(dealData.companyByContact, dealData.contactEmail)
      };
      console.log('✅ ConfigurationForm: Syncing deal data contact info to parent:', parentContactInfo);
      if (onContactInfoChange) {
        onContactInfoChange(parentContactInfo);
      }
    }
  }, [dealData]); // Removed onContactInfoChange from dependencies

  // Load discount value from sessionStorage on component mount
  useEffect(() => {
    try {
      const savedDiscount = sessionStorage.getItem('cpq_discount_session');
      if (savedDiscount !== null && savedDiscount !== '') {
        setDiscountValue(savedDiscount);
      }
    } catch {
      setDiscountValue('');
    }
  }, []);

  // Sync combination with config (only use sessionStorage, no localStorage fallback)
  useEffect(() => {
    console.log('🔧 ConfigurationForm: Combination sync logic:', {
      configCombination: config.combination,
      isInitialLoad: isInitialLoad,
      currentCombination: combination
    });
    
    // Always use config.combination (from session storage) as the source of truth
    if (config.combination && config.combination !== '') {
      setCombination(config.combination);
      console.log('🔧 ConfigurationForm: Syncing combination from config (session storage):', config.combination);
    } else {
      setCombination('');
      console.log('🔧 ConfigurationForm: No combination in config, setting empty');
    }
  }, [config.combination, isInitialLoad]); // Run when config.combination changes or initial load completes

  // Calculate end date when start date or duration changes
  useEffect(() => {
    if (config.startDate && config.duration && config.duration > 0) {
      const startDate = new Date(config.startDate);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + config.duration);
      const calculatedEndDate = endDate.toISOString().split('T')[0];
      
      if (config.endDate !== calculatedEndDate) {
        const newConfig = { ...config, endDate: calculatedEndDate };
        setConfig(newConfig);
        onConfigurationChange(newConfig);
        console.log(`📅 Auto-calculated end date: ${calculatedEndDate} (Start: ${config.startDate}, Duration: ${config.duration} months)`);
      }
    }
  }, [config.startDate, config.duration]);

  const handleChange = (field: keyof ConfigurationData, value: any) => {
    console.log(`🔧 ConfigurationForm: Changing ${field} from ${config[field]} to ${value}`);
    const newConfig = { ...config, [field]: value };
    
    // Calculate end date when start date or duration changes
    if (field === 'startDate' || field === 'duration') {
      if (newConfig.startDate && newConfig.duration && newConfig.duration > 0) {
        const startDate = new Date(newConfig.startDate);
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + newConfig.duration);
        newConfig.endDate = endDate.toISOString().split('T')[0];
        console.log(`📅 Calculated end date: ${newConfig.endDate} (Start: ${newConfig.startDate}, Duration: ${newConfig.duration} months)`);
      } else {
        newConfig.endDate = undefined;
      }
    }
    
    setConfig(newConfig);
    onConfigurationChange(newConfig);
    // Persist configuration in sessionStorage so values remain when user navigates but clear on page refresh
    try { 
      console.log('💾 === SAVING TO SESSION STORAGE ===');
      console.log('💾 Field changed:', field);
      console.log('💾 New value:', value);
      console.log('💾 Combination in newConfig:', newConfig.combination);
      console.log('💾 Full newConfig:', newConfig);
      
      sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
      console.log('💾 Saved to cpq_configuration_session');
      
      // Also save to navigation state to keep Dashboard in sync
      const existingNavState = sessionStorage.getItem('cpq_navigation_state');
      if (existingNavState) {
        try {
          const parsed = JSON.parse(existingNavState);
          // Ensure sessionState exists
          if (!parsed.sessionState) {
            parsed.sessionState = {};
          }
          parsed.sessionState.configuration = newConfig;
          sessionStorage.setItem('cpq_navigation_state', JSON.stringify(parsed));
          console.log('💾 Also saved to cpq_navigation_state');
        } catch (navError) {
          console.warn('💾 Could not save to navigation state:', navError);
        }
      }
    } catch (error) {
      console.error('💾 Error saving to sessionStorage:', error);
    }
    
    // Auto-scroll down when migration type is selected, but only if we have a target section
    if (field === 'migrationType' && value) {
      setTimeout(() => {
        const target = document.querySelector('[data-section="template-selection"]')
          || document.querySelector('[data-section="project-configuration"]');
        if (target) (target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  };

  const handleContactInfoChange = (field: keyof typeof contactInfo, value: string) => {
    let processedValue = value;
    
    // Apply sanitization based on field type
    if (field === 'clientEmail') {
      processedValue = sanitizeEmail(value);
    } else {
      processedValue = limitConsecutiveSpaces(value);
    }
    
    const newContactInfo = { ...contactInfo, [field]: processedValue };
    setContactInfo(newContactInfo);
    
    // Save to localStorage so it persists across sessions
    try { localStorage.setItem('cpq_contact_info', JSON.stringify(newContactInfo)); } catch {}
    
    // Also notify parent component
    if (onContactInfoChange) {
      onContactInfoChange(newContactInfo);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // CRITICAL: Validate contact information first (case-insensitive "Not Available" check)
    // Check both contactInfo state and dealData fallback values
    const isNotAvailable = (value: string | undefined) => {
      if (!value || value.trim() === '') return true;
      const normalized = value.trim().toLowerCase();
      return normalized === 'not available' || normalized === 'n/a' || normalized === 'na';
    };
    
    // Get effective values (from contactInfo or dealData fallback)
    const effectiveContactName = contactInfo.clientName ?? dealData?.contactName ?? '';
    const effectiveContactEmail = contactInfo.clientEmail ?? dealData?.contactEmail ?? '';
    const effectiveCompanyName = contactInfo.company ?? contactInfo.companyName2 ?? dealData?.companyByContact ?? dealData?.company ?? '';
    
    const hasContactName = effectiveContactName && !isNotAvailable(effectiveContactName);
    const hasContactEmail = effectiveContactEmail && !isNotAvailable(effectiveContactEmail);
    const hasCompanyName = effectiveCompanyName && !isNotAvailable(effectiveCompanyName);
    
    if (!hasContactName || !hasContactEmail || !hasCompanyName) {
      // Set validation errors to show red borders
      setContactValidationErrors({
        clientName: !hasContactName,
        clientEmail: !hasContactEmail,
        company: !hasCompanyName
      });
      
      // Show alert with specific missing fields
      const missingFields = [];
      if (!hasContactName) missingFields.push('Contact Name');
      if (!hasContactEmail) missingFields.push('Contact Email');
      if (!hasCompanyName) missingFields.push('Company Name');
      
      alert(`⚠️ Contact Information Required!\n\nPlease fill in the following fields:\n\n- ${missingFields.join('\n- ')}\n\n"Not available" is not a valid entry.\n\nScrolling to Contact Information section...`);
      
      // Scroll to top to show contact information section
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Also focus on the first invalid field after scroll
      setTimeout(() => {
        const firstInvalidField = document.querySelector('input[type="text"][value*="Not"], input[type="email"][value*="Not"]') as HTMLInputElement;
        if (firstInvalidField) {
          firstInvalidField.focus();
          firstInvalidField.select();
        }
      }, 500);
      
      return;
    }
    
    // Validation
    if (!config.migrationType) {
      alert('Please select a migration type');
      return;
    }
    
    if (!config.combination) {
      alert('Please select a combination');
      return;
    }
    
    // Require users field to be entered (0 allowed, but check value first, then touch status)
    if (config.combination !== 'overage-agreement') {
      // If value exists and is valid, accept it (even if not touched - e.g., loaded from sessionStorage)
      if (config.numberOfUsers === undefined || config.numberOfUsers === null) {
        // Value is missing - check if field was touched
        if (!fieldTouched.users) {
          alert('Please enter the number of users');
          return;
        }
      }
      // Check if value is negative
      if (config.numberOfUsers < 0) {
        alert('Please enter the number of users (minimum 0)');
        return;
      }
    }
    
    // Check instances: if value exists and is valid, accept it; otherwise check touch status
    if (config.numberOfInstances === undefined || config.numberOfInstances === null || config.numberOfInstances < 1) {
      if (!fieldTouched.instances) {
        alert('Please enter the number of instances (minimum 1)');
        return;
      }
      if (config.numberOfInstances < 1) {
        alert('Please enter the number of instances (minimum 1)');
        return;
      }
    }
    
    // Check duration: if value exists and is valid, accept it; otherwise check touch status
    if (config.duration === undefined || config.duration === null || config.duration < 1) {
      if (!fieldTouched.duration) {
        alert('Please enter project duration in months');
        return;
      }
      if (config.duration < 1) {
        alert('Please enter project duration (minimum 1 month)');
        return;
      }
    }
    
    // Data size is REQUIRED for Content (must be > 0). Prevent pricing if missing/zero.
    if (config.migrationType === 'Content' && config.combination !== 'overage-agreement') {
      if (config.dataSizeGB === undefined || config.dataSizeGB === null || config.dataSizeGB <= 0) {
        if (!fieldTouched.dataSize) {
          alert('Please enter data size in GB for Content migration');
          return;
        }
        if (config.dataSizeGB <= 0) {
          alert('Please enter data size in GB for Content migration (minimum 1 GB)');
          return;
        }
      }
    }
    
    // Messages is REQUIRED for Messaging (must be > 0). Prevent pricing if missing/zero.
    if (config.migrationType === 'Messaging' && config.combination !== 'overage-agreement') {
      if (config.messages === undefined || config.messages === null || config.messages <= 0) {
        if (!fieldTouched.messages) {
          alert('Please enter the number of messages for Messaging migration');
          return;
        }
        if (config.messages <= 0) {
          alert('Please enter the number of messages (minimum 1)');
          return;
        }
      }
    }
    
    console.log('✅ Form validation passed, submitting configuration');
    
    // Track configuration submission
    trackConfiguration({
      migrationType: config.migrationType,
      numberOfUsers: config.numberOfUsers,
      instanceType: config.instanceType,
      numberOfInstances: config.numberOfInstances,
      duration: config.duration,
      dataSizeGB: config.dataSizeGB,
      messages: config.messages,
      combination: config.combination,
      hasDiscount: !!discountValue && parseFloat(discountValue) > 0,
      discountValue: discountValue ? parseFloat(discountValue) : undefined
    });
    
    onSubmit();
    
    // Scroll to pricing section after a short delay to allow the component to render
    setTimeout(() => {
      const pricingSection = document.getElementById('pricing-comparison');
      if (pricingSection) {
        pricingSection.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
        console.log('✅ Scrolled to pricing section');
      } else {
        console.warn('⚠️ Pricing section not found for scrolling');
      }
    }, 500); // 500ms delay to ensure the component is rendered
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      {/* Custom styles for combination dropdown hover effects */}
      <style>{`
        .combination-select-dropdown option {
          padding: 12px 16px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .combination-select-dropdown option:hover {
          background: #4b5563 !important;
          color: white !important;
          font-weight: 600;
        }
        
        .combination-select-dropdown option:checked {
          background: #6b7280 !important;
          color: white !important;
          font-weight: 700;
        }
        
        .combination-select-dropdown option[value=""] {
          color: #9ca3af;
          font-style: italic;
        }
        
        /* Custom scrollbar for the select dropdown */
        .combination-select-dropdown::-webkit-scrollbar {
          width: 8px;
        }
        
        .combination-select-dropdown::-webkit-scrollbar-track {
          background: #f3f4f6;
          border-radius: 4px;
        }
        
        .combination-select-dropdown::-webkit-scrollbar-thumb {
          background: #9ca3af;
          border-radius: 4px;
        }
        
        .combination-select-dropdown::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }
      `}</style>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Contact Information Display - Show when deal data exists */}
        {(dealData || contactInfo.clientName || contactInfo.clientEmail || contactInfo.company) && (
          <div className="mb-6 bg-gradient-to-br from-emerald-50 to-green-50 rounded-2xl shadow-lg border border-emerald-200 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-green-600 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Contact Information</h3>
              <span className="ml-auto text-xs text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                {dealData && !contactInfo.clientName && !contactInfo.clientEmail ? 'From HubSpot Deal' : 'Saved Contact'}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Contact Name */}
              <div className="bg-white rounded-lg p-4 border border-emerald-100">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                  Contact Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={contactInfo.clientName ?? dealData?.contactName ?? ''}
                  onChange={(e) => {
                    const newContactInfo = {
                      ...contactInfo,
                      clientName: e.target.value
                    };
                    setContactInfo(newContactInfo);
                    
                    // Clear validation error when user types
                    setContactValidationErrors(prev => ({ ...prev, clientName: false }));
                    
                    // Save to both localStorage and sessionStorage for consistency
                    try {
                      localStorage.setItem('cpq_contact_info', JSON.stringify(newContactInfo));
                      sessionStorage.setItem('cpq_configure_contact_info', JSON.stringify({
                        clientName: newContactInfo.clientName,
                        clientEmail: newContactInfo.clientEmail,
                        company: newContactInfo.company
                      }));
                    } catch (error) {
                      console.warn('Could not save contact info to storage:', error);
                    }
                    
                    // Notify parent component
                    if (onContactInfoChange) {
                      onContactInfoChange({
                        clientName: newContactInfo.clientName,
                        clientEmail: newContactInfo.clientEmail,
                        company: newContactInfo.company,
                        companyName2: newContactInfo.companyName2 || newContactInfo.company
                      });
                    }
                  }}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    const normalized = value.toLowerCase();
                    // Only show error if field is empty or invalid
                    if (!value || normalized === 'not available' || normalized === 'n/a' || normalized === 'na') {
                      setContactValidationErrors(prev => ({ ...prev, clientName: true }));
                    } else {
                      // Clear error if field has valid value
                      setContactValidationErrors(prev => ({ ...prev, clientName: false }));
                    }
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 transition-all duration-200 text-sm font-medium ${
                    contactValidationErrors.clientName
                      ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                      : 'border-gray-200 focus:ring-emerald-500 focus:border-emerald-500'
                  }`}
                  placeholder="Enter contact name"
                />
                {contactValidationErrors.clientName && (
                  <p className="text-xs text-red-600 mt-1 font-semibold flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                    Contact Name is required
                  </p>
                )}
              </div>
              
              {/* Contact Email */}
              <div className="bg-white rounded-lg p-4 border border-emerald-100">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                  Contact Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={contactInfo.clientEmail ?? dealData?.contactEmail ?? ''}
                  onChange={(e) => {
                    // Sanitize email to remove invalid characters
                    const sanitizedEmail = sanitizeEmail(e.target.value);
                    const newContactInfo = {
                      ...contactInfo,
                      clientEmail: sanitizedEmail
                    };
                    setContactInfo(newContactInfo);
                    
                    // Clear validation error when user types
                    setContactValidationErrors(prev => ({ ...prev, clientEmail: false }));
                    
                    // Save to both localStorage and sessionStorage for consistency
                    try {
                      localStorage.setItem('cpq_contact_info', JSON.stringify(newContactInfo));
                      sessionStorage.setItem('cpq_configure_contact_info', JSON.stringify({
                        clientName: newContactInfo.clientName,
                        clientEmail: newContactInfo.clientEmail,
                        company: newContactInfo.company
                      }));
                    } catch (error) {
                      console.warn('Could not save contact info to storage:', error);
                    }
                    
                    // Notify parent component
                    if (onContactInfoChange) {
                      onContactInfoChange({
                        clientName: newContactInfo.clientName,
                        clientEmail: newContactInfo.clientEmail,
                        company: newContactInfo.company,
                        companyName2: newContactInfo.companyName2 || newContactInfo.company
                      });
                    }
                  }}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    const normalized = value.toLowerCase();
                    // Only show error if field is empty or invalid
                    if (!value || normalized === 'not available' || normalized === 'n/a' || normalized === 'na') {
                      setContactValidationErrors(prev => ({ ...prev, clientEmail: true }));
                    } else {
                      // Clear error if field has valid value
                      setContactValidationErrors(prev => ({ ...prev, clientEmail: false }));
                    }
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 transition-all duration-200 text-sm font-medium ${
                    contactValidationErrors.clientEmail
                      ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                      : 'border-gray-200 focus:ring-emerald-500 focus:border-emerald-500'
                  }`}
                  placeholder="Enter contact email"
                />
                {contactValidationErrors.clientEmail && (
                  <p className="text-xs text-red-600 mt-1 font-semibold flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                    Contact Email is required
                  </p>
                )}
              </div>
              
              {/* Company Name */}
              <div className="bg-white rounded-lg p-4 border border-emerald-100">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={contactInfo.company ?? contactInfo.companyName2 ?? dealData?.companyByContact ?? dealData?.company ?? ''}
                  onChange={(e) => {
                    // Sanitize company name to remove trailing number sequences
                    const sanitizedCompany = sanitizeCompanyName(e.target.value);
                    const newContactInfo = {
                      ...contactInfo,
                      company: sanitizedCompany,
                      companyName2: sanitizedCompany
                    };
                    setContactInfo(newContactInfo);
                    
                    // Clear validation error when user types
                    setContactValidationErrors(prev => ({ ...prev, company: false }));
                    
                    // Save to both localStorage and sessionStorage for consistency
                    try {
                      localStorage.setItem('cpq_contact_info', JSON.stringify(newContactInfo));
                      sessionStorage.setItem('cpq_configure_contact_info', JSON.stringify({
                        clientName: newContactInfo.clientName,
                        clientEmail: newContactInfo.clientEmail,
                        company: newContactInfo.company
                      }));
                    } catch (error) {
                      console.warn('Could not save contact info to storage:', error);
                    }
                    
                    // Notify parent component
                    if (onContactInfoChange) {
                      onContactInfoChange({
                        clientName: newContactInfo.clientName,
                        clientEmail: newContactInfo.clientEmail,
                        company: newContactInfo.company,
                        companyName2: newContactInfo.companyName2 || newContactInfo.company
                      });
                    }
                  }}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    const normalized = value.toLowerCase();
                    // Only show error if field is empty or invalid
                    if (!value || normalized === 'not available' || normalized === 'n/a' || normalized === 'na') {
                      setContactValidationErrors(prev => ({ ...prev, company: true }));
                    } else {
                      // Clear error if field has valid value
                      setContactValidationErrors(prev => ({ ...prev, company: false }));
                    }
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 transition-all duration-200 text-sm font-medium ${
                    contactValidationErrors.company
                      ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                      : 'border-gray-200 focus:ring-emerald-500 focus:border-emerald-500'
                  }`}
                  placeholder="Enter company name"
                />
                {contactValidationErrors.company && (
                  <p className="text-xs text-red-600 mt-1 font-semibold flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                    Company Name is required
                  </p>
                )}
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-emerald-100/50 rounded-lg border border-emerald-200">
              <p className="text-xs text-emerald-800">
                <strong>📌 Note:</strong> Edit the contact information above. Changes will be automatically saved and reflected in your quotes and agreements.
              </p>
            </div>
          </div>
        )}


        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Migration Type - Primary Component */}
          <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl shadow-lg border border-teal-200 p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ArrowRight className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Select Migration Type</h3>
              <p className="text-gray-600">Choose your migration type to configure the project requirements</p>
            </div>
            
            <div className="max-w-md mx-auto">
              <label className="flex items-center gap-3 text-lg font-semibold text-gray-800 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center">
                  <ArrowRight className="w-5 h-5 text-white" />
                </div>
                Migration Type
              </label>
              <select
                value={config.migrationType}
                onChange={(e) => {
                  const newMigrationType = e.target.value as 'Messaging' | 'Content' | 'Overage Agreement';
                  console.log(`🔄 Migration type changing from "${config.migrationType}" to "${newMigrationType}"`);
                  
                  // Create new config with updated migration type and cleared combination
                  const newConfig = { 
                    ...config, 
                    migrationType: newMigrationType,
                    combination: '' // Clear combination when migration type changes
                  };
                  
                  // Update state immediately
                  setConfig(newConfig);
                  setCombination('');
                  onConfigurationChange(newConfig);
                  
                  // Persist to sessionStorage
                  try {
                    sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                    const navState = JSON.parse(sessionStorage.getItem('cpq_navigation_state') || '{}');
                    navState.migrationType = newMigrationType;
                    navState.combination = '';
                    sessionStorage.setItem('cpq_navigation_state', JSON.stringify(navState));
                    console.log(`✅ Migration type changed to "${newMigrationType}" and combination cleared`);
                  } catch (error) {
                    console.warn('Could not save to sessionStorage:', error);
                  }
                }}
                className="w-full px-6 py-4 border-2 border-teal-200 rounded-xl focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 transition-all duration-300 bg-white/90 backdrop-blur-sm hover:border-teal-300 text-lg font-medium"
              >
                <option value="">Select Migration Type</option>
                <option value="Messaging">Messaging</option>
                <option value="Content">Content</option>
                <option value="Overage Agreement">Overage</option>
              </select>
            </div>
          </div>

          {/* Template Selection - Show when migration type is selected */}
          {config.migrationType && (
            <div data-section="template-selection" className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl shadow-lg border border-purple-200 p-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Select Combination</h3>
                <p className="text-gray-600">Choose a combination for your {config.migrationType.toLowerCase()} migration quote</p>
              </div>
              
              <div className="max-w-md mx-auto">
                <label className="flex items-center gap-3 text-lg font-semibold text-gray-800 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  Combination
                </label>
                
                {/* Show selection interface if no combination selected, otherwise show selected combination */}
                {!config.combination ? (
                  <>
                    {/* Search Input for Combinations */}
                    <div className="relative mb-4">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400">
                        <Search className="w-5 h-5" />
                      </div>
                      <input
                        type="text"
                        value={combinationSearch}
                        onChange={(e) => setCombinationSearch(e.target.value)}
                        placeholder="Search combinations..."
                        className="w-full pl-12 pr-12 py-3 border-2 border-purple-200 rounded-xl focus:ring-4 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-300 bg-white/90 backdrop-blur-sm hover:border-purple-300 text-base"
                      />
                      {combinationSearch && (
                        <button
                          onClick={() => setCombinationSearch('')}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                          type="button"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      )}
                    </div>

                    {/* Combination must be selected by user */}
                    <select
                      value={config.combination || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setCombination(value);
                        // Clear search when selection is made
                        setCombinationSearch('');
                        // Persist through unified handler to ensure sessionStorage + nav state are updated
                        handleChange('combination', value as any);
                        
                        // Scroll to next section after selection
                        setTimeout(() => {
                          const target = document.querySelector('[data-section="project-configuration"]');
                          if (target) (target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 150);
                      }}
                      className="w-full px-6 py-4 border-2 border-purple-200 rounded-xl focus:ring-4 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-300 bg-white/90 backdrop-blur-sm hover:border-purple-300 text-lg font-medium combination-select-dropdown"
                      size={10}
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#a855f7 #f3e8ff'
                      }}
                    >
                      <option value="">Select Combination</option>
                      {/* Messaging combinations */}
                      {config.migrationType === 'Messaging' && (() => {
                        const messagingCombinations = [
                          { value: 'slack-to-teams', label: 'SLACK TO TEAMS' },
                          { value: 'slack-to-google-chat', label: 'SLACK TO GOOGLE CHAT' }
                        ];
                        
                        const filtered = messagingCombinations.filter(combo => 
                          combo.label.toLowerCase().includes(combinationSearch.toLowerCase())
                        );
                        
                        return filtered.map(combo => (
                          <option key={combo.value} value={combo.value}>{combo.label}</option>
                        ));
                      })()}
                      {/* Content combinations */}
                      {config.migrationType === 'Content' && (() => {
                        const contentCombinations = [
                          { value: 'dropbox-to-google', label: 'DROPBOX TO GOOGLE (SHARED DRIVE/MYDRIVE)' },
                          { value: 'dropbox-to-microsoft', label: 'DROPBOX TO MICROSOFT (ONEDRIVE/SHAREPOINT)' },
                          { value: 'box-to-box', label: 'BOX TO BOX' },
                          { value: 'box-to-microsoft', label: 'BOX TO MICROSOFT (ONEDRIVE/SHAREPOINT)' },
                          { value: 'box-to-google', label: 'BOX TO GOOGLE (SHARED DRIVE/MYDRIVE)' },
                          { value: 'google-sharedrive-to-egnyte', label: 'GOOGLE SHARED DRIVE TO EGNYTE' },
                          { value: 'google-sharedrive-to-google-sharedrive', label: 'GOOGLE SHARED DRIVE TO GOOGLE SHARED DRIVE' },
                          { value: 'google-sharedrive-to-onedrive', label: 'GOOGLE SHARED DRIVE TO ONEDRIVE' },
                          { value: 'google-sharedrive-to-sharepoint', label: 'GOOGLE SHARED DRIVE TO SHAREPOINT' },
                          { value: 'google-mydrive-to-dropbox', label: 'GOOGLE MYDRIVE TO DROPBOX' },
                          { value: 'google-mydrive-to-egnyte', label: 'GOOGLE MYDRIVE TO EGNYTE' },
                          { value: 'google-mydrive-to-onedrive', label: 'GOOGLE MYDRIVE TO ONEDRIVE' },
                         { value: 'google-mydrive-to-sharepoint', label: 'GOOGLE MYDRIVE TO SHAREPOINT' },
                         { value: 'google-mydrive-to-google-sharedrive', label: 'GOOGLE MYDRIVE TO GOOGLE SHARED DRIVE' },
                         { value: 'google-mydrive-to-google-mydrive', label: 'GOOGLE MYDRIVE TO GOOGLE MYDRIVE' },
                         { value: 'sharefile-to-google-mydrive', label: 'SHAREFILE TO GOOGLE MYDRIVE' },
                         { value: 'sharefile-to-google-sharedrive', label: 'SHAREFILE TO GOOGLE SHARED DRIVE' },
                         { value: 'sharefile-to-onedrive', label: 'SHAREFILE TO ONEDRIVE' },
                         { value: 'sharefile-to-sharefile', label: 'SHAREFILE TO SHAREFILE' }
                        ];
                        
                        const filtered = contentCombinations.filter(combo => 
                          combo.label.toLowerCase().includes(combinationSearch.toLowerCase())
                        );
                        
                        return filtered.map(combo => (
                          <option key={combo.value} value={combo.value}>{combo.label}</option>
                        ));
                      })()}
                      {/* Overage Agreement migration type - show only overage agreement combination */}
                      {config.migrationType === 'Overage Agreement' && (() => {
                        const overageCombinations = [
                          { value: 'overage-agreement', label: 'OVERAGE AGREEMENT' }
                        ];

                        const filtered = overageCombinations.filter(combo =>
                          combo.label.toLowerCase().includes(combinationSearch.toLowerCase())
                        );

                        return filtered.map(combo => (
                          <option key={combo.value} value={combo.value}>{combo.label}</option>
                        ));
                      })()}
                    </select>
                    
                    {/* Show filtered count */}
                    {combinationSearch && (
                      <div className="mt-2 text-sm text-purple-600">
                        {(() => {
                          const messagingCombinations = [
                            { value: 'slack-to-teams', label: 'SLACK TO TEAMS' },
                            { value: 'slack-to-google-chat', label: 'SLACK TO GOOGLE CHAT' }
                          ];
                          const contentCombinations = [
                            { value: 'dropbox-to-google', label: 'DROPBOX TO GOOGLE (SHARED DRIVE/MYDRIVE)' },
                            { value: 'dropbox-to-microsoft', label: 'DROPBOX TO MICROSOFT (ONEDRIVE/SHAREPOINT)' },
                            { value: 'box-to-box', label: 'BOX TO BOX' },
                            { value: 'box-to-microsoft', label: 'BOX TO MICROSOFT (ONEDRIVE/SHAREPOINT)' },
                            { value: 'box-to-google', label: 'BOX TO GOOGLE (SHARED DRIVE/MYDRIVE)' },
                            { value: 'google-sharedrive-to-egnyte', label: 'GOOGLE SHARED DRIVE TO EGNYTE' },
                            { value: 'google-sharedrive-to-google-sharedrive', label: 'GOOGLE SHARED DRIVE TO GOOGLE SHARED DRIVE' },
                            { value: 'google-sharedrive-to-onedrive', label: 'GOOGLE SHARED DRIVE TO ONEDRIVE' },
                            { value: 'google-sharedrive-to-sharepoint', label: 'GOOGLE SHARED DRIVE TO SHAREPOINT' },
                            { value: 'google-mydrive-to-dropbox', label: 'GOOGLE MYDRIVE TO DROPBOX' },
                            { value: 'google-mydrive-to-egnyte', label: 'GOOGLE MYDRIVE TO EGNYTE' },
                            { value: 'google-mydrive-to-onedrive', label: 'GOOGLE MYDRIVE TO ONEDRIVE' },
                         { value: 'google-mydrive-to-sharepoint', label: 'GOOGLE MYDRIVE TO SHAREPOINT' },
                         { value: 'google-mydrive-to-google-sharedrive', label: 'GOOGLE MYDRIVE TO GOOGLE SHARED DRIVE' },
                         { value: 'google-mydrive-to-google-mydrive', label: 'GOOGLE MYDRIVE TO GOOGLE MYDRIVE' },
                         { value: 'sharefile-to-google-mydrive', label: 'SHAREFILE TO GOOGLE MYDRIVE' },
                         { value: 'sharefile-to-google-sharedrive', label: 'SHAREFILE TO GOOGLE SHARED DRIVE' },
                         { value: 'sharefile-to-onedrive', label: 'SHAREFILE TO ONEDRIVE' },
                         { value: 'sharefile-to-sharefile', label: 'SHAREFILE TO SHAREFILE' }
                       ];
                       const overageCombinations = [
                         { value: 'overage-agreement', label: 'OVERAGE AGREEMENT' }
                       ];

                          let allCombinations: { value: string; label: string }[] = [];
                          if (config.migrationType === 'Messaging') {
                            allCombinations = messagingCombinations;
                          } else if (config.migrationType === 'Content') {
                            allCombinations = contentCombinations;
                          } else if (config.migrationType === 'Overage Agreement') {
                            allCombinations = overageCombinations;
                          }

                          const filtered = allCombinations.filter(combo => 
                            combo.label.toLowerCase().includes(combinationSearch.toLowerCase())
                          );
                          return `Showing ${filtered.length} of ${allCombinations.length} combinations`;
                        })()}
                      </div>
                    )}
                    
                    <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                      <p className="text-sm text-purple-700">
                        <span>Please select a combination to continue.</span>
                      </p>
                    </div>
                  </>
                ) : (
                  /* Selected combination display - matches Migration Type style */
                  <>
                    <div className="relative">
                      <div className="w-full px-6 py-4 border-2 border-purple-200 rounded-xl bg-white/90 backdrop-blur-sm text-lg font-medium text-gray-900 flex items-center justify-between">
                        <span>{getCombinationLabel(config.combination)}</span>
                        <button
                          type="button"
                          onClick={() => {
                            handleChange('combination', '' as any);
                            setCombination('');
                          }}
                          className="ml-4 px-3 py-1 bg-purple-100 border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors font-medium text-sm"
                        >
                          Change
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                      <p className="text-sm text-purple-700">
                        <span className="block">Templates for this combination will be auto-selected after you choose a plan.</span>
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Other Configuration Fields - Conditional Rendering */}
          {config.migrationType && config.combination && (
            <div data-section="project-configuration" className="bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/50 rounded-2xl shadow-2xl border border-blue-100/50 p-8 backdrop-blur-sm">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Project Configuration</h3>
                <p className="text-gray-600">Configure your {config.migrationType.toLowerCase()} migration requirements</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Number of Users - HIDE for overage agreement */}
            {config.combination !== 'overage-agreement' && (
              <div className="group">
                <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Users className="w-4 h-4 text-white" />
                  </div>
                  Number of Users
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={config.numberOfUsers || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    const numValue = value === '' ? 0 : parseInt(value) || 0;
                    handleChange('numberOfUsers', numValue);
                    setFieldTouched(prev => ({ ...prev, users: true }));
                  }}
                  className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                  placeholder="Enter number of users"
                  autoComplete="off"
                />
              </div>
            )}

            {/* Instance Type */}
            <div className="group">
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                  <Server className="w-4 h-4 text-white" />
                </div>
                Instance Type
              </label>
              <select
                value={config.instanceType}
                onChange={(e) => handleChange('instanceType', e.target.value)}
                className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
              >
                <option value="Small">Small</option>
                <option value="Standard">Standard</option>
                <option value="Large">Large</option>
                <option value="Extra Large">Extra Large</option>
              </select>
            </div>

            {/* Number of Instances */}
            <div className="group">
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                  <Server className="w-4 h-4 text-white" />
                </div>
                Number of Instances
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={config.numberOfInstances || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  const numValue = value === '' ? 0 : parseInt(value) || 0;
                  handleChange('numberOfInstances', numValue);
                  setFieldTouched(prev => ({ ...prev, instances: true }));
                }}
                className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                placeholder="Enter number of instances"
                autoComplete="off"
              />
            </div>

            {/* Duration */}
            <div className="group">
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                  <Clock className="w-4 h-4 text-white" />
                </div>
                Duration of Project in Months
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={config.duration || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  const numValue = value === '' ? 0 : parseInt(value) || 0;
                  handleChange('duration', numValue);
                  setFieldTouched(prev => ({ ...prev, duration: true }));
                }}
                className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                placeholder="Enter project duration"
                autoComplete="off"
              />
            </div>

            {/* Start Date - MOVED to Quote session (Contact Information section) */}
            {/* The Project Start Date field has been moved to the Quote session above the Effective Date field */}
            {/* This ensures better user experience while maintaining all functionality */}

            {/* End Date - Calculated field - HIDDEN from UI but still calculated in background */}
            {/* The end date is still calculated automatically in the useEffect hook above */}
            {/* This ensures {{End_date}} token works in templates without showing the field to users */}
            {false && (
              <div className="group">
                <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Calendar className="w-4 h-4 text-white" />
                  </div>
                  Project End Date
                </label>
                <input
                  type="date"
                  value={config.endDate || ''}
                  readOnly
                  className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl bg-gray-50 text-lg font-medium cursor-not-allowed"
                  placeholder="Calculated automatically"
                  autoComplete="off"
                />
                <p className="text-xs text-gray-500 mt-2">Calculated based on start date and duration</p>
              </div>
            )}

                {/* Data Size - Show for Content, Hide for Messaging and overage agreement */}
                {config.migrationType === 'Content' && config.combination !== 'overage-agreement' && (
                  <div className="group md:col-span-2">
                    <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                        <Database className="w-4 h-4 text-white" />
                      </div>
                      Data Size GB ({config.migrationType})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={config.dataSizeGB || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        const numValue = value === '' ? 0 : parseInt(value) || 0;
                        handleChange('dataSizeGB', numValue);
                        setFieldTouched(prev => ({ ...prev, dataSize: true }));
                      }}
                      className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                      placeholder={`Enter data size in GB for ${config.migrationType} migration`}
                      autoComplete="off"
                    />
                  </div>
                )}

                {/* Discount - now visible in UI */}
                <div className="group">
                  <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-rose-600 rounded-lg flex items-center justify-center">
                      <Percent className="w-4 h-4 text-white" />
                    </div>
                    Discount (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    step={0.01}
                    value={discountValue}
                    onChange={(e) => {
                      const raw = e.target.value;
                      
                      // Allow empty value for clearing
                      if (raw === '') {
                        setDiscountValue('');
                        try { 
                          localStorage.setItem('cpq_discount', '');
                          window.dispatchEvent(new CustomEvent('discountUpdated'));
                        } catch {}
                        return;
                      }
                      
                      const numValue = Number(raw);
                      
                      // Check if value exceeds 15%
                      if (numValue > 15) {
                        alert('Discount cannot be more than 15%');
                        return; // Don't update the value
                      }
                      
                      // Ensure value is not negative
                      if (numValue < 0) {
                        setDiscountValue('0');
                        try { 
                          sessionStorage.setItem('cpq_discount_session', '0');
                          window.dispatchEvent(new CustomEvent('discountUpdated'));
                        } catch {}
                        return;
                      }
                      
                      // Update the display value immediately
                      setDiscountValue(raw);
                      
                      // Save to sessionStorage and notify other components
                      try { 
                        sessionStorage.setItem('cpq_discount_session', raw);
                        window.dispatchEvent(new CustomEvent('discountUpdated'));
                      } catch {}
                    }}
                   className="w-full px-5 py-4 border-2 rounded-xl focus:ring-4 transition-all duration-300 bg-white/80 backdrop-blur-sm text-lg font-medium border-gray-200 focus:ring-blue-500/20 focus:border-blue-500 hover:border-blue-300"
                   placeholder={`Enter discount percentage (max 15%)`}
                  />
                  <p className="text-xs text-gray-500 mt-2">Discount is available only for projects above $2,500 and capped at 15%.</p>
                </div>

                {/* Messages Field - Show for Messaging, Hide for Content and overage agreement */}
                {config.migrationType === 'Messaging' && config.combination !== 'overage-agreement' && (
                  <div className="group">
                    <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                        <MessageSquare className="w-4 h-4 text-white" />
                      </div>
                      Messages
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={config.messages || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        const numValue = value === '' ? 0 : parseInt(value) || 0;
                        handleChange('messages', numValue);
                        setFieldTouched(prev => ({ ...prev, messages: true }));
                      }}
                      className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                      placeholder="Enter number of messages"
                      autoComplete="off"
                    />
                    <p className="text-xs text-gray-500 mt-2">Number of messages for the migration.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Calculate Pricing Button - Show only after combination is selected */}
          {config.migrationType && config.combination && (
            <>
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white py-5 px-8 rounded-2xl font-bold text-lg hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 transition-all duration-500 transform hover:scale-105 hover:shadow-2xl shadow-xl relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <span className="relative flex items-center justify-center gap-3">
                  <Calculator className="w-5 h-5" />
                  Calculate Pricing
                  <Sparkles className="w-5 h-5" />
                </span>
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default ConfigurationForm;