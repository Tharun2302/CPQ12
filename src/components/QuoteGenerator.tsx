import React, { useState, useEffect, useRef } from 'react';
import { PricingCalculation, ConfigurationData, Quote } from '../types/pricing';
import { formatCurrency } from '../utils/pricing';
import { 
  FileText, 
  Download, 
  Send, 
  User, 
  Mail, 
  Building, 
  CheckCircle, 
  Users, 
  Sparkles,
  Eye,
  Briefcase,
  Calendar
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { convertDocxToPdfLight, downloadBlob } from '../utils/docxToPdfLight';
import { convertDocxToPdfExact } from '../utils/docxToPdfExact';

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
}

interface QuoteGeneratorProps {
  calculation: PricingCalculation;
  configuration: ConfigurationData;
  onGenerateQuote: (quote: Quote) => void;
  hubspotState?: {
    isConnected: boolean;
    hubspotContacts: any[];
    selectedContact: any;
  };
  onSelectHubSpotContact?: (contact: any) => void;
  companyInfo?: {
    name: string;
    address: string;
    city: string;
    email: string;
    phone: string;
  };
  selectedTemplate?: any;
  onClientInfoChange?: (clientInfo: ClientInfo) => void;
  dealData?: DealData | null;
  configureContactInfo?: {
    clientName: string;
    clientEmail: string;
    company: string;
  } | null;
}

interface ClientInfo {
  clientName: string;
  clientEmail: string;
  company: string;
  effectiveDate?: string;
  discount?: number;
}

const QuoteGenerator: React.FC<QuoteGeneratorProps> = ({
  calculation,
  configuration,
  onGenerateQuote,
  hubspotState,
  onSelectHubSpotContact,
  companyInfo,
  selectedTemplate,
  onClientInfoChange,
  dealData,
  configureContactInfo
}) => {
  // Reduced logging for performance
  if (!calculation) {
    console.log('🔍 QuoteGenerator render - calculation is null/undefined');
  }
  
  // Create a fallback calculation if none exists
  const safeCalculation = calculation || {
    userCost: 0,
    dataCost: 0,
    migrationCost: 0,
    instanceCost: 0,
    totalCost: 0,
    tier: {
      id: 'default',
      name: 'Basic' as const,
      perUserCost: 30.0,
      perGBCost: 1.00,
      managedMigrationCost: 300,
      instanceCost: 500,
      userLimits: { from: 1, to: 1000 },
      gbLimits: { from: 1, to: 10000 },
      features: ['Basic support', 'Standard migration', 'Email support', 'Basic reporting']
    }
  };

  // Safety check - if calculation is undefined, show warning but continue
  if (!calculation) {
    console.warn('⚠️ QuoteGenerator: calculation is undefined, using fallback');
    console.warn('⚠️ QuoteGenerator: calculation value:', calculation);
    console.warn('⚠️ QuoteGenerator: configuration value:', configuration);
  }
  const [clientInfo, setClientInfo] = useState<ClientInfo>({
    clientName: '',
    clientEmail: '',
    company: '',
    effectiveDate: '',
    discount: undefined
  });

  // Read discount entered in Configure session
  useEffect(() => {
    const loadDiscount = () => {
      try {
        const saved = localStorage.getItem('cpq_discount');
        if (saved !== null && saved !== '' && !isNaN(Number(saved))) {
          const val = Number(saved);
          setClientInfo(prev => ({ ...prev, discount: val }));
        } else {
          // Clear discount if empty
          setClientInfo(prev => ({ ...prev, discount: undefined }));
        }
      } catch {
        setClientInfo(prev => ({ ...prev, discount: undefined }));
      }
    };

    // Load initial discount
    loadDiscount();

    // Listen for storage events (changes from other components)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'cpq_discount') {
        loadDiscount();
      }
    };

    // Listen for custom events (immediate updates from same page)
    const handleDiscountUpdate = () => {
      loadDiscount();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('discountUpdated', handleDiscountUpdate);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('discountUpdated', handleDiscountUpdate);
    };
  }, []);

  // Persist and restore Quote session client inputs so they remain across navigation
  useEffect(() => {
    // Load client info from storage on mount
    try {
      const saved = localStorage.getItem('cpq_quote_client_info');
      if (saved) {
        const parsed = JSON.parse(saved);
        setClientInfo((prev) => ({
          ...prev,
          clientName: parsed.clientName || '',
          clientEmail: parsed.clientEmail || '',
          company: parsed.company || '',
          effectiveDate: parsed.effectiveDate || ''
        }));
      }
    } catch {}
  }, []);

  const [showPreview, setShowPreview] = useState(false);
  
  // Add debugging to track discount changes
  useEffect(() => {
    console.log('🔍 Discount changed in QuoteGenerator:', {
      clientInfoDiscount: clientInfo.discount,
      discountPercent: clientInfo.discount ?? 0,
      totalCost: calculation?.totalCost ?? safeCalculation.totalCost,
      showPreview
    });
  }, [clientInfo.discount, showPreview]);
  const [showContactSelector, setShowContactSelector] = useState(false);
  const [quoteId, setQuoteId] = useState<string>('');
  const [isSendingToDealDesk, setIsSendingToDealDesk] = useState(false);
  const [isEmailingAgreement, setIsEmailingAgreement] = useState(false);
  
  // Calculate discount logic - source discount primarily from Configure session (localStorage)
  const totalCost = calculation?.totalCost ?? safeCalculation.totalCost;
  // Read latest discount from localStorage as the source of truth, fallback to state
  const storedDiscountPercent = (() => {
    try {
      const raw = localStorage.getItem('cpq_discount');
      return raw !== null && raw !== '' && !isNaN(Number(raw)) ? Number(raw) : undefined;
    } catch {
      return undefined;
    }
  })();
  const discountPercent = (clientInfo.discount ?? storedDiscountPercent ?? 0);
  
  // Allow discount only when total project cost exceeds $2500
  const isDiscountAllowed = totalCost >= 2500;
  
  // Check if user has entered a valid discount
  const hasValidDiscount = discountPercent > 0 && discountPercent <= 10;
  
  // Calculate final total after discount
  const discountAmount = hasValidDiscount ? totalCost * (discountPercent / 100) : 0;
  const finalTotalAfterDiscount = totalCost - discountAmount;
  
  // Check if discount would bring total below $2500 - if so, don't apply
  const isDiscountValid = hasValidDiscount ? finalTotalAfterDiscount >= 2500 : true;
  
  // Should we show and apply the discount?
  const shouldApplyDiscount = isDiscountAllowed && hasValidDiscount && isDiscountValid;
  
  


  // Generate unique quote ID
  const generateUniqueQuoteId = (): string => {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `Q-${timestamp.slice(-6)}-${random}`;
  };

  // Helper function to update client info and notify parent
  const updateClientInfo = (updates: Partial<ClientInfo>) => {
    const newClientInfo = { ...clientInfo, ...updates };
    setClientInfo(newClientInfo);
    // Persist to localStorage so the Quote session remains sticky
    try { localStorage.setItem('cpq_quote_client_info', JSON.stringify(newClientInfo)); } catch {}
    
    // Only notify parent when user makes actual changes (not during auto-fill)
    if (onClientInfoChange && (updates.clientName || updates.clientEmail || updates.company || updates.effectiveDate || updates.discount !== undefined)) {
      onClientInfoChange(newClientInfo);
    }
  };

  // Generate quote ID once when component mounts
  useEffect(() => {
    if (!quoteId) {
      setQuoteId(generateUniqueQuoteId());
    }
  }, []); // Empty dependency array - run only once
  const [showPlaceholderPreview, setShowPlaceholderPreview] = useState(false);
  const [placeholderPreviewData, setPlaceholderPreviewData] = useState<{
    originalText: string;
    replacedText: string;
    placeholders: Array<{placeholder: string, value: string}>;
  } | null>(null);

  // Agreement preview state
  const [processedAgreement, setProcessedAgreement] = useState<Blob | null>(null);
  const [showAgreementPreview, setShowAgreementPreview] = useState(false);
  const [isGeneratingAgreement, setIsGeneratingAgreement] = useState(false);
  const [showInlinePreview, setShowInlinePreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  const ensureDocxPreviewStylesInjected = () => {
    const existing = document.getElementById('docx-preview-css');
    if (existing) return;
    const link = document.createElement('link');
    link.id = 'docx-preview-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/docx-preview@0.4.1/dist/docx-preview.css';
    document.head.appendChild(link);
  };

  const delayFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const renderDocxPreview = async (blob: Blob) => {
    try {
      // Validate blob before processing
      if (!blob || blob.size === 0) {
        throw new Error('Document blob is empty or invalid');
      }
      
      console.log('📄 Rendering DOCX preview, blob size:', blob.size, 'bytes, type:', blob.type);
      
      // Check if blob has valid ZIP signature
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      if (uint8Array.length < 4 || uint8Array[0] !== 0x50 || uint8Array[1] !== 0x4B) {
        throw new Error('Document is not a valid ZIP/DOCX file (missing ZIP signature)');
      }
      
      ensureDocxPreviewStylesInjected();
      // @ts-ignore - resolved at runtime; types provided via ambient declaration
      const { renderAsync } = await import('docx-preview');
      
      // Ensure container exists in DOM
      setShowInlinePreview(true);
      await delayFrame();
      
      // Wait for container to be available
      let attempts = 0;
      while (!previewContainerRef.current && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (!previewContainerRef.current) {
        throw new Error('Preview container not available after waiting');
      }
      
      previewContainerRef.current.innerHTML = '';
      
      await renderAsync(arrayBuffer, previewContainerRef.current as HTMLElement, undefined, {
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        className: 'docx',
        debug: false
      } as any);
      setPreviewUrl(null);
      console.log('✅ DOCX rendered with docx-preview');
    } catch (err) {
      console.warn('⚠️ docx-preview failed, falling back to HTML conversion via mammoth.', err);
      try {
        const mammoth = await import('mammoth');
        const arrayBuffer = await blob.arrayBuffer();
        
        // Validate arrayBuffer for mammoth
        if (arrayBuffer.byteLength === 0) {
          throw new Error('Document arrayBuffer is empty');
        }
        
        const result = await mammoth.convertToHtml({ arrayBuffer } as any);
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Document Preview</title></head><body>${result.value}</body></html>`;
        const htmlBlob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(htmlBlob);
        setPreviewUrl(url);
        setShowInlinePreview(true);
        console.log('✅ DOCX converted to HTML with mammoth');
      } catch (fallbackErr) {
        console.error('❌ HTML fallback also failed:', fallbackErr);
        // Show error message to user
        if (previewContainerRef.current) {
          previewContainerRef.current.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #666;">
              <h3>Document Preview Unavailable</h3>
              <p>The document could not be previewed due to formatting issues.</p>
              <p>You can still download the document using the buttons below.</p>
            </div>
          `;
        }
      }
    }
  };

  // Auto-populate client info from configure session (HIGHEST PRIORITY)
  useEffect(() => {
    console.log('🔍 QuoteGenerator: configureContactInfo changed:', configureContactInfo);
    if (configureContactInfo) {
      console.log('✅ HIGHEST PRIORITY: Auto-filling client info from configure session:', configureContactInfo);
      setClientInfo(configureContactInfo);
    } else {
      console.log('⚠️ No configureContactInfo available, will use HubSpot or default');
    }
  }, [configureContactInfo]);

  // Auto-populate client info when HubSpot contact is selected (only if no configure contact info)
  useEffect(() => {
    if (hubspotState?.selectedContact && !configureContactInfo) {
      const contact = hubspotState.selectedContact;
      console.log('🔍 Auto-filling client info from HubSpot contact:', contact);
      console.log('📄 Contact properties:', contact.properties);
      
      // Extract company name from email domain if company field is not available
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
      
      const newClientInfo = {
        clientName: `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim(),
        clientEmail: contact.properties.email || '',
        company: contact.properties.company || extractCompanyFromEmail(contact.properties.email || '')
      };
      
      console.log('✅ New client info to set:', newClientInfo);
      console.log('🏢 Company source:', contact.properties.company ? 'HubSpot company field' : 'Email domain extraction');
      setClientInfo(newClientInfo);
    }
  }, [hubspotState?.selectedContact, configureContactInfo]);

  // Clear client info when HubSpot is disconnected
  useEffect(() => {
    if (!hubspotState?.isConnected) {
      setClientInfo({
        clientName: '',
        clientEmail: '',
        company: '',
        effectiveDate: ''
      });
    }
  }, [hubspotState?.isConnected]);

  // Auto-populate client info from deal data (only if no configure contact info)
  useEffect(() => {
    if (dealData && !hubspotState?.selectedContact && !configureContactInfo) {
      console.log('🔍 Auto-filling client info from deal data:', dealData);
      
      const newClientInfo = {
        clientName: dealData.contactName || dealData.dealName || '',
        clientEmail: dealData.contactEmail || '',
        company: dealData.companyByContact || dealData.company || dealData.dealName.split(' ')[0] + ' Inc.'
      };
      
      console.log('✅ New client info from deal data:', newClientInfo);
      setClientInfo(newClientInfo);
    } else if (configureContactInfo) {
      console.log('⏭️ Skipping deal data auto-fill - configureContactInfo has priority');
    }
  }, [dealData, hubspotState?.selectedContact, configureContactInfo]);

  // REMOVED: useEffect that was causing infinite loop by calling onClientInfoChange on every render
  // onClientInfoChange will be called only when user makes actual changes to client info

  // REMOVED: Duplicate useEffect that was causing infinite loop

  // Debug logging removed to prevent console spam

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
            Please ensure you have selected a pricing tier and configuration before generating a quote.
          </p>
        </div>
      </div>
    );
  }

  const handleSendToDealDesk = async () => {
    // Validate discount is not more than 10%
    if (clientInfo.discount && clientInfo.discount > 10) {
      alert('Discount cannot be more than 10%. Please adjust the discount value.');
      return;
    }
    
    // Validate discount doesn't bring total below $2500
    if (clientInfo.discount && clientInfo.discount > 0) {
      const finalTotal = (calculation?.totalCost ?? safeCalculation.totalCost) * (1 - (clientInfo.discount / 100));
      if (finalTotal < 2500) {
        alert(`Discount cannot be applied. Final total would be $${finalTotal.toFixed(2)}, which is below the minimum of $2,500.`);
        return;
      }
    }
    
    setIsSendingToDealDesk(true);
    
    try {
      // Create quote data for deal desk
      const quoteData: Quote = {
        id: `quote-${Date.now()}`,
        clientName: clientInfo.clientName,
        clientEmail: clientInfo.clientEmail,
        company: clientInfo.company,
        configuration: configuration,
        selectedTier: safeCalculation.tier,
        calculation: safeCalculation,
        status: 'draft' as const,
        createdAt: new Date(),
        templateUsed: selectedTemplate ? {
          id: selectedTemplate.id,
          name: selectedTemplate.name,
          isDefault: false
        } : { id: 'default', name: 'Default Template', isDefault: true },
        dealData: dealData
      };
      
      console.log('📤 Sending quote to Deal Desk:', quoteData);
      // Prepare email content
      const emailSubject = `New Quote Request - ${clientInfo.company} - ${clientInfo.clientName}`;
      const emailBody = `
New Quote Request for Deal Desk Review

CLIENT INFORMATION:
- Client Name: ${clientInfo.clientName}
- Email: ${clientInfo.clientEmail}
- Company: ${clientInfo.company}
- Discount Applied: ${clientInfo.discount ?? 0}%

PROJECT CONFIGURATION:
- Number of Users: ${configuration?.numberOfUsers || 'N/A'}
- Instance Type: ${configuration?.instanceType || 'N/A'}
- Number of Instances: ${configuration?.numberOfInstances || 'N/A'}
- Duration: ${configuration?.duration || 'N/A'} months
- Migration Type: ${configuration?.migrationType || 'N/A'}
- Data Size: ${configuration?.dataSizeGB || 'N/A'} GB

PRICING BREAKDOWN (${safeCalculation.tier.name} Plan):
- User Costs: ${formatCurrency(safeCalculation.userCost)}
- Data Costs: ${formatCurrency(safeCalculation.dataCost)}
- Migration Services: ${formatCurrency(safeCalculation.migrationCost)}
- Instance Costs: ${formatCurrency(safeCalculation.instanceCost)}
- Subtotal: ${formatCurrency(safeCalculation.totalCost)}
${(clientInfo.discount ?? 0) > 0 ? `- Discount (${clientInfo.discount}%): -${formatCurrency(safeCalculation.totalCost * ((clientInfo.discount ?? 0) / 100))}` : ''}
- Final Total: ${formatCurrency(shouldApplyDiscount ? finalTotalAfterDiscount : totalCost)}

DEAL INFORMATION:
- Deal ID: ${dealData?.dealId || 'N/A'}
- Deal Name: ${dealData?.dealName || 'N/A'}
- Deal Amount: ${dealData?.amount || 'N/A'}
- Deal Stage: ${dealData?.stage || 'N/A'}

TEMPLATE USED:
- Template: ${selectedTemplate?.name || 'Default Template'}
- Template ID: ${selectedTemplate?.id || 'default'}

Please review this quote and approve or provide feedback.

Generated on: ${new Date().toLocaleString()}
Quote ID: ${quoteData.id}
      `.trim();

      // Send email directly through backend API
      const dealDeskEmail = 'dealdesk@cloudfuze.com'; // Replace with actual deal desk email
      
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: dealDeskEmail,
          subject: emailSubject,
          message: emailBody
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        
        // Handle specific email configuration errors
        if (response.status === 500 && errorData.message?.includes('Email configuration not set')) {
          alert(`❌ Email Not Configured\n\nThe server needs email configuration to send emails.\n\nPlease contact your administrator to:\n1. Create a .env file with EMAIL_USER and EMAIL_PASS\n2. Set up Gmail App Password\n3. Restart the server\n\nAlternatively, you can use the manual email option.`);
          
          // Fallback to mailto link
          const mailtoLink = `mailto:${dealDeskEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
      window.open(mailtoLink, '_blank');
          alert('📧 Email client opened as fallback. Please send the email manually.');
          return;
        }
        
        throw new Error(errorData.message || `Server error ${response.status}`);
      }
      
      const result = await response.json();
      if (result?.success) {
        alert(`✅ Quote sent to Deal Desk successfully!\n\n📧 Message ID: ${result.messageId}\n📧 Sent to: ${dealDeskEmail}\n\nThe Deal Desk team will review your quote and provide feedback.`);
      } else {
        throw new Error(result?.message || 'Unknown server response');
      }
      
    } catch (error) {
      console.error('Error sending to Deal Desk:', error);
      alert('Error preparing email. Please try again or contact support.');
    } finally {
      setIsSendingToDealDesk(false);
    }
  };

  // Send generated agreement via email (DOCX attachment)
  const handleEmailAgreement = async () => {
    try {
      if (!selectedTemplate) {
        alert('Please select a template first in the Template session.');
        return;
      }

      setIsEmailingAgreement(true);

      // Ensure we have an agreement generated
      let agreementBlob: Blob | null = processedAgreement;

      if (!agreementBlob && selectedTemplate?.file && selectedTemplate.file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const { DocxTemplateProcessor } = await import('../utils/docxTemplateProcessor');

        const companyName = (configureContactInfo?.company || clientInfo.company || 'Demo Company Inc.');
        const finalCompanyName = (!companyName || companyName === 'undefined' || companyName === 'null' || companyName === '') ? 'Demo Company Inc.' : companyName;
        const userCount = configuration?.numberOfUsers || 1;
        const userCost = calculation?.userCost ?? safeCalculation.userCost;
        const migrationCost = calculation?.migrationCost ?? safeCalculation.migrationCost;
        const totalCost = calculation?.totalCost ?? safeCalculation.totalCost;
        const duration = configuration?.duration || 1;
        const migrationType = configuration?.migrationType || 'Content';
        const clientName = clientInfo.clientName || 'Demo Client';
        const clientEmail = clientInfo.clientEmail || 'demo@example.com';

        // Calculate comprehensive pricing breakdown
        const dataCost = calculation?.dataCost ?? safeCalculation.dataCost;
        const instanceCost = calculation?.instanceCost ?? safeCalculation.instanceCost;
        const tierName = calculation?.tier?.name ?? safeCalculation.tier.name;
        const instanceType = configuration?.instanceType || 'Standard';
        const numberOfInstances = configuration?.numberOfInstances || 1;
        const dataSizeGB = configuration?.dataSizeGB || 0;
        
        // Calculate discount for this function scope
        const localDiscountPercent = clientInfo.discount ?? 0;
        const localDiscountAmount = localDiscountPercent > 0 ? totalCost * (localDiscountPercent / 100) : 0;
        
        const templateData: Record<string, string> = {
          // Core company and client information
          '{{Company Name}}': finalCompanyName,
          '{{ Company Name }}': finalCompanyName,
          '{{Company_Name}}': finalCompanyName,
          '{{ Company_Name }}': finalCompanyName,
          '{{company name}}': finalCompanyName,
          '{{clientName}}': clientName,
          '{{client_name}}': clientName,
          '{{email}}': clientEmail,
          '{{client_email}}': clientEmail,
          
          // Project configuration
          '{{users_count}}': (userCount || 1).toString(),
          '{{userscount}}': (userCount || 1).toString(),
          '{{users}}': (userCount || 1).toString(),
          '{{number_of_users}}': (userCount || 1).toString(),
          '{{instance_type}}': instanceType,
          '{{instanceType}}': instanceType,
          '{{number_of_instances}}': numberOfInstances.toString(),
          '{{numberOfInstances}}': numberOfInstances.toString(),
          '{{instances}}': numberOfInstances.toString(),
          '{{Duration of months}}': (duration || 1).toString(),
          '{{Duration_of_months}}': (duration || 1).toString(),
          '{{Suration_of_months}}': (duration || 1).toString(), // Handle typo version
          '{{duration_months}}': (duration || 1).toString(),
          '{{duration}}': (duration || 1).toString(),
          '{{migration type}}': migrationType,
          '{{migration_type}}': migrationType,
          '{{migrationType}}': migrationType,
          '{{data_size}}': dataSizeGB.toString(),
          '{{dataSizeGB}}': dataSizeGB.toString(),
          '{{data_size_gb}}': dataSizeGB.toString(),
          
          // Pricing breakdown - all costs
          '{{users_cost}}': formatCurrency(userCost || 0),
          '{{user_cost}}': formatCurrency(userCost || 0),
          '{{userCost}}': formatCurrency(userCost || 0),
          '{{price_data}}': formatCurrency(dataCost),
          '{{data_cost}}': formatCurrency(dataCost),
          '{{dataCost}}': formatCurrency(dataCost),
          '{{price_migration}}': formatCurrency(migrationCost || 0),
          '{{migration_cost}}': formatCurrency(migrationCost || 0),
          '{{migration_price}}': formatCurrency(migrationCost || 0),
          '{{migrationCost}}': formatCurrency(migrationCost || 0),
          '{{instance_cost}}': formatCurrency(instanceCost),
          '{{instanceCost}}': formatCurrency(instanceCost),
          '{{instance_costs}}': formatCurrency(instanceCost),
          
          // Total pricing
          '{{total price}}': formatCurrency(totalCost || 0),
          '{{total_price}}': formatCurrency(totalCost || 0),
          '{{totalPrice}}': formatCurrency(totalCost || 0),
          '{{prices}}': formatCurrency(totalCost || 0),
          '{{subtotal}}': formatCurrency(totalCost || 0),
          '{{sub_total}}': formatCurrency(totalCost || 0),
          
          // Discount information - hide discount tokens when discount is 0
          '{{discount}}': (shouldApplyDiscount && discountPercent > 0) ? discountPercent.toString() : '',
          '{{discount_percent}}': (shouldApplyDiscount && discountPercent > 0) ? discountPercent.toString() : '',
          '{{discount_percentage}}': (shouldApplyDiscount && discountPercent > 0) ? discountPercent.toString() : '',
          '{{discount_amount}}': (shouldApplyDiscount && localDiscountAmount > 0) ? formatCurrency(localDiscountAmount) : '',
          '{{discountAmount}}': (shouldApplyDiscount && localDiscountAmount > 0) ? formatCurrency(localDiscountAmount) : '',
          '{{discount_text}}': (shouldApplyDiscount && discountPercent > 0) ? `Discount (${discountPercent}%)` : '',
          '{{discount_line}}': (shouldApplyDiscount && localDiscountAmount > 0) ? `Discount (${discountPercent}%) - ${formatCurrency(localDiscountAmount)}` : '',
          // Special tokens for conditional display in templates
          '{{show_discount}}': (shouldApplyDiscount && discountPercent > 0) ? 'true' : '',
          '{{hide_discount}}': (shouldApplyDiscount && discountPercent > 0) ? '' : 'true',
          // Additional conditional tokens
          '{{if_discount}}': (shouldApplyDiscount && discountPercent > 0) ? 'show' : 'hide',
          '{{discount_row}}': (shouldApplyDiscount && localDiscountAmount > 0) ? `<tr><td>Discount (${discountPercent}%)</td><td>-${formatCurrency(localDiscountAmount)}</td></tr>` : '',
          '{{total_after_discount}}': formatCurrency(shouldApplyDiscount ? finalTotalAfterDiscount : totalCost),
          '{{total_price_discount}}': formatCurrency(shouldApplyDiscount ? finalTotalAfterDiscount : totalCost),
          '{{final_total}}': formatCurrency(shouldApplyDiscount ? finalTotalAfterDiscount : totalCost),
          '{{finalTotal}}': formatCurrency(shouldApplyDiscount ? finalTotalAfterDiscount : totalCost),
          
          // Plan and tier information
          '{{tier_name}}': tierName,
          '{{tierName}}': tierName,
          '{{plan_name}}': tierName,
          '{{planName}}': tierName,
          '{{plan}}': tierName,
          
          // Date information
          '{{date}}': clientInfo.effectiveDate ? new Date(clientInfo.effectiveDate).toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }) : new Date().toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }),
          '{{Date}}': clientInfo.effectiveDate ? new Date(clientInfo.effectiveDate).toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }) : new Date().toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }),
          '{{current_date}}': clientInfo.effectiveDate ? new Date(clientInfo.effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          '{{currentDate}}': clientInfo.effectiveDate ? new Date(clientInfo.effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          '{{generation_date}}': clientInfo.effectiveDate ? new Date(clientInfo.effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          '{{effective_date}}': clientInfo.effectiveDate ? new Date(clientInfo.effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          '{{effectiveDate}}': clientInfo.effectiveDate ? new Date(clientInfo.effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          
          // Deal information (if available)
          '{{deal_id}}': dealData?.dealId || 'N/A',
          '{{dealId}}': dealData?.dealId || 'N/A',
          '{{deal_name}}': dealData?.dealName || 'N/A',
          '{{dealName}}': dealData?.dealName || 'N/A',
          '{{deal_amount}}': dealData?.amount || 'N/A',
          '{{dealAmount}}': dealData?.amount || 'N/A',
          '{{deal_stage}}': dealData?.stage || 'N/A',
          '{{dealStage}}': dealData?.stage || 'N/A',
          
          // Messages from configuration
          '{{messages}}': (configuration?.messages || 0).toString(),
          '{{message}}': (configuration?.messages || 0).toString(),
          '{{message_count}}': (configuration?.messages || 0).toString(),
          '{{notes}}': (configuration?.messages || 0).toString(),
          '{{additional_notes}}': (configuration?.messages || 0).toString(),
          '{{additionalNotes}}': (configuration?.messages || 0).toString(),
          '{{custom_message}}': (configuration?.messages || 0).toString(),
          '{{customMessage}}': (configuration?.messages || 0).toString(),
          '{{number_of_messages}}': (configuration?.messages || 0).toString(),
          '{{numberOfMessages}}': (configuration?.messages || 0).toString(),
          '{{messages_count}}': (configuration?.messages || 0).toString(),
          
          // Additional metadata
          '{{template_name}}': selectedTemplate?.name || 'Default Template',
          '{{templateName}}': selectedTemplate?.name || 'Default Template',
          '{{agreement_id}}': `AGR-${Date.now().toString().slice(-8)}`,
          '{{agreementId}}': `AGR-${Date.now().toString().slice(-8)}`,
          '{{quote_id}}': `QTE-${Date.now().toString().slice(-8)}`,
          '{{quoteId}}': `QTE-${Date.now().toString().slice(-8)}`
        };

        const result = await DocxTemplateProcessor.processDocxTemplate(selectedTemplate.file as File, templateData);
        if (result.success && result.processedDocx) {
          agreementBlob = result.processedDocx;
          setProcessedAgreement(result.processedDocx);
        } else {
          alert('Failed to generate the agreement. Please try again.');
          setIsEmailingAgreement(false);
          return;
        }
      }

      if (!agreementBlob) {
        alert('Agreement not generated yet. Click Generate Agreement first.');
        setIsEmailingAgreement(false);
        return;
      }

      const toDefault = clientInfo.clientEmail || '';
      const to = window.prompt('Enter recipient email address', toDefault);
      if (!to) {
        setIsEmailingAgreement(false);
        return;
      }

      const subject = `CloudFuze Service Agreement - ${clientInfo.company || 'Client'} - ${new Date().toLocaleDateString()}`;
      
      // Calculate all pricing components
      const userCost = calculation?.userCost ?? safeCalculation.userCost;
      const dataCost = calculation?.dataCost ?? safeCalculation.dataCost;
      const migrationCost = calculation?.migrationCost ?? safeCalculation.migrationCost;
      const instanceCost = calculation?.instanceCost ?? safeCalculation.instanceCost;
      const subtotal = calculation?.totalCost ?? safeCalculation.totalCost;
      const discountAmount = (clientInfo.discount ?? 0) > 0 ? (subtotal * ((clientInfo.discount ?? 0) / 100)) : 0;
      const finalTotal = shouldApplyDiscount ? finalTotalAfterDiscount : subtotal;
      const tierName = calculation?.tier?.name ?? safeCalculation.tier.name;
      
      const message = `Dear ${clientInfo.clientName || 'Valued Client'},

Thank you for choosing CloudFuze for your data migration needs. Please find your comprehensive service agreement attached for review.

CLIENT INFORMATION:
- Client Name: ${clientInfo.clientName || 'N/A'}
- Email: ${clientInfo.clientEmail || 'N/A'}
- Company: ${clientInfo.company || 'N/A'}
- Discount Applied: ${clientInfo.discount || 0}%

PROJECT CONFIGURATION:
- Number of Users: ${configuration?.numberOfUsers || 'N/A'}
- Instance Type: ${configuration?.instanceType || 'N/A'}
- Number of Instances: ${configuration?.numberOfInstances || 'N/A'}
- Duration: ${configuration?.duration || 'N/A'} months
- Migration Type: ${configuration?.migrationType || 'N/A'}
- Data Size: ${configuration?.dataSizeGB || 'N/A'} GB

PRICING BREAKDOWN (${tierName} Plan):
- User Costs: ${formatCurrency(userCost)}
- Data Costs: ${formatCurrency(dataCost)}
- Migration Services: ${formatCurrency(migrationCost)}
- Instance Costs: ${formatCurrency(instanceCost)}
- Subtotal: ${formatCurrency(subtotal)}
${discountAmount > 0 ? `- Discount (${clientInfo.discount}%): -${formatCurrency(discountAmount)}` : ''}
- Final Total: ${formatCurrency(finalTotal)}

${dealData ? `DEAL INFORMATION:
- Deal ID: ${dealData.dealId || 'N/A'}
- Deal Name: ${dealData.dealName || 'N/A'}
- Deal Amount: ${dealData.amount || 'N/A'}
- Deal Stage: ${dealData.stage || 'N/A'}

` : ''}NEXT STEPS:
1. Review the attached service agreement carefully
2. Contact us with any questions or concerns
3. Sign and return the agreement to proceed
4. Our team will begin migration setup upon receipt

SUPPORT CONTACT:
For questions about this agreement or your migration project, please contact:
- Email: support@cloudfuze.com
- Phone: +1 (555) 123-4567
- Portal: https://portal.cloudfuze.com

Thank you for trusting CloudFuze with your data migration needs. We look forward to delivering a successful migration experience!

Best regards,
CloudFuze Sales Team

---
This agreement was generated on ${new Date().toLocaleString()} using CloudFuze CPQ Pro.
Agreement ID: AGR-${Date.now().toString().slice(-8)}
Template: ${selectedTemplate?.name || 'Default Template'}`;

      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const formData = new FormData();
      formData.append('to', to);
      formData.append('subject', subject);
      formData.append('message', message);

      const filenameBase = (clientInfo.company || 'Company').replace(/[^a-zA-Z0-9]/g, '_');
      const timestamp = new Date().toISOString().slice(0, 10);
      const file = new File([agreementBlob], `${filenameBase}_Agreement_${timestamp}.docx`, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      formData.append('attachment', file);

      const response = await fetch(`${backendUrl}/api/email/send`, { method: 'POST', body: formData });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        
        // Handle specific email configuration errors
        if (response.status === 500 && errorData.message?.includes('Email configuration not set')) {
          alert(`❌ Email Not Configured\n\nThe server needs email configuration to send emails.\n\nPlease contact your administrator to:\n1. Create a .env file with EMAIL_USER and EMAIL_PASS\n2. Set up Gmail App Password\n3. Restart the server\n\nAlternatively, you can download the agreement and send it manually.`);
          return;
        }
        
        throw new Error(errorData.message || `Server error ${response.status}`);
      }
      const result = await response.json();
      if (result?.success) {
        alert('✅ Agreement emailed successfully to ' + to + '!');
      } else {
        throw new Error(result?.message || 'Unknown server response');
      }
    } catch (err: any) {
      console.error('Error emailing agreement:', err);
      
      // Provide helpful error messages
      const errorMessage = err.message || 'Unknown error';
      if (errorMessage.includes('Network')) {
        alert('❌ Network Error\n\nCould not connect to the server. Please check:\n• Is the backend server running?\n• Is the server URL correct?\n• Check your internet connection');
      } else if (errorMessage.includes('credentials') || errorMessage.includes('authentication')) {
        alert('❌ Email Authentication Failed\n\nEmail credentials are invalid. Please contact your administrator to:\n• Verify Gmail credentials in .env file\n• Check if App Password is correct\n• Restart the server after updating credentials');
      } else {
        alert(`❌ Failed to send agreement email\n\nError: ${errorMessage}\n\nPlease try again or download the agreement manually.`);
      }
    } finally {
      setIsEmailingAgreement(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('🔍 handleSubmit - dealData:', dealData);
    
    // Validate discount is not more than 10%
    if (clientInfo.discount && clientInfo.discount > 10) {
      alert('Discount cannot be more than 10%. Please adjust the discount value.');
      return;
    }
    
    // Validate discount doesn't bring total below $2500
    if (clientInfo.discount && clientInfo.discount > 0) {
      const finalTotal = (calculation?.totalCost ?? safeCalculation.totalCost) * (1 - (clientInfo.discount / 100));
      if (finalTotal < 2500) {
        alert(`Discount cannot be applied. Final total would be $${finalTotal.toFixed(2)}, which is below the minimum of $2,500.`);
        return;
      }
    }
    
    if (onGenerateQuote) {
      // Create quote object with deal information including discount
      const quoteData: Quote = {
        id: `quote-001`,
        clientName: clientInfo.clientName,
        clientEmail: clientInfo.clientEmail,
        company: clientInfo.company,
        configuration: configuration,
        selectedTier: safeCalculation.tier,
        calculation: safeCalculation,
        status: 'draft' as const,
        createdAt: new Date(),
        templateUsed: selectedTemplate ? {
          id: selectedTemplate.id,
          name: selectedTemplate.name,
          isDefault: false
        } : { id: 'default', name: 'Default Template', isDefault: true },
        dealData: dealData,
        discount: clientInfo.discount // Add discount to quote data
      };
      
      console.log('📝 Sending quote data:', quoteData);
      onGenerateQuote(quoteData);
      
      // Automatically open quote preview instead of showing success message
      setShowPreview(true);
    }
  };

  const handleContactSelect = (contact: any) => {
    if (onSelectHubSpotContact) {
      onSelectHubSpotContact(contact);
    }
    setShowContactSelector(false);
  };

  const generatePlaceholderPreview = () => {
    if (!selectedTemplate) return;

    // Create quote object for preview
    const quote = {
      id: `quote-001`,
      clientName: clientInfo.clientName,
      clientEmail: clientInfo.clientEmail,
      company: clientInfo.company,
      configuration: configuration,
      calculation: safeCalculation,
      selectedTier: safeCalculation.tier,
      status: 'draft' as const,
      createdAt: new Date(),
      templateUsed: {
        id: selectedTemplate.id,
        name: selectedTemplate.name,
        isDefault: false
      }
    };

    const quoteNumber = `CPQ-001`;

    // Define placeholder mappings - match exact placeholders from template
    const placeholderMappings = {
      '{{Company Name}}': quote.company || 'Company Name',
      '{{migration type}}': quote.configuration.migrationType,
      '{{userscount}}': quote.configuration.numberOfUsers.toString(),
      '{{price_migration}}': formatCurrency(safeCalculation.migrationCost),
      '{{price_data}}': formatCurrency(safeCalculation.userCost + safeCalculation.dataCost + safeCalculation.instanceCost),
      '{{Duration of months}}': quote.configuration.duration.toString(),
      '{{total price}}': formatCurrency(safeCalculation.totalCost),
      // New tokens related to discount and final total - hide when discount is 0
      '{{discount_amount}}': (shouldApplyDiscount && discountAmount > 0) ? formatCurrency(discountAmount) : '',
      '{{discount_text}}': (shouldApplyDiscount && discountPercent > 0) ? `Discount (${discountPercent}%)` : '',
      '{{discount_line}}': (shouldApplyDiscount && discountAmount > 0) ? `Discount (${discountPercent}%) - ${formatCurrency(discountAmount)}` : '',
      '{{total_after_discount}}': formatCurrency(shouldApplyDiscount ? finalTotalAfterDiscount : totalCost),
      '{{total_price_discount}}': formatCurrency(shouldApplyDiscount ? finalTotalAfterDiscount : totalCost),
      
      // Additional mappings for compatibility
      '{{company_name}}': quote.company || 'Company Name',
      '{{users}}': quote.configuration.numberOfUsers.toString(),
      '{{migration_type}}': quote.configuration.migrationType,
      '{{prices}}': formatCurrency(safeCalculation.userCost + safeCalculation.dataCost + safeCalculation.instanceCost),
      '{{migration_price}}': formatCurrency(safeCalculation.migrationCost),
      '{{total_price}}': formatCurrency(safeCalculation.totalCost),
      '{{duration_months}}': quote.configuration.duration.toString(),
      '{{client_name}}': quote.clientName,
      '{{client_email}}': quote.clientEmail,
      '{{quote_number}}': quoteNumber,
      '{{date}}': clientInfo.effectiveDate ? new Date(clientInfo.effectiveDate).toLocaleDateString('en-US', { 
        year: '2-digit', 
        month: '2-digit', 
        day: '2-digit' 
      }) : new Date().toLocaleDateString('en-US', { 
        year: '2-digit', 
        month: '2-digit', 
        day: '2-digit' 
      }),
        '{{instance_cost}}': formatCurrency(safeCalculation.instanceCost),
        '{{discount}}': (shouldApplyDiscount ? discountPercent : 0).toString(),
        '{{discount_percent}}': (shouldApplyDiscount ? discountPercent : 0).toString(),
        '{{final_total}}': formatCurrency(shouldApplyDiscount ? finalTotalAfterDiscount : totalCost)
    };

    // Create sample template text with placeholders - matches CloudFuze template
    const originalText = `CloudFuze Purchase Agreement for {{Company Name}}

This agreement provides {{Company Name}} with pricing for use of the CloudFuze's X-Change Enterprise Data Migration Solution:

Cloud-Hosted SaaS Solution | Managed Migration | Dedicated Migration Manager

Services and Pricing Table:
┌─────────────────────────────────────┬─────────────────────────────────────┬─────────────────┬─────────────┐
│ Job Requirement                     │ Description                         │ Migration Type  │ Price(USD)  │
├─────────────────────────────────────┼─────────────────────────────────────┼─────────────────┼─────────────┤
│ CloudFuze X-Change Data Migration   │ {{migration type}} to Teams         │ Managed         │ {{price_migration}} │
│                                     │ ─────────────────────────────────   │ Migration       │             │
│                                     │ Up to {{userscount}} Users          │ One-Time        │             │
│                                     │ All Channels and DMs                │                 │             │
├─────────────────────────────────────┼─────────────────────────────────────┼─────────────────┼─────────────┤
│ Managed Migration Service           │ Fully Managed Migration             │ Managed         │ {{price_data}} │
│                                     │ Dedicated Project Manager           │ Migration       │             │
│                                     │ Pre-Migration Analysis              │ One-Time        │             │
│                                     │ During Migration Consulting         │                 │             │
│                                     │ Post-Migration Support              │                 │             │
│                                     │ Data Reconciliation Support         │                 │             │
│                                     │ End-to End Migration Assistance     │                 │             │
│                                     │ 24*7 Premium Support                │                 │             │
│                                     │ ─────────────────────────────────   │                 │             │
│                                     │ Valid for {{Duration of months}} Month │                 │             │
└─────────────────────────────────────┴─────────────────────────────────────┴─────────────────┴─────────────┘

Total Price: {{total price}}`;

    // Replace placeholders
    let replacedText = originalText;
    const placeholders = [];

    for (const [placeholder, value] of Object.entries(placeholderMappings)) {
      if (replacedText.includes(placeholder)) {
        placeholders.push({ placeholder, value });
        replacedText = replacedText.replace(new RegExp(placeholder, 'gi'), value);
      }
    }

    setPlaceholderPreviewData({
      originalText,
      replacedText,
      placeholders
    });

    setShowPlaceholderPreview(true);
  };

  const handleDownloadAgreement = () => {
    if (processedAgreement) {
      const url = URL.createObjectURL(processedAgreement);
      const link = document.createElement('a');
      link.href = url;
      link.download = `agreement-${clientInfo.clientName || 'client'}-${new Date().toISOString().split('T')[0]}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      // Close preview after download
      setShowAgreementPreview(false);
      setProcessedAgreement(null);
    }
  };

  // Handle PDF download from the generated agreement using document preview
  const handleDownloadAgreementPDF = async () => {
    try {
    if (!processedAgreement) {
      alert('No agreement available. Please generate an agreement first.');
      return;
    }
      // Prefer server-side high-fidelity conversion
      const { templateService } = await import('../utils/templateService');
      const pdfBlob = await templateService.convertDocxToPdf(processedAgreement);
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `agreement-${clientInfo.clientName || 'client'}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('❌ Server conversion failed, falling back to in-modal PDF capture:', error);
      try {
        // Ensure the inline preview exists; if not, render it
        if (!showInlinePreview) {
          setShowAgreementPreview(true);
          setShowInlinePreview(true);
          await delayFrame();
          await renderDocxPreview(processedAgreement as Blob);
          await delayFrame();
        }

        // Find the agreement preview container
        const container = previewContainerRef.current || document.querySelector('.document-preview-content');
        if (!container) {
          alert('Document preview not available. Please click "View Document" first, then try again.');
        return;
      }

        // Attempt page-by-page capture to avoid mid-page breaks
        const pageSelectors = ['.docx .page', '.docx .docx-page', '.docx-page', '.page'];
        let pages: Element[] = [];
        for (const sel of pageSelectors) {
          const found = Array.from((container as HTMLElement).querySelectorAll(sel));
          if (found.length) { pages = found; break; }
        }

        const pdf = new jsPDF('p', 'mm', 'a4');

        if (pages.length > 0) {
          for (let i = 0; i < pages.length; i++) {
            // Create isolated temp for each page
            const tempPage = document.createElement('div');
            tempPage.style.position = 'absolute';
            tempPage.style.left = '-9999px';
            tempPage.style.top = '0';
            tempPage.style.width = '1200px';
            tempPage.style.backgroundColor = 'white';
            document.body.appendChild(tempPage);
            tempPage.appendChild((pages[i] as HTMLElement).cloneNode(true));

            await new Promise(res => setTimeout(res, 200));

            const canvas = await html2canvas(tempPage, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
              backgroundColor: '#ffffff'
      });

            document.body.removeChild(tempPage);

      const imgData = canvas.toDataURL('image/png');
            const imgWidth = 210; // A4 width
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            if (i > 0) pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');
          }
        } else {
          // Fallback to whole-container capture
          const temp = document.createElement('div');
          temp.style.position = 'absolute';
          temp.style.left = '-9999px';
          temp.style.top = '0';
          temp.style.width = '1200px';
          temp.style.backgroundColor = 'white';
          temp.style.padding = '40px';
          document.body.appendChild(temp);
          temp.appendChild((container as HTMLElement).cloneNode(true));

          await new Promise(res => setTimeout(res, 800));
          const canvas = await html2canvas(temp, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            width: 1200,
            height: (temp.firstElementChild as HTMLElement)?.scrollHeight || temp.scrollHeight
          });
          document.body.removeChild(temp);

          const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 295; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
          }
        }

        pdf.save(`agreement-${clientInfo.clientName || 'client'}-${new Date().toISOString().split('T')[0]}.pdf`);
      } catch (fallbackErr) {
        console.error('❌ Inline capture fallback failed:', fallbackErr);
        // Last resort: Use the original DOCX file as download
        try {
          const url = URL.createObjectURL(processedAgreement as Blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `agreement-${clientInfo.clientName || 'client'}-${new Date().toISOString().split('T')[0]}.docx`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          alert('PDF conversion is not available. The Word document has been downloaded instead. You can convert it to PDF using Microsoft Word or any online converter.');
        } catch (docxErr) {
          console.error('❌ DOCX download fallback failed:', docxErr);
          alert('Unable to download document. Please try again or contact support.');
        }
      }
    }
  };

  const handleViewInline = async () => {
    if (processedAgreement) {
      try {
        // Prefer exact docx renderer
        if (processedAgreement.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          // Ensure modal content is visible
          setShowAgreementPreview(true);
          await delayFrame();
          await renderDocxPreview(processedAgreement);
          return;
        }
        console.log('✅ Converting DOCX to HTML for preview');
        console.log('📄 Document type:', processedAgreement.type);
        console.log('📄 Document size:', processedAgreement.size, 'bytes');
        
        // Convert DOCX to HTML using mammoth with exact formatting preservation
        const mammoth = await import('mammoth');
        
        const arrayBuffer = await processedAgreement.arrayBuffer();
        const result = await mammoth.convertToHtml({ 
          arrayBuffer,
          styleMap: [
            // Preserve table formatting
            "p[style-name='Table Heading'] => h3.table-heading",
            "p[style-name='Table Text'] => p.table-text",
            "r[style-name='Strong'] => strong",
            "r[style-name='Emphasis'] => em",
            // Preserve colors and formatting
            "r[style-name='Highlight'] => span.highlight",
            "r[style-name='Heading 1'] => h1.heading-1",
            "r[style-name='Heading 2'] => h2.heading-2",
            "r[style-name='Heading 3'] => h3.heading-3",
            // Preserve table styles
            "table => table.docx-table",
            "tr => tr.docx-row",
            "td => td.docx-cell",
            "th => th.docx-header",
            // Preserve headers and footers
            "p[style-name='Header'] => div.docx-header",
            "p[style-name='Footer'] => div.docx-footer",
            // Preserve page breaks
            "br[type='page'] => div.page-break"
          ],
          convertImage: mammoth.images.imgElement(function(image) {
            return image.read("base64").then(function(imageBuffer) {
              return {
                src: "data:" + image.contentType + ";base64," + imageBuffer
              };
            });
          })
        } as any);
        
        console.log('✅ DOCX converted to HTML with exact formatting');
        console.log('📄 HTML length:', result.value.length);
        console.log('📄 Warnings:', result.messages);
        
        // Create HTML document with exact DOCX styling preserved
        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Document Preview - Exact DOCX Formatting</title>
            <meta charset="UTF-8">
            <style>
              /* Reset and base styles */
              * {
                box-sizing: border-box;
              }
              
              body { 
                font-family: 'Times New Roman', serif; 
                margin: 0;
                padding: 40px;
                line-height: 1.6;
                color: #000;
                background: white;
                font-size: 12pt;
              }
              
              /* Preserve exact DOCX formatting */
              .docx-table {
                border-collapse: collapse;
                width: 100%;
                margin: 20px 0;
                border: 1px solid #000;
              }
              
              .docx-row {
                border: 1px solid #000;
              }
              
              .docx-cell, .docx-header {
                border: 1px solid #000;
                padding: 8px 12px;
                vertical-align: top;
                text-align: left;
              }
              
              .docx-header {
                background-color: #f2f2f2;
                font-weight: bold;
                text-align: center;
              }
              
              /* Preserve heading styles */
              h1, h2, h3, h4, h5, h6 {
                color: #000;
                margin-top: 20px;
                margin-bottom: 10px;
                font-weight: bold;
              }
              
              h1 { font-size: 18pt; }
              h2 { font-size: 16pt; }
              h3 { font-size: 14pt; }
              h4 { font-size: 12pt; }
              
              /* Preserve paragraph formatting */
              p {
                margin-bottom: 10px;
                text-align: left;
                font-size: 12pt;
                line-height: 1.15;
              }
              
              /* Preserve text formatting */
              strong, b {
                font-weight: bold;
              }
              
              em, i {
                font-style: italic;
              }
              
              .highlight {
                background-color: #ffff00;
                padding: 1px 2px;
              }
              
              /* Preserve list formatting */
              ul, ol {
                margin: 10px 0;
                padding-left: 30px;
              }
              
              li {
                margin-bottom: 5px;
              }
              
              /* Preserve table alignment */
              .docx-table td[align="center"] {
                text-align: center;
              }
              
              .docx-table td[align="right"] {
                text-align: right;
              }
              
              .docx-table td[align="left"] {
                text-align: left;
              }
              
              /* Preserve colors and backgrounds */
              .docx-table tr:nth-child(even) {
                background-color: #f9f9f9;
              }
              
              /* Preserve spacing */
              .docx-table td {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }
              
              /* Preserve page layout */
              @media print {
                body {
                  margin: 0;
                  padding: 20px;
                }
              }
              
              /* Preserve headers and footers */
              .docx-header {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background: white;
                border-bottom: 1px solid #ccc;
                padding: 10px;
                font-size: 10pt;
                z-index: 1000;
              }
              
              .docx-footer {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                background: white;
                border-top: 1px solid #ccc;
                padding: 10px;
                font-size: 10pt;
                z-index: 1000;
              }
              
              /* Preserve page breaks */
              .page-break {
                page-break-before: always;
                break-before: page;
                margin: 20px 0;
                border-top: 1px dashed #ccc;
                padding-top: 20px;
              }
              
              /* Adjust body padding for headers/footers */
              body {
                padding-top: 60px;
                padding-bottom: 60px;
              }
              
              /* Ensure exact DOCX appearance */
              .docx-content {
                max-width: 100%;
                margin: 0 auto;
              }
            </style>
          </head>
          <body>
            <div class="docx-content">
              ${result.value}
            </div>
          </body>
          </html>
        `;
        
        // Create blob URL for the HTML content
        const htmlBlobForPreview = new Blob([htmlContent], { type: 'text/html' });
        const actualPreviewUrl = URL.createObjectURL(htmlBlobForPreview);
        
        setPreviewUrl(actualPreviewUrl);
        setShowInlinePreview(true);
        
        console.log('✅ HTML preview URL created:', actualPreviewUrl);
        
        return; // Exit early to use HTML preview
        
        // Fallback HTML preview (kept for reference but not used)
        const previewHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Agreement Preview</title>
            <style>
              body { 
                font-family: 'Times New Roman', serif; 
                margin: 40px; 
                line-height: 1.6;
                color: #000;
                background: white;
                max-width: 800px;
                margin: 40px auto;
              }
              .document-header {
                text-align: center;
                margin-bottom: 40px;
                border-bottom: 2px solid #333;
                padding-bottom: 20px;
              }
              .document-title {
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 10px;
                color: #333;
              }
              .document-subtitle {
                font-size: 16px;
                color: #666;
                margin-bottom: 20px;
              }
              .content-section {
                margin-bottom: 30px;
                text-align: justify;
              }
              .section-title {
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 15px;
                color: #333;
                border-bottom: 1px solid #ccc;
                padding-bottom: 5px;
              }
              .table-container {
                margin: 20px 0;
                border: 1px solid #333;
              }
              .table-header {
                background: #f0f0f0;
                font-weight: bold;
                padding: 10px;
                border-bottom: 1px solid #333;
              }
              .table-row {
                display: flex;
                border-bottom: 1px solid #ccc;
              }
              .table-cell {
                flex: 1;
                padding: 10px;
                border-right: 1px solid #ccc;
              }
              .table-cell:last-child {
                border-right: none;
              }
              .highlight-box {
                background: #f9f9f9;
                border: 1px solid #ddd;
                padding: 15px;
                margin: 15px 0;
                border-radius: 4px;
              }
              .total-section {
                background: #e8f5e8;
                border: 2px solid #4caf50;
                padding: 20px;
                margin: 30px 0;
                text-align: center;
                border-radius: 8px;
              }
              .total-amount {
                font-size: 24px;
                font-weight: bold;
                color: #2e7d32;
              }
            </style>
          </head>
          <body>
            <div class="document-header">
              <div class="document-title">CloudFuze Purchase Agreement for ${clientInfo.company}</div>
              <div class="document-subtitle">This agreement provides ${clientInfo.company} with pricing for use of the CloudFuze's X-Change Enterprise Data</div>
            </div>
            
            <div class="content-section">
              <div class="highlight-box">
                <strong>Cloud-Hosted SaaS Solution | Managed Migration | Dedicated Migration Manager</strong>
              </div>
            </div>
            
            <div class="content-section">
              <div class="section-title">Service Details</div>
              
              <div class="table-container">
                <div class="table-header">Job Requirements and Pricing</div>
                <div class="table-row">
                  <div class="table-cell"><strong>Job Requirement</strong></div>
                  <div class="table-cell"><strong>Description</strong></div>
                  <div class="table-cell"><strong>Price (USD)</strong></div>
                </div>
                <div class="table-row">
                  <div class="table-cell">CloudFuze X-Change Data Migration</div>
                  <div class="table-cell">
                    <p>slack to Teams</p>
                    <p>Up to ${configuration?.numberOfUsers || 1} Users | All Channels and DMs</p>
                  </div>
                  <div class="table-cell">${formatCurrency(calculation?.userCost || 0)}</div>
                </div>
                <div class="table-row">
                  <div class="table-cell">Managed Migration Service</div>
                  <div class="table-cell">
                    <p>Fully Managed Migration | Dedicated Project Manager | Pre-Migration Analysis | During Migration Consulting | Post-Migration Support and Data Reconciliation Support | End-to End Migration Assistance with 24*7 Premium Support</p>
                    <p><strong>Valid for ${configuration?.duration || 1} Month</strong></p>
                  </div>
                  <div class="table-cell">${formatCurrency(calculation?.migrationCost || 0)}</div>
                </div>
              </div>
            </div>
            
            <div class="content-section">
              <div class="section-title">Client Information</div>
              <p><strong>Company:</strong> ${clientInfo.company}</p>
              <p><strong>Client Name:</strong> ${clientInfo.clientName}</p>
              <p><strong>Email:</strong> ${clientInfo.clientEmail}</p>
              <p><strong>Migration Type:</strong> ${configuration?.migrationType || 'Content'}</p>
              <p><strong>Duration:</strong> ${configuration?.duration || 1} months</p>
              <p><strong>Data Size:</strong> ${configuration?.dataSizeGB || 0} GB</p>
            </div>
            
            <div class="total-section">
              <div class="section-title">Total Price</div>
              <div class="total-amount">${formatCurrency(calculation?.totalCost || 0)}</div>
            </div>
            
            <div class="content-section">
              <p><em>Document generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</em></p>
              <p><em>All tokens have been replaced with actual quote data from your configuration.</em></p>
            </div>
          </body>
          </html>
        `;
        
        // Create blob URL for the HTML preview
        const htmlBlob = new Blob([previewHtml], { type: 'text/html' });
        const htmlUrl = URL.createObjectURL(htmlBlob);
        
        // Store the HTML URL for the iframe
        setPreviewUrl(htmlUrl);
        setShowInlinePreview(true);
        
      } catch (error) {
        console.error('Error creating inline preview:', error);
        alert('Error creating document preview. Please try downloading the file instead.');
      }
    }
  };

  const handleDownloadPDF = async () => {
    try {
      console.log('🔄 Starting PDF generation...');
      
      // Find the quote preview element
      const quotePreviewElement = document.querySelector('[data-quote-preview]');
      if (!quotePreviewElement) {
        console.error('❌ Quote preview element not found');
        alert('Quote preview not found. Please try again.');
        return;
      }

      // Create a temporary container for PDF generation
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '0';
      tempContainer.style.width = '1200px';
      tempContainer.style.backgroundColor = 'white';
      tempContainer.style.padding = '40px';
      document.body.appendChild(tempContainer);

      // Clone the quote preview content
      const clonedContent = quotePreviewElement.cloneNode(true) as HTMLElement;
      tempContainer.appendChild(clonedContent);

      // Wait for any images or fonts to load
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Generate PDF using html2canvas and jsPDF
      const canvas = await html2canvas(tempContainer, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: 1200,
        height: clonedContent.scrollHeight
      });

      // Clean up temporary container
      document.body.removeChild(tempContainer);

      // Create PDF
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 295; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      let position = 0;

      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Add additional pages if needed
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Generate filename
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `CPQ_Quote_${clientInfo.clientName.replace(/\s+/g, '_')}_${timestamp}.pdf`;

      // Download the PDF
      pdf.save(filename);
      
      console.log('✅ PDF generated and downloaded successfully');
      
    } catch (error) {
      console.error('❌ Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  };

  const handleGenerateAgreement = async () => {
    if (!selectedTemplate) {
      alert('Please select a template first in the Template session.');
      return;
    }

    // Validate effective date is provided
    if (!clientInfo.effectiveDate || clientInfo.effectiveDate.trim() === '') {
      alert('Please Give Effective Date');
      return;
    }

    setIsGeneratingAgreement(true);
    try {
      console.log('🔄 Generating Agreement... [TIMESTAMP:', new Date().toISOString(), ']');
      console.log('🔍 calculation prop:', calculation);
      console.log('🔍 safeCalculation:', safeCalculation);
      
      // Use safe calculation with additional safety checks
      const currentCalculation = calculation || safeCalculation;
      console.log('🔍 currentCalculation:', currentCalculation);
      console.log('🔍 currentCalculation.totalCost:', currentCalculation.totalCost);
      
      // Additional safety check
      if (!currentCalculation || typeof currentCalculation.totalCost === 'undefined') {
        console.error('❌ CRITICAL: currentCalculation is invalid:', currentCalculation);
        alert('Error: Invalid calculation data. Please refresh the page and try again.');
        return;
      }

      // Check if configuration is available
      if (!configuration) {
        console.error('❌ Configuration is undefined:', configuration);
        alert('Error: No configuration available. Please go to the Configuration session and configure your project first.');
        return;
      }
      
      // Check if a template is selected
      if (!selectedTemplate) {
        console.log('❌ No template selected');
        alert('Please select a template first in the Template session before generating an agreement.');
        return;
      }

      console.log('🔍 Selected template details:', {
        id: selectedTemplate.id,
        name: selectedTemplate.name,
        hasFile: !!selectedTemplate.file,
        fileType: selectedTemplate.file?.type,
        fileName: selectedTemplate.file?.name,
        fileSize: selectedTemplate.file?.size,
        lastModified: selectedTemplate.file?.lastModified
      });

      // Check if template has a file
      if (!selectedTemplate.file) {
        console.error('❌ Selected template missing file:', selectedTemplate);
        console.log('🔍 Template details:', {
          id: selectedTemplate.id,
          name: selectedTemplate.name,
          hasFileData: !!selectedTemplate.fileData,
          hasFile: !!selectedTemplate.file,
          fileType: selectedTemplate.fileType,
          fileName: selectedTemplate.fileName
        });
        
        // Try to provide more helpful error message
        if (selectedTemplate.fileData) {
          alert('Template file is being processed. Please wait a moment and try again, or go to the Template session to re-select your template.');
        } else {
          alert('Selected template does not have a valid file. Please go to the Template session and re-select your template.');
        }
        return;
      }

      console.log('📄 Processing template:', selectedTemplate.name);
      console.log('📊 Template file type:', selectedTemplate.file.type);
      console.log('📊 Calculation object:', calculation);
      console.log('📊 SafeCalculation object:', safeCalculation);
      console.log('📊 Configuration object:', configuration);
      console.log('👤 Client Info object:', clientInfo);
      console.log('🏢 Company name from clientInfo:', clientInfo.company);
      
      // Debug: Check if calculation has actual values
      if (calculation) {
        console.log('✅ Using actual calculation object');
        console.log('💰 Calculation values:', {
          userCost: calculation.userCost,
          dataCost: calculation.dataCost,
          migrationCost: calculation.migrationCost,
          instanceCost: calculation.instanceCost,
          totalCost: calculation.totalCost
        });
      } else {
        console.log('⚠️ Using fallback calculation object');
        console.log('💰 Fallback values:', {
          userCost: safeCalculation.userCost,
          dataCost: safeCalculation.dataCost,
          migrationCost: safeCalculation.migrationCost,
          instanceCost: safeCalculation.instanceCost,
          totalCost: safeCalculation.totalCost
        });
      }
      
      // CRITICAL: Ensure we have valid calculation data
      const finalCalculation = calculation || safeCalculation;
      console.log('🔍 FINAL CALCULATION BEING USED:', finalCalculation);
      console.log('🔍 FINAL CALCULATION TYPE:', typeof finalCalculation);
      console.log('🔍 FINAL CALCULATION KEYS:', Object.keys(finalCalculation));
      
      // CRITICAL: Ensure we have valid configuration data
      const fallbackConfiguration = {
        numberOfUsers: 1,
        instanceType: 'Standard',
        numberOfInstances: 1,
        duration: 1,
        migrationType: 'Content',
        dataSizeGB: 0
      };
      const finalConfiguration = configuration || fallbackConfiguration;
      console.log('🔍 FINAL CONFIGURATION BEING USED:', finalConfiguration);
      console.log('🔍 FINAL CONFIGURATION TYPE:', typeof finalConfiguration);
      console.log('🔍 FINAL CONFIGURATION KEYS:', Object.keys(finalConfiguration));

      // Create quote data for template processing
      const quoteData = {
        id: `quote-001`,
        company: clientInfo.company || clientInfo.clientName || 'Demo Company Inc.',
        clientName: clientInfo.clientName,
        clientEmail: clientInfo.clientEmail,
        configuration: {
          numberOfUsers: finalConfiguration.numberOfUsers,
          instanceType: finalConfiguration.instanceType,
          numberOfInstances: finalConfiguration.numberOfInstances,
          duration: finalConfiguration.duration,
          migrationType: finalConfiguration.migrationType,
          dataSizeGB: finalConfiguration.dataSizeGB
        },
        calculation: {
          userCost: finalCalculation.userCost,
          dataCost: finalCalculation.dataCost,
          migrationCost: finalCalculation.migrationCost,
          instanceCost: finalCalculation.instanceCost,
          totalCost: finalCalculation.totalCost,
          tier: finalCalculation.tier
        },
        costs: {
          userCost: finalCalculation.userCost,
          dataCost: finalCalculation.dataCost,
          migrationCost: finalCalculation.migrationCost,
          instanceCost: finalCalculation.instanceCost,
          totalCost: finalCalculation.totalCost
        },
        selectedPlan: {
          name: finalCalculation.tier.name,
          price: finalCalculation.totalCost,
          features: finalCalculation.tier.features
        },
        quoteId: quoteId || generateUniqueQuoteId(),
        generatedDate: new Date(),
        status: 'draft'
      };
      
      console.log('📋 Final quoteData for template processing:', {
        company: quoteData.company,
        clientName: quoteData.clientName,
        clientEmail: quoteData.clientEmail,
        'company type': typeof quoteData.company,
        'company length': quoteData.company?.length
      });

      let processedDocument: Blob | null = null;

      // Process based on template file type - DOCX is now the primary method
      if (selectedTemplate.file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        console.log('🔄 Processing DOCX template (Primary Method)...');
        
        // Import DOCX template processor
        const { DocxTemplateProcessor } = await import('../utils/docxTemplateProcessor');
        
        // Debug: Log the quote data being passed
        console.log('🔍 Quote data being passed to DOCX processor:', {
          company: quoteData.company,
          clientName: quoteData.clientName,
          clientEmail: quoteData.clientEmail,
          configuration: quoteData.configuration,
          calculation: quoteData.calculation,
          selectedPlan: quoteData.selectedPlan
        });
        
        // CRITICAL: Deep dive into quote data structure
        console.log('🔍 COMPLETE QUOTE DATA STRUCTURE:');
        console.log('  Full quoteData object:', JSON.stringify(quoteData, null, 2));
        console.log('  quoteData.company:', quoteData.company);
        console.log('  quoteData.clientName:', quoteData.clientName);
        console.log('  quoteData.clientEmail:', quoteData.clientEmail);
        console.log('  quoteData.configuration:', JSON.stringify(quoteData.configuration, null, 2));
        console.log('  quoteData.calculation:', JSON.stringify(quoteData.calculation, null, 2));
        console.log('  quoteData.selectedPlan:', JSON.stringify(quoteData.selectedPlan, null, 2));
        
        // CRITICAL: Extract data directly from the quote with proper validation
        console.log('🔍 EXTRACTING DATA FROM QUOTE:');
        console.log('  quoteData object:', quoteData);
        console.log('  quoteData.company:', quoteData.company);
        console.log('  quoteData.configuration:', quoteData.configuration);
        console.log('  quoteData.calculation:', quoteData.calculation);
        console.log('  clientInfo object:', clientInfo);
        
        // Extract values with multiple fallback sources
        console.log('🔍 DEBUGGING COMPANY NAME SOURCES:');
        console.log('  quoteData.company:', quoteData.company);
        console.log('  clientInfo.company:', clientInfo.company);
        console.log('  dealData:', dealData);
        console.log('  configureContactInfo:', configureContactInfo);
        
        const companyName = configureContactInfo?.company || quoteData.company || clientInfo.company || dealData?.companyByContact || dealData?.company || 'Demo Company Inc.';
        console.log('  Final companyName:', companyName);
        
        // CRITICAL: Additional fallback if company name is still undefined or empty
        let finalCompanyName = companyName;
        if (!finalCompanyName || finalCompanyName === 'undefined' || finalCompanyName === '' || finalCompanyName === 'null') {
          console.warn('⚠️ Company name is still undefined/empty, using fallback');
          finalCompanyName = 'Demo Company Inc.';
        }
        console.log('  Final finalCompanyName:', finalCompanyName);
        const userCount = quoteData.configuration?.numberOfUsers || 1;
        const userCost = quoteData.calculation?.userCost || 0;
        const migrationCost = quoteData.calculation?.migrationCost || 0;
        const totalCost = quoteData.calculation?.totalCost || 0;
        const duration = quoteData.configuration?.duration || 1;
        const migrationType = quoteData.configuration?.migrationType || 'Content';
        const clientName = quoteData.clientName || clientInfo.clientName || 'Demo Client';
        const clientEmail = quoteData.clientEmail || clientInfo.clientEmail || 'demo@example.com';
        
        // CRITICAL: Debug extracted values
        console.log('🔍 EXTRACTED VALUES DEBUG:');
        console.log('  companyName:', companyName);
        console.log('  userCount:', userCount);
        console.log('  userCost:', userCost);
        console.log('  migrationCost:', migrationCost);
        console.log('  totalCost:', totalCost);
        console.log('  duration:', duration);
        console.log('  migrationType:', migrationType);
        console.log('  clientName:', clientName);
        console.log('  clientEmail:', clientEmail);
        
        // CRITICAL: Check if any values are undefined or null
        const extractedValues = {
          companyName, userCount, userCost, migrationCost, totalCost, duration, migrationType, clientName, clientEmail
        };
        
        Object.entries(extractedValues).forEach(([key, value]) => {
          if (value === undefined || value === null || value === '') {
            console.error(`❌ CRITICAL: ${key} is undefined/null/empty:`, value);
          } else {
            console.log(`✅ ${key}:`, value);
          }
        });
        
        // CRITICAL: Test formatCurrency function
        console.log('🔍 FORMAT CURRENCY TEST:');
        console.log('  formatCurrency(0):', formatCurrency(0));
        console.log('  formatCurrency(100):', formatCurrency(100));
        console.log('  formatCurrency(15000):', formatCurrency(15000));
        console.log('  formatCurrency(userCost):', formatCurrency(userCost));
        console.log('  formatCurrency(migrationCost):', formatCurrency(migrationCost));
        console.log('  formatCurrency(totalCost):', formatCurrency(totalCost));
        
        console.log('🔍 EXTRACTED VALUES:');
        console.log('  companyName:', companyName, '(type:', typeof companyName, ')');
        console.log('  userCount:', userCount, '(type:', typeof userCount, ')');
        console.log('  userCost:', userCost, '(type:', typeof userCost, ')');
        console.log('  migrationCost:', migrationCost, '(type:', typeof migrationCost, ')');
        console.log('  totalCost:', totalCost, '(type:', typeof totalCost, ')');
        console.log('  duration:', duration, '(type:', typeof duration, ')');
        console.log('  migrationType:', migrationType, '(type:', typeof migrationType, ')');
        console.log('  clientName:', clientName, '(type:', typeof clientName, ')');
        console.log('  clientEmail:', clientEmail, '(type:', typeof clientEmail, ')');
        
        // CRITICAL: Validate that we have actual values, not undefined
        if (!companyName || companyName === 'undefined') {
          console.error('❌ CRITICAL: Company name is undefined!');
          console.log('  quoteData.company:', quoteData.company);
          console.log('  clientInfo.company:', clientInfo.company);
        }
        if (!userCount || userCount === 0) {
          console.error('❌ CRITICAL: User count is undefined!');
          console.log('  quoteData.configuration.numberOfUsers:', quoteData.configuration?.numberOfUsers);
        }
        if (totalCost === undefined || totalCost === null) {
          console.error('❌ CRITICAL: Total cost is undefined!');
          console.log('  quoteData.calculation.totalCost:', quoteData.calculation?.totalCost);
        }
        
        // CRITICAL: Create comprehensive template data with ALL tokens for your template
        // Calculate comprehensive pricing breakdown for consistency
        const dataCost = quoteData.calculation?.dataCost || 0;
        const instanceCost = quoteData.calculation?.instanceCost || 0;
        const tierName = quoteData.calculation?.tier?.name || 'Advanced';
        const instanceType = quoteData.configuration?.instanceType || 'Standard';
        const numberOfInstances = quoteData.configuration?.numberOfInstances || 1;
        const dataSizeGB = quoteData.configuration?.dataSizeGB || 0;
        
        const templateData: Record<string, string> = {
          // Core company and client information
          '{{Company Name}}': finalCompanyName || 'Demo Company Inc.',
          '{{ Company Name }}': finalCompanyName || 'Demo Company Inc.',
          '{{Company_Name}}': finalCompanyName || 'Demo Company Inc.',
          '{{ Company_Name }}': finalCompanyName || 'Demo Company Inc.',
          '{{company name}}': finalCompanyName || 'Demo Company Inc.',
          '{{clientName}}': clientName || 'Demo Client',
          '{{client_name}}': clientName || 'Demo Client',
          '{{email}}': clientEmail || 'demo@example.com',
          '{{client_email}}': clientEmail || 'demo@example.com',
          
          // Project configuration
          '{{users_count}}': (userCount || 1).toString(),
          '{{userscount}}': (userCount || 1).toString(),
          '{{users}}': (userCount || 1).toString(),
          '{{number_of_users}}': (userCount || 1).toString(),
          '{{instance_type}}': instanceType,
          '{{instanceType}}': instanceType,
          '{{number_of_instances}}': numberOfInstances.toString(),
          '{{numberOfInstances}}': numberOfInstances.toString(),
          '{{instances}}': numberOfInstances.toString(),
          '{{Duration of months}}': (duration || 1).toString(),
          '{{Duration_of_months}}': (duration || 1).toString(),
          '{{Suration_of_months}}': (duration || 1).toString(), // Handle typo version
          '{{duration_months}}': (duration || 1).toString(),
          '{{duration}}': (duration || 1).toString(),
          '{{migration type}}': migrationType || 'Content',
          '{{migration_type}}': migrationType || 'Content',
          '{{migrationType}}': migrationType || 'Content',
          '{{data_size}}': dataSizeGB.toString(),
          '{{dataSizeGB}}': dataSizeGB.toString(),
          '{{data_size_gb}}': dataSizeGB.toString(),
          
          // Pricing breakdown - all costs
          '{{users_cost}}': formatCurrency(userCost || 0),
          '{{user_cost}}': formatCurrency(userCost || 0),
          '{{userCost}}': formatCurrency(userCost || 0),
          '{{price_data}}': formatCurrency(dataCost),
          '{{data_cost}}': formatCurrency(dataCost),
          '{{dataCost}}': formatCurrency(dataCost),
          '{{price_migration}}': formatCurrency(migrationCost || 0),
          '{{migration_cost}}': formatCurrency(migrationCost || 0),
          '{{migration_price}}': formatCurrency(migrationCost || 0),
          '{{migrationCost}}': formatCurrency(migrationCost || 0),
          '{{instance_cost}}': formatCurrency(instanceCost),
          '{{instanceCost}}': formatCurrency(instanceCost),
          '{{instance_costs}}': formatCurrency(instanceCost),
          
          // Total pricing
          '{{total price}}': formatCurrency(totalCost || 0),
          '{{total_price}}': formatCurrency(totalCost || 0),
          '{{totalPrice}}': formatCurrency(totalCost || 0),
          '{{prices}}': formatCurrency(totalCost || 0),
          '{{subtotal}}': formatCurrency(totalCost || 0),
          '{{sub_total}}': formatCurrency(totalCost || 0),
          
          // Discount information - hide discount tokens when discount is 0
        '{{discount}}': (shouldApplyDiscount && discountPercent > 0) ? discountPercent.toString() : '',
        '{{discount_percent}}': (shouldApplyDiscount && discountPercent > 0) ? discountPercent.toString() : '',
          '{{discount_percentage}}': (shouldApplyDiscount && discountPercent > 0) ? discountPercent.toString() : '',
        '{{discount_amount}}': (shouldApplyDiscount && discountAmount > 0) ? formatCurrency(discountAmount) : '',
          '{{discountAmount}}': (shouldApplyDiscount && discountAmount > 0) ? formatCurrency(discountAmount) : '',
          '{{discount_text}}': (shouldApplyDiscount && discountPercent > 0) ? `Discount (${discountPercent}%)` : '',
          '{{discount_line}}': (shouldApplyDiscount && discountAmount > 0) ? `Discount (${discountPercent}%) - ${formatCurrency(discountAmount)}` : '',
        '{{total_after_discount}}': formatCurrency(shouldApplyDiscount ? finalTotalAfterDiscount : totalCost),
          '{{total_price_discount}}': formatCurrency(shouldApplyDiscount ? finalTotalAfterDiscount : totalCost),
          '{{final_total}}': formatCurrency(shouldApplyDiscount ? finalTotalAfterDiscount : totalCost),
          '{{finalTotal}}': formatCurrency(shouldApplyDiscount ? finalTotalAfterDiscount : totalCost),
          
          // Plan and tier information
          '{{tier_name}}': tierName,
          '{{tierName}}': tierName,
          '{{plan_name}}': tierName,
          '{{planName}}': tierName,
          '{{plan}}': tierName,
          
          // Date information
          '{{date}}': clientInfo.effectiveDate ? new Date(clientInfo.effectiveDate).toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }) : new Date().toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }),
          '{{Date}}': clientInfo.effectiveDate ? new Date(clientInfo.effectiveDate).toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }) : new Date().toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }),
          '{{current_date}}': clientInfo.effectiveDate ? new Date(clientInfo.effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          '{{currentDate}}': clientInfo.effectiveDate ? new Date(clientInfo.effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          '{{generation_date}}': clientInfo.effectiveDate ? new Date(clientInfo.effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          '{{effective_date}}': clientInfo.effectiveDate ? new Date(clientInfo.effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          '{{effectiveDate}}': clientInfo.effectiveDate ? new Date(clientInfo.effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          
          // Deal information (if available)
          '{{deal_id}}': dealData?.dealId || 'N/A',
          '{{dealId}}': dealData?.dealId || 'N/A',
          '{{deal_name}}': dealData?.dealName || 'N/A',
          '{{dealName}}': dealData?.dealName || 'N/A',
          '{{deal_amount}}': dealData?.amount || 'N/A',
          '{{dealAmount}}': dealData?.amount || 'N/A',
          '{{deal_stage}}': dealData?.stage || 'N/A',
          '{{dealStage}}': dealData?.stage || 'N/A',
          
          // Messages from configuration
          '{{messages}}': (configuration?.messages || 0).toString(),
          '{{message}}': (configuration?.messages || 0).toString(),
          '{{message_count}}': (configuration?.messages || 0).toString(),
          '{{notes}}': (configuration?.messages || 0).toString(),
          '{{additional_notes}}': (configuration?.messages || 0).toString(),
          '{{additionalNotes}}': (configuration?.messages || 0).toString(),
          '{{custom_message}}': (configuration?.messages || 0).toString(),
          '{{customMessage}}': (configuration?.messages || 0).toString(),
          '{{number_of_messages}}': (configuration?.messages || 0).toString(),
          '{{numberOfMessages}}': (configuration?.messages || 0).toString(),
          '{{messages_count}}': (configuration?.messages || 0).toString(),
          
          // Additional metadata
          '{{template_name}}': selectedTemplate?.name || 'Default Template',
          '{{templateName}}': selectedTemplate?.name || 'Default Template',
          '{{agreement_id}}': `AGR-${Date.now().toString().slice(-8)}`,
          '{{agreementId}}': `AGR-${Date.now().toString().slice(-8)}`,
          '{{quote_id}}': `QTE-${Date.now().toString().slice(-8)}`,
          '{{quoteId}}': `QTE-${Date.now().toString().slice(-8)}`
        };
        
        console.log('🔍 TEMPLATE DATA CREATED:');
        console.log('  Template data keys:', Object.keys(templateData));
        console.log('  Template data values:', Object.values(templateData));
        
        // CRITICAL: Debug each template data entry
        console.log('🔍 TEMPLATE DATA DETAILED DEBUG:');
        Object.entries(templateData).forEach(([key, value]) => {
          if (value === undefined || value === null || value === '') {
            console.error(`❌ CRITICAL: Template data ${key} is undefined/null/empty:`, value);
          } else {
            console.log(`✅ Template data ${key}:`, value);
          }
        });
        
        console.log('📋 Template data for DOCX processing:', templateData);
        
        // Debug: Check each token value individually
        console.log('🔍 Individual token values:');
        console.log('  Company Name:', templateData['{{Company Name}}']);
        console.log('  users_count:', templateData['{{users_count}}']);
        console.log('  users.cost:', templateData['{{users.cost}}']); // FIXED: Check dot notation
        console.log('  users_cost:', templateData['{{users_cost}}']); // Check underscore version
        console.log('  Duration of months:', templateData['{{Duration of months}}']);
        console.log('  total price:', templateData['{{total price}}']);
        console.log('  price_migration:', templateData['{{price_migration}}']);
        
        // Debug: Check the source data
        console.log('🔍 Source data debugging:');
        console.log('  quoteData.company:', quoteData.company);
        console.log('  quoteData.configuration.numberOfUsers:', quoteData.configuration.numberOfUsers);
        console.log('  quoteData.calculation.userCost:', quoteData.calculation.userCost);
        console.log('  quoteData.calculation.migrationCost:', quoteData.calculation.migrationCost);
        console.log('  quoteData.calculation.totalCost:', quoteData.calculation.totalCost);
        console.log('  formatCurrency(0):', formatCurrency(0));
        console.log('  formatCurrency(300):', formatCurrency(300));
        
        // CRITICAL: Final validation - ensure NO undefined values
        const undefinedTokens = Object.entries(templateData).filter(([, value]) => 
          value === undefined || value === null || value === 'undefined' || value === ''
        );
        
        if (undefinedTokens.length > 0) {
          console.error('❌ CRITICAL: Found undefined/null/empty tokens:', undefinedTokens);
          
          // Fix any remaining undefined values
          undefinedTokens.forEach(([key, value]) => {
            console.log(`🔧 Fixing undefined token: ${key} = ${value}`);
            if (key.toLowerCase().includes('company')) {
              templateData[key] = 'Demo Company Inc.';
            } else if (key.toLowerCase().includes('user') && key.toLowerCase().includes('count')) {
              templateData[key] = '1';
            } else if (key.toLowerCase().includes('cost') || key.toLowerCase().includes('price')) {
              templateData[key] = '$0.00';
            } else if (key.toLowerCase().includes('duration') || key.toLowerCase().includes('month')) {
              templateData[key] = '1';
            } else if (key.toLowerCase().includes('migration') && !key.toLowerCase().includes('cost')) {
              templateData[key] = 'Content';
            } else if (key.toLowerCase().includes('client') || key.toLowerCase().includes('name')) {
              templateData[key] = 'Demo Client';
            } else if (key.toLowerCase().includes('email')) {
              templateData[key] = 'demo@example.com';
            } else if (key.toLowerCase().includes('date')) {
              templateData[key] = new Date().toLocaleDateString();
            } else {
              templateData[key] = 'N/A';
            }
          });
          
          console.log('🔧 Fixed undefined tokens:', undefinedTokens.map(([key]) => key));
        } else {
          console.log('✅ All tokens have valid values');
        }
        
        // CRITICAL: Final check - ensure key tokens are not undefined
        const criticalTokens = ['{{Company Name}}', '{{ Company Name }}', '{{Company_Name}}', '{{ Company_Name }}', '{{users_count}}', '{{users_cost}}', '{{Duration of months}}', '{{Duration_of_months}}', '{{total price}}', '{{total_price}}', '{{price_migration}}', '{{company name}}', '{{Date}}'];
        const criticalIssues = criticalTokens.filter(token => 
          !templateData[token] || templateData[token] === 'undefined' || templateData[token] === ''
        );
        
        if (criticalIssues.length > 0) {
          console.error('❌ CRITICAL: Key tokens still have issues:', criticalIssues);
          console.log('🔧 Current values:', criticalIssues.map(token => `${token}: ${templateData[token]}`));
          
          // CRITICAL: Force fix any remaining undefined values
          criticalIssues.forEach(token => {
            console.log(`🔧 FORCE FIXING: ${token}`);
            if (token === '{{Company Name}}' || token === '{{ Company Name }}' || token === '{{Company_Name}}' || token === '{{ Company_Name }}') {
              templateData[token] = finalCompanyName || 'Demo Company Inc.';
            } else if (token === '{{users_count}}') {
              templateData[token] = (userCount || 1).toString();
            } else if (token === '{{users_cost}}') {
              templateData[token] = formatCurrency(userCost || 0);
            } else if (token === '{{Duration of months}}' || token === '{{Duration_of_months}}') {
              templateData[token] = (duration || 1).toString();
            } else if (token === '{{total price}}' || token === '{{total_price}}') {
              templateData[token] = formatCurrency(totalCost || 0);
            } else if (token === '{{price_migration}}') {
              templateData[token] = formatCurrency(migrationCost || 0);
            } else if (token === '{{company name}}') {
              templateData[token] = finalCompanyName || 'Demo Company Inc.';
            } else if (token === '{{Date}}') {
              templateData[token] = clientInfo.effectiveDate ? new Date(clientInfo.effectiveDate).toLocaleDateString('en-US', {
                year: '2-digit', 
                month: '2-digit', 
                day: '2-digit' 
              }) : new Date().toLocaleDateString('en-US', {
                year: '2-digit', 
                month: '2-digit', 
                day: '2-digit' 
              });
            }
            console.log(`🔧 FIXED: ${token} = ${templateData[token]}`);
          });
        } else {
          console.log('✅ All critical tokens have valid values');
        }
        
        // CRITICAL: Show the exact values being sent for the key tokens
        console.log('🎯 FINAL TOKEN VALUES BEING SENT:');
        console.log('  Company Name:', templateData['{{Company Name}}']);
        console.log('  Company Name (spaces):', templateData['{{ Company Name }}']);
        console.log('  Company_Name:', templateData['{{Company_Name}}']);
        console.log('  Company_Name (spaces):', templateData['{{ Company_Name }}']);
        console.log('  users_count:', templateData['{{users_count}}']);
        console.log('  users_cost:', templateData['{{users_cost}}']);
        console.log('  Duration of months:', templateData['{{Duration of months}}']);
        console.log('  Duration_of_months:', templateData['{{Duration_of_months}}']);
        console.log('  total price:', templateData['{{total price}}']);
        console.log('  total_price:', templateData['{{total_price}}']);
        console.log('  price_migration:', templateData['{{price_migration}}']);
        console.log('  company name:', templateData['{{company name}}']);
        
        // Debug: Show the exact data being sent to DOCX processor
        console.log('🚀 SENDING TO DOCX PROCESSOR:');
        console.log('  Template file:', selectedTemplate.file.name);
        console.log('  Template file type:', selectedTemplate.file.type);
        console.log('  Template data keys:', Object.keys(templateData));
        console.log('  Template data values:', Object.values(templateData));
        
        // Debug: Check if the data looks correct
        console.log('🔍 DATA VALIDATION:');
        console.log('  Company name valid?', !!templateData['{{Company Name}}']);
        console.log('  Users count valid?', !!templateData['{{users_count}}']);
        console.log('  Users cost valid?', !!templateData['{{users_cost}}']);
        console.log('  Duration valid?', !!templateData['{{Duration of months}}']);
        console.log('  Total price valid?', !!templateData['{{total price}}']);
        
        // DIAGNOSTIC: Run comprehensive template analysis
        console.log('🔍 Running comprehensive template diagnostic...');
        const { TemplateDiagnostic } = await import('../utils/templateDiagnostic');
        const diagnostic = await TemplateDiagnostic.diagnoseTemplate(
          selectedTemplate.file,
          templateData
        );
        
        console.log('📊 DIAGNOSTIC RESULTS:');
        console.log('  Template tokens found:', diagnostic.templateTokens);
        console.log('  Data tokens provided:', diagnostic.dataTokens);
        console.log('  Missing tokens:', diagnostic.missingTokens);
        console.log('  Mismatched tokens:', diagnostic.mismatchedTokens);
        console.log('  File info:', diagnostic.fileInfo);
        console.log('  Document structure:', diagnostic.documentStructure);
        console.log('  Recommendations:', diagnostic.recommendations);
        
        // Show diagnostic results to user
        if (diagnostic.missingTokens.length > 0 || diagnostic.mismatchedTokens.length > 0) {
          const issueMessage = `
🔍 TEMPLATE DIAGNOSTIC RESULTS:

❌ ISSUES FOUND:
${diagnostic.missingTokens.length > 0 ? `• Missing data for tokens: ${diagnostic.missingTokens.join(', ')}` : ''}
${diagnostic.mismatchedTokens.length > 0 ? `• Token format mismatches: ${diagnostic.mismatchedTokens.join(', ')}` : ''}

📋 TEMPLATE TOKENS FOUND:
${diagnostic.templateTokens.map(token => `• {{${token}}}`).join('\n')}

📊 DATA TOKENS PROVIDED:
${diagnostic.dataTokens.map(token => `• ${token}`).join('\n')}

💡 RECOMMENDATIONS:
${diagnostic.recommendations.map(rec => `• ${rec}`).join('\n')}

⚠️ Please check your template and ensure token names match exactly!
          `.trim();
          
          console.error('❌ Template diagnostic found issues:', issueMessage);
          alert(issueMessage);
          
          // CRITICAL: Stop processing if diagnostic finds issues
          throw new Error('Template diagnostic found issues. Please fix the token mismatches before proceeding.');
        } else {
          console.log('✅ Template diagnostic passed - all tokens match correctly!');
        }

        // Process DOCX template
        console.log('🚀 FINAL TEMPLATE DATA BEING SENT TO DOCX PROCESSOR:');
        console.log('  Template file:', selectedTemplate.file.name);
        console.log('  Template data keys:', Object.keys(templateData));
        console.log('  Template data values:', Object.values(templateData));
        
        // Critical tokens validation already performed earlier in the code
        
        // CRITICAL: Log the exact templateData being sent to DOCX processor
        console.log('🎯 SENDING TO DOCX PROCESSOR:');
        console.log('  templateData keys:', Object.keys(templateData));
        console.log('  templateData.{{Company Name}}:', templateData['{{Company Name}}']);
        console.log('  templateData.{{ Company Name }}:', templateData['{{ Company Name }}']);
        console.log('  templateData.{{Company_Name}}:', templateData['{{Company_Name}}']);
        console.log('  templateData.{{ Company_Name }}:', templateData['{{ Company_Name }}']);
        console.log('  templateData.{{company name}}:', templateData['{{company name}}']);
        console.log('  templateData.{{company_name}}:', templateData['{{company_name}}']);
        
        const result = await DocxTemplateProcessor.processDocxTemplate(
          selectedTemplate.file,
          templateData
        );

        if (result.success && result.processedDocx) {
          processedDocument = result.processedDocx;
          
            console.log('✅ DOCX template processed successfully');
            console.log('📊 Processing time:', result.processingTime + 'ms');
            console.log('📊 Tokens replaced:', result.tokensReplaced || 0);
          console.log('📄 Processed DOCX size:', result.processedDocx.size, 'bytes');
          console.log('📄 Processed DOCX type:', result.processedDocx.type);
        } else {
          console.error('❌ DOCX processing failed:', result.error);
          throw new Error(result.error || 'Failed to process DOCX template');
        }

      } else if (selectedTemplate.file.type === 'application/pdf') {
        console.log('🔄 Processing PDF template (Fallback Method)...');
        console.log('⚠️ Note: PDF processing is less reliable. Consider using DOCX templates for better results.');
        
        // Import PDF orchestrator
        const { pdfOrchestrator } = await import('../utils/pdfOrchestratorIntegration');
        
        // Debug: Log the quote data being passed
        console.log('🔍 Quote data being passed to PDF orchestrator:', {
          company: quoteData.company,
          clientName: quoteData.clientName,
          clientEmail: quoteData.clientEmail,
          configuration: quoteData.configuration,
          calculation: quoteData.calculation,
          selectedPlan: quoteData.selectedPlan
        });
        
        // Process PDF template with quote data
        const result = await pdfOrchestrator.buildMergedPDFFromFile(
          selectedTemplate.file,
          quoteData
        );

        if (result.success && result.mergedPDF) {
          processedDocument = result.mergedPDF;
          
            console.log('✅ PDF template processed successfully');
            console.log('📊 Processing completed');
          console.log('📄 Merged PDF size:', result.mergedPDF.size, 'bytes');
          console.log('📄 Merged PDF type:', result.mergedPDF.type);
        } else {
          console.error('❌ PDF processing failed:', result.error);
          throw new Error(result.error || 'Failed to process PDF template');
        }

      } else {
        throw new Error('Unsupported template file type. Please use PDF or DOCX files.');
      }

      // Show preview of the processed agreement
      if (processedDocument) {
        console.log('✅ Agreement processed successfully');
        console.log('📄 Processed document size:', processedDocument.size, 'bytes');
        console.log('📄 Processed document type:', processedDocument.type);
        
        // Store the processed document for preview and download
        setProcessedAgreement(processedDocument);
        
        // For DOCX files render with docx-preview to match exact document formatting
        if (processedDocument.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          // Open modal first so container exists, then render
          setShowAgreementPreview(true);
          await delayFrame();
          try {
            await renderDocxPreview(processedDocument);
            return;
          } catch (err) {
            console.warn('docx-preview render failed in initial flow, trying mammoth HTML fallback.', err);
          }
          try {
            console.log('🔄 Converting DOCX to HTML for preview with exact formatting...');
            const mammoth = await import('mammoth');
            
            const arrayBuffer = await processedDocument.arrayBuffer();
            const result = await mammoth.convertToHtml({ 
              arrayBuffer,
              styleMap: [
                // Preserve table formatting
                "p[style-name='Table Heading'] => h3.table-heading",
                "p[style-name='Table Text'] => p.table-text",
                "r[style-name='Strong'] => strong",
                "r[style-name='Emphasis'] => em",
                // Preserve colors and formatting
                "r[style-name='Highlight'] => span.highlight",
                "r[style-name='Heading 1'] => h1.heading-1",
                "r[style-name='Heading 2'] => h2.heading-2",
                "r[style-name='Heading 3'] => h3.heading-3",
                // Preserve table styles
                "table => table.docx-table",
                "tr => tr.docx-row",
                "td => td.docx-cell",
                "th => th.docx-header",
                // Preserve headers and footers
                "p[style-name='Header'] => div.docx-header",
                "p[style-name='Footer'] => div.docx-footer",
                // Preserve page breaks
                "br[type='page'] => div.page-break"
              ],
              convertImage: mammoth.images.imgElement(function(image) {
                return image.read("base64").then(function(imageBuffer) {
                  return {
                    src: "data:" + image.contentType + ";base64," + imageBuffer
                  };
                });
              })
            } as any);
            
            console.log('✅ DOCX converted to HTML with exact formatting');
            console.log('📄 HTML length:', result.value.length);
            console.log('📄 Warnings:', result.messages);
            
            // Create HTML document with exact DOCX styling preserved
            const htmlContent = `
              <!DOCTYPE html>
              <html>
              <head>
                <title>Document Preview - Exact DOCX Formatting</title>
                <meta charset="UTF-8">
                <style>
                  /* Reset and base styles */
                  * {
                    box-sizing: border-box;
                  }
                  
                  body { 
                    font-family: 'Times New Roman', serif; 
                    margin: 0;
                    padding: 40px;
                    line-height: 1.6;
                    color: #000;
                    background: white;
                    font-size: 12pt;
                  }
                  
                  /* Preserve exact DOCX formatting */
                  .docx-table {
                    border-collapse: collapse;
                    width: 100%;
                    margin: 20px 0;
                    border: 1px solid #000;
                  }
                  
                  .docx-row {
                    border: 1px solid #000;
                  }
                  
                  .docx-cell, .docx-header {
                    border: 1px solid #000;
                    padding: 8px 12px;
                    vertical-align: top;
                    text-align: left;
                  }
                  
                  .docx-header {
                    background-color: #f2f2f2;
                    font-weight: bold;
                    text-align: center;
                  }
                  
                  /* Preserve heading styles */
                  h1, h2, h3, h4, h5, h6 {
                    color: #000;
                    margin-top: 20px;
                    margin-bottom: 10px;
                    font-weight: bold;
                  }
                  
                  h1 { font-size: 18pt; }
                  h2 { font-size: 16pt; }
                  h3 { font-size: 14pt; }
                  h4 { font-size: 12pt; }
                  
                  /* Preserve paragraph formatting */
                  p {
                    margin-bottom: 10px;
                    text-align: left;
                    font-size: 12pt;
                    line-height: 1.15;
                  }
                  
                  /* Preserve text formatting */
                  strong, b {
                    font-weight: bold;
                  }
                  
                  em, i {
                    font-style: italic;
                  }
                  
                  .highlight {
                    background-color: #ffff00;
                    padding: 1px 2px;
                  }
                  
                  /* Preserve list formatting */
                  ul, ol {
                    margin: 10px 0;
                    padding-left: 30px;
                  }
                  
                  li {
                    margin-bottom: 5px;
                  }
                  
                  /* Preserve table alignment */
                  .docx-table td[align="center"] {
                    text-align: center;
                  }
                  
                  .docx-table td[align="right"] {
                    text-align: right;
                  }
                  
                  .docx-table td[align="left"] {
                    text-align: left;
                  }
                  
                  /* Preserve colors and backgrounds */
                  .docx-table tr:nth-child(even) {
                    background-color: #f9f9f9;
                  }
                  
                  /* Preserve spacing */
                  .docx-table td {
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                  }
                  
                  /* Preserve page layout */
                  @media print {
                    body {
                      margin: 0;
                      padding: 20px;
                    }
                  }
                  
                  /* Preserve headers and footers */
                  .docx-header {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    background: white;
                    border-bottom: 1px solid #ccc;
                    padding: 10px;
                    font-size: 10pt;
                    z-index: 1000;
                  }
                  
                  .docx-footer {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: white;
                    border-top: 1px solid #ccc;
                    padding: 10px;
                    font-size: 10pt;
                    z-index: 1000;
                  }
                  
                  /* Preserve page breaks */
                  .page-break {
                    page-break-before: always;
                    break-before: page;
                    margin: 20px 0;
                    border-top: 1px dashed #ccc;
                    padding-top: 20px;
                  }
                  
                  /* Adjust body padding for headers/footers */
                  body {
                    padding-top: 60px;
                    padding-bottom: 60px;
                  }
                  
                  /* Ensure exact DOCX appearance */
                  .docx-content {
                    max-width: 100%;
                    margin: 0 auto;
                  }
                </style>
              </head>
              <body>
                <div class="docx-content">
                  ${result.value}
                </div>
              </body>
              </html>
            `;
            
            // Create blob URL for the HTML content
            const htmlBlobForInitial = new Blob([htmlContent], { type: 'text/html' });
            const previewUrl = URL.createObjectURL(htmlBlobForInitial);
            
            setPreviewUrl(previewUrl);
            setShowInlinePreview(true); // Show the HTML preview by default
            console.log('🔗 HTML preview URL created:', previewUrl);
            
          } catch (error) {
            console.error('❌ Error converting DOCX to HTML:', error);
            // Fallback to direct document URL
            const previewUrl = URL.createObjectURL(processedDocument);
            setPreviewUrl(previewUrl);
            setShowInlinePreview(true);
          }
        } else {
          // For PDF files, use direct URL
          const previewUrl = URL.createObjectURL(processedDocument);
          setPreviewUrl(previewUrl);
          setShowInlinePreview(true);
        }
        
        setShowAgreementPreview(true);
        
        // Show success message
        alert(`✅ Agreement generated successfully!\n\nTemplate: ${selectedTemplate.name}\nClient: ${clientInfo.clientName}\nTotal Cost: ${formatCurrency(currentCalculation.totalCost)}\n\n📄 Please review the preview below. If everything looks correct, click "Download Agreement" to save the file.`);
      }

    } catch (error) {
      console.error('❌ Error generating agreement:', error);
      alert(`Error generating agreement: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again or contact support.`);
    } finally {
      setIsGeneratingAgreement(false);
    }
  };

  const handleSendQuote = async () => {
    try {
      // Create quote object
      const quote = {
        id: `quote-001`,
        clientName: clientInfo.clientName,
        clientEmail: clientInfo.clientEmail,
        company: clientInfo.company,
        configuration: configuration,
        calculation: safeCalculation,
        selectedTier: safeCalculation.tier,
        status: 'draft' as const,
        createdAt: new Date(),
        templateUsed: selectedTemplate ? {
          id: selectedTemplate.id,
          name: selectedTemplate.name,
          isDefault: false
        } : { id: 'default', name: 'Default Template', isDefault: true }
      };

      // If a custom template is selected, use it for PDF generation
      if (selectedTemplate && selectedTemplate.file) {
        console.log('Using custom template:', selectedTemplate.name);
        
        try {
        // Generate quote number
        const quoteNumber = `CPQ-001`;
        
          // Check if this is an SOW template with placeholders
          const { detectPlaceholders } = await import('../utils/pdfMerger');
          const isSowTemplate = await detectPlaceholders(selectedTemplate.file);
          
          let mergedPdfBlob;
          
          if (isSowTemplate) {
            // Use placeholder replacement for SOW templates
            console.log('📄 Detected SOW template, using placeholder replacement...');
            const { mergeQuoteWithPlaceholders } = await import('../utils/pdfMerger');
            const { quoteBlob, newTemplateBlob } = await mergeQuoteWithPlaceholders(selectedTemplate.file, quote, quoteNumber);
            
            // Download the quote PDF
            const quoteFileName = `Quote-${clientInfo.clientName.replace(/\s+/g, '-')}-${selectedTemplate.name}.pdf`;
            const quoteUrl = URL.createObjectURL(quoteBlob);
            const quoteLink = document.createElement('a');
            quoteLink.href = quoteUrl;
            quoteLink.download = quoteFileName;
            document.body.appendChild(quoteLink);
            quoteLink.click();
            document.body.removeChild(quoteLink);
            URL.revokeObjectURL(quoteUrl);
            
            // Download the new template
            const templateFileName = `New-Template-${selectedTemplate.name}-${new Date().toISOString().split('T')[0]}.pdf`;
            const templateUrl = URL.createObjectURL(newTemplateBlob);
            const templateLink = document.createElement('a');
            templateLink.href = templateUrl;
            templateLink.download = templateFileName;
            document.body.appendChild(templateLink);
            templateLink.click();
            document.body.removeChild(templateLink);
            URL.revokeObjectURL(templateUrl);
            
            console.log('✅ Quote generated with SOW template and new template created successfully');
            
            // Show success message
            alert(`✅ Quote generated successfully!\n\n📄 Quote PDF: ${quoteFileName}\n📄 New Template: ${templateFileName}\n\nBoth files have been downloaded. The new template contains your current data and can be used for future quotes.`);
            
          } else {
            // Use regular template merge for other templates
            console.log('📄 Using regular template merge...');
            const { mergeQuoteIntoTemplate } = await import('../utils/pdfMerger');
            mergedPdfBlob = await mergeQuoteIntoTemplate(selectedTemplate.file, quote, quoteNumber);
            
            // Download the merged PDF
            const fileName = `Quote-${clientInfo.clientName.replace(/\s+/g, '-')}-${selectedTemplate.name}.pdf`;
            const url = URL.createObjectURL(mergedPdfBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log('✅ Quote generated with custom template successfully');
            
            // Show success message
            alert(`Quote PDF "${fileName}" has been generated using custom template "${selectedTemplate.name}" and downloaded successfully!`);
          }
          
        } catch (error) {
          console.error('Error merging with template:', error);
          alert('Error generating quote with template. Using default template instead.');
          
          // Fallback to default template
          if (onGenerateQuote) {
            onGenerateQuote(quote);
          }
        }
      } else {
        // Use default template (existing logic)
        console.log('Using default template');
        
        // Call the onGenerateQuote callback
        if (onGenerateQuote) {
          onGenerateQuote(quote);
        }
      }
    } catch (error) {
      console.error('Error generating quote:', error);
      alert('Error generating quote. Please try again.');
    }
  };

  // If HubSpot is not connected, show connection message
  if (hubspotState && !hubspotState.isConnected) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">HubSpot Not Connected</h2>
          <p className="text-gray-600 mb-6">
            Please connect to HubSpot in the HubSpot tab to automatically populate client information from your contacts.
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Manual Client Information</h3>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="group">
                <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  Client Name
                </label>
                <input
                  type="text"
                  required
                  value={clientInfo.clientName}
                  onChange={(e) => updateClientInfo({ clientName: e.target.value })}
                  className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                  placeholder="Enter client name"
                />
              </div>

              <div className="group">
                <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Mail className="w-4 h-4 text-white" />
                  </div>
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={clientInfo.clientEmail}
                  onChange={(e) => updateClientInfo({ clientEmail: e.target.value })}
                  className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                  placeholder="Enter email address"
                />
              </div>

              <div className="group">
                <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Building className="w-4 h-4 text-white" />
                  </div>
                  Company Name
                </label>
                <input
                  type="text"
                  required
                  value={clientInfo.company}
                  onChange={(e) => updateClientInfo({ company: e.target.value })}
                  className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                  placeholder="Enter company name"
                />
                {clientInfo.company && hubspotState?.selectedContact && (
                  <p className="text-sm text-blue-600 mt-2 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    {hubspotState.selectedContact.properties.company 
                      ? 'Company name from HubSpot contact'
                      : 'Company name auto-extracted from email domain'
                    }
                  </p>
                )}
              </div>

              {/* Effective Date */}
              <div className="group">
                <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Calendar className="w-4 h-4 text-white" />
                  </div>
                  Effective Date
                </label>
                <input
                  type="date"
                  value={clientInfo.effectiveDate || ''}
                  onChange={(e) => setClientInfo({ ...clientInfo, effectiveDate: e.target.value })}
                  className="w-full px-6 py-5 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-xl font-medium"
                  style={{ 
                    fontSize: '18px',
                    height: '60px',
                    paddingTop: '18px',
                    paddingBottom: '18px'
                  }}
                />
              </div>

              {/* Discount field moved to Configure session */}

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white py-4 px-8 rounded-2xl font-bold text-lg hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 transition-all duration-500 transform hover:scale-105 hover:shadow-2xl shadow-xl relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <span className="relative flex items-center justify-center gap-3">
                  <FileText className="w-5 h-5" />
                  Generate Quote
                  <Sparkles className="w-5 h-5" />
                </span>
              </button>

              {/* Generate Agreement Button */}
              <button
                type="button"
                onClick={handleGenerateAgreement}
                disabled={!selectedTemplate || isGeneratingAgreement}
                className={`w-full mt-4 py-4 px-8 rounded-2xl font-bold text-lg transition-all duration-500 transform shadow-xl relative overflow-hidden group ${
                  selectedTemplate && !isGeneratingAgreement
                    ? 'bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 text-white hover:from-green-700 hover:via-emerald-700 hover:to-teal-700 hover:scale-105 hover:shadow-2xl' 
                    : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <span className="relative flex items-center justify-center gap-3">
                  {isGeneratingAgreement ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileText className="w-5 h-5" />
                      Generate Agreement
                      <Sparkles className="w-5 h-5" />
                    </>
                  )}
                </span>
              </button>

              {/* Email Agreement Button */}
              <button
                type="button"
                onClick={handleEmailAgreement}
                disabled={isEmailingAgreement || !selectedTemplate}
                className={`w-full mt-4 py-4 px-8 rounded-2xl font-bold text-lg transition-all duration-500 transform shadow-xl relative overflow-hidden group ${
                  isEmailingAgreement
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white hover:from-emerald-700 hover:via-teal-700 hover:to-cyan-700 hover:scale-105 hover:shadow-2xl'
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <span className="relative flex items-center justify-center gap-3">
                  {isEmailingAgreement ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-5 h-5" />
                      Email Agreement
                      <Send className="w-5 h-5" />
                    </>
                  )}
                </span>
              </button>

              {/* Send to Deal Desk Button */}
              <button
                type="button"
                onClick={handleSendToDealDesk}
                disabled={isSendingToDealDesk}
                className={`w-full mt-4 py-4 px-8 rounded-2xl font-bold text-lg transition-all duration-500 transform shadow-xl relative overflow-hidden group ${
                  isSendingToDealDesk
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white hover:from-purple-700 hover:via-indigo-700 hover:to-blue-700 hover:scale-105 hover:shadow-2xl'
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <span className="relative flex items-center justify-center gap-3">
                  {isSendingToDealDesk ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Preparing Email...
                    </>
                  ) : (
                    <>
                      <Briefcase className="w-5 h-5" />
                      Send to Deal Desk
                      <Send className="w-5 h-5" />
                    </>
                  )}
                </span>
              </button>

            {/* Placeholder Preview Button */}
            {selectedTemplate && (
              <button
                type="button"
                onClick={generatePlaceholderPreview}
                className="w-full mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 px-8 rounded-2xl font-bold text-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-500 transform hover:scale-105 hover:shadow-2xl shadow-xl relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <span className="relative flex items-center justify-center gap-3">
                  <Eye className="w-5 h-5" />
                  Preview Placeholder Replacement
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </span>
              </button>
            )}

            {/* Placeholder Replacement Button */}
            {selectedTemplate && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    // Create quote object
                    const quote = {
                      id: `quote-001`,
                      clientName: clientInfo.clientName,
                      clientEmail: clientInfo.clientEmail,
                      company: clientInfo.company,
                      configuration: configuration,
                      calculation: safeCalculation,
                      selectedTier: safeCalculation.tier,
                      status: 'draft' as const,
                      createdAt: new Date(),
                      templateUsed: {
                        id: selectedTemplate.id,
                        name: selectedTemplate.name,
                        isDefault: false
                      }
                    };

                    const quoteNumber = `CPQ-001`;
                    
                    console.log('🔄 Starting placeholder replacement for template:', selectedTemplate.name);
                    
                    // Check if template has placeholders
                    const { detectPlaceholders } = await import('../utils/pdfMerger');
                    const hasPlaceholders = await detectPlaceholders(selectedTemplate.file);
                    
                    if (!hasPlaceholders) {
                      alert('⚠️ No placeholders detected in this template. Make sure your template contains placeholders like {{company_name}}, {{users}}, etc.');
                      return;
                    }
                    
                    // Use placeholder replacement
                    const { mergeQuoteWithPlaceholders } = await import('../utils/pdfMerger');
                    const { quoteBlob, newTemplateBlob } = await mergeQuoteWithPlaceholders(selectedTemplate.file, quote, quoteNumber);
                    
                    // Download the quote PDF
                    const quoteFileName = `Quote-${clientInfo.clientName.replace(/\s+/g, '-')}-${selectedTemplate.name}-PLACEHOLDERS.pdf`;
                    const quoteUrl = URL.createObjectURL(quoteBlob);
                    const quoteLink = document.createElement('a');
                    quoteLink.href = quoteUrl;
                    quoteLink.download = quoteFileName;
                    document.body.appendChild(quoteLink);
                    quoteLink.click();
                    document.body.removeChild(quoteLink);
                    URL.revokeObjectURL(quoteUrl);
                    
                    // Download the new template
                    const templateFileName = `New-Template-${selectedTemplate.name}-${new Date().toISOString().split('T')[0]}.pdf`;
                    const templateUrl = URL.createObjectURL(newTemplateBlob);
                    const templateLink = document.createElement('a');
                    templateLink.href = templateUrl;
                    templateLink.download = templateFileName;
                    document.body.appendChild(templateLink);
                    templateLink.click();
                    document.body.removeChild(templateLink);
                    URL.revokeObjectURL(templateUrl);
                    
                    console.log('✅ Placeholder replacement and new template creation completed successfully');
                    alert(`✅ Process completed successfully!\n\n📄 Quote PDF: ${quoteFileName}\n📄 New Template: ${templateFileName}\n\nBoth files have been downloaded. The new template contains your current data and can be used for future quotes.`);
                    
                  } catch (error) {
                    console.error('❌ Placeholder replacement failed:', error);
                    alert(`❌ Placeholder replacement failed:\n\n${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease check that your template contains valid placeholders and try again.`);
                  }
                }}
                className="w-full mt-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 px-8 rounded-2xl font-bold text-lg hover:from-green-700 hover:to-emerald-700 transition-all duration-500 transform hover:scale-105 hover:shadow-2xl shadow-xl relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <span className="relative flex items-center justify-center gap-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Replace Placeholders
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </span>
              </button>
            )}
            </form>
          </div>
        </div>
      </div>
    );
  }

  const QuotePreview = ({ dealData }: { dealData?: any }) => {
    // Debug the discount values in QuotePreview
    console.log('🔍 QuotePreview render with discount values:', {
      clientInfoDiscount: clientInfo.discount,
      discountPercent,
      shouldApplyDiscount,
      discountAmount,
      finalTotalAfterDiscount,
      totalCost
    });
    
    return (
    <div data-quote-preview className="bg-gradient-to-br from-white via-slate-50/30 to-blue-50/20 p-10 border-2 border-blue-100 rounded-2xl shadow-2xl max-w-5xl mx-auto backdrop-blur-sm">
      {/* Header */}
      <div className="flex justify-between items-start mb-10 pb-6 border-b-2 border-gradient-to-r from-blue-200 to-indigo-200">
        <div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent mb-3">
            PROFESSIONAL QUOTE
          </h1>
          <p className="text-gray-700 font-semibold text-lg">Quote #{quoteId || generateUniqueQuoteId()}</p>
          <p className="text-gray-600 font-medium">{new Date().toLocaleDateString()}</p>
        </div>
        <div className="text-right">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-6 rounded-2xl shadow-lg">
            <h2 className="text-2xl font-bold mb-2">{companyInfo?.name || 'CPQ Pro Solutions'}</h2>
            <p className="opacity-90">{companyInfo?.address || '123 Business St.'}</p>
            <p className="opacity-90">{companyInfo?.city || 'City, State 12345'}</p>
            <p className="opacity-90">{companyInfo?.email || 'contact@cpqsolutions.com'}</p>
          </div>
        </div>
      </div>

      {/* Client Info */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-8 rounded-2xl mb-10 border border-blue-200">
        <h3 className="font-bold text-gray-900 mb-6 text-xl flex items-center gap-2">
          <User className="w-6 h-6 text-blue-600" />
          Bill To:
        </h3>
        <div className="space-y-2">
          <p className="font-bold text-lg text-gray-900">{clientInfo.clientName}</p>
          <p className="text-gray-700 font-semibold">{clientInfo.company}</p>
          <p className="text-gray-600 font-medium">{clientInfo.clientEmail}</p>
        </div>
      </div>

      {/* Deal Information */}
      {(dealData && (dealData.dealId || dealData.dealName)) && (
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-8 rounded-2xl mb-10 border border-purple-200">
          <h3 className="font-bold text-gray-900 mb-6 text-xl flex items-center gap-2">
            <Building className="w-6 h-6 text-purple-600" />
            Deal Information:
          </h3>
          <div className="grid grid-cols-2 gap-6">
            {dealData.dealId && (
              <div className="flex justify-between items-center bg-white/60 p-4 rounded-xl">
                <span className="text-gray-700 font-semibold">Deal ID:</span>
                <span className="font-bold text-gray-900">{dealData.dealId}</span>
              </div>
            )}
            {dealData.dealName && (
              <div className="flex justify-between items-center bg-white/60 p-4 rounded-xl">
                <span className="text-gray-700 font-semibold">Deal Name:</span>
                <span className="font-bold text-gray-900">{dealData.dealName}</span>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Project Details */}
      <div className="mb-10">
        <h3 className="font-bold text-gray-900 mb-6 text-xl flex items-center gap-2">
          <FileText className="w-6 h-6 text-blue-600" />
          Project Configuration:
        </h3>
        <div className="grid grid-cols-2 gap-6">
          <div className="flex justify-between items-center bg-white/60 p-4 rounded-xl">
            <span className="text-gray-700 font-semibold">Number of Users:</span>
            <span className="font-bold text-gray-900">{configuration.numberOfUsers}</span>
          </div>
          <div className="flex justify-between items-center bg-white/60 p-4 rounded-xl">
            <span className="text-gray-700 font-semibold">Instance Type:</span>
            <span className="font-bold text-gray-900">{configuration.instanceType}</span>
          </div>
          <div className="flex justify-between items-center bg-white/60 p-4 rounded-xl">
            <span className="text-gray-700 font-semibold">Number of Instances:</span>
            <span className="font-bold text-gray-900">{configuration.numberOfInstances}</span>
          </div>
          <div className="flex justify-between items-center bg-white/60 p-4 rounded-xl">
            <span className="text-gray-700 font-semibold">Duration:</span>
            <span className="font-bold text-gray-900">{configuration.duration} months</span>
          </div>
          <div className="flex justify-between items-center bg-white/60 p-4 rounded-xl">
            <span className="text-gray-700 font-semibold">Migration Type:</span>
            <span className="font-bold text-gray-900">{configuration.migrationType}</span>
          </div>
          <div className="flex justify-between items-center bg-white/60 p-4 rounded-xl">
            <span className="text-gray-700 font-semibold">Data Size:</span>
            <span className="font-bold text-gray-900">{configuration.dataSizeGB} GB</span>
          </div>
          <div className="flex justify-between items-center bg-white/60 p-4 rounded-xl">
            <span className="text-gray-700 font-semibold">Messages:</span>
            <span className="font-bold text-gray-900">{configuration.messages || 0}</span>
          </div>
        </div>
      </div>

      {/* Pricing Breakdown */}
      <div className="mb-10">
        <h3 className="font-bold text-gray-900 mb-6 text-xl flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-blue-600" />
          Pricing Breakdown - {safeCalculation.tier.name} Plan:
        </h3>
        <div className="bg-white/80 rounded-2xl p-6 shadow-lg">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-blue-200">
              <th className="text-left py-4 text-gray-800 font-bold text-lg">Description</th>
              <th className="text-right py-4 text-gray-800 font-bold text-lg">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="py-4 text-gray-700 font-medium">User costs ({configuration.numberOfUsers} users × {configuration.duration} months)</td>
              <td className="text-right py-4 font-bold text-gray-900">{formatCurrency(safeCalculation.userCost)}</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-4 text-gray-700 font-medium">Data costs ({configuration.dataSizeGB} GB)</td>
              <td className="text-right py-4 font-bold text-gray-900">{formatCurrency(safeCalculation.dataCost)}</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-4 text-gray-700 font-medium">Migration services</td>
              <td className="text-right py-4 font-bold text-gray-900">{formatCurrency(safeCalculation.migrationCost)}</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-4 text-gray-700 font-medium">Instance costs ({configuration.numberOfInstances} instances)</td>
              <td className="text-right py-4 font-bold text-gray-900">{formatCurrency(safeCalculation.instanceCost)}</td>
            </tr>
            <tr className="border-t-2 border-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50">
              <td className="py-6 font-bold text-xl text-gray-900">Subtotal (Total Project Cost)</td>
              <td className="text-right py-6 font-bold text-2xl text-blue-600">{formatCurrency(totalCost)}</td>
            </tr>
{shouldApplyDiscount && (
          <tr className="border-b border-gray-200">
            <td className="py-4 text-gray-700 font-medium">Discount ({discountPercent.toString()}%)</td>
            <td className="text-right py-4 font-bold text-red-600">- {formatCurrency(discountAmount)}</td>
          </tr>
        )}
        {/* Debug: Always show discount debug info - see console */}
        <tr className="border-t-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50">
          <td className="py-6 font-bold text-xl text-gray-900">Total After Discount</td>
          <td className="text-right py-6 font-bold text-2xl text-emerald-700">
            {formatCurrency(shouldApplyDiscount ? finalTotalAfterDiscount : totalCost)}
          </td>
        </tr>
        {!shouldApplyDiscount && (clientInfo.discount ?? storedDiscountPercent ?? 0) > 0 && (
          <tr>
            <td colSpan={2} className="py-3 text-center text-sm text-amber-600">
              Discount entered in Configure session did not apply because the project total is below $2,500 or exceeds the 10% cap.
            </td>
          </tr>
        )}
        {isDiscountAllowed && hasValidDiscount && !isDiscountValid && (
          <tr className="border-b border-red-200 bg-red-50">
            <td colSpan={2} className="py-3 text-center">
              <p className="text-sm text-red-600 font-medium">
                ⚠️ Discount not applied: Final total would be below $2,500 minimum
              </p>
            </td>
          </tr>
        )}
          </tbody>
        </table>
        </div>
      </div>

    </div>
    );
  };

  if (showPreview) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center bg-gradient-to-r from-white to-blue-50 p-6 rounded-2xl shadow-lg">
          <div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-blue-900 bg-clip-text text-transparent">
              Quote Preview
            </h2>
            <p className="text-gray-600 mt-1">Review your professional quote before sending</p>
          </div>
          <div className="flex space-x-4">
            <button
              onClick={() => setShowPreview(false)}
              className="px-6 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-300 font-semibold flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              Back
            </button>
            <button 
              onClick={handleDownloadPDF}
              className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all duration-300 font-semibold flex items-center gap-2 shadow-lg"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
            <button 
              onClick={handleGenerateAgreement}
              disabled={!selectedTemplate || isGeneratingAgreement}
              className={`px-6 py-3 rounded-xl transition-all duration-300 font-semibold flex items-center gap-2 shadow-lg ${
                !selectedTemplate || isGeneratingAgreement
                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700'
              }`}
            >
              {isGeneratingAgreement ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Generate Agreement
                </>
              )}
            </button>
            {/* Generate PDF Quote button removed as requested */}
          </div>
        </div>
        <QuotePreview dealData={dealData} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
          <FileText className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Generate Professional Quote</h1>
        <p className="text-gray-600">Create a detailed quote for your client</p>
      </div>

      <div className="flex justify-center">
        {/* Client Information Form */}
        <div className="w-full max-w-2xl">
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">

            {/* Template Selection Indicator */}
            {selectedTemplate ? (
              <div className="flex items-center justify-between mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <FileText className="w-3 h-3 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">Template Selected</h3>
                    <p className="text-sm text-gray-600">
                      Using template: <span className="font-medium text-green-700">{selectedTemplate.name}</span>
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      ✅ Ready to generate agreement with this template
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    Template Active
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 mb-6 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border border-yellow-200">
                <div className="w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center">
                  <FileText className="w-3 h-3 text-white" />
                  </div>
                  <div>
                  <h3 className="font-semibold text-gray-800">No Template Selected</h3>
                    <p className="text-sm text-gray-600">
                    Go to the <span className="font-medium text-blue-600">Template</span> session to select a template for agreement generation.
                  </p>
                  <p className="text-xs text-yellow-600 mt-1">
                    ⚠️ Generate Agreement button will be disabled until a template is selected
                    </p>
                  </div>
              </div>
            )}


            <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
            <User className="w-6 h-6 text-blue-600" />
            Client Information
          </h3>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="group">
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                  <User className="w-4 h-4 text-white" />
                </div>
                Client Name
              </label>
              <input
                type="text"
                required
                value={clientInfo.clientName}
                onChange={(e) => setClientInfo({ ...clientInfo, clientName: e.target.value })}
                className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                placeholder="Enter client name"
              />
            </div>

            <div className="group">
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                  <Mail className="w-4 h-4 text-white" />
                </div>
                Email Address
              </label>
              <input
                type="email"
                required
                value={clientInfo.clientEmail}
                onChange={(e) => setClientInfo({ ...clientInfo, clientEmail: e.target.value })}
                className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                placeholder="Enter email address"
              />
            </div>

            <div className="group">
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                  <Building className="w-4 h-4 text-white" />
                </div>
                Company Name
              </label>
              <input
                type="text"
                required
                value={clientInfo.company}
                onChange={(e) => setClientInfo({ ...clientInfo, company: e.target.value })}
                className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                placeholder="Enter company name"
              />
                {clientInfo.company && hubspotState?.selectedContact && (
                  <p className="text-sm text-blue-600 mt-2 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    {hubspotState.selectedContact.properties.company 
                      ? 'Company name from HubSpot contact'
                      : 'Company name auto-extracted from email domain'
                    }
                  </p>
                )}
            </div>

            {/* Effective Date */}
            <div className="group">
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                  <Calendar className="w-4 h-4 text-white" />
                </div>
                Effective Date
              </label>
              <input
                type="date"
                value={clientInfo.effectiveDate || ''}
                onChange={(e) => updateClientInfo({ effectiveDate: e.target.value })}
                className="w-full px-6 py-5 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-xl font-medium"
                style={{ 
                  fontSize: '18px',
                  height: '60px',
                  paddingTop: '18px',
                  paddingBottom: '18px'
                }}
              />
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white py-4 px-8 rounded-2xl font-bold text-lg hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 transition-all duration-500 transform hover:scale-105 hover:shadow-2xl shadow-xl relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
              <span className="relative flex items-center justify-center gap-3">
                <FileText className="w-5 h-5" />
                Generate Quote
                <Sparkles className="w-5 h-5" />
              </span>
            </button>

            {/* Generate Agreement Button */}
                  <button
              type="button"
              onClick={handleGenerateAgreement}
              disabled={!selectedTemplate || isGeneratingAgreement}
              className={`w-full mt-4 py-4 px-8 rounded-2xl font-bold text-lg transition-all duration-500 transform shadow-xl relative overflow-hidden group ${
                selectedTemplate && !isGeneratingAgreement
                  ? 'bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 text-white hover:from-green-700 hover:via-emerald-700 hover:to-teal-700 hover:scale-105 hover:shadow-2xl' 
                  : 'bg-gray-400 text-gray-200 cursor-not-allowed'
              }`}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
              <span className="relative flex items-center justify-center gap-3">
                {isGeneratingAgreement ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5" />
                    Generate Agreement
                    <Sparkles className="w-5 h-5" />
                  </>
                )}
              </span>
                  </button>

            {/* Send to Deal Desk Button (same behavior as preview) */}
            <button
              type="button"
              onClick={handleEmailAgreement}
              disabled={isEmailingAgreement}
              className={`w-full mt-4 py-4 px-8 rounded-2xl font-bold text-lg transition-all duration-500 transform shadow-xl relative overflow-hidden group ${
                isEmailingAgreement
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white hover:from-purple-700 hover:via-indigo-700 hover:to-blue-700 hover:scale-105 hover:shadow-2xl'
              }`}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
              <span className="relative flex items-center justify-center gap-3">
                {isEmailingAgreement ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="w-5 h-5" />
                    Send to Deal Desk
                    <Send className="w-5 h-5" />
                  </>
                )}
              </span>
            </button>
          </form>

              </div>
            </div>

      </div>

      {/* Contact Selector Modal */}
      {showContactSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Select HubSpot Contact</h3>
              <button
                onClick={() => setShowContactSelector(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-3">
              {hubspotState?.hubspotContacts.map(contact => (
                <div
                  key={contact.id}
                  className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                  onClick={() => handleContactSelect(contact)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                      {contact.properties.firstname?.[0]}{contact.properties.lastname?.[0]}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-800">
                        {contact.properties.firstname} {contact.properties.lastname}
                      </h4>
                      <p className="text-sm text-gray-600">{contact.properties.email}</p>
                      {contact.properties.company && (
                        <p className="text-sm text-gray-500">{contact.properties.company}</p>
                      )}
                    </div>
                    <CheckCircle className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
              ))}
            </div>
            
            {(!hubspotState?.hubspotContacts || hubspotState.hubspotContacts.length === 0) && (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No contacts found in HubSpot</p>
              </div>
            )}
          </div>
        </div>
      )}



        {/* Placeholder Preview Modal */}
        {showPlaceholderPreview && placeholderPreviewData && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">Placeholder Replacement Preview</h2>
                  <p className="text-gray-600">See exactly how your data will replace placeholders in the template</p>
                </div>
                <button
                  onClick={() => setShowPlaceholderPreview(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ✕
                </button>
              </div>

              {/* Placeholder Mapping Table */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Placeholder Mappings</h3>
                <div className="bg-gray-50 rounded-xl p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {placeholderPreviewData.placeholders.map((item, index) => (
                      <div key={index} className="bg-white rounded-lg p-4 border border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-600">Placeholder</p>
                            <p className="text-sm font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded">
                              {item.placeholder}
                            </p>
                          </div>
                          <div className="mx-4 text-gray-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-600">Will Become</p>
                            <p className="text-sm font-semibold text-green-700 bg-green-50 px-2 py-1 rounded">
                              {item.value}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Before/After Comparison */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Before */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
                      <span className="text-red-600 font-bold text-sm">1</span>
                    </div>
                    Template with Placeholders
                  </h3>
                  <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
                    <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                      {placeholderPreviewData.originalText}
                    </pre>
                  </div>
                </div>

                {/* After */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                      <span className="text-green-600 font-bold text-sm">2</span>
                    </div>
                    Template with Your Data
                  </h3>
                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
                    <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                      {placeholderPreviewData.replacedText}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 mt-8 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setShowPlaceholderPreview(false)}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold"
                >
                  Close Preview
                </button>
                <button
                  onClick={() => {
                    setShowPlaceholderPreview(false);
                    // Trigger the actual quote generation
                    const form = document.querySelector('form');
                    if (form) {
                      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                    }
                  }}
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-semibold"
                >
                  Proceed with Generation
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Agreement Preview Modal - Enhanced Large Size */}
        {showAgreementPreview && processedAgreement && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-2">
            <div className="bg-white rounded-3xl shadow-2xl w-full h-full max-w-7xl max-h-[98vh] overflow-hidden flex flex-col">
              {/* Header - Enhanced */}
              <div className="bg-gradient-to-r from-green-600 via-green-700 to-emerald-600 text-white p-8 flex items-center justify-between">
                <div className="flex items-center space-x-6">
                  <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                    <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-4xl font-bold mb-2">🎉 Agreement Generated Successfully!</h2>
                    <p className="text-green-100 text-xl">
                      Template: {selectedTemplate?.name} | Client: {clientInfo.clientName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowAgreementPreview(false);
                    setProcessedAgreement(null);
                  }}
                  className="text-white hover:text-green-200 transition-colors p-3 hover:bg-white hover:bg-opacity-10 rounded-full"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content - Enhanced */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Success Message - Enhanced */}
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-l-8 border-green-500 p-8 m-6 mb-4">
                  <div className="flex items-start space-x-4">
                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-green-800 font-bold text-xl mb-2">Template processed successfully!</p>
                      <p className="text-green-700 text-lg">
                        The tokens in your template have been replaced with the actual quote data. 
                        Please review the preview below. If everything looks correct, click "Download Agreement" to save the file.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Preview Area - Enhanced Large */}
                <div className="flex-1 mx-6 mb-6 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-300 overflow-hidden flex flex-col">
                  <div className="bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-2xl font-bold text-gray-800">📄 Document Preview</h3>
                    {!showInlinePreview && (
                      <button
                        onClick={handleViewInline}
                        className="text-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                      >
                        👁️ View Document
                      </button>
                    )}
                    {showInlinePreview && (
                      <div className="text-sm text-gray-600 bg-green-50 px-4 py-2 rounded-lg">
                        📄 Showing actual document content (converted from DOCX)
                      </div>
                    )}
                  </div>
                  <div className="flex-1 bg-white overflow-hidden">
                    {showInlinePreview ? (
                      previewUrl ? (
                        <iframe
                          src={previewUrl}
                          className="w-full h-full border-0"
                          title="Agreement Document Preview"
                        />
                      ) : (
                        <div ref={previewContainerRef} className="document-preview-content w-full h-full overflow-auto p-6 bg-white" />
                      )
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <div className="text-center p-12">
                          <div className="w-32 h-32 bg-gradient-to-br from-green-100 to-emerald-100 rounded-full flex items-center justify-center mx-auto mb-8">
                            <svg className="w-16 h-16 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <h4 className="text-3xl font-bold text-gray-800 mb-4">Document Ready for Preview</h4>
                          <p className="text-gray-600 text-xl mb-8 max-w-2xl mx-auto">
                            Your agreement has been processed successfully with all tokens replaced with actual quote data.
                          </p>
                          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-8 mb-8 max-w-3xl mx-auto">
                            <p className="text-blue-800 text-lg">
                              <strong>Click "View Document" above</strong> to see the complete agreement with all your data, 
                              or click "Download Agreement" to save the file.
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-6 text-lg text-gray-600 max-w-2xl mx-auto">
                            <div className="bg-gray-50 p-4 rounded-xl">
                              <p><strong>📋 Template:</strong> {selectedTemplate?.name}</p>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-xl">
                              <p><strong>👤 Client:</strong> {clientInfo.clientName}</p>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-xl">
                              <p><strong>🏢 Company:</strong> {clientInfo.company}</p>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-xl">
                              <p><strong>💰 Total Cost:</strong> {formatCurrency(calculation?.totalCost || 0)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons - Enhanced */}
                <div className="bg-white border-t-2 border-gray-200 p-8">
                  <div className="flex gap-6 justify-center">
                    <button
                      onClick={handleDownloadAgreement}
                      className="flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-2xl hover:from-green-700 hover:to-green-800 transition-all duration-200 font-bold text-xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-1"
                    >
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      📥 Download Agreement
                    </button>
                    {/* Download PDF button with functionality */}
                    <button
                      onClick={handleDownloadAgreementPDF}
                      className="flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 font-bold text-xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-1"
                    >
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      📄 Download PDF
                    </button>
                    <button
                      onClick={handleEmailAgreement}
                      disabled={isEmailingAgreement}
                      className={`flex items-center gap-3 px-10 py-5 rounded-2xl transition-all duration-200 font-bold text-xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 ${
                        isEmailingAgreement
                          ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                          : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800'
                      }`}
                    >
                      {isEmailingAgreement ? (
                        <>
                          <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="w-7 h-7" />
                          📧 Send to Deal Desk
                        </>
                      )}
                    </button>
                    {showInlinePreview ? (
                      <button
                        onClick={() => {
                          setShowInlinePreview(false);
                          if (previewUrl) {
                            URL.revokeObjectURL(previewUrl);
                            setPreviewUrl(null);
                          }
                        }}
                        className="flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-2xl hover:from-orange-700 hover:to-orange-800 transition-all duration-200 font-bold text-xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-1"
                      >
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        </svg>
                        🙈 Hide Document
                      </button>
                    ) : (
                      <button
                        onClick={handleViewInline}
                        className="flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 font-bold text-xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-1"
                      >
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        👁️ View Document
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowAgreementPreview(false);
                        setProcessedAgreement(null);
                        setShowInlinePreview(false);
                        if (previewUrl) {
                          URL.revokeObjectURL(previewUrl);
                          setPreviewUrl(null);
                        }
                      }}
                      className="flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-2xl hover:from-gray-700 hover:to-gray-800 transition-all duration-200 font-bold text-xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-1"
                    >
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      ❌ Close Preview
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default QuoteGenerator;