import React, { useState, useEffect } from 'react';
import { ConfigurationData } from '../types/pricing';
import { Calculator, Users, Server, Clock, Database, ArrowRight, Sparkles, UserCheck, FileText, Percent, MessageSquare, Calendar } from 'lucide-react';
import { sanitizeNameInput, sanitizeEmailInput, sanitizeCompanyInput } from '../utils/emojiSanitizer';

interface DealData {
  dealId: string;
  dealName: string;
  amount: string;
  closeDate?: string;
  stage?: string;
  ownerId?: string;
  company?: string;
  companyByContact?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactJobTitle?: string;
  companyDomain?: string;
  companyPhone?: string;
  companyAddress?: string;
}

interface Template {
  id: string;
  name: string;
  description?: string;
  file?: File;
  uploadDate?: Date;
  isDefault?: boolean;
}

interface ConfigurationFormProps {
  onConfigurationChange: (config: ConfigurationData) => void;
  onSubmit: () => void;
  dealData?: DealData | null;
  onContactInfoChange?: (contactInfo: { clientName: string; clientEmail: string; company: string }) => void;
  templates?: Template[];
  selectedTemplate?: Template | null;
  onTemplateSelect?: (template: Template | null) => void;
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

  // Contact information state
  const [contactInfo, setContactInfo] = useState({
    clientName: '',
    clientEmail: '',
    company: '',
    companyName2: ''
  });

  // Track if this is the initial load vs navigation return
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Discount state for proper display
  const [discountValue, setDiscountValue] = useState<string>('');
  // Combination selection state
  const [combination, setCombination] = useState<string>('');

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

  // Helper function to limit consecutive spaces to maximum 5
  const limitConsecutiveSpaces = (value: string, maxSpaces: number = 5): string => {
    // Replace any sequence of more than maxSpaces spaces with exactly maxSpaces spaces
    const spaceRegex = new RegExp(`\\s{${maxSpaces + 1},}`, 'g');
    return value.replace(spaceRegex, ' '.repeat(maxSpaces));
  };

  // Helper function to sanitize Contact Name input (remove special characters and emojis)
  const sanitizeContactName = (value: string): string => {
    // Remove special characters, emojis, and keep only letters, spaces, hyphens, apostrophes, and periods
    return value.replace(/[^a-zA-Z\s\-'\.]/g, '');
  };

  // Helper function to sanitize Contact Email input (remove emojis and special characters)
  const sanitizeContactEmail = (value: string): string => {
    // Remove emojis and special characters, keep only valid email characters
    return value.replace(/[^\w@\.\-]/g, '');
  };

  // Initialize contact info from deal data
  useEffect(() => {
    // Load previously saved configuration from sessionStorage (only for current session)
    // This ensures project configuration fields are empty on page refresh but retained during navigation
    try {
      const savedConfig = sessionStorage.getItem('cpq_configuration_session');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        const merged = {
          numberOfUsers: typeof parsed.numberOfUsers === 'number' ? parsed.numberOfUsers : 0,
          instanceType: parsed.instanceType || 'Small',
          numberOfInstances: typeof parsed.numberOfInstances === 'number' ? parsed.numberOfInstances : 0,
          duration: typeof parsed.duration === 'number' ? parsed.duration : 0,
          migrationType: parsed.migrationType || ('' as any),
          dataSizeGB: typeof parsed.dataSizeGB === 'number' ? parsed.dataSizeGB : 0,
          messages: typeof parsed.messages === 'number' ? parsed.messages : 0,
          combination: '' // Always start with empty combination, let user choose
        } as ConfigurationData;
        setConfig(merged);
        onConfigurationChange(merged);
        console.log('📋 Loaded project configuration from session storage');
      } else {
        console.log('📋 No session configuration found, starting with empty project configuration fields');
      }
    } catch (error) {
      console.log('📋 Error loading session configuration, starting with empty fields:', error);
    }

    // Load persisted contact info if available (user may have edited manually earlier)
    let savedContactInfo = null;
    try {
      const savedContact = localStorage.getItem('cpq_contact_info');
      if (savedContact) {
        savedContactInfo = JSON.parse(savedContact);
      }
    } catch {}

    // Initialize contact info with smart priority logic
    let finalContactInfo = {
      clientName: '',
      clientEmail: '',
      company: '',
      companyName2: ''
    };

    // Check if user has saved contact info (indicating they've made manual edits)
    const hasUserEdits = savedContactInfo && (
      (savedContactInfo.clientName && savedContactInfo.clientName !== 'Not Available') ||
      (savedContactInfo.clientEmail && savedContactInfo.clientEmail !== 'Not Available') ||
      (savedContactInfo.company && savedContactInfo.company !== 'Not Available') ||
      (savedContactInfo.companyName2 && savedContactInfo.companyName2 !== 'Not Available')
    );

    // If user has made edits, ALWAYS prioritize their edits (even over deal data)
    if (hasUserEdits) {
      finalContactInfo = {
        clientName: savedContactInfo.clientName || '',
        clientEmail: savedContactInfo.clientEmail || '',
        company: savedContactInfo.company || '',
        companyName2: savedContactInfo.companyName2 || ''
      };
      console.log('✅ ConfigurationForm: Using saved contact info (user edits preserved):', finalContactInfo);
    }
    // If no user edits, use deal data if available
    else if (dealData) {
      finalContactInfo = {
        clientName: dealData.contactName || '',
        clientEmail: dealData.contactEmail || '',
        company: dealData.company || '',
        companyName2: getEffectiveCompanyName(dealData.companyByContact, dealData.contactEmail)
      };
      console.log('🔍 ConfigurationForm: Using deal data (no user edits):', finalContactInfo);
      console.log('🏢 Company extraction applied:', {
        original: dealData.companyByContact,
        email: dealData.contactEmail,
        extracted: finalContactInfo.companyName2
      });
    }
    // Otherwise, start with empty values
    else {
      console.log('🔍 ConfigurationForm: Starting with empty contact info (no deal data or user edits)');
    }

    // Mark that we've completed the initial load
    setIsInitialLoad(false);

    // Set the final contact info
    setContactInfo(finalContactInfo);
    
    // Notify parent component of final contact info
    if (onContactInfoChange) {
      const parentContactInfo = {
        clientName: finalContactInfo.clientName,
        clientEmail: finalContactInfo.clientEmail,
        company: finalContactInfo.companyName2 || finalContactInfo.company || ''
      };
      console.log('✅ ConfigurationForm: Notifying parent of final contact info:', parentContactInfo);
      onContactInfoChange(parentContactInfo);
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

  // Load saved combination from localStorage only when component mounts, but don't auto-update config
  useEffect(() => {
    try {
      const savedCombo = localStorage.getItem('cpq_combination');
      if (savedCombo && savedCombo !== '') {
        setCombination(savedCombo);
        console.log('🔧 ConfigurationForm: Loaded combination from localStorage into local state:', savedCombo);
      } else {
        setCombination('');
        console.log('🔧 ConfigurationForm: No saved combination found, keeping empty');
      }
    } catch (error) {
      console.error('Error loading combination from localStorage:', error);
    }
  }, []); // Run only once on mount

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
    try { sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig)); } catch {}
    
    // Auto-scroll down when migration type is selected, but only if we have a target section
    if (field === 'migrationType' && value) {
      setTimeout(() => {
        const target = document.querySelector('[data-section="template-selection"]')
          || document.querySelector('[data-section="project-configuration"]');
        if (target) {
          (target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
    }
  };

  const handleContactChange = (field: keyof typeof contactInfo, value: string) => {
    // Apply sanitization and space limitation for clientName field
    let processedValue = value;
    if (field === 'clientName') {
      processedValue = sanitizeNameInput(value);
      processedValue = limitConsecutiveSpaces(processedValue);
    } else if (field === 'clientEmail') {
      processedValue = sanitizeEmailInput(value);
    } else if (field === 'companyName2') {
      processedValue = sanitizeCompanyInput(value);
    }
    
    const newContactInfo = {
      ...contactInfo,
      [field]: processedValue
    };
    console.log('🔍 ConfigurationForm: Contact info changed:', { field, value: processedValue, newContactInfo });
    setContactInfo(newContactInfo);
    // Persist contact info
    try { localStorage.setItem('cpq_contact_info', JSON.stringify(newContactInfo)); } catch {}
    
    // Notify parent component of contact info changes
    if (onContactInfoChange) {
      // Map the internal structure to the expected parent structure
      // Use companyName2 if available, otherwise use company field
      const parentContactInfo = {
        clientName: newContactInfo.clientName,
        clientEmail: newContactInfo.clientEmail,
        company: newContactInfo.companyName2 || newContactInfo.company || ''
      };
      console.log('✅ ConfigurationForm: Notifying parent of contact info change:', parentContactInfo);
      onContactInfoChange(parentContactInfo);
    } else {
      console.log('⚠️ ConfigurationForm: No onContactInfoChange callback available');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate contact information first
    const hasInvalidContactInfo = 
      contactInfo.clientName === 'Not Available' || 
      contactInfo.clientEmail === 'Not Available' || 
      contactInfo.companyName2 === 'Not Available' ||
      !contactInfo.clientName.trim() ||
      !contactInfo.clientEmail.trim() ||
      !contactInfo.companyName2.trim();
    
    if (hasInvalidContactInfo) {
      alert('All contact information should be filled. Please update any fields showing "Not Available" or empty fields, including the required Legal Entity Name, before proceeding.');
      return;
    }
    
    // Validate that all required fields have valid values (minimum 1)
    if (config.numberOfUsers < 1) {
      alert('Please enter a valid number of users (minimum 1)');
      return;
    }
    if (config.numberOfInstances < 1) {
      alert('Please enter a valid number of instances (minimum 1)');
      return;
    }
    if (config.duration < 1) {
      alert('Please enter a valid project duration (minimum 1 month)');
      return;
    }
    if (config.migrationType !== 'Messaging' && config.dataSizeGB < 1) {
      alert('Please enter a valid data size (minimum 1 GB)');
      return;
    }
    
    onSubmit();
    
    // Auto-scroll down after calculating pricing to show results
    setTimeout(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'smooth'
      });
    }, 200); // Slightly longer delay to ensure pricing results are rendered
  };

  return (
    <div className="space-y-8">

      {/* Configuration Form */}
      <div className="bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/50 rounded-2xl shadow-2xl border border-blue-100/50 p-8 backdrop-blur-sm">
        <div className="flex items-center gap-4 mb-8">
          <div className="relative">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <Calculator className="w-6 h-6 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
              <Sparkles className="w-2 h-2 text-white" />
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent">
              {dealData ? 'CONFIGURE PROJECT' : 'FILL DETAILS HERE'}
            </h2>
            <p className="text-gray-600 mt-1">
              {dealData 
                ? `Configure project requirements for deal: ${dealData.dealName}`
                : 'Configure your project requirements to get accurate pricing'
              }
            </p>
          </div>
        </div>

        {/* Client Information Section - Auto-filled from HubSpot */}
        {dealData && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl shadow-lg border border-green-200 p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                  <UserCheck className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-800">Contact Information</h3>
                  <p className="text-sm text-gray-600">Auto-filled from HubSpot deal data</p>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Contact Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Contact Name</label>
                <input
                  type="text"
                  value={contactInfo.clientName}
                  onChange={(e) => handleContactChange('clientName', e.target.value)}
                  className={`w-full px-4 py-3 bg-white border-2 rounded-lg text-gray-800 font-medium focus:outline-none focus:ring-2 transition-colors ${
                    contactInfo.clientName === 'Not Available' || !contactInfo.clientName.trim()
                      ? 'border-red-300 focus:border-red-400 focus:ring-red-100' 
                      : 'border-green-200 focus:border-green-400 focus:ring-green-100'
                  }`}
                  placeholder="Enter contact name"
                  maxLength={35}
                />
              </div>
              
              {/* Contact Email */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Contact Email</label>
                <input
                  type="email"
                  value={contactInfo.clientEmail}
                  onChange={(e) => handleContactChange('clientEmail', e.target.value)}
                  className={`w-full px-4 py-3 bg-white border-2 rounded-lg text-gray-800 font-medium focus:outline-none focus:ring-2 transition-colors ${
                    contactInfo.clientEmail === 'Not Available' || !contactInfo.clientEmail.trim()
                      ? 'border-red-300 focus:border-red-400 focus:ring-red-100' 
                      : 'border-green-200 focus:border-green-400 focus:ring-green-100'
                  }`}
                  placeholder="Enter contact email"
                />
              </div>
              
              {/* Legal Entity Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Legal Entity Name*</label>
                <input
                  type="text"
                  value={contactInfo.companyName2}
                  onChange={(e) => handleContactChange('companyName2', e.target.value)}
                  className={`w-full px-4 py-3 bg-white border-2 rounded-lg text-gray-800 font-medium focus:outline-none focus:ring-2 transition-colors ${
                    contactInfo.companyName2 === 'Not Available' || !contactInfo.companyName2.trim()
                      ? 'border-red-300 focus:border-red-400 focus:ring-red-100' 
                      : 'border-green-200 focus:border-green-400 focus:ring-green-100'
                  }`}
                  placeholder="Enter legal entity name"
                  maxLength={35}
                />
              </div>
            </div>
            
            {/* Warning message for incomplete contact information */}
            {(contactInfo.clientName === 'Not Available' || 
              contactInfo.clientEmail === 'Not Available' || 
              contactInfo.companyName2 === 'Not Available' ||
              !contactInfo.clientName.trim() ||
              !contactInfo.clientEmail.trim() ||
              !contactInfo.companyName2.trim()) && (
               <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                 <p className="text-sm text-red-700 font-medium">
                   ⚠️ <strong>Action Required:</strong> All contact information fields must be completed before proceeding to plan selection. 
                   Please update any fields showing "Not Available" or empty fields, including the required Legal Entity Name.
                 </p>
               </div>
            )}
            
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
                onChange={(e) => handleChange('migrationType', e.target.value as 'Messaging')}
                className="w-full px-6 py-4 border-2 border-teal-200 rounded-xl focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 transition-all duration-300 bg-white/90 backdrop-blur-sm hover:border-teal-300 text-lg font-medium"
              >
                <option value="">Select Migration Type</option>
                <option value="Messaging">Messaging</option>
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
                {/* Combination must be selected by user */}
                <select
                  value={combination}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCombination(value);
                    try { localStorage.setItem('cpq_combination', value); } catch {}
                    
                    // Update configuration with new combination
                    const newConfig = { ...config, combination: value };
                    console.log('🔧 ConfigurationForm: Combination changed:', {
                      oldCombination: config.combination,
                      newCombination: value,
                      newConfig: newConfig
                    });
                    setConfig(newConfig);
                    onConfigurationChange(newConfig);
                    
                    // Scroll to next section after selection
                    setTimeout(() => {
                      const target = document.querySelector('[data-section="project-configuration"]');
                      if (target) (target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 150);
                  }}
                  className="w-full px-6 py-4 border-2 border-purple-200 rounded-xl focus:ring-4 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-300 bg-white/90 backdrop-blur-sm hover:border-purple-300 text-lg font-medium"
                >
                  <option value="">Select Combination</option>
                  <option value="slack-to-teams">SLACK TO TEAMS</option>
                  <option value="slack-to-google-chat">SLACK TO GOOGLE CHAT</option>
                </select>
                <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <p className="text-sm text-purple-700">
                    {combination ? (
                      <>
                        <strong>Selected:</strong> {combination.replace(/-/g, ' ').toUpperCase()}
                        <span className="block mt-1 text-purple-600">Templates for this combination will be auto-selected after you choose a plan.</span>
                      </>
                    ) : (
                      <span>Please select a combination to continue.</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Other Configuration Fields - Conditional Rendering */}
          {config.migrationType && combination && (
            <div data-section="project-configuration" className="bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/50 rounded-2xl shadow-2xl border border-blue-100/50 p-8 backdrop-blur-sm">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Project Configuration</h3>
                <p className="text-gray-600">Configure your {config.migrationType.toLowerCase()} migration requirements</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Number of Users */}
            <div className="group">
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                  <Users className="w-4 h-4 text-white" />
                </div>
                Number of Users
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={config.numberOfUsers || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  const numValue = value === '' ? 0 : parseInt(value) || 0;
                  handleChange('numberOfUsers', numValue);
                }}
                className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                placeholder="Enter number of users"
                autoComplete="off"
              />
            </div>

            {/* Instance Type */}
            <div className="group">
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                  <Server className="w-4 h-4 text-white" />
                </div>
                Instance Type
              </label>
              <select
                value={config.instanceType}
                onChange={(e) => handleChange('instanceType', e.target.value as 'Small' | 'Standard' | 'Large' | 'Extra Large')}
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
                min="1"
                step="1"
                value={config.numberOfInstances || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  const numValue = value === '' ? 0 : parseInt(value) || 0;
                  handleChange('numberOfInstances', numValue);
                }}
                className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                placeholder="Enter number of instances"
                autoComplete="off"
              />
            </div>

            {/* Duration */}
            <div className="group">
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
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

                {/* Data Size - Hide for Messaging migration type */}
                {config.migrationType !== 'Messaging' && (
                  <div className="group md:col-span-2">
                    <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                        <Database className="w-4 h-4 text-white" />
                      </div>
                      Data Size GB ({config.migrationType})
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={config.dataSizeGB || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        const numValue = value === '' ? 0 : parseInt(value) || 0;
                        handleChange('dataSizeGB', numValue);
                      }}
                      className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                      placeholder={`Enter data size in GB for ${config.migrationType} migration`}
                      autoComplete="off"
                    />
                  </div>
                )}

                {/* Discount and Messages Fields side by side */}
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
                    max={10}
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
                      
                      // Check if value exceeds 10%
                      if (numValue > 10) {
                        alert('Discount cannot be more than 10%');
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
                    placeholder={`Enter discount percentage (max 10%)`}
                  />
                  <p className="text-xs text-gray-500 mt-2">Discount is available only for projects above $2,500 and capped at 10%.</p>
                </div>

                {/* Messages Field */}
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
                    }}
                    className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                    placeholder="Enter number of messages"
                    autoComplete="off"
                  />
                  <p className="text-xs text-gray-500 mt-2">Number of messages for the migration.</p>
                </div>
              </div>
            </div>
          )}

          {/* Calculate Pricing Button - Show only after combination is selected */}
          {config.migrationType && combination && (
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