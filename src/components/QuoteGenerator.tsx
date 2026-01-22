import React, { useState, useEffect, useRef } from 'react';
import { PricingCalculation, ConfigurationData, Quote } from '../types/pricing';
import { formatCurrency, getInstanceTypeCost } from '../utils/pricing';
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
  Calendar,
  Workflow,
  X
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { downloadAndSavePDF } from '../utils/pdfProcessor';
import { sanitizeNameInput, sanitizeEmailInput, sanitizeCompanyInput } from '../utils/emojiSanitizer';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';
import { BACKEND_URL } from '../config/api';
import { useNavigate } from 'react-router-dom';
import { trackQuoteOperation, trackDocumentOperation, trackApprovalEvent } from '../analytics/clarity';
import { getEffectiveDurationMonths, formatMonths } from '../utils/configDuration';
// EmailJS import removed - now using server-side email with attachment support

// Date formatting helper for mm/dd/yyyy format
function formatDateMMDDYYYY(dateString: string): string {
  console.log('🔍 formatDateMMDDYYYY called with:', dateString, 'type:', typeof dateString);
  
  if (!dateString || dateString === 'N/A' || dateString === 'undefined' || dateString === 'null') {
    console.log('  Returning N/A - empty or invalid dateString');
    return 'N/A';
  }
  
  try {
    let date: Date;
    
    // Handle different date formats
    if (dateString.includes('-')) {
      // Handle YYYY-MM-DD format (from HTML date input)
      date = new Date(dateString + 'T00:00:00');
    } else if (dateString.includes('/')) {
      // Handle MM/DD/YYYY format
      date = new Date(dateString);
    } else {
      // Try parsing as-is
      date = new Date(dateString);
    }
    
    console.log('  Parsed date object:', date);
    console.log('  Date is valid:', !isNaN(date.getTime()));
    console.log('  Date toString:', date.toString());
    
    if (isNaN(date.getTime())) {
      console.log('  Invalid date, returning N/A');
      return 'N/A';
    }
    
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    const result = `${month}/${day}/${year}`;
    console.log('  Formatted result:', result);
    return result;
  } catch (error) {
    console.error('Error formatting date:', dateString, error);
    return 'N/A';
  }
}

// Helper function to limit consecutive spaces to maximum 5
function limitConsecutiveSpaces(value: string, maxSpaces: number = 5): string {
  // Replace any sequence of more than maxSpaces spaces with exactly maxSpaces spaces
  const spaceRegex = new RegExp(`\\s{${maxSpaces + 1},}`, 'g');
  return value.replace(spaceRegex, ' '.repeat(maxSpaces));
}

// Helper function to get display name for exhibit category
function getCategoryDisplayName(category: string): string {
  const normalized = (category || 'content').toLowerCase();
  switch (normalized) {
    case 'messaging':
    case 'message':
      return 'CloudFuze X-Change Messaging Migration';
    case 'content':
      return 'CloudFuze X-Change Content Migration';
    case 'email':
      return 'CloudFuze X-Change Email Migration';
    default:
      return 'CloudFuze X-Change Data Migration';
  }
}

// Helper function to format exhibit description with configuration details
function formatExhibitDescription(exhibit: any, configuration: ConfigurationData, exhibitConfig?: any): string {
  const category = (exhibit.category || 'content').toLowerCase();
  let exhibitName = exhibit.name || '';
  
  // Remove plan type and Included/Not Included suffixes from display name
  // Patterns to remove:
  // - " Standard Plan - Standard Include"
  // - " Advanced Plan - Advanced Include"
  // - " Standard Plan - Included Features"
  // - " - Included Features"
  // - " - Not Included Features"
  const cleanPatterns = [
    /\s+(Standard|Advanced|Basic|Premium|Enterprise)\s+Plan\s*-\s*(Standard|Advanced|Basic|Premium|Enterprise)\s+(Include|Not\s+Include|Included|Not\s+Included)(\s+Features?)?$/i,
    /\s+(Standard|Advanced|Basic|Premium|Enterprise)\s+Plan\s*-\s*(Included|Not\s+Included)\s+Features?$/i,
    /\s+-\s*(Included|Not\s+Included|Include|Not\s+Include)(\s+Features?)?$/i,
  ];
  
  for (const pattern of cleanPatterns) {
    exhibitName = exhibitName.replace(pattern, '');
  }
  
  // Also remove any trailing plan type if it exists (e.g., "Some Exhibit Standard")
  exhibitName = exhibitName.replace(/\s+(Standard|Advanced|Basic|Premium|Enterprise)$/i, '');
  exhibitName = exhibitName.trim();
  
  // For Multi combination, use the specific config for this exhibit
  let config = exhibitConfig || configuration;
  
  if (category === 'messaging' || category === 'message') {
    const users = config?.numberOfUsers || 1;
    const messages = config?.messages || 0;
    // Format: Exhibit name, dashed line separator, then details
    return `${exhibitName}\n---------------------------------\nUp to ${users} Users | All Channels and DMs | ${messages} Messages`;
  } else if (category === 'content') {
    const users = config?.numberOfUsers || 1;
    const dataSize = config?.dataSizeGB || 0;
    // Format: Exhibit name, dashed line separator, then details
    return `${exhibitName}\n---------------------------------\nUp to ${users} Users | ${dataSize} GBs`;
  } else if (category === 'email') {
    const mailboxes = config?.numberOfUsers || 1;
    // Format: Exhibit name, dashed line separator, then details
    return `${exhibitName}\n---------------------------------\nUp to ${mailboxes} Mailboxes`;
  }
  
  return exhibitName;
}

// Helper function to calculate exhibit pricing
function calculateExhibitPrice(exhibit: any, configuration: ConfigurationData, calculation: PricingCalculation | null, exhibitConfig?: any): number {
  const category = (exhibit.category || 'content').toLowerCase();
  
  // For Multi combination, use specific calculation if available
  if (configuration?.migrationType === 'Multi combination') {
    if ((category === 'messaging' || category === 'message') && calculation?.messagingCalculation) {
      return calculation.messagingCalculation.totalCost || 0;
    } else if (category === 'content' && calculation?.contentCalculation) {
      return calculation.contentCalculation.totalCost || 0;
    } else if (category === 'email' && calculation?.emailCalculation) {
      return calculation.emailCalculation.totalCost || 0;
    }
  }
  
  // For single migration type, use the overall calculation
  if (calculation) {
    return calculation.totalCost || 0;
  }
  
  // Fallback: estimate based on configuration
  const config = exhibitConfig || configuration;
  const users = config?.numberOfUsers || 1;
  const perUserCost = 40; // Default per user cost
  return users * perUserCost;
}


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
  onConfigurationChange?: (config: ConfigurationData) => void;
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
  selectedExhibits?: string[];
}

interface ClientInfo {
  clientName: string;
  clientEmail: string;
  company: string;
  effectiveDate?: string;
  discount?: number;
  paymentTerms?: string;
}

const QuoteGenerator: React.FC<QuoteGeneratorProps> = ({
  calculation,
  configuration,
  onGenerateQuote,
  onConfigurationChange,
  hubspotState,
  onSelectHubSpotContact,
  companyInfo,
  selectedExhibits = [],
  selectedTemplate,
  onClientInfoChange,
  dealData,
  configureContactInfo
}) => {
  const navigate = useNavigate();
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

  // Helper: user-friendly template name for UI
  const getSelectedTemplateDisplayName = (): string => {
    const rawName: string = selectedTemplate?.name || '';

    // For overage agreements, hide the "Content"/"Messaging" suffix
    const isOverageCombination =
      (configuration?.combination || '').toLowerCase() === 'overage-agreement';
    const isOverageMigrationType =
      (configuration?.migrationType || '').toLowerCase() === 'overage agreement';

    if ((isOverageCombination || isOverageMigrationType) &&
        rawName.toUpperCase().startsWith('OVERAGE AGREEMENT')) {
      return 'OVERAGE AGREEMENT';
    }

    return rawName || 'Selected Template';
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
    discount: undefined,
    paymentTerms: '100% Upfront'
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

  // Load configuration from sessionStorage if prop is undefined
  useEffect(() => {
    if (!configuration || !calculation) {
      try {
        const savedConfig = sessionStorage.getItem('cpq_configuration_session');
        const savedNav = sessionStorage.getItem('cpq_navigation_state');
        
        if (savedConfig) {
          const parsedConfig = JSON.parse(savedConfig);
          console.log('✅ QuoteGenerator: Loaded configuration from sessionStorage:', parsedConfig);
        }
        
        if (savedNav) {
          const parsedNav = JSON.parse(savedNav);
          if (parsedNav.sessionState?.selectedTier) {
            console.log('✅ QuoteGenerator: Found selectedTier in navigation state:', parsedNav.sessionState.selectedTier);
          }
        }
      } catch (error) {
        console.warn('⚠️ Could not load configuration/calculation from storage:', error);
      }
    }
  }, [configuration, calculation]);

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
          effectiveDate: parsed.effectiveDate || '',
          paymentTerms: parsed.paymentTerms || '100% Upfront'
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
  const [dateValidationErrors, setDateValidationErrors] = useState({
    projectStartDate: false,
    effectiveDate: false
  });
  
  // Calculate discount logic - source discount primarily from Configure session (localStorage)
  const getEffectiveTotalCost = (
    cfg: typeof configuration,
    calc: typeof calculation | typeof safeCalculation
  ): number => {
    const c: any = calc || {};
    if (cfg?.migrationType === 'Multi combination') {
      const sumBreakdowns = (arr: any[] | undefined) =>
        Array.isArray(arr) ? arr.reduce((acc, b) => acc + (Number(b?.totalCost) || 0), 0) : 0;

      const messagingTotal =
        sumBreakdowns(c.messagingCombinationBreakdowns) ||
        (Number(c.messagingCalculation?.totalCost) || 0);
      const contentTotal =
        sumBreakdowns(c.contentCombinationBreakdowns) ||
        (Number(c.contentCalculation?.totalCost) || 0);
      const emailTotal =
        sumBreakdowns(c.emailCombinationBreakdowns) ||
        (Number(c.emailCalculation?.totalCost) || 0);

      const combined = messagingTotal + contentTotal + emailTotal;
      // Fall back to the top-level totalCost if for some reason the above is empty
      return combined > 0 ? combined : (Number(c.totalCost) || 0);
    }
    return Number(c.totalCost) || 0;
  };

  const totalCost = getEffectiveTotalCost(configuration, calculation || safeCalculation);
  // Read latest discount from sessionStorage as the source of truth, fallback to state
  const storedDiscountPercent = (() => {
    try {
      const raw = sessionStorage.getItem('cpq_discount_session');
      return raw !== null && raw !== '' && !isNaN(Number(raw)) ? Number(raw) : undefined;
    } catch {
      return undefined;
    }
  })();
  const discountPercent = (clientInfo.discount ?? storedDiscountPercent ?? 0);
  
  // Allow discount only when total project cost exceeds $2500
  const isDiscountAllowed = totalCost >= 2500;
  
  // Check if user has entered a valid discount (capped at 15% as per business rules)
  const hasValidDiscount = discountPercent > 0 && discountPercent <= 15;
  
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
    // Apply sanitization and space limitation for clientName field
    let processedUpdates = { ...updates };
    if (updates.clientName) {
      processedUpdates.clientName = sanitizeNameInput(updates.clientName);
      processedUpdates.clientName = limitConsecutiveSpaces(processedUpdates.clientName);
    }
    if (updates.clientEmail) {
      processedUpdates.clientEmail = sanitizeEmailInput(updates.clientEmail);
    }
    if (updates.company) {
      processedUpdates.company = sanitizeCompanyInput(updates.company);
    }
    
    const newClientInfo = { ...clientInfo, ...processedUpdates };
    setClientInfo(newClientInfo);
    // Persist to localStorage so the Quote session remains sticky
    try { localStorage.setItem('cpq_quote_client_info', JSON.stringify(newClientInfo)); } catch {}
    
    // Only notify parent when user makes actual changes (not during auto-fill)
    if (onClientInfoChange && (updates.clientName || updates.clientEmail || updates.company || updates.effectiveDate || updates.discount !== undefined || updates.paymentTerms !== undefined)) {
      onClientInfoChange(newClientInfo);
    }
  };

  // Generate quote ID once when component mounts
  useEffect(() => {
    if (!quoteId) {
      setQuoteId(generateUniqueQuoteId());
    }
  }, []); // Empty dependency array - run only once

  // Inject date format styles on component mount
  useEffect(() => {
    ensureDateFormatStylesInjected();
    
    // Force US date format by setting locale
    const dateInputs = document.querySelectorAll('input[type="date"][data-format="mm-dd-yyyy"]');
    dateInputs.forEach((input) => {
      const htmlInput = input as HTMLInputElement;
      htmlInput.lang = 'en-US';
      htmlInput.setAttribute('locale', 'en-US');
    });
  }, []); // Empty dependency array - run only once
  const [showPlaceholderPreview, setShowPlaceholderPreview] = useState(false);
  const [placeholderPreviewData, setPlaceholderPreviewData] = useState<{
    originalText: string;
    replacedText: string;
    placeholders: Array<{placeholder: string, value: string}>;
  } | null>(null);

  // Agreement preview state
  const [processedAgreement, setProcessedAgreement] = useState<Blob | null>(null);
  const [originalDocxAgreement, setOriginalDocxAgreement] = useState<Blob | null>(null); // Store original DOCX for Word downloads
  const [showAgreementPreview, setShowAgreementPreview] = useState(false);
  const [isGeneratingAgreement, setIsGeneratingAgreement] = useState(false);
  const [showInlinePreview, setShowInlinePreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  // Approval workflow state
  const { createWorkflow } = useApprovalWorkflows();
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  // Use centralized hardcoded defaults (original team addresses)
  const defaultTechEmail = 'cpq.zenop.ai.technical@cloudfuze.com';
  const defaultLegalEmail = 'cpq.zenop.ai.legal@cloudfuze.com';
  const defaultDealDeskEmail = 'salesops@cloudfuze.com';
  const workflowCreatorEmail = (() => {
    try {
      const raw = localStorage.getItem('cpq_user');
      if (raw) {
        const user = JSON.parse(raw);
        if (user?.email) return user.email;
      }
    } catch {}
    return 'abhilasha.kandakatla@cloudfuze.com';
  })();
  const [approvalEmails, setApprovalEmails] = useState({
    role1: defaultTechEmail,
    role2: defaultLegalEmail,
    role4: defaultDealDeskEmail
  });
  const [isStartingWorkflow, setIsStartingWorkflow] = useState(false);
  // Team Approval selection (persist across sessions)
  const [teamSelection, setTeamSelection] = useState<string>(() => {
    try {
      return localStorage.getItem('cpq_team_selection') || 'SMB';
    } catch {
      return 'SMB';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('cpq_team_selection', teamSelection);
    } catch {}
  }, [teamSelection]);

  // Mapping for Team Approval emails by group
  // SMB  -> chitradip.saha@cloudfuze.com
  // AM   -> joy.prakash@cloudfuze.com
  // ENT  -> anthony@cloudfuze.com
  // DEV  -> anushreddydasari@gmail.com
  // DEV2 -> raya.durai@cloudfuze.com
  const TEAM_APPROVAL_EMAILS: Record<string, string> = {
    SMB: 'chitradip.saha@cloudfuze.com',
    AM: 'joy.prakash@cloudfuze.com',
    ENT: 'anthony@cloudfuze.com', // Update if Enterprise owner changes
    DEV: 'anushreddydasari@gmail.com',
    DEV2: 'raya.durai@cloudfuze.com',
  };

  // Helper function to get team approval email based on selection
  const getTeamApprovalEmail = (team: string): string => {
    const key = (team || '').toUpperCase();
    return TEAM_APPROVAL_EMAILS[key] || '';
  };

  const ensureDocxPreviewStylesInjected = () => {
    const existing = document.getElementById('docx-preview-css');
    if (existing) return;
    const link = document.createElement('link');
    link.id = 'docx-preview-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/docx-preview@0.4.1/dist/docx-preview.css';
    document.head.appendChild(link);
  };

  const ensureDateFormatStylesInjected = () => {
    const existing = document.getElementById('date-format-css');
    if (existing) return;
    const style = document.createElement('style');
    style.id = 'date-format-css';
    style.textContent = `
      /* Force US date format order for Chrome/Safari */
      input[type="date"][data-format="mm-dd-yyyy"]::-webkit-datetime-edit-fields-wrapper {
        flex-direction: row;
      }
      input[type="date"][data-format="mm-dd-yyyy"]::-webkit-datetime-edit-month-field {
        order: 1;
      }
      input[type="date"][data-format="mm-dd-yyyy"]::-webkit-datetime-edit-text:nth-of-type(1) {
        order: 2;
      }
      input[type="date"][data-format="mm-dd-yyyy"]::-webkit-datetime-edit-day-field {
        order: 3;
      }
      input[type="date"][data-format="mm-dd-yyyy"]::-webkit-datetime-edit-text:nth-of-type(2) {
        order: 4;
      }
      input[type="date"][data-format="mm-dd-yyyy"]::-webkit-datetime-edit-year-field {
        order: 5;
      }
      
      /* Custom placeholder for empty date inputs */
      input[type="date"][data-format="mm-dd-yyyy"]:not(:focus):invalid {
        color: transparent;
        background-image: none;
        position: relative;
      }
      input[type="date"][data-format="mm-dd-yyyy"]:not(:focus):invalid::before {
        content: "mm-dd-yyyy";
        color: #9CA3AF;
        font-size: 18px;
        position: absolute;
        left: 24px;
        top: 50%;
        transform: translateY(-50%);
        pointer-events: none;
      }
      
      /* Hide default calendar icon when showing custom placeholder */
      input[type="date"][data-format="mm-dd-yyyy"]:not(:focus):invalid::-webkit-calendar-picker-indicator {
        opacity: 0.5;
      }
    `;
    document.head.appendChild(style);
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
        effectiveDate: '',
        paymentTerms: '100% Upfront'
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

CONTACT INFORMATION:
- Contact Name: ${clientInfo.clientName}
- Email: ${clientInfo.clientEmail}
- Legal Entity Name: ${clientInfo.company}
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

Generated on: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}
Quote ID: ${quoteData.id}
      `.trim();

      // Send email directly through backend API
      const dealDeskEmail = 'salesops@cloudfuze.com'; // Deal Desk email
      
      const response = await fetch(`${BACKEND_URL}/api/email/send`, {
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

      // Always attempt to fetch the latest template file from backend (cache-bust),
      // so backend template edits (e.g. removing "Dedicated") show up immediately
      // without re-selecting the template in the UI.
      const fetchLatestTemplateFile = async (): Promise<File | null> => {
        try {
          if (!selectedTemplate?.id) return null;
          const fr = await fetch(`${BACKEND_URL}/api/templates/${selectedTemplate.id}/file?t=${Date.now()}`, {
            cache: 'no-store'
          });
          if (!fr.ok) return null;
          const blob = await fr.blob();
          return new File(
            [blob],
            selectedTemplate.fileName || selectedTemplate.file?.name || 'template.docx',
            {
              type:
                selectedTemplate.fileType ||
                selectedTemplate.file?.type ||
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            }
          );
        } catch (e) {
          console.warn('⚠️ Unable to fetch latest template file, falling back to cached file:', e);
          return null;
        }
      };

      const latestTemplateFile = await fetchLatestTemplateFile();
      const templateFileForEmail = latestTemplateFile || selectedTemplate?.file || null;

      if (!agreementBlob && templateFileForEmail && templateFileForEmail.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const { DocxTemplateProcessor } = await import('../utils/docxTemplateProcessor');

        const companyName = (configureContactInfo?.company || clientInfo.company || dealData?.companyByContact || dealData?.company || 'Your Company');
        const finalCompanyName = (!companyName || companyName === 'undefined' || companyName === 'null' || companyName === '' || companyName === 'Demo Company Inc.') ? 'Your Company' : companyName;
        const userCount = configuration?.numberOfUsers || 1;
        const userCost = calculation?.userCost ?? safeCalculation.userCost;
        const migrationCost = calculation?.migrationCost ?? safeCalculation.migrationCost;
        const totalCost = getEffectiveTotalCost(configuration, calculation || safeCalculation);
        const duration = getEffectiveDurationMonths(configuration) || 1;
        const migrationType = configuration?.migrationType || 'Content';
        const clientName = clientInfo.clientName || dealData?.contactName || 'Contact Name';
        const clientEmail = clientInfo.clientEmail || dealData?.contactEmail || 'contact@email.com';

        // Calculate comprehensive pricing breakdown
        const dataCost = calculation?.dataCost ?? safeCalculation.dataCost;
        const instanceCost = calculation?.instanceCost ?? safeCalculation.instanceCost;
        const tierName = calculation?.tier?.name ?? safeCalculation.tier.name;
        const instanceType = configuration?.instanceType || 'Standard';
        const numberOfInstances = configuration?.numberOfInstances || 1;
        const dataSizeGB = configuration?.dataSizeGB ?? 0;
        
        // Debug: Log data size for email function
        console.log('🔍 EMAIL FUNCTION - DATA SIZE DEBUG:');
        console.log('  configuration?.dataSizeGB:', configuration?.dataSizeGB);
        console.log('  Final dataSizeGB value:', dataSizeGB);
        console.log('  dataCost value:', dataCost);
        
        // Calculate discount for this function scope (use sessionStorage as source of truth)
        const localDiscountPercent = (clientInfo.discount ?? storedDiscountPercent ?? 0);
        const localIsDiscountAllowed = totalCost >= 2500;
        const localHasValidDiscount = localDiscountPercent > 0 && localDiscountPercent <= 15;
        const localDiscountAmount = localHasValidDiscount ? totalCost * (localDiscountPercent / 100) : 0;
        const localFinalTotalAfterDiscount = totalCost - localDiscountAmount;
        const localIsDiscountValid = localHasValidDiscount ? localFinalTotalAfterDiscount >= 2500 : true;
        const localShouldApplyDiscount = localIsDiscountAllowed && localHasValidDiscount && localIsDiscountValid;
        
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
          // Instance type monthly cost (per server per month)
          // Multi combination requirement: sum messaging + content base monthly rates.
          '{{instance_type_cost}}': (() => {
            if (configuration?.migrationType === 'Multi combination') {
              const msgType = configuration.messagingConfig?.instanceType || 'Small';
              const contentType = configuration.contentConfig?.instanceType || 'Small';
              return formatCurrency(getInstanceTypeCost(msgType) + getInstanceTypeCost(contentType));
            }
            return formatCurrency(getInstanceTypeCost(instanceType));
          })(),
          '{{number_of_instances}}': numberOfInstances.toString(),
          '{{numberOfInstances}}': numberOfInstances.toString(),
          '{{instances}}': numberOfInstances.toString(),
          '{{Duration of months}}': (duration || 1).toString(),
          '{{Duration_of_months}}': (duration || 1).toString(),
          '{{Suration_of_months}}': (duration || 1).toString(), // Handle typo version
          '{{duration_months}}': (duration || 1).toString(),
          '{{duration}}': (duration || 1).toString(),
          // Complete validity text placeholders (for templates with hardcoded "Month" after placeholder)
          '{{duration_validity_text}}': `Valid for ${duration || 1} Month${(duration || 1) === 1 ? '' : 's'}`,
          '{{instance_validity_text}}': `Instance Valid for ${duration || 1} Month${(duration || 1) === 1 ? '' : 's'}`,
          '{{migration type}}': migrationType,
          '{{migration_type}}': migrationType,
          '{{migrationType}}': migrationType,
          '{{data_size}}': (dataSizeGB ?? 0).toString(),
          '{{dataSizeGB}}': (dataSizeGB ?? 0).toString(),
          '{{data_size_gb}}': (dataSizeGB ?? 0).toString(),
          
          // Pricing breakdown - all costs
          '{{users_cost}}': formatCurrency((userCost || 0) + (dataCost || 0)), // User Cost + Data Cost combined
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
          
          // Per-user cost calculations
          // Multi combination requirement: pick the HIGHEST per-user cost between messaging and content.
          '{{per_user_cost}}': (() => {
            if (configuration?.migrationType === 'Multi combination') {
              const msgUsers = configuration.messagingConfig?.numberOfUsers || 0;
              const contentUsers = configuration.contentConfig?.numberOfUsers || 0;
              const msgUserCost = (calculation?.messagingCalculation?.userCost ?? safeCalculation.messagingCalculation?.userCost ?? 0);
              const contentUserCost = (calculation?.contentCalculation?.userCost ?? safeCalculation.contentCalculation?.userCost ?? 0);
              const msgPerUser = msgUsers > 0 ? msgUserCost / msgUsers : 0;
              const contentPerUser = contentUsers > 0 ? contentUserCost / contentUsers : 0;
              return formatCurrency(Math.max(msgPerUser, contentPerUser));
            }
            return formatCurrency((userCost || 0) / (userCount || 1));
          })(),
          '{{per_user_monthly_cost}}': (() => {
            if (configuration?.migrationType === 'Multi combination') {
              const msgUsers = configuration.messagingConfig?.numberOfUsers || 0;
              const contentUsers = configuration.contentConfig?.numberOfUsers || 0;
              const msgMonths = configuration.messagingConfig?.duration || 0;
              const contentMonths = configuration.contentConfig?.duration || 0;
              const msgUserCost = (calculation?.messagingCalculation?.userCost ?? safeCalculation.messagingCalculation?.userCost ?? 0);
              const contentUserCost = (calculation?.contentCalculation?.userCost ?? safeCalculation.contentCalculation?.userCost ?? 0);
              const msgPerUserMonthly = (msgUsers > 0 && msgMonths > 0) ? (msgUserCost / (msgUsers * msgMonths)) : 0;
              const contentPerUserMonthly = (contentUsers > 0 && contentMonths > 0) ? (contentUserCost / (contentUsers * contentMonths)) : 0;
              return formatCurrency(Math.max(msgPerUserMonthly, contentPerUserMonthly));
            }
            return formatCurrency((userCost || 0) / ((userCount || 1) * (duration || 1)));
          })(),
          '{{user_rate}}': (() => {
            if (configuration?.migrationType === 'Multi combination') {
              const msgUsers = configuration.messagingConfig?.numberOfUsers || 0;
              const contentUsers = configuration.contentConfig?.numberOfUsers || 0;
              const msgUserCost = (calculation?.messagingCalculation?.userCost ?? safeCalculation.messagingCalculation?.userCost ?? 0);
              const contentUserCost = (calculation?.contentCalculation?.userCost ?? safeCalculation.contentCalculation?.userCost ?? 0);
              const msgPerUser = msgUsers > 0 ? msgUserCost / msgUsers : 0;
              const contentPerUser = contentUsers > 0 ? contentUserCost / contentUsers : 0;
              return formatCurrency(Math.max(msgPerUser, contentPerUser));
            }
            return formatCurrency((userCost || 0) / (userCount || 1));
          })(),
          '{{monthly_user_rate}}': (() => {
            if (configuration?.migrationType === 'Multi combination') {
              const msgUsers = configuration.messagingConfig?.numberOfUsers || 0;
              const contentUsers = configuration.contentConfig?.numberOfUsers || 0;
              const msgMonths = configuration.messagingConfig?.duration || 0;
              const contentMonths = configuration.contentConfig?.duration || 0;
              const msgUserCost = (calculation?.messagingCalculation?.userCost ?? safeCalculation.messagingCalculation?.userCost ?? 0);
              const contentUserCost = (calculation?.contentCalculation?.userCost ?? safeCalculation.contentCalculation?.userCost ?? 0);
              const msgPerUserMonthly = (msgUsers > 0 && msgMonths > 0) ? (msgUserCost / (msgUsers * msgMonths)) : 0;
              const contentPerUserMonthly = (contentUsers > 0 && contentMonths > 0) ? (contentUserCost / (contentUsers * contentMonths)) : 0;
              return formatCurrency(Math.max(msgPerUserMonthly, contentPerUserMonthly));
            }
            return formatCurrency((userCost || 0) / ((userCount || 1) * (duration || 1)));
          })(),
          
          // Per-data cost calculations - cost per GB
          '{{per_data_cost}}': (() => {
            // Multi combination: per-GB should come from CONTENT side (messaging has no data size)
            const isMulti = configuration?.migrationType === 'Multi combination';
            const safeDataSize = isMulti ? (configuration?.contentConfig?.dataSizeGB ?? 0) : (dataSizeGB ?? 0);
            const safeDataCost = isMulti
              ? (calculation?.contentCalculation?.dataCost ?? safeCalculation.contentCalculation?.dataCost ?? 0)
              : (dataCost ?? 0);
            
            // CRITICAL: For Email/Overage flows where dataSizeGB=0 and dataCost=0,
            // use the tier's perGBCost directly instead of calculating from division
            const tierPerGbRaw = isMulti
              ? (calculation?.tier?.perGBCost ??
                  safeCalculation.tier?.perGBCost ??
                  0)
              : (calculation?.tier?.perGBCost ?? safeCalculation.tier?.perGBCost ?? 0);

            const tierNameForFallback = (
              calculation?.tier?.name ??
              safeCalculation.tier?.name ??
              ''
            ).toString().toLowerCase();

            // Fallback defaults if tier.perGBCost is 0/undefined
            const fallbackPerGb =
              tierNameForFallback === 'basic' ? 1.0 :
              tierNameForFallback === 'standard' ? 1.5 :
              tierNameForFallback === 'advanced' ? 1.8 :
              1.5; // Default to Standard rate if tier unknown

            const tierPerGb = (tierPerGbRaw && tierPerGbRaw > 0) ? tierPerGbRaw : fallbackPerGb;

            // Use tier's per-GB cost when dataSize is 0 (common in Email/Overage)
            const perDataCost = safeDataSize > 0 ? (safeDataCost / safeDataSize) : tierPerGb;
            
            console.log('🔍 PER_DATA_COST CALCULATION (handleEmailAgreement):', {
              migType: configuration?.migrationType,
              dataSizeGB: safeDataSize,
              dataCost: safeDataCost,
              'calculation.tier': calculation?.tier,
              'safeCalculation.tier': safeCalculation.tier,
              tierPerGbRaw,
              tierNameForFallback,
              fallbackPerGb,
              tierPerGb,
              perDataCost,
              formatted: formatCurrency(perDataCost)
            });
            return formatCurrency(perDataCost);
          })(),
          
          // Total pricing
          '{{total price}}': formatCurrency(totalCost || 0),
          '{{total_price}}': formatCurrency(totalCost || 0),
          '{{totalPrice}}': formatCurrency(totalCost || 0),
          '{{prices}}': formatCurrency(totalCost || 0),
          '{{subtotal}}': formatCurrency(totalCost || 0),
          '{{sub_total}}': formatCurrency(totalCost || 0),
          
          // Discount information - hide discount tokens when discount is 0
          '{{discount}}': (localShouldApplyDiscount && localDiscountPercent > 0) ? localDiscountPercent.toString() : '',
          '{{Discount}}': (localShouldApplyDiscount && localDiscountPercent > 0) ? localDiscountPercent.toString() : '',
          '{{discount_percent}}': (localShouldApplyDiscount && localDiscountPercent > 0) ? localDiscountPercent.toString() : '',
          '{{discount_percentage}}': (localShouldApplyDiscount && localDiscountPercent > 0) ? localDiscountPercent.toString() : '',
          '{{discount_amount}}': (localShouldApplyDiscount && localDiscountAmount > 0) ? `-${formatCurrency(localDiscountAmount)}` : '',
          '{{Discount Amount}}': (localShouldApplyDiscount && localDiscountAmount > 0) ? `-${formatCurrency(localDiscountAmount)}` : '',
          '{{discountAmount}}': (localShouldApplyDiscount && localDiscountAmount > 0) ? `-${formatCurrency(localDiscountAmount)}` : '',
          '{{discount_text}}': (localShouldApplyDiscount && localDiscountPercent > 0) ? `Discount (${localDiscountPercent}%)` : '',
          '{{discount_line}}': (localShouldApplyDiscount && localDiscountAmount > 0) ? `Discount (${localDiscountPercent}%) - ${formatCurrency(localDiscountAmount)}` : '',
          // Some templates may have a static label cell; clear it when no discount
          '{{discount_label}}': (localShouldApplyDiscount && localDiscountPercent > 0) ? 'Discount' : '',
          // Special tokens for conditional display in templates
          '{{show_discount}}': (localShouldApplyDiscount && localDiscountPercent > 0) ? 'true' : '',
          '{{hide_discount}}': (localShouldApplyDiscount && localDiscountPercent > 0) ? '' : 'true',
          // Additional conditional tokens
          '{{if_discount}}': (localShouldApplyDiscount && localDiscountPercent > 0) ? 'show' : 'hide',
          '{{discount_row}}': (localShouldApplyDiscount && localDiscountAmount > 0) ? `<tr><td>Discount (${localDiscountPercent}%)</td><td>-${formatCurrency(localDiscountAmount)}</td></tr>` : '',
          '{{total_after_discount}}': formatCurrency(localShouldApplyDiscount ? localFinalTotalAfterDiscount : totalCost),
          '{{Total After Discount}}': formatCurrency(localShouldApplyDiscount ? localFinalTotalAfterDiscount : totalCost),
          '{{total_price_discount}}': formatCurrency(localShouldApplyDiscount ? localFinalTotalAfterDiscount : totalCost),
          '{{final_total}}': formatCurrency(localShouldApplyDiscount ? localFinalTotalAfterDiscount : totalCost),
          '{{finalTotal}}': formatCurrency(localShouldApplyDiscount ? localFinalTotalAfterDiscount : totalCost),
          
          // Plan and tier information
          '{{tier_name}}': tierName,
          '{{tierName}}': tierName,
          '{{plan_name}}': tierName,
          '{{planName}}': tierName,
          '{{plan}}': tierName,
          
          // Date information
          '{{date}}': clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]),
          '{{Date}}': clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]),
          '{{current_date}}': clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]),
          '{{currentDate}}': clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]),
          '{{generation_date}}': clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]),
          '{{effective_date}}': clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]),
          '{{effectiveDate}}': clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]),
          
          // Payment terms information (overage agreements)
          '{{payment_terms}}': clientInfo.paymentTerms || '100% Upfront',
          '{{Payment_terms}}': clientInfo.paymentTerms || '100% Upfront',
          '{{Payment Terms}}': clientInfo.paymentTerms || '100% Upfront',
          '{{Payment_Terms}}': clientInfo.paymentTerms || '100% Upfront',
          '{{paymentTerms}}': clientInfo.paymentTerms || '100% Upfront',
          
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

        const result = await DocxTemplateProcessor.processDocxTemplate(templateFileForEmail as File, templateData);
        if (result.success && result.processedDocx) {
          agreementBlob = result.processedDocx;
          
          // Merge selected exhibits ONLY for Multi combination migration type
          const uniqueSelectedExhibitsForMerge = Array.from(
            new Set((selectedExhibits || []).map((id) => (id ?? '').toString()).filter(Boolean))
          );
          if (uniqueSelectedExhibitsForMerge.length > 0 && configuration.migrationType === 'Multi combination') {
            console.log('📎 Fetching and merging selected exhibits for Multi combination email...', {
              raw: selectedExhibits,
              unique: uniqueSelectedExhibitsForMerge
            });
            
            try {
              // Fetch all exhibit files
              const exhibitBlobs: Blob[] = [];
              
              // Sort exhibits: Included first, then Not Included
              // Within each group: sort by category (messaging first, then content) and displayOrder
              const sortExhibits = async (ids: string[]) => {
                try {
                  const metaResp = await fetch(`${BACKEND_URL}/api/exhibits`);
                  if (!metaResp.ok) return ids;
                  const metaData = await metaResp.json();
                  const lookup = new Map((metaData.exhibits || []).map((ex: any) => [ex._id, ex]));
                  
                  // Separate into Included and Not Included
                  const included: Array<{id: string, exhibit: any}> = [];
                  const notIncluded: Array<{id: string, exhibit: any}> = [];
                  
                  ids.forEach((id) => {
                    const ex = lookup.get(id) as any;
                    if (!ex) return;
                    const text = `${ex?.name || ''} ${ex?.description || ''}`.toLowerCase();
                    // Check for various "not included" patterns (with/without spaces, different cases)
                    const isNotIncluded = text.includes('not included') ||
                                        text.includes('not include') ||
                                        text.includes('notincluded') ||
                                        text.includes('notinclude') ||
                                        text.includes('not-include') ||
                                        text.includes('not-included');
                    if (isNotIncluded) {
                      notIncluded.push({ id, exhibit: ex });
                    } else {
                      included.push({ id, exhibit: ex });
                    }
                  });
                  
                  // Sort within each group: category (messaging first, then content), then displayOrder
                  const categoryOrder = (cat: string) => {
                    const normalized = (cat || 'content').toLowerCase();
                    if (normalized === 'messaging' || normalized === 'message') return 1;
                    if (normalized === 'content') return 2;
                    return 3; // email or others
                  };
                  
                  included.sort((a, b) => {
                    const catDiff = categoryOrder(a.exhibit.category) - categoryOrder(b.exhibit.category);
                    if (catDiff !== 0) return catDiff;
                    return (a.exhibit.displayOrder || 0) - (b.exhibit.displayOrder || 0);
                  });
                  
                  notIncluded.sort((a, b) => {
                    const catDiff = categoryOrder(a.exhibit.category) - categoryOrder(b.exhibit.category);
                    if (catDiff !== 0) return catDiff;
                    return (a.exhibit.displayOrder || 0) - (b.exhibit.displayOrder || 0);
                  });
                  
                  // Return: All Included first, then All Not Included
                  return [...included.map(x => x.id), ...notIncluded.map(x => x.id)];
                } catch {
                  return ids;
                }
              };

              const sortedExhibits = await sortExhibits(uniqueSelectedExhibitsForMerge);

              // Fetch exhibit metadata for grouping
              const exhibitMetadata: Array<{ name: string; category?: string }> = [];
              const metaResp = await fetch(`${BACKEND_URL}/api/exhibits`);
              let allExhibits: any[] = [];
              if (metaResp.ok) {
                const metaData = await metaResp.json();
                if (metaData.success && metaData.exhibits) {
                  allExhibits = metaData.exhibits;
                }
              }

              for (const exhibitId of sortedExhibits) {
                console.log(`📎 Fetching exhibit: ${exhibitId}`);
                const response = await fetch(`${BACKEND_URL}/api/exhibits/${exhibitId}/file`);
                
                if (response.ok) {
                  const blob = await response.blob();
                  exhibitBlobs.push(blob);
                  
                  // Get exhibit metadata
                  const exhibit = allExhibits.find((ex: any) => ex._id === exhibitId);
                  if (exhibit) {
                    exhibitMetadata.push({
                      name: exhibit.name || '',
                      category: exhibit.category || ''
                    });
                  }
                  
                  console.log(`✅ Fetched exhibit ${exhibitId} (${blob.size} bytes)`);
                } else {
                  console.warn(`⚠️ Failed to fetch exhibit ${exhibitId}:`, response.status);
                }
              }
              
              if (exhibitBlobs.length > 0) {
                console.log(`📎 Merging ${exhibitBlobs.length} exhibits into email document...`);
                const { mergeDocxFiles } = await import('../utils/docxMerger');
                
                agreementBlob = await mergeDocxFiles(agreementBlob, exhibitBlobs, exhibitMetadata);
                
                console.log('✅ Exhibits merged successfully for email!', {
                  totalExhibits: exhibitBlobs.length,
                  finalSize: agreementBlob.size
                });
              }
            } catch (mergeError) {
              console.error('❌ Error merging exhibits for email:', mergeError);
              // Continue with main document without exhibits
            }
          }
          
          setProcessedAgreement(agreementBlob);
        } else {
          alert('Failed to generate the agreement. Please try again.');
          setIsEmailingAgreement(false);
          return;
        }
      }

      if (!agreementBlob) {
        alert('Agreement not generated yet. Click Preview Agreement first.');
        setIsEmailingAgreement(false);
        return;
      }

      // Send directly to CloudFuze sales operations
      const to = 'anushreddydasari@gmail.com';

      const emailCompanyName = clientInfo.company || dealData?.companyByContact || dealData?.company || 'Client';
      const emailClientName = clientInfo.clientName || dealData?.contactName || 'Valued Client';
      
      const subject = `CloudFuze Service Agreement - ${emailCompanyName} - ${new Date().toLocaleDateString()}`;
      
      // Calculate all pricing components
      const userCost = calculation?.userCost ?? safeCalculation.userCost;
      const dataCost = calculation?.dataCost ?? safeCalculation.dataCost;
      const migrationCost = calculation?.migrationCost ?? safeCalculation.migrationCost;
      const instanceCost = calculation?.instanceCost ?? safeCalculation.instanceCost;
      const subtotal = calculation?.totalCost ?? safeCalculation.totalCost;
      const discountAmount = (clientInfo.discount ?? 0) > 0 ? (subtotal * ((clientInfo.discount ?? 0) / 100)) : 0;
      const finalTotal = shouldApplyDiscount ? finalTotalAfterDiscount : subtotal;
      const tierName = calculation?.tier?.name ?? safeCalculation.tier.name;
      
      const message = `Dear ${emailClientName},

Thank you for choosing CloudFuze for your data migration needs. Please find your comprehensive service agreement attached for review.

CONTACT INFORMATION:
- Contact Name: ${emailClientName}
- Email: ${clientInfo.clientEmail || dealData?.contactEmail || 'N/A'}
- Legal Entity Name: ${emailCompanyName}
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
This agreement was generated on ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST using CloudFuze Zenop.ai Pro.
Agreement ID: AGR-${Date.now().toString().slice(-8)}
Template: ${selectedTemplate?.name || 'Default Template'}`;

      const formData = new FormData();
      const filenameBase = (clientInfo.company || 'Company').replace(/[^a-zA-Z0-9]/g, '_');
      const timestamp = new Date().toISOString().slice(0, 10);
      const attachmentName = `${filenameBase}_Agreement_${timestamp}.docx`;

      // Add form data for server-side email with attachment
      formData.append('to', to);
      formData.append('subject', subject);
      formData.append('message', message);
      formData.append('attachment', agreementBlob, attachmentName);

      console.log('📧 Sending email via server with attachment:', {
        to,
        subject,
        attachmentName,
        attachmentSize: agreementBlob.size
      });

      // Send email using server-side endpoint with attachment
      const response = await fetch(`${BACKEND_URL}/api/email/send`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        console.log('📧 Email send response:', result);
        console.log('📧 SendGrid Status Code:', result.statusCode);
        console.log('📧 Message ID:', result.messageId);
        
        // Show more detailed success message
        const messageId = result.messageId ? `\nMessage ID: ${result.messageId}` : '';
        const statusCode = result.statusCode ? `\nStatus: ${result.statusCode}` : '';
        alert(`✅ Agreement emailed successfully to anushreddydasari@gmail.com!${messageId}${statusCode}\n\nNote: The email has been sent to CloudFuze Sales Operations.`);
      } else {
        throw new Error(result.message);
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
      // CRITICAL: For Multi combination, ensure top-level duration is set to the sum of messaging + content
      const finalConfiguration = { ...configuration };
      if (configuration?.migrationType === 'Multi combination') {
        const msgDuration = Number(configuration.messagingConfig?.duration || 0);
        const contentDuration = Number(configuration.contentConfig?.duration || 0);
        finalConfiguration.duration = msgDuration + contentDuration;
        console.log('✅ Multi combination: Setting top-level duration =', finalConfiguration.duration, '(messaging:', msgDuration, '+ content:', contentDuration, ')');
        console.log('✅ Multi combination: finalConfiguration includes nested configs:', {
          hasMessagingConfig: !!finalConfiguration.messagingConfig,
          hasContentConfig: !!finalConfiguration.contentConfig,
          messagingConfig: finalConfiguration.messagingConfig,
          contentConfig: finalConfiguration.contentConfig
        });
      }
      
      // Create quote object with deal information including discount
      const quoteData: Quote = {
        id: `quote-001`,
        clientName: clientInfo.clientName,
        clientEmail: clientInfo.clientEmail,
        company: clientInfo.company,
        configuration: finalConfiguration,
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
      
      // Track quote generation
      trackQuoteOperation({
        action: 'generated',
        quoteId: quoteData.id,
        clientName: quoteData.clientName,
        clientEmail: quoteData.clientEmail,
        totalCost: safeCalculation.totalCost,
        tier: safeCalculation.tier?.name,
        templateId: selectedTemplate?.id,
        templateName: selectedTemplate?.name
      });
      
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
      // Use effective duration (handles Multi combination + nested configs)
      '{{Duration of months}}': (getEffectiveDurationMonths(quote.configuration) || 1).toString(),
      '{{instance_users}}': quote.configuration.numberOfInstances.toString(),
      '{{instance_type}}': quote.configuration.instanceType || 'Standard',
      // Instance type monthly cost (per server per month)
      // Multi combination requirement: sum messaging + content base monthly rates.
      '{{instance_type_cost}}': (() => {
        if (quote.configuration?.migrationType === 'Multi combination') {
          const msgType = quote.configuration.messagingConfig?.instanceType || quote.configuration.instanceType || 'Small';
          const contentType = quote.configuration.contentConfig?.instanceType || quote.configuration.instanceType || 'Small';
          return formatCurrency(getInstanceTypeCost(msgType) + getInstanceTypeCost(contentType));
        }
        return formatCurrency(getInstanceTypeCost(quote.configuration.instanceType || 'Standard'));
      })(),
      '{{per_user_cost}}': (() => {
        if (quote.configuration?.migrationType === 'Multi combination') {
          const msgUsers = quote.configuration.messagingConfig?.numberOfUsers || 0;
          const contentUsers = quote.configuration.contentConfig?.numberOfUsers || 0;
          const msgUserCost = (safeCalculation.messagingCalculation?.userCost ?? 0);
          const contentUserCost = (safeCalculation.contentCalculation?.userCost ?? 0);
          const msgPerUser = msgUsers > 0 ? msgUserCost / msgUsers : 0;
          const contentPerUser = contentUsers > 0 ? contentUserCost / contentUsers : 0;
          return formatCurrency(Math.max(msgPerUser, contentPerUser));
        }
        return formatCurrency((safeCalculation.userCost || 0) / (quote.configuration.numberOfUsers || 1));
      })(),
      '{{data_size}}': (quote.configuration.dataSizeGB ?? 0).toString(),
      '{{dataSizeGB}}': (quote.configuration.dataSizeGB ?? 0).toString(),
      '{{data_size_gb}}': (quote.configuration.dataSizeGB ?? 0).toString(),
      '{{per_data_cost}}': (() => {
        // Multi combination: per-GB should come from CONTENT side (messaging has no data size)
        const isMulti = quote.configuration?.migrationType === 'Multi combination';
        const safeDataSize = isMulti ? (quote.configuration?.contentConfig?.dataSizeGB ?? 0) : (quote.configuration.dataSizeGB ?? 0);
        const safeDataCost = isMulti ? (safeCalculation.contentCalculation?.dataCost ?? 0) : (safeCalculation.dataCost ?? 0);
        
        // CRITICAL: For Email/Overage flows where dataSizeGB=0 and dataCost=0,
        // use the tier's perGBCost directly
        const tierPerGbRaw = isMulti
          ? (safeCalculation.tier?.perGBCost ?? 0)
          : (safeCalculation.tier?.perGBCost ?? 0);

        const tierNameForFallback = (safeCalculation.tier?.name ?? '').toString().toLowerCase();

        // Fallback defaults if tier.perGBCost is 0/undefined
        const fallbackPerGb =
          tierNameForFallback === 'basic' ? 1.0 :
          tierNameForFallback === 'standard' ? 1.5 :
          tierNameForFallback === 'advanced' ? 1.8 :
          1.5; // Default to Standard rate if tier unknown

        const tierPerGb = (tierPerGbRaw && tierPerGbRaw > 0) ? tierPerGbRaw : fallbackPerGb;

        // Use tier's per-GB cost when dataSize is 0
        const perDataCost = safeDataSize > 0 ? (safeDataCost / safeDataSize) : tierPerGb;
        
        console.log('🔍 PER_DATA_COST CALCULATION (generatePlaceholderPreview):', {
          migType: quote.configuration?.migrationType,
          dataSizeGB: safeDataSize,
          dataCost: safeDataCost,
          'safeCalculation.tier': safeCalculation.tier,
          tierPerGbRaw,
          tierNameForFallback,
          fallbackPerGb,
          tierPerGb,
          perDataCost,
          formatted: formatCurrency(perDataCost)
        });
        return formatCurrency(perDataCost);
      })(),
      '{{total price}}': formatCurrency(safeCalculation.totalCost),
      // New tokens related to discount and final total - hide when discount is 0
      '{{discount_amount}}': (shouldApplyDiscount && discountAmount > 0) ? `-${formatCurrency(discountAmount)}` : '',
      '{{discount_text}}': (shouldApplyDiscount && discountPercent > 0) ? `Discount (${discountPercent}%)` : '',
      '{{discount_line}}': (shouldApplyDiscount && discountAmount > 0) ? `Discount (${discountPercent}%) - ${formatCurrency(discountAmount)}` : '',
          // Static label support for templates with a dedicated label cell
          '{{discount_label}}': (shouldApplyDiscount && discountPercent > 0) ? 'Discount' : '',
      '{{total_after_discount}}': formatCurrency(shouldApplyDiscount ? finalTotalAfterDiscount : totalCost),
      '{{total_price_discount}}': formatCurrency(shouldApplyDiscount ? finalTotalAfterDiscount : totalCost),
      
      // Additional mappings for compatibility
      '{{company_name}}': quote.company || 'Company Name',
      '{{users}}': quote.configuration.numberOfUsers.toString(),
      '{{migration_type}}': quote.configuration.migrationType,
      '{{prices}}': formatCurrency(safeCalculation.userCost + safeCalculation.dataCost + safeCalculation.instanceCost),
      '{{migration_price}}': formatCurrency(safeCalculation.migrationCost),
      '{{total_price}}': formatCurrency(safeCalculation.totalCost),
      '{{duration_months}}': (getEffectiveDurationMonths(quote.configuration) || 1).toString(),
      '{{client_name}}': quote.clientName,
      '{{client_email}}': quote.clientEmail,
      '{{quote_number}}': quoteNumber,
      '{{date}}': clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]),
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
    // For Word downloads, prefer the original DOCX if available
    const documentToDownload = originalDocxAgreement || processedAgreement;
    
    if (!documentToDownload) {
      alert('No agreement available. Please generate an agreement first.');
      return;
    }

    try {
      // Use original DOCX if available, otherwise use processed agreement
      const isDOCX = originalDocxAgreement !== null;
      const fileExtension = isDOCX ? 'docx' : (processedAgreement?.type === 'application/pdf' ? 'pdf' : 'docx');
      const fileSize = documentToDownload.size;
      
      // Generate filename with correct extension
      const clientName = (clientInfo.clientName || 'client').replace(/[^a-zA-Z0-9]/g, '_');
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `agreement-${clientName}-${dateStr}.${fileExtension}`;
      
      console.log(`📥 Downloading Word document: ${filename} (${(fileSize / 1024).toFixed(2)} KB)`);
      console.log(`📄 Document type: ${isDOCX ? 'DOCX (original)' : 'PDF (converted)'}`);
      
      // Create download link
      const url = URL.createObjectURL(documentToDownload);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      // Track document download
      trackDocumentOperation({
        action: 'downloaded',
        documentType: 'agreement',
        documentName: filename,
        format: fileExtension,
        fileSize: fileSize / 1024 // Convert to KB
      });
      
      console.log(`✅ Word document downloaded as ${filename} (${(fileSize / 1024).toFixed(2)} KB)`);
      
      // Don't close preview automatically - let user decide when to close
      // setShowAgreementPreview(false);
      // setProcessedAgreement(null);
    } catch (error) {
      console.error('❌ Error downloading Word document:', error);
      alert('Failed to download Word document. Please try again.');
    }
  };

  // Handle PDF download from the generated agreement using document preview
  const handleDownloadAgreementPDF = async () => {
    try {
      if (!processedAgreement) {
        alert('No agreement available. Please generate an agreement first.');
        return;
      }

      // If we already have a PDF (new flow), reuse it directly instead of converting again.
      let pdfBlob: Blob;
      if (processedAgreement.type === 'application/pdf') {
        console.log('📄 Using existing PDF blob for download (no extra conversion).');
        pdfBlob = processedAgreement;
      } else {
        // Fallback: Prefer server-side high-fidelity conversion from DOCX.
        const { templateService } = await import('../utils/templateService');
        pdfBlob = await templateService.convertDocxToPdf(processedAgreement);
      }
      
      // Save PDF to MongoDB database
      try {
        console.log('💾 Saving PDF to MongoDB from PDF button...');
        const { documentServiceMongoDB } = await import('../services/documentServiceMongoDB');
        const base64Data = await documentServiceMongoDB.blobToBase64(pdfBlob);
        
        const savedDoc = {
          fileName: `${clientInfo.company?.replace(/[^a-z0-9]/gi, '_') || 'Agreement'}_${new Date().toISOString().split('T')[0]}.pdf`,
          fileData: base64Data,
          fileSize: pdfBlob.size,
          clientName: clientInfo.clientName || 'Unknown',
          clientEmail: clientInfo.clientEmail || '',
          company: clientInfo.company || 'Unknown Company',
          templateName: selectedTemplate?.name || 'Agreement',
          generatedDate: new Date().toISOString(),
          quoteId: quoteId,
          metadata: {
            totalCost: calculation?.totalCost || 0,
            duration: configuration?.duration || 0,
            migrationType: configuration?.migrationType || 'Messaging',
            numberOfUsers: configuration?.numberOfUsers || 0
          }
        };
        
        await documentServiceMongoDB.saveDocument(savedDoc);
        console.log('✅ PDF saved to MongoDB successfully from PDF button');
        
        // Show success notification
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2';
        notification.innerHTML = `
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
          <span>PDF saved to MongoDB!</span>
        `;
        document.body.appendChild(notification);
        setTimeout(() => {
          notification.remove();
        }, 3000);
      } catch (error) {
        console.error('❌ Error saving PDF to MongoDB:', error);
        // Continue with download even if saving fails
      }
      
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `agreement-${clientInfo.clientName || 'client'}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      // Track document download
      trackDocumentOperation({
        action: 'downloaded',
        documentType: 'agreement',
        documentName: link.download,
        format: 'pdf',
        fileSize: pdfBlob.size / 1024 // Convert to KB
      });
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

  // Handle starting approval workflow
  const handleStartApprovalWorkflow = async () => {
    if (!processedAgreement) {
      alert('No agreement available. Please generate an agreement first.');
      return;
    }

    // Validate email addresses
    if (!approvalEmails.role1 || !approvalEmails.role2 || !approvalEmails.role4) {
      alert('Please enter Technical, Legal, and Deal Desk email addresses.');
      return;
    }

    setIsStartingWorkflow(true);
    try {
      // First, save the PDF to MongoDB if not already saved
      const { templateService } = await import('../utils/templateService');
      const pdfBlob = await templateService.convertDocxToPdf(processedAgreement);
      
      const { documentServiceMongoDB } = await import('../services/documentServiceMongoDB');
      const base64Data = await documentServiceMongoDB.blobToBase64(pdfBlob);
      
      const savedDoc = {
        fileName: `${clientInfo.company?.replace(/[^a-z0-9]/gi, '_') || 'Agreement'}_${new Date().toISOString().split('T')[0]}.pdf`,
        fileData: base64Data,
        fileSize: pdfBlob.size,
        clientName: clientInfo.clientName || 'Unknown',
        clientEmail: clientInfo.clientEmail || '',
          company: clientInfo.company || 'Unknown Company',
          templateName: selectedTemplate?.name || 'Agreement',
          generatedDate: new Date().toISOString(),
          quoteId: quoteId,
          metadata: {
            totalCost: calculation?.totalCost || 0,
            duration: configuration?.duration || 0,
            migrationType: configuration?.migrationType || 'Messaging',
            numberOfUsers: configuration?.numberOfUsers || 0
          }
        };
        
        const documentId = await documentServiceMongoDB.saveDocument(savedDoc);
      console.log('✅ PDF saved to MongoDB for workflow:', documentId);

      // Resolve Team Approval group from UI selection
      const choice = (teamSelection || 'SMB').toUpperCase();
      const teamEmail = getTeamApprovalEmail(choice);

      if (!teamEmail) {
        alert('Please select a valid Team Approval group email before starting the workflow.');
        setIsStartingWorkflow(false);
        return;
      }

      // Determine if this is an overage agreement workflow (special approval routing)
      const isOverageWorkflow =
        (configuration?.combination || '').toLowerCase() === 'overage-agreement' ||
        (configuration?.migrationType || '').toLowerCase() === 'overage agreement';
      
      // Create the approval workflow (Team Approval -> Technical -> Legal -> Deal Desk)
      // For overage workflows, Technical Team approval will be auto-skipped in Team step.
        const workflowData = {
        documentId: documentId,
        documentType: 'PDF Agreement',
        clientName: clientInfo.clientName || 'Unknown Client',
        amount: calculation?.totalCost || 0,
        // Notify the actual workflow initiator (current CPQ user)
          creatorEmail: (() => {
          try {
            const userRaw = localStorage.getItem('cpq_user');
            if (userRaw) {
              const user = JSON.parse(userRaw);
              if (user?.email) return user.email;
            }
          } catch {}
          // Fallback if no user is stored
          return 'abhilasha.kandakatla@cloudfuze.com';
        })(),
        isOverage: isOverageWorkflow,
        totalSteps: 4,
        workflowSteps: [
          { step: 1, role: 'Team Approval', email: teamEmail, status: 'pending' as const, group: choice, comments: '' },
          { step: 2, role: 'Technical Team', email: approvalEmails.role1, status: 'pending' as const },
          { step: 3, role: 'Legal Team', email: approvalEmails.role2, status: 'pending' as const },
          { step: 4, role: 'Deal Desk', email: approvalEmails.role4, status: 'pending' as const }
        ]
      };

      const newWorkflow = await createWorkflow(workflowData);
      console.log('✅ Approval workflow created:', newWorkflow);

      // Analytics: workflow started
      try {
        trackApprovalEvent({
          action: 'workflow_started',
          quoteId: quoteId,
          workflowId: newWorkflow?.id
        });
      } catch {}

      // Send email to the selected Team Approval first (sequential approval)
      try {
        const response = await fetch(`${BACKEND_URL}/api/send-team-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            teamEmail,
            workflowData: {
              documentId: documentId,
              documentType: 'PDF Agreement',
              clientName: clientInfo.clientName || 'Unknown Client',
              amount: calculation?.totalCost || 0,
              workflowId: newWorkflow.id,
              // Include selected team so email can display it
              teamGroup: choice
            }
          })
        });

        // Be tolerant of non-JSON error responses (e.g., 404 HTML fallback)
        let result: any = null;
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          result = await response.json();
        } else {
          const text = await response.text();
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
          } else {
            result = { success: true };
          }
        }

        if (result?.success) {
          const creator = workflowData.creatorEmail || workflowCreatorEmail;
          alert(`✅ Approval workflow started successfully!\n📧 Team Approval (${choice || 'SMB'}) has been notified. The workflow will continue sequentially when each role approves.\nℹ️ If any approver denies, the creator will be notified at ${creator}.`);
          setShowApprovalModal(false);
          setApprovalEmails({ role1: defaultTechEmail, role2: defaultLegalEmail, role4: defaultDealDeskEmail });
        } else {
          alert('✅ Workflow created but Technical Team email failed.\nPlease notify Technical Team manually.');
        }
      } catch (emailError) {
        console.error('❌ Error sending Technical Team email:', emailError);
        alert('✅ Workflow created but Technical Team email failed.\nPlease notify Technical Team manually.');
      }

      // Navigate to Approval page → Admin Dashboard tab so user can see the workflow status
      navigate('/approval', {
        state: { openDashboardTab: true, source: 'quote-approval', documentId: documentId }
      });

    } catch (error) {
      console.error('❌ Error starting approval workflow:', error);
      alert('Error starting approval workflow. Please try again.');
    } finally {
      setIsStartingWorkflow(false);
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
                    <p><strong>Valid for ${formatMonths(getEffectiveDurationMonths(configuration) || 1)}</strong></p>
                  </div>
                  <div class="table-cell">${formatCurrency(calculation?.migrationCost || 0)}</div>
                </div>
              </div>
            </div>
            
            <div class="content-section">
              <div class="section-title">Contact Information</div>
              <p><strong>Legal Entity Name:</strong> ${clientInfo.company}</p>
              <p><strong>Contact Name:</strong> ${clientInfo.clientName}</p>
              <p><strong>Email:</strong> ${clientInfo.clientEmail}</p>
              <p><strong>Migration Type:</strong> ${configuration?.migrationType || 'Content'}</p>
              <p><strong>Duration:</strong> ${(getEffectiveDurationMonths(configuration) || 1)} months</p>
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

      // Convert PDF to blob and save to database
      const pdfBlob = pdf.output('blob');
      
      // Download and save to database
      await downloadAndSavePDF(
        pdfBlob,
        filename,
        clientInfo.clientName,
        clientInfo.company,
        undefined, // quoteId
        calculation?.totalCost
      );
      
      console.log('✅ PDF generated, downloaded, and saved to database successfully');
      
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

    // Validate both date fields are provided
    const hasProjectStartDate = configuration?.startDate && configuration.startDate.trim() !== '';
    const hasEffectiveDate = clientInfo.effectiveDate && clientInfo.effectiveDate.trim() !== '';
    
    if (!hasProjectStartDate || !hasEffectiveDate) {
      // Set validation errors to show red borders
      setDateValidationErrors({
        projectStartDate: !hasProjectStartDate,
        effectiveDate: !hasEffectiveDate
      });
      
      // Show alert with specific missing fields
      const missingFields = [];
      if (!hasProjectStartDate) missingFields.push('Project Start Date');
      if (!hasEffectiveDate) missingFields.push('Effective Date');
      
      alert(`Please fill in the following required fields:\n- ${missingFields.join('\n- ')}`);
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
      // Clone to avoid mutating React state object
      const finalConfiguration = { ...(configuration || fallbackConfiguration) } as any;
      // Multi combination: ensure top-level duration reflects the effective duration from nested configs
      // (new UI stores per-exhibit durations in messagingConfigs/contentConfigs arrays).
      if (finalConfiguration?.migrationType === 'Multi combination') {
        const effectiveDuration = getEffectiveDurationMonths(finalConfiguration);
        if (effectiveDuration > 0) {
          finalConfiguration.duration = effectiveDuration;
        }
      }
      console.log('🔍 FINAL CONFIGURATION BEING USED:', finalConfiguration);
      console.log('🔍 FINAL CONFIGURATION TYPE:', typeof finalConfiguration);
      console.log('🔍 FINAL CONFIGURATION KEYS:', Object.keys(finalConfiguration));
      console.log('🔍 FINAL CONFIGURATION startDate:', finalConfiguration.startDate);
      console.log('🔍 FINAL CONFIGURATION endDate:', finalConfiguration.endDate);

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
          dataSizeGB: finalConfiguration.dataSizeGB,
          startDate: finalConfiguration.startDate,
          endDate: finalConfiguration.endDate,
          // IMPORTANT: preserve nested configs for Multi combination
          messagingConfig: finalConfiguration.messagingConfig,
          contentConfig: finalConfiguration.contentConfig,
          // New UI shape: per-exhibit configs
          messagingConfigs: finalConfiguration.messagingConfigs,
          contentConfigs: finalConfiguration.contentConfigs,
          emailConfigs: finalConfiguration.emailConfigs
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

      // Always try to fetch the latest template file from backend (cache-bust) so
      // edits in Mongo/disk are reflected even if the template was previously loaded.
      const fetchLatestTemplateFile = async (): Promise<File | null> => {
        try {
          if (!selectedTemplate?.id) return null;
          const fr = await fetch(`${BACKEND_URL}/api/templates/${selectedTemplate.id}/file?t=${Date.now()}`, {
            cache: 'no-store'
          });
          if (!fr.ok) return null;
          const blob = await fr.blob();
          return new File(
            [blob],
            selectedTemplate.fileName || selectedTemplate.file?.name || 'template.docx',
            {
              type:
                selectedTemplate.fileType ||
                selectedTemplate.file?.type ||
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            }
          );
        } catch (e) {
          console.warn('⚠️ Unable to fetch latest template file, falling back to cached file:', e);
          return null;
        }
      };

      const latestTemplateFile = await fetchLatestTemplateFile();
      const templateFileForAgreement = latestTemplateFile || selectedTemplate.file;

      // Process based on template file type - DOCX is now the primary method
      if (templateFileForAgreement.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
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
        const duration = getEffectiveDurationMonths(quoteData.configuration) || 1;
        const migrationType = quoteData.configuration?.migrationType || 'Content';
        const clientName = quoteData.clientName || clientInfo.clientName || 'Demo Client';
        const clientEmail = quoteData.clientEmail || clientInfo.clientEmail || 'demo@example.com';
        
        // CRITICAL DEBUG: Log duration calculation for Multi combination
        console.log('🔍 AGREEMENT GENERATION - DURATION DEBUG:');
        console.log('  quoteData.configuration.migrationType:', quoteData.configuration?.migrationType);
        console.log('  quoteData.configuration.duration:', quoteData.configuration?.duration);
        console.log('  quoteData.configuration.messagingConfig?.duration:', quoteData.configuration?.messagingConfig?.duration);
        console.log('  quoteData.configuration.contentConfig?.duration:', quoteData.configuration?.contentConfig?.duration);
        console.log('  getEffectiveDurationMonths result:', getEffectiveDurationMonths(quoteData.configuration));
        console.log('  Final duration value being used:', duration);
        
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
        const dataSizeGB = quoteData.configuration?.dataSizeGB ?? configuration?.dataSizeGB ?? 0;
        
        // CRITICAL: Recalculate discount based on the local totalCost value
        // This ensures discount is calculated correctly for the template preview
        const localDiscountPercent = (clientInfo.discount ?? storedDiscountPercent ?? 0);
        const localIsDiscountAllowed = totalCost >= 2500;
        const localHasValidDiscount = localDiscountPercent > 0 && localDiscountPercent <= 15; // Updated to 15% cap
        const localDiscountAmount = localHasValidDiscount ? totalCost * (localDiscountPercent / 100) : 0;
        const localFinalTotalAfterDiscount = totalCost - localDiscountAmount;
        const localIsDiscountValid = localHasValidDiscount ? localFinalTotalAfterDiscount >= 2500 : true;
        const localShouldApplyDiscount = localIsDiscountAllowed && localHasValidDiscount && localIsDiscountValid;
        
        console.log('🧮 Discount calculation in handleGenerateAgreement:', {
          totalCost,
          localDiscountPercent,
          localIsDiscountAllowed,
          localHasValidDiscount,
          localDiscountAmount,
          localFinalTotalAfterDiscount,
          localIsDiscountValid,
          localShouldApplyDiscount
        });
        
        // Debug: Log critical data extraction
        console.log('🔍 DATA SIZE DEBUG:');
        console.log('  quoteData.configuration?.dataSizeGB:', quoteData.configuration?.dataSizeGB);
        console.log('  configuration?.dataSizeGB:', configuration?.dataSizeGB);
        console.log('  finalConfiguration?.dataSizeGB:', finalConfiguration?.dataSizeGB);
        console.log('  Final dataSizeGB value:', dataSizeGB);
        console.log('  typeof dataSizeGB:', typeof dataSizeGB);
        console.log('  dataSizeGB === undefined:', dataSizeGB === undefined);
        console.log('  dataSizeGB === null:', dataSizeGB === null);
        console.log('  dataCost value:', dataCost);
        console.log('  typeof dataCost:', typeof dataCost);
        console.log('  Per data cost calculation:', (dataCost || 0) / (dataSizeGB || 1));
        
        // CRITICAL: Check all configuration sources
        console.log('🔍 CONFIGURATION SOURCES:');
        console.log('  configuration prop:', configuration);
        console.log('  finalConfiguration:', finalConfiguration);
        console.log('  quoteData.configuration:', quoteData.configuration);
        
        // Debug: Log the date values being used
        console.log('🔍 Template Data Debug:');
        console.log('  configuration?.startDate:', configuration?.startDate);
        console.log('  configuration?.endDate:', configuration?.endDate);
        console.log('  clientInfo.effectiveDate:', clientInfo.effectiveDate);
        console.log('  clientInfo.paymentTerms:', clientInfo.paymentTerms);
        console.log('  configuration?.duration:', configuration?.duration);
        console.log('  Full configuration object:', configuration);
        console.log('  Full clientInfo object:', clientInfo);
        
        const templateData: Record<string, string> = {
          // Core company and client information
          '{{Company Name}}': finalCompanyName || 'Your Company',
          '{{ Company Name }}': finalCompanyName || 'Your Company',
          '{{Company_Name}}': finalCompanyName || 'Your Company',
          '{{ Company_Name }}': finalCompanyName || 'Your Company',
          '{{company name}}': finalCompanyName || 'Your Company',
          '{{clientName}}': clientName || 'Contact Name',
          '{{client_name}}': clientName || 'Contact Name',
          '{{email}}': clientEmail || 'contact@email.com',
          '{{client_email}}': clientEmail || 'contact@email.com',
          
          // Project configuration
          '{{users_count}}': (userCount || 1).toString(),
          '{{userscount}}': (userCount || 1).toString(),
          '{{users}}': (userCount || 1).toString(),
          '{{number_of_users}}': (userCount || 1).toString(),
          '{{instance_type}}': instanceType,
          '{{instanceType}}': instanceType,
          '{{instance type}}': instanceType, // Space version
          // Instance type monthly cost (per server per month)
          // Multi combination requirement: sum messaging + content base monthly rates.
          '{{instance_type_cost}}': (() => {
            if (configuration?.migrationType === 'Multi combination') {
              // Newer UI stores Multi-combo values in messagingConfigs/contentConfigs/emailConfigs arrays.
              // Keep backward compatibility with older shape (messagingConfig/contentConfig/emailConfig).
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const cfg: any = configuration as any;
              const msgType = (cfg.messagingConfig?.instanceType ?? cfg.messagingConfigs?.[0]?.instanceType) || 'Small';
              const contentType = (cfg.contentConfig?.instanceType ?? cfg.contentConfigs?.[0]?.instanceType) || 'Small';
              const emailType = (cfg.emailConfig?.instanceType ?? cfg.emailConfigs?.[0]?.instanceType) || '';

              const base = getInstanceTypeCost(msgType) + getInstanceTypeCost(contentType);
              const email = emailType ? getInstanceTypeCost(emailType) : 0;
              return formatCurrency(base + email);
            }
            return formatCurrency(getInstanceTypeCost(instanceType));
          })(),
          '{{instance_type cost}}': (() => {
            // Space version - keep consistent with {{instance_type_cost}}
            if (configuration?.migrationType === 'Multi combination') {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const cfg: any = configuration as any;
              const msgType = (cfg.messagingConfig?.instanceType ?? cfg.messagingConfigs?.[0]?.instanceType) || 'Small';
              const contentType = (cfg.contentConfig?.instanceType ?? cfg.contentConfigs?.[0]?.instanceType) || 'Small';
              const emailType = (cfg.emailConfig?.instanceType ?? cfg.emailConfigs?.[0]?.instanceType) || '';

              const base = getInstanceTypeCost(msgType) + getInstanceTypeCost(contentType);
              const email = emailType ? getInstanceTypeCost(emailType) : 0;
              return formatCurrency(base + email);
            }
            return formatCurrency(getInstanceTypeCost(instanceType));
          })(), // Space version
          '{{instance..cost}}': formatCurrency(instanceCost), // Handle double-dot typo
          '{{instance_cost}}': formatCurrency(instanceCost),
          '{{instanceCost}}': formatCurrency(instanceCost),
          '{{instance cost}}': formatCurrency(instanceCost), // Space version
          '{{instance_users}}': numberOfInstances.toString(),
          '{{number_of_instances}}': numberOfInstances.toString(),
          '{{number of instances}}': numberOfInstances.toString(), // Space version
          '{{numberOfInstances}}': numberOfInstances.toString(),
          '{{instances}}': numberOfInstances.toString(),
          '{{Duration of months}}': (duration || 1).toString(),
          '{{Duration_of_months}}': (duration || 1).toString(),
          '{{Suration_of_months}}': (duration || 1).toString(), // Handle typo version
          '{{duration_months}}': (duration || 1).toString(),
          '{{duration}}': (duration || 1).toString(),
          // Complete validity text placeholders (for templates with hardcoded "Month" after placeholder)
          '{{duration_validity_text}}': `Valid for ${duration || 1} Month${(duration || 1) === 1 ? '' : 's'}`,
          '{{instance_validity_text}}': `Instance Valid for ${duration || 1} Month${(duration || 1) === 1 ? '' : 's'}`,
          '{{migration type}}': migrationType || 'Content',
          '{{migration_type}}': migrationType || 'Content',
          '{{migrationType}}': migrationType || 'Content',
          '{{data_size}}': (dataSizeGB ?? 0).toString(),
          '{{dataSizeGB}}': (dataSizeGB ?? 0).toString(),
          '{{data_size_gb}}': (dataSizeGB ?? 0).toString(),
          
          // Project dates - formatted as mm/dd/yyyy
          // Use configuration.startDate (Project Start Date) for Start_date
          '{{Start_date}}': (() => {
            const startDate = configuration?.startDate;
            console.log('🔍 Start_date calculation:');
            console.log('  configuration?.startDate (Project Start Date):', configuration?.startDate);
            console.log('  clientInfo.effectiveDate (Effective Date):', clientInfo.effectiveDate);
            console.log('  selected startDate:', startDate);
            
            if (!startDate) {
              console.log('  No start date found, returning N/A');
              return 'N/A';
            }
            
            const formatted = formatDateMMDDYYYY(startDate);
            console.log('  formatted result:', formatted);
            return formatted;
          })(),
          '{{start_date}}': (() => {
            const startDate = configuration?.startDate;
            return startDate ? formatDateMMDDYYYY(startDate) : 'N/A';
          })(),
          '{{startdate}}': (() => {
            const startDate = configuration?.startDate;
            return startDate ? formatDateMMDDYYYY(startDate) : 'N/A';
          })(),
          '{{project_start_date}}': (() => {
            const startDate = configuration?.startDate;
            return startDate ? formatDateMMDDYYYY(startDate) : 'N/A';
          })(),
          '{{project_start}}': (() => {
            const startDate = configuration?.startDate;
            return startDate ? formatDateMMDDYYYY(startDate) : 'N/A';
          })(),
          
          // End date - calculate from Project Start Date + duration
          '{{End_date}}': (() => {
            // First check if endDate is explicitly provided
            if (configuration?.endDate && configuration.endDate !== 'N/A' && configuration.endDate.trim() !== '') {
              console.log('🔍 End_date using provided endDate:', configuration.endDate);
              const formatted = formatDateMMDDYYYY(configuration.endDate);
              console.log('  Formatted endDate:', formatted);
              return formatted;
            }
            
            // Calculate end date from Project Start Date + duration
            const startDate = configuration?.startDate;
            const duration = getEffectiveDurationMonths(configuration) || 0;
            
            console.log('🔍 End_date calculation (no explicit endDate provided):');
            console.log('  Project Start Date:', startDate);
            console.log('  Duration (months):', duration);
            console.log('  Configuration object:', configuration);
            
            if (!startDate || startDate === 'N/A' || startDate.trim() === '') {
              console.warn('  ⚠️ No start date found, returning N/A');
              return 'N/A';
            }
            
            if (!duration || duration <= 0) {
              console.warn('  ⚠️ No valid duration found, returning N/A');
              return 'N/A';
            }
            
            try {
              // Handle different date formats
              let startDateObj: Date;
              if (startDate.includes('/')) {
                // MM/DD/YYYY format
                const [month, day, year] = startDate.split('/');
                startDateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
              } else if (startDate.includes('-')) {
                // YYYY-MM-DD format
                startDateObj = new Date(startDate + 'T00:00:00');
              } else {
                startDateObj = new Date(startDate);
              }
              
              if (isNaN(startDateObj.getTime())) {
                console.error('  ❌ Invalid start date format:', startDate);
                return 'N/A';
              }
              
              const endDate = new Date(startDateObj);
              endDate.setMonth(endDate.getMonth() + duration);
              
              const endDateISO = endDate.toISOString().split('T')[0];
              console.log('  ✅ Calculated End Date (ISO):', endDateISO);
              const formatted = formatDateMMDDYYYY(endDateISO);
              console.log('  ✅ Formatted End Date:', formatted);
              return formatted;
            } catch (error) {
              console.error('  ❌ Error calculating end date:', error);
              return 'N/A';
            }
          })(),
          '{{end_date}}': (() => {
            // Use the same logic as End_date
            if (configuration?.endDate && configuration.endDate !== 'N/A' && configuration.endDate.trim() !== '') {
              return formatDateMMDDYYYY(configuration.endDate);
            }
            // Calculate end date from Project Start Date + duration
            const startDate = configuration?.startDate;
            const duration = getEffectiveDurationMonths(configuration) || 0;
            if (startDate && duration && duration > 0) {
              try {
                let startDateObj: Date;
                if (startDate.includes('/')) {
                  const [month, day, year] = startDate.split('/');
                  startDateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                } else if (startDate.includes('-')) {
                  startDateObj = new Date(startDate + 'T00:00:00');
                } else {
                  startDateObj = new Date(startDate);
                }
                if (!isNaN(startDateObj.getTime())) {
                  const endDate = new Date(startDateObj);
                  endDate.setMonth(endDate.getMonth() + duration);
                  return formatDateMMDDYYYY(endDate.toISOString().split('T')[0]);
                }
              } catch (error) {
                console.error('Error calculating end_date:', error);
              }
            }
            return 'N/A';
          })(),
          '{{enddate}}': (() => {
            if (configuration?.endDate) {
              return formatDateMMDDYYYY(configuration.endDate);
            }
            // Calculate end date from Project Start Date + duration
            const startDate = configuration?.startDate;
            const duration = getEffectiveDurationMonths(configuration) || 0;
            if (startDate && duration > 0) {
              const startDateObj = new Date(startDate);
              const endDate = new Date(startDateObj);
              endDate.setMonth(endDate.getMonth() + duration);
              return formatDateMMDDYYYY(endDate.toISOString().split('T')[0]);
            }
            return 'N/A';
          })(),
          '{{project_end_date}}': (() => {
            if (configuration?.endDate) {
              return formatDateMMDDYYYY(configuration.endDate);
            }
            // Calculate end date from Project Start Date + duration
            const startDate = configuration?.startDate;
            const duration = getEffectiveDurationMonths(configuration) || 0;
            if (startDate && duration > 0) {
              const startDateObj = new Date(startDate);
              const endDate = new Date(startDateObj);
              endDate.setMonth(endDate.getMonth() + duration);
              return formatDateMMDDYYYY(endDate.toISOString().split('T')[0]);
            }
            return 'N/A';
          })(),
          '{{project_end}}': (() => {
            // Use the same logic as End_date
            if (configuration?.endDate && configuration.endDate !== 'N/A' && configuration.endDate.trim() !== '') {
              return formatDateMMDDYYYY(configuration.endDate);
            }
            // Calculate end date from Project Start Date + duration
            const startDate = configuration?.startDate;
            const duration = getEffectiveDurationMonths(configuration) || 0;
            if (startDate && duration && duration > 0) {
              try {
                let startDateObj: Date;
                if (startDate.includes('/')) {
                  const [month, day, year] = startDate.split('/');
                  startDateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                } else if (startDate.includes('-')) {
                  startDateObj = new Date(startDate + 'T00:00:00');
                } else {
                  startDateObj = new Date(startDate);
                }
                if (!isNaN(startDateObj.getTime())) {
                  const endDate = new Date(startDateObj);
                  endDate.setMonth(endDate.getMonth() + duration);
                  return formatDateMMDDYYYY(endDate.toISOString().split('T')[0]);
                }
              } catch (error) {
                console.error('Error calculating project_end:', error);
              }
            }
            return 'N/A';
          })(),
          
          // Per-user cost calculations
          // Multi combination requirement: pick the HIGHEST per-user cost between messaging and content.
          '{{per_user_cost}}': (() => {
            if (configuration?.migrationType === 'Multi combination') {
              const msgUsers = configuration.messagingConfig?.numberOfUsers || 0;
              const contentUsers = configuration.contentConfig?.numberOfUsers || 0;
              const msgUserCost = (safeCalculation.messagingCalculation?.userCost ?? 0);
              const contentUserCost = (safeCalculation.contentCalculation?.userCost ?? 0);
              const msgPerUser = msgUsers > 0 ? msgUserCost / msgUsers : 0;
              const contentPerUser = contentUsers > 0 ? contentUserCost / contentUsers : 0;
              return formatCurrency(Math.max(msgPerUser, contentPerUser));
            }
            return formatCurrency((userCost || 0) / (userCount || 1));
          })(),
          '{{per_user_monthly_cost}}': (() => {
            if (configuration?.migrationType === 'Multi combination') {
              const msgUsers = configuration.messagingConfig?.numberOfUsers || 0;
              const contentUsers = configuration.contentConfig?.numberOfUsers || 0;
              const msgMonths = configuration.messagingConfig?.duration || 0;
              const contentMonths = configuration.contentConfig?.duration || 0;
              const msgUserCost = (safeCalculation.messagingCalculation?.userCost ?? 0);
              const contentUserCost = (safeCalculation.contentCalculation?.userCost ?? 0);
              const msgPerUserMonthly = (msgUsers > 0 && msgMonths > 0) ? (msgUserCost / (msgUsers * msgMonths)) : 0;
              const contentPerUserMonthly = (contentUsers > 0 && contentMonths > 0) ? (contentUserCost / (contentUsers * contentMonths)) : 0;
              return formatCurrency(Math.max(msgPerUserMonthly, contentPerUserMonthly));
            }
            return formatCurrency((userCost || 0) / ((userCount || 1) * (duration || 1)));
          })(),
          '{{user_rate}}': (() => {
            if (configuration?.migrationType === 'Multi combination') {
              const msgUsers = configuration.messagingConfig?.numberOfUsers || 0;
              const contentUsers = configuration.contentConfig?.numberOfUsers || 0;
              const msgUserCost = (safeCalculation.messagingCalculation?.userCost ?? 0);
              const contentUserCost = (safeCalculation.contentCalculation?.userCost ?? 0);
              const msgPerUser = msgUsers > 0 ? msgUserCost / msgUsers : 0;
              const contentPerUser = contentUsers > 0 ? contentUserCost / contentUsers : 0;
              return formatCurrency(Math.max(msgPerUser, contentPerUser));
            }
            return formatCurrency((userCost || 0) / (userCount || 1));
          })(),
          '{{monthly_user_rate}}': (() => {
            if (configuration?.migrationType === 'Multi combination') {
              const msgUsers = configuration.messagingConfig?.numberOfUsers || 0;
              const contentUsers = configuration.contentConfig?.numberOfUsers || 0;
              const msgMonths = configuration.messagingConfig?.duration || 0;
              const contentMonths = configuration.contentConfig?.duration || 0;
              const msgUserCost = (safeCalculation.messagingCalculation?.userCost ?? 0);
              const contentUserCost = (safeCalculation.contentCalculation?.userCost ?? 0);
              const msgPerUserMonthly = (msgUsers > 0 && msgMonths > 0) ? (msgUserCost / (msgUsers * msgMonths)) : 0;
              const contentPerUserMonthly = (contentUsers > 0 && contentMonths > 0) ? (contentUserCost / (contentUsers * contentMonths)) : 0;
              return formatCurrency(Math.max(msgPerUserMonthly, contentPerUserMonthly));
            }
            return formatCurrency((userCost || 0) / ((userCount || 1) * (duration || 1)));
          })(),
          
          // Per-data cost calculations - cost per GB
          '{{per_data_cost}}': (() => {
            // Multi combination: per-GB should come from CONTENT side (messaging has no data size)
            const isMulti = configuration?.migrationType === 'Multi combination';
            const safeDataSize = isMulti ? (configuration?.contentConfig?.dataSizeGB ?? 0) : (dataSizeGB ?? 0);
            const safeDataCost = isMulti ? (safeCalculation.contentCalculation?.dataCost ?? 0) : (dataCost ?? 0);
            
            // CRITICAL: For Email/Overage flows where dataSizeGB=0 and dataCost=0,
            // use the tier's perGBCost directly
            const tierPerGbRaw = isMulti
              ? (safeCalculation.tier?.perGBCost ?? 0)
              : (safeCalculation.tier?.perGBCost ?? 0);

            const tierNameForFallback = (
              safeCalculation.tier?.name ?? ''
            ).toString().toLowerCase();

            // Fallback defaults if tier.perGBCost is 0/undefined
            const fallbackPerGb =
              tierNameForFallback === 'basic' ? 1.0 :
              tierNameForFallback === 'standard' ? 1.5 :
              tierNameForFallback === 'advanced' ? 1.8 :
              1.5; // Default to Standard rate if tier unknown

            const tierPerGb = (tierPerGbRaw && tierPerGbRaw > 0) ? tierPerGbRaw : fallbackPerGb;

            // Use tier's per-GB cost when dataSize is 0
            const perDataCost = safeDataSize > 0 ? (safeDataCost / safeDataSize) : tierPerGb;
            
            console.log('🔍 PER_DATA_COST CALCULATION (handleGenerateAgreement):', {
              migType: configuration?.migrationType,
              dataSizeGB: safeDataSize,
              dataCost: safeDataCost,
              'safeCalculation.tier': safeCalculation.tier,
              tierPerGbRaw,
              tierNameForFallback,
              fallbackPerGb,
              tierPerGb,
              perDataCost,
              formatted: formatCurrency(perDataCost)
            });
            return formatCurrency(perDataCost);
          })(),
          
          // Total pricing
          '{{total price}}': formatCurrency(totalCost || 0),
          '{{total_price}}': formatCurrency(totalCost || 0),
          '{{totalPrice}}': formatCurrency(totalCost || 0),
          '{{prices}}': formatCurrency(totalCost || 0),
          '{{subtotal}}': formatCurrency(totalCost || 0),
          '{{sub_total}}': formatCurrency(totalCost || 0),
          
          // Discount information - hide discount tokens when discount is 0
        // CRITICAL: Use local discount variables calculated from local totalCost
        '{{discount}}': (localShouldApplyDiscount && localDiscountPercent > 0) ? localDiscountPercent.toString() : '',
          '{{discount_percent}}': (localShouldApplyDiscount && localDiscountPercent > 0) ? localDiscountPercent.toString() : '',
          '{{discount percent}}': (localShouldApplyDiscount && localDiscountPercent > 0) ? localDiscountPercent.toString() : '', // Space version
          '{{discount_percentage}}': (localShouldApplyDiscount && localDiscountPercent > 0) ? localDiscountPercent.toString() : '',
          '{{discount_amount}}': (localShouldApplyDiscount && localDiscountAmount > 0) ? `-${formatCurrency(localDiscountAmount)}` : '',
          '{{discount amount}}': (localShouldApplyDiscount && localDiscountAmount > 0) ? `-${formatCurrency(localDiscountAmount)}` : '', // Space version
          '{{discountAmount}}': (localShouldApplyDiscount && localDiscountAmount > 0) ? `-${formatCurrency(localDiscountAmount)}` : '',
          '{{discount_text}}': (localShouldApplyDiscount && localDiscountPercent > 0) ? `Discount (${localDiscountPercent}%)` : '',
          '{{discount_line}}': (localShouldApplyDiscount && localDiscountAmount > 0) ? `Discount (${localDiscountPercent}%) - ${formatCurrency(localDiscountAmount)}` : '',
          
          // Enhanced discount tokens for better template control
          '{{discount_label}}': (localShouldApplyDiscount && localDiscountPercent > 0) ? 'Discount' : '',
          '{{discount_percent_only}}': (localShouldApplyDiscount && localDiscountPercent > 0) ? `${localDiscountPercent}%` : '',
          '{{discount_percent_with_parentheses}}': (localShouldApplyDiscount && localDiscountPercent > 0) ? `(${localDiscountPercent}%)` : '',
          '{{discount_display}}': (localShouldApplyDiscount && localDiscountAmount > 0) ? `Discount (${localDiscountPercent}%)` : '',
          '{{discount_full_line}}': (localShouldApplyDiscount && localDiscountAmount > 0) ? `Discount (${localDiscountPercent}%) - ${formatCurrency(localDiscountAmount)}` : '',
        '{{total_after_discount}}': formatCurrency(localShouldApplyDiscount ? localFinalTotalAfterDiscount : totalCost),
          '{{total_price_discount}}': formatCurrency(localShouldApplyDiscount ? localFinalTotalAfterDiscount : totalCost),
          '{{final_total}}': formatCurrency(localShouldApplyDiscount ? localFinalTotalAfterDiscount : totalCost),
          '{{finalTotal}}': formatCurrency(localShouldApplyDiscount ? localFinalTotalAfterDiscount : totalCost),
          
          // Plan and tier information
          '{{tier_name}}': tierName,
          '{{tierName}}': tierName,
          '{{plan_name}}': tierName,
          '{{planName}}': tierName,
          '{{plan}}': tierName,
          
          // Date information
          '{{date}}': clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]),
          '{{Date}}': clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]),
          '{{current_date}}': clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]),
          '{{currentDate}}': clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]),
          '{{generation_date}}': clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]),
          '{{effective_date}}': clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]),
          '{{effectiveDate}}': clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]),
          
          // Payment terms information (overage agreements)
          '{{payment_terms}}': clientInfo.paymentTerms || '100% Upfront',
          '{{Payment_terms}}': clientInfo.paymentTerms || '100% Upfront',
          '{{Payment Terms}}': clientInfo.paymentTerms || '100% Upfront',
          '{{Payment_Terms}}': clientInfo.paymentTerms || '100% Upfront',
          '{{paymentTerms}}': clientInfo.paymentTerms || '100% Upfront',
          
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
        
        // Calculate end date value once for reuse in space versions
        const calculatedEndDate = (() => {
          if (configuration?.endDate && configuration.endDate !== 'N/A' && configuration.endDate.trim() !== '') {
            return formatDateMMDDYYYY(configuration.endDate);
          }
          const startDate = configuration?.startDate;
          const duration = getEffectiveDurationMonths(configuration) || 0;
          if (startDate && duration && duration > 0) {
            try {
              let startDateObj: Date;
              if (startDate.includes('/')) {
                const [month, day, year] = startDate.split('/');
                startDateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
              } else if (startDate.includes('-')) {
                startDateObj = new Date(startDate + 'T00:00:00');
              } else {
                startDateObj = new Date(startDate);
              }
              if (!isNaN(startDateObj.getTime())) {
                const endDate = new Date(startDateObj);
                endDate.setMonth(endDate.getMonth() + duration);
                return formatDateMMDDYYYY(endDate.toISOString().split('T')[0]);
              }
            } catch (error) {
              console.error('Error calculating end date for space versions:', error);
            }
          }
          return 'N/A';
        })();
        
        // Add space versions for compatibility
        templateData['{{End date}}'] = calculatedEndDate;
        templateData['{{end date}}'] = calculatedEndDate;
        
        // For Multi combination: Determine migration names from selected exhibits
        if (configuration?.migrationType === 'Multi combination' && selectedExhibits && selectedExhibits.length > 0) {
          try {
            console.log('🔍 Fetching exhibit details to determine migration names...');
            const exhibitResponse = await fetch(`${BACKEND_URL}/api/exhibits`);
            if (exhibitResponse.ok) {
              const exhibitData = await exhibitResponse.json();
              if (exhibitData.success && exhibitData.exhibits) {
                const exhibits = exhibitData.exhibits;
                
                // Helper function to get combination label
                const getCombinationLabel = (combinationValue: string): string => {
                  const labels: Record<string, string> = {
                    'slack-to-teams': 'SLACK TO TEAMS',
                    'slack-to-google-chat': 'SLACK TO GOOGLE CHAT',
                    'google-chat-to-teams': 'GOOGLE CHAT TO TEAMS',
                    'sharefile-to-google-sharedrive': 'SHAREFILE TO GOOGLE SHARED DRIVE',
                    'sharefile-to-google-mydrive': 'SHAREFILE TO GOOGLE MYDRIVE',
                    'sharefile-to-onedrive': 'SHAREFILE TO ONEDRIVE',
                    'sharefile-to-sharepoint': 'SHAREFILE TO SHAREPOINT',
                    'sharefile-to-sharefile': 'SHAREFILE TO SHAREFILE',
                    'google-mydrive-to-google-mydrive': 'GOOGLE MYDRIVE TO GOOGLE MYDRIVE',
                    'google-mydrive-to-google-sharedrive': 'GOOGLE MYDRIVE TO GOOGLE SHARED DRIVE',
                    'google-sharedrive-to-onedrive': 'GOOGLE SHARED DRIVE TO ONEDRIVE',
                    'google-sharedrive-to-sharepoint': 'GOOGLE SHARED DRIVE TO SHAREPOINT',
                    'google-sharedrive-to-google-sharedrive': 'GOOGLE SHARED DRIVE TO GOOGLE SHARED DRIVE',
                    'box-to-google-mydrive': 'BOX TO GOOGLE MYDRIVE',
                    'box-to-google-sharedrive': 'BOX TO GOOGLE SHARED DRIVE',
                    'box-to-onedrive': 'BOX TO ONEDRIVE',
                    'box-to-sharepoint': 'BOX TO SHAREPOINT',
                    'dropbox-to-google-mydrive': 'DROPBOX TO GOOGLE MYDRIVE',
                    'dropbox-to-google-sharedrive': 'DROPBOX TO GOOGLE SHARED DRIVE',
                    'dropbox-to-onedrive': 'DROPBOX TO ONEDRIVE',
                    'dropbox-to-sharepoint': 'DROPBOX TO SHAREPOINT',
                    'onedrive-to-onedrive': 'ONEDRIVE TO ONEDRIVE',
                    'onedrive-to-google-mydrive': 'ONEDRIVE TO GOOGLE MYDRIVE',
                    'sharepoint-online-to-egnyte': 'SHAREPOINT ONLINE TO EGNYTE',
                    'egnyte-to-google': 'EGNYTE TO GOOGLE',
                    'egnyte-to-google-sharedrive': 'EGNYTE TO GOOGLE SHARED DRIVE',
                    'egnyte-to-microsoft': 'EGNYTE TO MICROSOFT',
                    'nfs-to-google': 'NFS TO GOOGLE',
                    'nfs-to-microsoft': 'NFS TO MICROSOFT',
                    'overage-agreement': 'OVERAGE AGREEMENT'
                  };
                  return labels[combinationValue.toLowerCase()] || combinationValue.toUpperCase();
                };
                
                let messagingMigrationName = '';
                let contentMigrationName = '';
                
                // Check each selected exhibit
                for (const exhibitId of selectedExhibits) {
                  const exhibit = exhibits.find((ex: any) => ex._id === exhibitId);
                  if (exhibit) {
                    const category = (exhibit.category || 'content').toLowerCase();
                    const combinations = exhibit.combinations || [];
                    
                    // Find the first non-'all' combination
                    const combination = combinations.find((c: string) => c !== 'all');
                    
                    if (combination) {
                      const label = getCombinationLabel(combination);
                      
                      if ((category === 'messaging' || category === 'message') && !messagingMigrationName) {
                        messagingMigrationName = label;
                      } else if (category === 'content' && !contentMigrationName) {
                        contentMigrationName = label;
                      }
                    }
                  }
                }
                
                // Add migration name tokens to templateData
                templateData['{{messaging_migration_name}}'] = messagingMigrationName || '';
                templateData['{{content_migration_name}}'] = contentMigrationName || '';
                templateData['{{messagingMigrationName}}'] = messagingMigrationName || '';
                templateData['{{contentMigrationName}}'] = contentMigrationName || '';
                
                console.log('✅ Migration names determined:', {
                  messaging: messagingMigrationName,
                  content: contentMigrationName
                });
              }
            }
          } catch (error) {
            console.error('❌ Error determining migration names from exhibits:', error);
            // Set empty values as fallback
            templateData['{{messaging_migration_name}}'] = '';
            templateData['{{content_migration_name}}'] = '';
            templateData['{{messagingMigrationName}}'] = '';
            templateData['{{contentMigrationName}}'] = '';
          }
        } else {
          // For non-multi-combination, set empty values
          templateData['{{messaging_migration_name}}'] = '';
          templateData['{{content_migration_name}}'] = '';
          templateData['{{messagingMigrationName}}'] = '';
          templateData['{{contentMigrationName}}'] = '';
        }
        
        // Add Multi combination specific tokens (content_* and messaging_*)
        if (configuration?.migrationType === 'Multi combination') {
          // Extract messaging config and calculation
          // NOTE: newer UI stores Multi-combo values in messagingConfigs/contentConfigs arrays.
          // Keep backward compatibility with older shape (messagingConfig/contentConfig).
          const messagingConfig =
            configuration.messagingConfig ??
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((configuration as any).messagingConfigs?.[0] ?? undefined);
          const messagingCalc = (calculation || safeCalculation)?.messagingCalculation;
          
          // Extract content config and calculation
          const contentConfig =
            configuration.contentConfig ??
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((configuration as any).contentConfigs?.[0] ?? undefined);
          const contentCalc = (calculation || safeCalculation)?.contentCalculation;
          
          // Debug: Log the calculation structure
          console.log('🔍 Multi combination calculation structure:', {
            calculation: calculation,
            safeCalculation: safeCalculation,
            messagingCalc: messagingCalc,
            contentCalc: contentCalc,
            messagingConfig: messagingConfig,
            contentConfig: contentConfig,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            messagingConfigsCount: ((configuration as any).messagingConfigs || []).length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            contentConfigsCount: ((configuration as any).contentConfigs || []).length
          });
          
          // Messaging tokens
          if (messagingConfig) {
            templateData['{{messaging_users_count}}'] = (messagingConfig.numberOfUsers || 0).toString();
            templateData['{{messagingUsersCount}}'] = (messagingConfig.numberOfUsers || 0).toString();
            templateData['{{messaging_number_of_users}}'] = (messagingConfig.numberOfUsers || 0).toString();
            templateData['{{messaging number of users}}'] = (messagingConfig.numberOfUsers || 0).toString(); // Space version
            templateData['{{messaging_number_of_instances}}'] = (messagingConfig.numberOfInstances || 0).toString();
            templateData['{{messaging number of instances}}'] = (messagingConfig.numberOfInstances || 0).toString(); // Space version
            templateData['{{messagingNumberOfInstances}}'] = (messagingConfig.numberOfInstances || 0).toString();
            templateData['{{messaging_instance_type}}'] = messagingConfig.instanceType || 'Standard';
            templateData['{{messaging instance type}}'] = messagingConfig.instanceType || 'Standard'; // Space version
            templateData['{{messagingInstanceType}}'] = messagingConfig.instanceType || 'Standard';
            templateData['{{messaging_duration}}'] = (messagingConfig.duration || 0).toString();
            templateData['{{messagingDuration}}'] = (messagingConfig.duration || 0).toString();
            templateData['{{messaging_messages}}'] = (messagingConfig.messages || 0).toString();
            templateData['{{messagingMessages}}'] = (messagingConfig.messages || 0).toString();
            // Also map general message_count to messaging_messages for Multi combination
            templateData['{{message_count}}'] = (messagingConfig.messages || 0).toString();
            templateData['{{messages}}'] = (messagingConfig.messages || 0).toString();
            templateData['{{number_of_messages}}'] = (messagingConfig.messages || 0).toString();
            templateData['{{messages_count}}'] = (messagingConfig.messages || 0).toString();
          } else {
            templateData['{{messaging_users_count}}'] = '0';
            templateData['{{messagingUsersCount}}'] = '0';
            templateData['{{messaging_number_of_users}}'] = '0';
            templateData['{{messaging_number_of_instances}}'] = '0';
            templateData['{{messagingNumberOfInstances}}'] = '0';
            templateData['{{messaging_instance_type}}'] = '';
            templateData['{{messagingInstanceType}}'] = '';
            templateData['{{messaging_duration}}'] = '0';
            templateData['{{messagingDuration}}'] = '0';
            templateData['{{messaging_messages}}'] = '0';
            templateData['{{messagingMessages}}'] = '0';
            templateData['{{message_count}}'] = '0';
            templateData['{{messages}}'] = '0';
            templateData['{{number_of_messages}}'] = '0';
            templateData['{{messages_count}}'] = '0';
          }
          
          if (messagingCalc) {
            console.log('✅ Messaging calculation found:', messagingCalc);
            templateData['{{messaging_migration_cost}}'] = formatCurrency(messagingCalc.migrationCost || 0);
            templateData['{{messagingMigrationCost}}'] = formatCurrency(messagingCalc.migrationCost || 0);
            templateData['{{messaging_user_cost}}'] = formatCurrency(messagingCalc.userCost || 0);
            templateData['{{messagingUserCost}}'] = formatCurrency(messagingCalc.userCost || 0);
            templateData['{{messaging_data_cost}}'] = formatCurrency(messagingCalc.dataCost || 0);
            templateData['{{messagingDataCost}}'] = formatCurrency(messagingCalc.dataCost || 0);
            templateData['{{messaging_instance_cost}}'] = formatCurrency(messagingCalc.instanceCost || 0);
            templateData['{{messagingInstanceCost}}'] = formatCurrency(messagingCalc.instanceCost || 0);
            templateData['{{messaging_total_cost}}'] = formatCurrency(messagingCalc.totalCost || 0);
            templateData['{{messagingTotalCost}}'] = formatCurrency(messagingCalc.totalCost || 0);
          } else {
            console.warn('⚠️ Messaging calculation not found, setting to $0.00');
            templateData['{{messaging_migration_cost}}'] = formatCurrency(0);
            templateData['{{messagingMigrationCost}}'] = formatCurrency(0);
            templateData['{{messaging_user_cost}}'] = formatCurrency(0);
            templateData['{{messagingUserCost}}'] = formatCurrency(0);
            templateData['{{messaging_data_cost}}'] = formatCurrency(0);
            templateData['{{messagingDataCost}}'] = formatCurrency(0);
            templateData['{{messaging_instance_cost}}'] = formatCurrency(0);
            templateData['{{messagingInstanceCost}}'] = formatCurrency(0);
            templateData['{{messaging_total_cost}}'] = formatCurrency(0);
            templateData['{{messagingTotalCost}}'] = formatCurrency(0);
          }
          
          // Content tokens
          if (contentConfig) {
            templateData['{{content_users_count}}'] = (contentConfig.numberOfUsers || 0).toString();
            templateData['{{contentUsersCount}}'] = (contentConfig.numberOfUsers || 0).toString();
            templateData['{{content_number_of_users}}'] = (contentConfig.numberOfUsers || 0).toString();
            templateData['{{content number of users}}'] = (contentConfig.numberOfUsers || 0).toString(); // Space version
            templateData['{{content_number_of_instances}}'] = (contentConfig.numberOfInstances || 0).toString();
            templateData['{{content number of instances}}'] = (contentConfig.numberOfInstances || 0).toString(); // Space version
            templateData['{{contentNumberOfInstances}}'] = (contentConfig.numberOfInstances || 0).toString();
            templateData['{{content_instance_type}}'] = contentConfig.instanceType || 'Standard';
            templateData['{{content instance type}}'] = contentConfig.instanceType || 'Standard'; // Space version
            templateData['{{contentInstanceType}}'] = contentConfig.instanceType || 'Standard';
            templateData['{{content_duration}}'] = (contentConfig.duration || 0).toString();
            templateData['{{contentDuration}}'] = (contentConfig.duration || 0).toString();
            templateData['{{content_data_size}}'] = (contentConfig.dataSizeGB || 0).toString();
            templateData['{{contentDataSize}}'] = (contentConfig.dataSizeGB || 0).toString();
            templateData['{{content_data_size_gb}}'] = (contentConfig.dataSizeGB || 0).toString();
            // Also map general data_size to content_data_size for Multi combination
            templateData['{{data_size}}'] = (contentConfig.dataSizeGB || 0).toString();
            templateData['{{dataSizeGB}}'] = (contentConfig.dataSizeGB || 0).toString();
            templateData['{{data_size_gb}}'] = (contentConfig.dataSizeGB || 0).toString();
          } else {
            templateData['{{content_users_count}}'] = '0';
            templateData['{{contentUsersCount}}'] = '0';
            templateData['{{content_number_of_users}}'] = '0';
            templateData['{{content_number_of_instances}}'] = '0';
            templateData['{{contentNumberOfInstances}}'] = '0';
            templateData['{{content_instance_type}}'] = '';
            templateData['{{contentInstanceType}}'] = '';
            templateData['{{content_duration}}'] = '0';
            templateData['{{contentDuration}}'] = '0';
            templateData['{{content_data_size}}'] = '0';
            templateData['{{contentDataSize}}'] = '0';
            templateData['{{content_data_size_gb}}'] = '0';
            templateData['{{data_size}}'] = '0';
            templateData['{{dataSizeGB}}'] = '0';
            templateData['{{data_size_gb}}'] = '0';
          }
          
          if (contentCalc) {
            console.log('✅ Content calculation found:', contentCalc);
            templateData['{{content_migration_cost}}'] = formatCurrency(contentCalc.migrationCost || 0);
            templateData['{{contentMigrationCost}}'] = formatCurrency(contentCalc.migrationCost || 0);
            templateData['{{content_user_cost}}'] = formatCurrency(contentCalc.userCost || 0);
            templateData['{{contentUserCost}}'] = formatCurrency(contentCalc.userCost || 0);
            templateData['{{content_data_cost}}'] = formatCurrency(contentCalc.dataCost || 0);
            templateData['{{contentDataCost}}'] = formatCurrency(contentCalc.dataCost || 0);
            templateData['{{content_instance_cost}}'] = formatCurrency(contentCalc.instanceCost || 0);
            templateData['{{contentInstanceCost}}'] = formatCurrency(contentCalc.instanceCost || 0);
            templateData['{{content_total_cost}}'] = formatCurrency(contentCalc.totalCost || 0);
            templateData['{{contentTotalCost}}'] = formatCurrency(contentCalc.totalCost || 0);
          } else {
            console.warn('⚠️ Content calculation not found, setting to $0.00');
            templateData['{{content_migration_cost}}'] = formatCurrency(0);
            templateData['{{contentMigrationCost}}'] = formatCurrency(0);
            templateData['{{content_user_cost}}'] = formatCurrency(0);
            templateData['{{contentUserCost}}'] = formatCurrency(0);
            templateData['{{content_data_cost}}'] = formatCurrency(0);
            templateData['{{contentDataCost}}'] = formatCurrency(0);
            templateData['{{content_instance_cost}}'] = formatCurrency(0);
            templateData['{{contentInstanceCost}}'] = formatCurrency(0);
            templateData['{{content_total_cost}}'] = formatCurrency(0);
            templateData['{{contentTotalCost}}'] = formatCurrency(0);
          }
          
          console.log('✅ Added Multi combination tokens:', {
            messaging: {
              users: templateData['{{messaging_users_count}}'],
              instances: templateData['{{messaging_number_of_instances}}'],
              instanceType: templateData['{{messaging_instance_type}}'],
              migrationCost: templateData['{{messaging_migration_cost}}']
            },
            content: {
              users: templateData['{{content_users_count}}'],
              instances: templateData['{{content_number_of_instances}}'],
              instanceType: templateData['{{content_instance_type}}'],
              migrationCost: templateData['{{content_migration_cost}}']
            }
          });
        } else {
          // For non-Multi combination, set empty values for these tokens
          templateData['{{messaging_users_count}}'] = '';
          templateData['{{messagingUsersCount}}'] = '';
          templateData['{{messaging_number_of_users}}'] = '';
          templateData['{{messaging_number_of_instances}}'] = '';
          templateData['{{messagingNumberOfInstances}}'] = '';
          templateData['{{messaging_instance_type}}'] = '';
          templateData['{{messagingInstanceType}}'] = '';
          templateData['{{messaging_duration}}'] = '';
          templateData['{{messagingDuration}}'] = '';
          templateData['{{messaging_messages}}'] = '';
          templateData['{{messagingMessages}}'] = '';
          templateData['{{messaging_migration_cost}}'] = '';
          templateData['{{messagingMigrationCost}}'] = '';
          templateData['{{messaging_user_cost}}'] = '';
          templateData['{{messagingUserCost}}'] = '';
          templateData['{{messaging_data_cost}}'] = '';
          templateData['{{messagingDataCost}}'] = '';
          templateData['{{messaging_instance_cost}}'] = '';
          templateData['{{messagingInstanceCost}}'] = '';
          templateData['{{messaging_total_cost}}'] = '';
          templateData['{{messagingTotalCost}}'] = '';
          templateData['{{content_users_count}}'] = '';
          templateData['{{contentUsersCount}}'] = '';
          templateData['{{content_number_of_users}}'] = '';
          templateData['{{content_number_of_instances}}'] = '';
          templateData['{{contentNumberOfInstances}}'] = '';
          templateData['{{content_instance_type}}'] = '';
          templateData['{{contentInstanceType}}'] = '';
          templateData['{{content_duration}}'] = '';
          templateData['{{contentDuration}}'] = '';
          templateData['{{content_data_size}}'] = '';
          templateData['{{contentDataSize}}'] = '';
          templateData['{{content_data_size_gb}}'] = '';
          templateData['{{content_migration_cost}}'] = '';
          templateData['{{contentMigrationCost}}'] = '';
          templateData['{{content_user_cost}}'] = '';
          templateData['{{contentUserCost}}'] = '';
          templateData['{{content_data_cost}}'] = '';
          templateData['{{contentDataCost}}'] = '';
          templateData['{{content_instance_cost}}'] = '';
          templateData['{{contentInstanceCost}}'] = '';
          templateData['{{content_total_cost}}'] = '';
          templateData['{{contentTotalCost}}'] = '';
        }

        // Multi combination: many templates still use the "generic" instance tokens in the Shared Server/Instance row.
        // The base `quoteData.calculation.instanceCost` can be wrong/partial for multi-combo, so aggregate here.
        // This restores expected instance pricing/labels in the agreement.
        if (configuration?.migrationType === 'Multi combination') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cfg: any = configuration as any;
          const calcAny: any = (calculation || safeCalculation) as any;

          const msgCfg = cfg.messagingConfig ?? cfg.messagingConfigs?.[0];
          const contentCfg = cfg.contentConfig ?? cfg.contentConfigs?.[0];
          const emailCfg = cfg.emailConfig ?? cfg.emailConfigs?.[0];

          const msgInstances = msgCfg?.numberOfInstances ?? 0;
          const contentInstances = contentCfg?.numberOfInstances ?? 0;
          const emailInstances = emailCfg?.numberOfInstances ?? 0;
          const combinedInstances = (msgInstances || 0) + (contentInstances || 0) + (emailInstances || 0);

          const msgType = (msgCfg?.instanceType || '').trim();
          const contentType = (contentCfg?.instanceType || '').trim();
          const emailType = (emailCfg?.instanceType || '').trim();
          const allTypes = [contentType, msgType, emailType].filter(Boolean);
          const uniqueTypes = Array.from(new Set(allTypes));
          const combinedType = uniqueTypes.length === 1 ? uniqueTypes[0] : (uniqueTypes.length > 1 ? 'Mixed' : (instanceType || 'Standard'));

          const combinedInstanceCost =
            (calcAny?.messagingCalculation?.instanceCost ?? 0) +
            (calcAny?.contentCalculation?.instanceCost ?? 0) +
            (calcAny?.emailCalculation?.instanceCost ?? 0);

          // Override generic instance tokens so templates that don't use content_/messaging_ still render correctly.
          if (combinedInstances > 0) {
            templateData['{{instance_users}}'] = combinedInstances.toString();
            templateData['{{number_of_instances}}'] = combinedInstances.toString();
            templateData['{{number of instances}}'] = combinedInstances.toString();
            templateData['{{numberOfInstances}}'] = combinedInstances.toString();
            templateData['{{instances}}'] = combinedInstances.toString();
          }

          if (combinedType) {
            templateData['{{instance_type}}'] = combinedType;
            templateData['{{instanceType}}'] = combinedType;
            templateData['{{instance type}}'] = combinedType;
            templateData['{{messaging_instance_type}}'] = templateData['{{messaging_instance_type}}'] || msgType || combinedType;
            templateData['{{content_instance_type}}'] = templateData['{{content_instance_type}}'] || contentType || combinedType;
          }

          if (combinedInstanceCost > 0) {
            templateData['{{instance..cost}}'] = formatCurrency(combinedInstanceCost);
            templateData['{{instance_cost}}'] = formatCurrency(combinedInstanceCost);
            templateData['{{instanceCost}}'] = formatCurrency(combinedInstanceCost);
            templateData['{{instance cost}}'] = formatCurrency(combinedInstanceCost);
          }
        }
        
        // Build exhibit rows for the template (ONE row per selected migration, not per exhibit file)
        // This prevents duplicates when a single migration has multiple exhibit files (Included/Not Included/etc).
        try {
          // In Multi combination, the per-exhibit configs (messagingConfigs/contentConfigs/emailConfigs)
          // are the most reliable source of which combinations are selected.
          // Some flows can have `selectedExhibits` missing/stale, which would cause only 1 row to render.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cfgAny: any = configuration as any;
          const idsFromSelection = (selectedExhibits || []).map((id) => (id ?? '').toString()).filter(Boolean);
          const idsFromConfigs = [
            ...(cfgAny.messagingConfigs || []).map((c: any) => (c?.exhibitId ?? '').toString()),
            ...(cfgAny.contentConfigs || []).map((c: any) => (c?.exhibitId ?? '').toString()),
            ...(cfgAny.emailConfigs || []).map((c: any) => (c?.exhibitId ?? '').toString()),
          ].filter(Boolean);

          const exhibitIds = Array.from(new Set([...idsFromSelection, ...idsFromConfigs]));

          const exhibitsData: Array<{
            exhibitType: string;
            exhibitDesc: string;
            exhibitPlan: string;
            exhibitPrice: string;
          }> = [];

          if (exhibitIds.length > 0) {
            const exhibitResponse = await fetch(`${BACKEND_URL}/api/exhibits`);
            if (exhibitResponse.ok) {
              const exhibitDataResponse = await exhibitResponse.json();
              const allExhibits = exhibitDataResponse?.exhibits || [];

              type ExhibitRowGroup = {
                category: string;
                displayName: string; // cleaned name like "Slack to Teams"
                exhibit: any;
              };

              const byGroupKey = new Map<string, ExhibitRowGroup>();

              for (const exhibitId of exhibitIds) {
                const exhibit = allExhibits.find((ex: any) => ex?._id?.toString() === exhibitId);
                if (!exhibit) continue;

                const category = (exhibit.category || 'content').toLowerCase();
                const desc = formatExhibitDescription(exhibit, configuration);
                const displayName = (desc.split('\n')[0] || exhibit.name || '').trim();
                if (!displayName) continue;

                const key = `${category}|${displayName.toLowerCase()}`;

                // Prefer an "Included" version if we see both Included/Not Included files for the same migration.
                const exhibitNameLower = (exhibit.name || '').toLowerCase();
                const isNotIncluded = exhibitNameLower.includes('not included') ||
                  exhibitNameLower.includes('not include') ||
                  exhibitNameLower.includes('notincluded') ||
                  exhibitNameLower.includes('notinclude') ||
                  exhibitNameLower.includes('not-include') ||
                  exhibitNameLower.includes('not-included');

                const existing = byGroupKey.get(key);
                if (!existing) {
                  byGroupKey.set(key, { category, displayName, exhibit });
                } else {
                  const existingNameLower = (existing.exhibit?.name || '').toLowerCase();
                  const existingIsNotIncluded = existingNameLower.includes('not included') ||
                    existingNameLower.includes('not include') ||
                    existingNameLower.includes('notincluded') ||
                    existingNameLower.includes('notinclude') ||
                    existingNameLower.includes('not-include') ||
                    existingNameLower.includes('not-included');
                  if (existingIsNotIncluded && !isNotIncluded) {
                    byGroupKey.set(key, { category, displayName, exhibit });
                  }
                }
              }

              // Sort in a stable order: messaging → content → email → others, then name
              const categoryOrder = (cat: string) => {
                const c = (cat || '').toLowerCase();
                if (c === 'messaging' || c === 'message') return 1;
                if (c === 'content') return 2;
                if (c === 'email') return 3;
                return 4;
              };

              const groups = Array.from(byGroupKey.values()).sort((a, b) => {
                const cd = categoryOrder(a.category) - categoryOrder(b.category);
                if (cd !== 0) return cd;
                return a.displayName.localeCompare(b.displayName);
              });

              for (const g of groups) {
                // Use per-combination config + breakdowns in Multi combination for accurate price/details.
                const category = g.category;
                const combinationName = g.displayName;

                let exhibitConfig: any = configuration;
                if (configuration?.migrationType === 'Multi combination') {
                  const exhibitId = g.exhibit?._id?.toString?.() || '';
                  if (category === 'messaging' || category === 'message') {
                    exhibitConfig =
                      (configuration as any).messagingConfigs?.find((c: any) => c.exhibitId === exhibitId) ||
                      (configuration as any).messagingConfigs?.find((c: any) => c.exhibitName === combinationName) ||
                      (configuration as any).messagingConfig ||
                      configuration;
                  } else if (category === 'content') {
                    exhibitConfig =
                      (configuration as any).contentConfigs?.find((c: any) => c.exhibitId === exhibitId) ||
                      (configuration as any).contentConfigs?.find((c: any) => c.exhibitName === combinationName) ||
                      (configuration as any).contentConfig ||
                      configuration;
                  } else if (category === 'email') {
                    exhibitConfig =
                      (configuration as any).emailConfigs?.find((c: any) => c.exhibitId === exhibitId) ||
                      (configuration as any).emailConfigs?.find((c: any) => c.exhibitName === combinationName) ||
                      (configuration as any).emailConfig ||
                      configuration;
                  }
                }

                let price = 0;
                if (configuration?.migrationType === 'Multi combination') {
                  const breakdownName = exhibitConfig?.exhibitName || combinationName;
                  if (category === 'messaging' || category === 'message') {
                    price =
                      (calculation || safeCalculation)?.messagingCombinationBreakdowns?.find((b: any) => b.combinationName === breakdownName)
                        ?.totalCost ?? 0;
                  } else if (category === 'content') {
                    price =
                      (calculation || safeCalculation)?.contentCombinationBreakdowns?.find((b: any) => b.combinationName === breakdownName)
                        ?.totalCost ?? 0;
                  } else if (category === 'email') {
                    price =
                      (calculation || safeCalculation)?.emailCombinationBreakdowns?.find((b: any) => b.combinationName === breakdownName)
                        ?.totalCost ?? 0;
                  }
                }

                // Fallback if breakdown not available
                if (!price || price <= 0) {
                  price = calculateExhibitPrice(g.exhibit, configuration, calculation || safeCalculation, exhibitConfig);
                }

                exhibitsData.push({
                  exhibitType: 'CloudFuze X-Change Data Migration',
                  exhibitDesc: formatExhibitDescription(g.exhibit, configuration, exhibitConfig),
                  exhibitPlan: (calculation || safeCalculation)?.tier?.name || 'Standard',
                  exhibitPrice: formatCurrency(price),
                });
              }
            }
          }

          (templateData as any).exhibits = exhibitsData;
        } catch (e) {
          console.warn('⚠️ Unable to build exhibit rows for template, continuing without exhibit rows:', e);
          (templateData as any).exhibits = [];
        }
        
        console.log('🔍 TEMPLATE DATA CREATED:');
        console.log('  Template data keys:', Object.keys(templateData));
        console.log('  Template data values:', Object.values(templateData));
        
        // DEBUG: Check configuration object structure
        console.log('🔍 CONFIGURATION DEBUG:');
        console.log('  configuration object:', configuration);
        console.log('  configuration.startDate:', configuration?.startDate);
        console.log('  configuration.endDate:', configuration?.endDate);
        console.log('  configuration keys:', configuration ? Object.keys(configuration) : 'configuration is null/undefined');
        
        // CRITICAL: Debug each template data entry
        console.log('🔍 TEMPLATE DATA DETAILED DEBUG:');
        Object.entries(templateData).forEach(([key, value]) => {
          if (value === undefined || value === null || value === '') {
            console.error(`❌ CRITICAL: Template data ${key} is undefined/null/empty:`, value);
          } else {
            console.log(`✅ Template data ${key}:`, value);
          }
        });
        
        // Specific debugging for date tokens
        console.log('🔍 DATE TOKENS DEBUG:');
        console.log('  {{Start_date}}:', templateData['{{Start_date}}']);
        console.log('  {{End_date}}:', templateData['{{End_date}}']);
        console.log('  {{start_date}}:', templateData['{{start_date}}']);
        console.log('  {{end_date}}:', templateData['{{end_date}}']);
        console.log('  {{startdate}}:', templateData['{{startdate}}']);
        console.log('  {{enddate}}:', templateData['{{enddate}}']);
        
        // Specific debugging for payment terms tokens
        console.log('🔍 PAYMENT TERMS TOKENS DEBUG:');
        console.log('  clientInfo.paymentTerms value:', clientInfo.paymentTerms);
        console.log('  {{payment_terms}}:', templateData['{{payment_terms}}']);
        console.log('  {{Payment_terms}}:', templateData['{{Payment_terms}}']);
        console.log('  {{Payment Terms}}:', templateData['{{Payment Terms}}']);
        console.log('  {{Payment_Terms}}:', templateData['{{Payment_Terms}}']);
        console.log('  {{paymentTerms}}:', templateData['{{paymentTerms}}']);
        
        // CRITICAL: Final pass to ensure NO undefined values in templateData
        Object.keys(templateData).forEach(key => {
          const value = templateData[key];
          if (value === undefined || value === null || String(value).toLowerCase() === 'undefined') {
            console.warn(`⚠️ Found undefined/null value for token ${key}, setting fallback`);
            const lower = key.toLowerCase();
            if (lower.includes('cost') || lower.includes('price')) {
              templateData[key] = '$0.00';
            } else if (lower.includes('count') || lower.includes('number') || lower.includes('size') || lower.includes('users') || lower.includes('messages')) {
              templateData[key] = '0';
            } else if (lower.includes('duration') || lower.includes('month')) {
              templateData[key] = '1';
            } else if (lower.includes('migration') && !lower.includes('cost') && !lower.includes('price')) {
              templateData[key] = migrationType || 'Content';
            } else if (lower.includes('company')) {
              templateData[key] = finalCompanyName || 'Your Company';
            } else if (lower.includes('client') || (lower.includes('name') && !lower.includes('company'))) {
              templateData[key] = clientName || 'Contact Name';
            } else if (lower.includes('email')) {
              templateData[key] = clientEmail || 'contact@email.com';
            } else if (lower.includes('date')) {
              templateData[key] = clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]);
            } else if (lower.includes('discount')) {
              templateData[key] = ''; // Keep discount empty if not applicable
            } else {
              templateData[key] = '';
            }
          }
        });
        
        // Add migration description tokens for better template support
        const migrationDescription = (() => {
          if (configuration?.migrationType === 'Multi combination') {
            const messagingName = templateData['{{messaging_migration_name}}'] || '';
            const contentName = templateData['{{content_migration_name}}'] || '';
            if (messagingName && contentName) {
              return `${contentName} | ${messagingName}`;
            } else if (messagingName) {
              return messagingName;
            } else if (contentName) {
              return contentName;
            }
          }
          return migrationType || 'Content';
        })();
        
        templateData['{{migration_description}}'] = migrationDescription;
        templateData['{{migrationDescription}}'] = migrationDescription;
        templateData['{{migration_description_text}}'] = migrationDescription;
        
        // Add user description tokens
        const userDescription = `Up to ${userCount || 1} Users`;
        templateData['{{user_description}}'] = userDescription;
        templateData['{{userDescription}}'] = userDescription;
        templateData['{{users_description}}'] = userDescription;
        
        // Add data size description tokens
        const dataDescription = dataSizeGB > 0 ? `${dataSizeGB} GBs` : '0 GBs';
        templateData['{{data_description}}'] = dataDescription;
        templateData['{{dataDescription}}'] = dataDescription;

        // Add server/instance description token used by some templates
        // (TemplateDiagnostic requires an exact match for "server_descriptions")
        const serverDescriptions = (() => {
          if (configuration?.migrationType === 'Multi combination') {
            // Build EXACT-style lines based on per-exhibit configs (one config per selected exhibit)
            // so the Shared Server/Instance description matches prior output.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cfg: any = configuration as any;

            type ServerLine = { instances: number; instanceType: string; kind: 'data' | 'email' };
            const entries: ServerLine[] = [];

            const pushEntries = (list: any[] | undefined, kind: 'data' | 'email') => {
              if (!Array.isArray(list)) return;
              for (const item of list) {
                const instances = Number(item?.numberOfInstances ?? 0);
                const instanceType = String(item?.instanceType ?? '').trim();
                if (!instanceType) continue;
                // Default to 1 if template expects a count and config omitted it
                entries.push({ instances: instances > 0 ? instances : 1, instanceType, kind });
              }
            };

            // Historically, Shared Server/Instance row describes "data migration" + "email migration".
            // Treat Messaging + Content as "data migration" (both are data moves), and Email as "email migration".
            pushEntries(cfg.emailConfigs ?? [], 'email');
            pushEntries(cfg.contentConfigs ?? [], 'data');
            pushEntries(cfg.messagingConfigs ?? [], 'data');

            // Backward compatibility: if arrays aren't present, fall back to single configs.
            if (entries.length === 0) {
              if (cfg.emailConfig?.instanceType) {
                entries.push({
                  instances: Number(cfg.emailConfig?.numberOfInstances ?? 1),
                  instanceType: String(cfg.emailConfig?.instanceType),
                  kind: 'email'
                });
              }
              if (cfg.contentConfig?.instanceType) {
                entries.push({
                  instances: Number(cfg.contentConfig?.numberOfInstances ?? 1),
                  instanceType: String(cfg.contentConfig?.instanceType),
                  kind: 'data'
                });
              }
              if (cfg.messagingConfig?.instanceType) {
                entries.push({
                  instances: Number(cfg.messagingConfig?.numberOfInstances ?? 1),
                  instanceType: String(cfg.messagingConfig?.instanceType),
                  kind: 'data'
                });
              }
            }

            // Render in the exact style:
            // 1
            // Small server for email migration
            // -------------------------------
            // 1
            // Standard server for data migration
            const separator = '----------------------------------------';
            const lines: string[] = [];
            entries.forEach((e, idx) => {
              if (idx > 0) lines.push(separator);
              lines.push(String(e.instances));
              lines.push(`${e.instanceType} server for ${e.kind === 'email' ? 'email migration' : 'data migration'}`);
            });

            return lines.join('\n');
          }

          const n = numberOfInstances || 1;
          const type = instanceType || 'Standard';
          return `Server: ${type} (${n} instance${n === 1 ? '' : 's'})`;
        })();

        templateData['{{server_descriptions}}'] = serverDescriptions;
        templateData['{{serverDescriptions}}'] = serverDescriptions; // optional camelCase variant
        templateData['{{server descriptions}}'] = serverDescriptions; // optional space variant
        
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
        
        // ⭐ SPECIFIC DEBUG FOR USER'S TEMPLATE TOKENS
        console.log('🎯 USER TEMPLATE SPECIFIC TOKENS:');
        console.log('  {{users_cost}}:', templateData['{{users_cost}}']);
        console.log('  {{instance_cost}}:', templateData['{{instance_cost}}']);
        console.log('  {{Duration_of_months}}:', templateData['{{Duration_of_months}}']);
        console.log('  {{per_user_cost}}:', templateData['{{per_user_cost}}']);
        console.log('  Source values for debugging:');
        console.log('    userCost value:', userCost);
        console.log('    instanceCost value:', instanceCost);
        console.log('    duration value:', duration);
        console.log('    formatCurrency(userCost):', formatCurrency(userCost || 0));
        console.log('    formatCurrency(instanceCost):', formatCurrency(instanceCost));
        console.log('    duration.toString():', (duration || 1).toString());
        
        // ⭐ GLOBAL DEBUG: Store template data for console debugging
        (window as any).lastTemplateData = templateData;
        console.log('🌍 Template data stored in window.lastTemplateData for debugging');
        
        // Debug: Check the source data
        console.log('🔍 Source data debugging:');
        console.log('  quoteData.company:', quoteData.company);
        console.log('  quoteData.configuration.numberOfUsers:', quoteData.configuration.numberOfUsers);
        console.log('  quoteData.calculation.userCost:', quoteData.calculation.userCost);
        console.log('  quoteData.calculation.migrationCost:', quoteData.calculation.migrationCost);
        console.log('  quoteData.calculation.totalCost:', quoteData.calculation.totalCost);
        console.log('  formatCurrency(0):', formatCurrency(0));
        console.log('  formatCurrency(300):', formatCurrency(300));
        
        // CRITICAL: Final validation - ensure NO undefined values (including string "undefined")
        const undefinedTokens = Object.entries(templateData).filter(([key, value]) => {
          if (value === undefined || value === null) return true;
          const strValue = String(value).trim();
          if (strValue === '' || strValue.toLowerCase() === 'undefined' || strValue === 'null') {
            // Skip discount-related tokens - they should remain empty if not applicable
            const lower = key.toLowerCase();
            if (lower.includes('discount') || lower.includes('show_discount') || lower.includes('hide_discount')) {
              return false; // Don't flag discount tokens as undefined
            }
            return true;
          }
          return false;
        });
        
        if (undefinedTokens.length > 0) {
          console.error('❌ CRITICAL: Found undefined/null/empty tokens:', undefinedTokens);
          
          // Fix any remaining undefined values
          undefinedTokens.forEach(([key, value]) => {
            console.log(`🔧 Fixing undefined token: ${key} = ${value}`);
            const lower = key.toLowerCase();
            if (lower.includes('company')) {
              templateData[key] = finalCompanyName || 'Your Company';
            } else if (lower.includes('user') && (lower.includes('count') || lower.includes('number'))) {
              templateData[key] = (userCount || 1).toString();
            } else if (lower.includes('cost') || lower.includes('price')) {
              templateData[key] = '$0.00';
            } else if (lower.includes('duration') || lower.includes('month')) {
              templateData[key] = (duration || 1).toString();
            } else if (lower.includes('migration') && !lower.includes('cost') && !lower.includes('price')) {
              templateData[key] = migrationType || 'Content';
            } else if (lower.includes('client') || (lower.includes('name') && !lower.includes('company'))) {
              templateData[key] = clientName || 'Contact Name';
            } else if (lower.includes('email')) {
              templateData[key] = clientEmail || 'contact@email.com';
            } else if (lower.includes('date')) {
              templateData[key] = clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]);
            } else if (lower.includes('data') && (lower.includes('size') || lower.includes('gb'))) {
              templateData[key] = (dataSizeGB || 0).toString();
            } else if (lower.includes('instance') && (lower.includes('count') || lower.includes('number'))) {
              templateData[key] = (numberOfInstances || 1).toString();
            } else {
              templateData[key] = '';
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
              templateData[token] = finalCompanyName || 'Your Company';
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
              templateData[token] = finalCompanyName || 'Your Company';
            } else if (token === '{{Date}}') {
              templateData[token] = clientInfo.effectiveDate ? formatDateMMDDYYYY(clientInfo.effectiveDate) : formatDateMMDDYYYY(new Date().toISOString().split('T')[0]);
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
        
        // Ensure discount label token always exists (even when empty)
        if (templateData['{{discount_label}}'] === undefined) {
          templateData['{{discount_label}}'] = (localShouldApplyDiscount && localDiscountPercent > 0) ? 'Discount' : '';
        }

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
        
        // Treat discount tokens as optional (we intentionally allow them to be empty/not present)
        const optionalTokens = ['discount_label', 'discount_amount', 'show_discount', 'hide_discount', 'if_discount'];
        const filteredMissing = diagnostic.missingTokens.filter(t => !optionalTokens.includes(t));
        const filteredMismatched = diagnostic.mismatchedTokens.filter(t => !optionalTokens.includes(t));

        // Pre-check and log whether discount will show
        console.log('🧮 Discount pre-check before generate:', {
          localDiscountPercent,
          localShouldApplyDiscount,
          localDiscountAmount,
          localFinalTotalAfterDiscount,
          discount_label: templateData['{{discount_label}}'],
          discount_amount: templateData['{{discount_amount}}'],
          total_after_discount: templateData['{{total_after_discount}}']
        });

        // Show diagnostic results to user (only for non-optional tokens)
        if (filteredMissing.length > 0 || filteredMismatched.length > 0) {
          const issueMessage = `
🔍 TEMPLATE DIAGNOSTIC RESULTS:

❌ ISSUES FOUND:
${filteredMissing.length > 0 ? `• Missing data for tokens: ${filteredMissing.join(', ')}` : ''}
${filteredMismatched.length > 0 ? `• Token format mismatches: ${filteredMismatched.join(', ')}` : ''}

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
          
          // Stop only when non-optional tokens have issues
          throw new Error('Template diagnostic found issues. Please fix the token mismatches before proceeding.');
        } else {
          console.log('✅ Template diagnostic passed - all tokens match correctly!');
        }

        // Process DOCX template
        console.log('🚀 FINAL TEMPLATE DATA BEING SENT TO DOCX PROCESSOR:');
        console.log('  Template file:', templateFileForAgreement.name);
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
        console.log('  templateData.{{users_count}}:', templateData['{{users_count}}']);
        console.log('  templateData.{{users_cost}}:', templateData['{{users_cost}}']);
        console.log('  templateData.{{Duration_of_months}}:', templateData['{{Duration_of_months}}']);
        console.log('  templateData.{{instance_cost}}:', templateData['{{instance_cost}}']);
        console.log('  templateData.{{per_user_cost}}:', templateData['{{per_user_cost}}']);
        
        const result = await DocxTemplateProcessor.processDocxTemplate(
          templateFileForAgreement,
          templateData
        );

        if (result.success && result.processedDocx) {
          processedDocument = result.processedDocx;
          
            console.log('✅ DOCX template processed successfully');
            console.log('📊 Processing time:', result.processingTime + 'ms');
            console.log('📊 Tokens replaced:', result.tokensReplaced || 0);
          console.log('📄 Processed DOCX size:', result.processedDocx.size, 'bytes');
          console.log('📄 Processed DOCX type:', result.processedDocx.type);
          
          // Merge selected exhibits ONLY for Multi combination migration type
          const uniqueSelectedExhibitsForMerge = Array.from(
            new Set((selectedExhibits || []).map((id) => (id ?? '').toString()).filter(Boolean))
          );
          if (uniqueSelectedExhibitsForMerge.length > 0 && configuration.migrationType === 'Multi combination') {
            console.log('📎 Fetching and merging selected exhibits for Multi combination...', {
              raw: selectedExhibits,
              unique: uniqueSelectedExhibitsForMerge
            });
            
            try {
              // Fetch all exhibit files
              const exhibitBlobs: Blob[] = [];
              
              // Sort exhibits: Included first, then Not Included
              // Within each group: sort by category (messaging first, then content) and displayOrder
              const sortExhibits = async (ids: string[]) => {
                try {
                  const metaResp = await fetch(`${BACKEND_URL}/api/exhibits`);
                  if (!metaResp.ok) return ids;
                  const metaData = await metaResp.json();
                  const lookup = new Map((metaData.exhibits || []).map((ex: any) => [ex._id, ex]));
                  
                  // Separate into Included and Not Included
                  const included: Array<{id: string, exhibit: any}> = [];
                  const notIncluded: Array<{id: string, exhibit: any}> = [];
                  
                  ids.forEach((id) => {
                    const ex = lookup.get(id) as any;
                    if (!ex) return;
                    const text = `${ex?.name || ''} ${ex?.description || ''}`.toLowerCase();
                    // Check for various "not included" patterns (with/without spaces, different cases)
                    const isNotIncluded = text.includes('not included') ||
                                        text.includes('not include') ||
                                        text.includes('notincluded') ||
                                        text.includes('notinclude') ||
                                        text.includes('not-include') ||
                                        text.includes('not-included');
                    if (isNotIncluded) {
                      notIncluded.push({ id, exhibit: ex });
                    } else {
                      included.push({ id, exhibit: ex });
                    }
                  });
                  
                  // Sort within each group: category (messaging first, then content), then displayOrder
                  const categoryOrder = (cat: string) => {
                    const normalized = (cat || 'content').toLowerCase();
                    if (normalized === 'messaging' || normalized === 'message') return 1;
                    if (normalized === 'content') return 2;
                    return 3; // email or others
                  };
                  
                  included.sort((a, b) => {
                    const catDiff = categoryOrder(a.exhibit.category) - categoryOrder(b.exhibit.category);
                    if (catDiff !== 0) return catDiff;
                    return (a.exhibit.displayOrder || 0) - (b.exhibit.displayOrder || 0);
                  });
                  
                  notIncluded.sort((a, b) => {
                    const catDiff = categoryOrder(a.exhibit.category) - categoryOrder(b.exhibit.category);
                    if (catDiff !== 0) return catDiff;
                    return (a.exhibit.displayOrder || 0) - (b.exhibit.displayOrder || 0);
                  });
                  
                  // Return: All Included first, then All Not Included
                  return [...included.map(x => x.id), ...notIncluded.map(x => x.id)];
                } catch {
                  return ids;
                }
              };

              const sortedExhibits = await sortExhibits(uniqueSelectedExhibitsForMerge);

              // Fetch exhibit metadata for grouping
              const exhibitMetadata: Array<{ name: string; category?: string }> = [];
              const metaResp = await fetch(`${BACKEND_URL}/api/exhibits`);
              let allExhibits: any[] = [];
              if (metaResp.ok) {
                const metaData = await metaResp.json();
                if (metaData.success && metaData.exhibits) {
                  allExhibits = metaData.exhibits;
                }
              }

              for (const exhibitId of sortedExhibits) {
                console.log(`📎 Fetching exhibit: ${exhibitId}`);
                
                // Get exhibit metadata FIRST (before fetching file)
                const exhibit = allExhibits.find((ex: any) => ex._id === exhibitId);
                if (!exhibit) {
                  console.warn(`⚠️ Exhibit ${exhibitId} not found in metadata, skipping`);
                  continue;
                }
                
                const response = await fetch(`${BACKEND_URL}/api/exhibits/${exhibitId}/file`);
                
                if (response.ok) {
                  const blob = await response.blob();
                  
                  // Add both blob and metadata together to ensure they match
                  exhibitBlobs.push(blob);
                  exhibitMetadata.push({
                    name: exhibit.name || '',
                    category: exhibit.category || ''
                  });
                  console.log(`✅ Fetched exhibit ${exhibitId}: "${exhibit.name}" (${blob.size} bytes)`);
                } else {
                  console.warn(`⚠️ Failed to fetch exhibit ${exhibitId}:`, response.status);
                }
              }
              
              // Verify metadata matches blobs
              if (exhibitBlobs.length !== exhibitMetadata.length) {
                console.error(`❌ Mismatch: ${exhibitBlobs.length} blobs but ${exhibitMetadata.length} metadata entries!`);
              } else {
                console.log(`✅ Verified: ${exhibitBlobs.length} exhibits with matching metadata`);
                console.log('📋 Exhibit order:', exhibitMetadata.map((m, i) => `${i + 1}. ${m.name}`));
              }
              
              if (exhibitBlobs.length > 0) {
                console.log(`📎 Merging ${exhibitBlobs.length} exhibits into document...`);
                const { mergeDocxFiles } = await import('../utils/docxMerger');
                
                processedDocument = await mergeDocxFiles(processedDocument, exhibitBlobs, exhibitMetadata);
                
                console.log('✅ Exhibits merged successfully!', {
                  totalExhibits: exhibitBlobs.length,
                  finalSize: processedDocument.size
                });
              }
            } catch (mergeError) {
              console.error('❌ Error merging exhibits:', mergeError);
              // Don't fail the whole generation, just warn the user
              alert('⚠️ Warning: Some exhibits could not be attached to the document. The main document was generated successfully.');
            }
          }
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

        // For DOCX, store the original before converting to PDF for preview
        if (processedDocument.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          // Store original DOCX for Word downloads
          setOriginalDocxAgreement(processedDocument);
          console.log('💾 Stored original DOCX for Word downloads');
          
          try {
            console.log('🔄 Converting DOCX agreement to PDF for preview...');
            const { templateService } = await import('../utils/templateService');
            const pdfBlob = await templateService.convertDocxToPdf(processedDocument);
            console.log('✅ DOCX converted to PDF for preview. Size:', pdfBlob.size, 'bytes');
            processedDocument = pdfBlob;
          } catch (error) {
            console.error('❌ Failed to convert DOCX to PDF for preview. Falling back to original blob.', error);
          }
        } else {
          // For PDF templates, clear the original DOCX since we don't have one
          setOriginalDocxAgreement(null);
        }

        if (!processedDocument) {
          console.error('❌ No processed document available to preview/download');
          return;
        }
        const processedDocumentBlob = processedDocument;

        // Store the (now PDF) document for preview and PDF downloads
        setProcessedAgreement(processedDocumentBlob);

        // Always preview the same blob that will be downloaded
        const previewUrl = URL.createObjectURL(processedDocumentBlob);
        setPreviewUrl(previewUrl);
        setShowInlinePreview(true);
        setShowAgreementPreview(true);
        console.log('🔗 Preview URL created for processed agreement (PDF-based):', previewUrl);
        return;
        
        // For DOCX files render with docx-preview to match exact document formatting
        if (processedDocumentBlob.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          // Open modal first so container exists, then render
          setShowAgreementPreview(true);
          await delayFrame();
          try {
            await renderDocxPreview(processedDocumentBlob);
            return;
          } catch (err) {
            console.warn('docx-preview render failed in initial flow, trying mammoth HTML fallback.', err);
          }
          try {
            console.log('🔄 Converting DOCX to HTML for preview with exact formatting...');
            const mammoth = await import('mammoth');
            
            const arrayBuffer = await processedDocumentBlob.arrayBuffer();
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
            const previewUrl = URL.createObjectURL(processedDocumentBlob);
            setPreviewUrl(previewUrl);
            setShowInlinePreview(true);
          }
        } else {
          // For PDF files, use direct URL
          const previewUrl = URL.createObjectURL(processedDocumentBlob);
          setPreviewUrl(previewUrl);
          setShowInlinePreview(true);
        }
        
        // Save PDF to MongoDB database
        try {
          console.log('💾 Saving PDF to MongoDB...');
          const { documentServiceMongoDB } = await import('../services/documentServiceMongoDB');
          const base64Data = await documentServiceMongoDB.blobToBase64(processedDocumentBlob);
          
          // Define variables for the saved document
          const finalCompanyName = clientInfo.company || 'Unknown Company';
          const clientName = clientInfo.clientName || 'Unknown';
          const clientEmail = clientInfo.clientEmail || '';
          
          const savedDoc = {
            fileName: `${finalCompanyName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
            fileData: base64Data,
            fileSize: processedDocumentBlob.size,
            clientName: clientName,
            clientEmail: clientEmail,
            company: finalCompanyName,
            templateName: selectedTemplate.name,
            generatedDate: new Date().toISOString(),
            quoteId: quoteId,
            metadata: {
              totalCost: finalCalculation.totalCost,
              duration: finalConfiguration.duration,
              migrationType: finalConfiguration.migrationType,
              numberOfUsers: finalConfiguration.numberOfUsers
            }
          };
          
          await documentServiceMongoDB.saveDocument(savedDoc);
          console.log('✅ PDF saved to MongoDB successfully');
          
          // Show success notification
          const notification = document.createElement('div');
          notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2';
          notification.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>Agreement saved to MongoDB!</span>
          `;
          document.body.appendChild(notification);
          setTimeout(() => {
            notification.remove();
          }, 3000);
        } catch (error) {
          console.error('❌ Error saving PDF to MongoDB:', error);
          // Still show the PDF even if saving fails
        }
        
        setShowAgreementPreview(true);
        // Force inline preview to be shown when agreement is generated
        setShowInlinePreview(true);
        
        // Document preview will show directly without alert interruption
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
            <h3 className="font-semibold text-gray-800 mb-4">Manual Contact Information</h3>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="group">
                <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  Contact Name
                </label>
                <input
                  type="text"
                  required
                  value={clientInfo.clientName}
                  onChange={(e) => updateClientInfo({ clientName: e.target.value })}
                  className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                  placeholder="Enter contact name"
                  maxLength={35}
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
                  maxLength={35}
                />
              </div>

              <div className="group">
                <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Building className="w-4 h-4 text-white" />
                  </div>
                  Legal Entity Name*
                </label>
                <input
                  type="text"
                  required
                  value={clientInfo.company}
                  onChange={(e) => updateClientInfo({ company: e.target.value })}
                  className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                  placeholder="Enter legal entity name"
                />
                {clientInfo.company && hubspotState?.selectedContact && (
                  <p className="text-sm text-blue-600 mt-2 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    {hubspotState.selectedContact.properties.company 
                      ? 'Legal entity name from HubSpot contact'
                      : 'Legal entity name auto-extracted from email domain'
                    }
                  </p>
                )}
              </div>

              {/* Project Start Date - MOVED to main Contact Information section */}


              {/* Discount field moved to Configure session */}

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white py-4 px-8 rounded-2xl font-bold text-lg hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 transition-all duration-500 transform hover:scale-105 hover:shadow-2xl shadow-xl relative overflow-hidden group hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <span className="relative flex items-center justify-center gap-3">
                  <FileText className="w-5 h-5" />
                  Generate Quote
                  <Sparkles className="w-5 h-5" />
                </span>
              </button>

              {/* Preview Agreement Button */}
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
                      Preview Agreement
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
                className={`w-full mt-4 py-4 px-8 rounded-2xl font-bold text-lg transition-all duration-500 transform shadow-xl relative overflow-hidden group hidden ${
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
            <h2 className="text-2xl font-bold mb-2">{companyInfo?.name || 'Zenop.ai Pro Solutions'}</h2>
            <p className="opacity-90">{companyInfo?.address || '123 Business St.'}</p>
            <p className="opacity-90">{companyInfo?.city || 'City, State 12345'}</p>
            <p className="opacity-90">{companyInfo?.email || 'contact@zenopsolutions.com'}</p>
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
              <td className="py-4 text-gray-700 font-medium">
                User costs ({configuration.numberOfUsers} users × {configuration.duration} months)
                <br />
                <span className="text-sm text-gray-500 font-normal">
                  @ {formatCurrency(safeCalculation.userCost / (configuration.numberOfUsers * configuration.duration))}/user/month
                </span>
              </td>
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
                  Preview Agreement
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
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
            <FileText className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800">Generate Professional Quote</h1>
        </div>
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
                      Using template: <span className="font-medium text-green-700">{getSelectedTemplateDisplayName()}</span>
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
                    ⚠️ Preview Agreement button will be disabled until a template is selected
                    </p>
                  </div>
              </div>
            )}


            <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
            <User className="w-6 h-6 text-blue-600" />
            Contact Information
          </h3>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="group">
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                  <User className="w-4 h-4 text-white" />
                </div>
                Contact Name
              </label>
              <input
                type="text"
                required
                value={clientInfo.clientName}
                onChange={(e) => {
                  const sanitized = sanitizeNameInput(e.target.value);
                  const processed = limitConsecutiveSpaces(sanitized);
                  setClientInfo({ ...clientInfo, clientName: processed });
                }}
                className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                placeholder="Enter contact name"
                maxLength={35}
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
                onChange={(e) => {
                  const sanitized = sanitizeEmailInput(e.target.value);
                  setClientInfo({ ...clientInfo, clientEmail: sanitized });
                }}
                className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                placeholder="Enter email address"
                maxLength={35}
              />
            </div>

            <div className="group">
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                  <Building className="w-4 h-4 text-white" />
                </div>
                Legal Entity Name*
              </label>
              <input
                type="text"
                required
                value={clientInfo.company}
                onChange={(e) => {
                  const sanitized = sanitizeCompanyInput(e.target.value);
                  setClientInfo({ ...clientInfo, company: sanitized });
                }}
                className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                placeholder="Enter legal entity name"
              />
                {clientInfo.company && hubspotState?.selectedContact && (
                  <p className="text-sm text-blue-600 mt-2 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    {hubspotState.selectedContact.properties.company 
                      ? 'Legal entity name from HubSpot contact'
                      : 'Legal entity name auto-extracted from email domain'
                    }
                  </p>
                )}
            </div>

            {/* Project Start Date - MOVED from Project Configuration */}
            <div className="group">
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                  <Calendar className="w-4 h-4 text-white" />
                </div>
                Project Start Date
                <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={configuration?.startDate || ''}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => {
                  const newStartDate = e.target.value;
                  console.log('📅 Project Start Date changed:', newStartDate);
                  
                  // Clear validation error when user selects a date
                  setDateValidationErrors(prev => ({ ...prev, projectStartDate: false }));
                  
                  if (onConfigurationChange) {
                    // Update the configuration with the new start date
                    const updatedConfig = {
                      ...configuration,
                      startDate: newStartDate
                    };
                    onConfigurationChange(updatedConfig);
                    console.log('✅ Configuration updated with new start date:', newStartDate);
                  } else {
                    console.warn('⚠️ No onConfigurationChange callback provided');
                  }
                }}
                onBlur={(e) => {
                  // Validate on blur
                  if (!e.target.value || e.target.value.trim() === '') {
                    setDateValidationErrors(prev => ({ ...prev, projectStartDate: true }));
                  }
                }}
                className={`w-full px-5 py-4 border-2 rounded-xl focus:ring-4 transition-all duration-300 bg-white/80 backdrop-blur-sm text-lg font-medium ${
                  dateValidationErrors.projectStartDate
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 hover:border-blue-300'
                }`}
                placeholder="Select start date"
                autoComplete="off"
              />
              {dateValidationErrors.projectStartDate && (
                <p className="text-xs text-red-600 mt-2 font-semibold flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                  Project Start Date is required
                </p>
              )}
              {!dateValidationErrors.projectStartDate && (
                <p className="text-xs text-gray-500 mt-2">Select a date from today onwards</p>
              )}
            </div>

            {/* Effective Date */}
            <div className="group">
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                  <Calendar className="w-4 h-4 text-white" />
                </div>
                Effective Date
                <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={clientInfo.effectiveDate || ''}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => {
                  const selectedDate = e.target.value;
                  
                  // Clear validation error when user selects a date
                  setDateValidationErrors(prev => ({ ...prev, effectiveDate: false }));
                  
                  if (!selectedDate) {
                    updateClientInfo({ effectiveDate: '' });
                    return;
                  }
                  
                  const today = new Date();
                  const todayStr = today.toISOString().split('T')[0];
                  
                  console.log('Effective Date validation:', { selectedDate, todayStr });
                  
                  // Compare as strings (YYYY-MM-DD format)
                  if (selectedDate >= todayStr) {
                    updateClientInfo({ effectiveDate: selectedDate });
                  } else {
                    // Past date detected - show warning and reset
                    alert('Effective date cannot be in the past. Please select today\'s date or a future date.');
                    e.target.value = todayStr;
                    updateClientInfo({ effectiveDate: todayStr });
                  }
                }}
                onBlur={(e) => {
                  const selectedDate = e.target.value;
                  
                  // Validate on blur - check if empty
                  if (!selectedDate || selectedDate.trim() === '') {
                    setDateValidationErrors(prev => ({ ...prev, effectiveDate: true }));
                    return;
                  }
                  
                  if (selectedDate) {
                    const today = new Date();
                    const todayStr = today.toISOString().split('T')[0];
                    
                    if (selectedDate < todayStr) {
                      alert('Effective date cannot be in the past. Please select today\'s date or a future date.');
                      e.target.value = todayStr;
                      updateClientInfo({ effectiveDate: todayStr });
                    }
                  }
                }}
                className={`w-full px-6 py-5 border-2 rounded-xl focus:ring-4 transition-all duration-300 bg-white/80 backdrop-blur-sm text-xl font-medium ${
                  dateValidationErrors.effectiveDate
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 hover:border-blue-300'
                }`}
                style={{ 
                  fontSize: '18px',
                  height: '60px',
                  paddingTop: '18px',
                  paddingBottom: '18px'
                }}
              />
              {dateValidationErrors.effectiveDate && (
                <p className="text-xs text-red-600 mt-2 font-semibold flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                  Effective Date is required
                </p>
              )}
              {!dateValidationErrors.effectiveDate && (
                <p className="text-xs text-gray-500 mt-2">Select a date from today onwards</p>
              )}
            </div>

            {/* Payment Terms - Only for Overage Agreement */}
            {((configuration?.combination || '').toLowerCase() === 'overage-agreement' ||
              (configuration?.migrationType || '').toLowerCase() === 'overage agreement') && (
              <div className="group">
                <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-green-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Briefcase className="w-4 h-4 text-white" />
                  </div>
                  Payment Terms
                  <span className="text-xs text-gray-500 font-normal">(optional)</span>
                </label>
                <div className="flex gap-3 items-center">
                  <button
                    type="button"
                    onClick={() => updateClientInfo({ paymentTerms: '100% Upfront' })}
                    className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all duration-200 ${
                      clientInfo.paymentTerms === '100% Upfront'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-emerald-300 hover:bg-emerald-50'
                    }`}
                  >
                    100% Upfront (Default)
                  </button>
                  <input
                    type="text"
                    placeholder="Or enter custom payment terms"
                    className="flex-1 px-6 py-5 border-2 rounded-xl focus:ring-4 transition-all duration-300 bg-white/80 backdrop-blur-sm text-xl font-medium border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20 hover:border-emerald-300"
                    style={{ 
                      fontSize: '18px',
                      height: '60px',
                      paddingTop: '18px',
                      paddingBottom: '18px'
                    }}
                    value={clientInfo.paymentTerms ?? '100% Upfront'}
                    onChange={(e) => updateClientInfo({ paymentTerms: e.target.value })}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  This value will appear under &quot;Important Payment Notes&quot; in the generated agreement.
                </p>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white py-4 px-8 rounded-2xl font-bold text-lg hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 transition-all duration-500 transform hover:scale-105 hover:shadow-2xl shadow-xl relative overflow-hidden group hidden"
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
                    Preview Agreement
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
              className={`w-full mt-4 py-4 px-8 rounded-2xl font-bold text-lg transition-all duration-500 transform shadow-xl relative overflow-hidden group hidden ${
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
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-1">
            <div className={`bg-white shadow-2xl w-full h-full overflow-hidden flex flex-col ${
              isFullscreen 
                ? 'max-w-none max-h-none rounded-none' 
                : 'max-w-[98vw] max-h-[99vh] rounded-3xl'
            }`}>
              {/* Header - Ultra Compact */}
              <div className="bg-gradient-to-r from-green-600 via-green-700 to-emerald-600 text-white p-2 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">🎉 Agreement Generated!</h2>
                    <p className="text-green-100 text-xs">
                      {getSelectedTemplateDisplayName()} | {clientInfo.clientName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Essential action buttons in header for agreement preview */}
                  {showAgreementPreview && (
                    <>
                      <button
                        onClick={handleDownloadAgreement}
                        disabled={!processedAgreement}
                        className={`text-white hover:text-green-200 transition-colors px-3 py-1 hover:bg-white hover:bg-opacity-10 rounded-lg text-xs font-semibold ${
                          !processedAgreement ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        title={processedAgreement ? "Download Agreement (Word Document)" : "No agreement available"}
                      >
                        📥 Word
                      </button>
                      <button
                        onClick={handleDownloadAgreementPDF}
                        className="text-white hover:text-green-200 transition-colors px-3 py-1 hover:bg-white hover:bg-opacity-10 rounded-lg text-xs font-semibold"
                        title="Download PDF"
                      >
                        📄 PDF
                      </button>
                      <button
                        onClick={() => setShowApprovalModal(true)}
                        disabled={isStartingWorkflow}
                        className="text-white hover:text-green-200 transition-colors px-3 py-1 hover:bg-white hover:bg-opacity-10 rounded-lg text-xs font-semibold"
                        title="Start Approval Workflow"
                      >
                        <Workflow className="w-3 h-3 inline mr-1" />
                        {isStartingWorkflow ? 'Creating Approval Workflow…' : 'Start Approval Workflow'}
                      </button>
                      <button
                        onClick={handleEmailAgreement}
                        disabled={isEmailingAgreement}
                        className={`transition-colors px-3 py-1 rounded-lg text-xs font-semibold ${
                          isEmailingAgreement
                            ? 'text-green-300 cursor-not-allowed'
                            : 'text-white hover:text-green-200 hover:bg-white hover:bg-opacity-10'
                        }`}
                        title="Send to Deal Desk"
                      >
                        {isEmailingAgreement ? '⏳ Sending...' : '📧 Send'}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="text-white hover:text-green-200 transition-colors p-2 hover:bg-white hover:bg-opacity-10 rounded-full"
                    title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                  >
                    {isFullscreen ? (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.5 3.5M15 9h4.5M15 9V4.5M15 9l5.5-5.5M9 15v4.5M9 15H4.5M9 15l-5.5 5.5M15 15h4.5M15 15v4.5m0-4.5l5.5 5.5" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowAgreementPreview(false);
                      setProcessedAgreement(null);
                      setOriginalDocxAgreement(null); // Clear original DOCX
                      setIsFullscreen(false);
                      // Reset inline preview when closing agreement modal
                      setShowInlinePreview(false);
                      if (previewUrl) {
                        URL.revokeObjectURL(previewUrl);
                        setPreviewUrl(null);
                      }
                    }}
                    className="text-white hover:text-green-200 transition-colors p-2 hover:bg-white hover:bg-opacity-10 rounded-full"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content - Maximized for Preview */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Success Message - Ultra Compact (hidden in fullscreen) */}
                {!isFullscreen && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-l-2 border-green-500 p-2 mx-2 mt-1 mb-2 flex-shrink-0">
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <p className="text-green-800 font-semibold text-xs">
                        Template processed successfully! Review the preview below.
                      </p>
                    </div>
                  </div>
                )}

                {/* Preview Area - Maximized */}
                <div className={`flex-1 bg-gray-50 border border-gray-300 overflow-hidden flex flex-col min-h-0 ${
                  isFullscreen 
                    ? 'mx-0 mb-0 rounded-none' 
                    : 'mx-2 mb-2 rounded-xl'
                }`}>
                  <div className="bg-white px-3 py-2 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                    <h3 className="text-sm font-bold text-gray-800">📄 Document Preview</h3>
                    <div className="flex items-center gap-2">
                      {showInlinePreview && (
                        <div className="text-xs text-gray-600 bg-green-50 px-2 py-1 rounded">
                          📄 DOCX Content
                        </div>
                      )}
                      {!showInlinePreview && !showAgreementPreview && (
                        <button
                          onClick={handleViewInline}
                          className="text-xs bg-gradient-to-r from-blue-600 to-blue-700 text-white px-3 py-1 rounded hover:from-blue-700 hover:to-blue-800 transition-all duration-200 font-semibold"
                        >
                          👁️ View Document
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 bg-white overflow-hidden min-h-0">
                    {showInlinePreview ? (
                      previewUrl ? (
                        <div className="w-full h-full relative">
                          <iframe
                            src={previewUrl}
                            className="w-full h-full border-0"
                            title="Agreement Document Preview"
                            style={{ 
                              minHeight: '700px',
                              height: '100%',
                              width: '100%'
                            }}
                          />
                         
                          {/* Fullscreen floating action buttons */}
                          {isFullscreen && (
                            <div className="absolute bottom-4 right-4 flex flex-col gap-2">
                              <button
                                onClick={handleDownloadAgreement}
                                disabled={!processedAgreement}
                                className={`text-white p-3 rounded-full shadow-2xl transition-all duration-200 transform ${
                                  !processedAgreement
                                    ? 'bg-gray-400 cursor-not-allowed opacity-50'
                                    : 'bg-green-600 hover:bg-green-700 hover:scale-105'
                                }`}
                                title={processedAgreement ? "Download Agreement (Word Document)" : "No agreement available"}
                              >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </button>
                              <button
                                onClick={handleDownloadAgreementPDF}
                                className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-2xl transition-all duration-200 transform hover:scale-105"
                                title="Download PDF"
                              >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div ref={previewContainerRef} className="document-preview-content w-full h-full overflow-auto p-6 bg-white" style={{ minHeight: '700px' }} />
                      )
                    ) : (
                      <div className="h-full flex items-center justify-center min-h-[400px]">
                        <div className="text-center p-8">
                          <div className="w-24 h-24 bg-gradient-to-br from-green-100 to-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <h4 className="text-2xl font-bold text-gray-800 mb-3">Document Ready for Preview</h4>
                          <p className="text-gray-600 text-lg mb-6 max-w-xl mx-auto">
                            Your agreement has been processed successfully with all tokens replaced with actual quote data.
                          </p>
                          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-6 mb-6 max-w-2xl mx-auto">
                            <p className="text-blue-800 text-base">
                              <strong>Click "View Document" above</strong> to see the complete agreement with all your data, 
                              or click "Download Agreement" to save the file.
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 max-w-xl mx-auto">
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <p><strong>📋 Template:</strong> {selectedTemplate?.name}</p>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <p><strong>👤 Client:</strong> {clientInfo.clientName}</p>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <p><strong>🏢 Company:</strong> {clientInfo.company}</p>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <p><strong>💰 Total Cost:</strong> {formatCurrency(calculation?.totalCost || 0)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons - Ultra Compact (hidden in fullscreen and agreement preview) */}
                {!isFullscreen && !showAgreementPreview && (
                  <div className="bg-white border-t border-gray-200 p-2 flex-shrink-0">
                  <div className="flex gap-2 justify-center flex-wrap">
                    <button
                      onClick={handleDownloadAgreement}
                      disabled={!processedAgreement}
                      className={`flex items-center gap-1 px-4 py-2 rounded-lg transition-all duration-200 font-semibold text-xs shadow-lg ${
                        !processedAgreement
                          ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                          : 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-700 hover:to-green-800'
                      }`}
                      title={processedAgreement ? "Download Agreement (Word Document)" : "Generate agreement first"}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      📥 Download Agreement
                    </button>
                    {/* Download PDF button with functionality */}
                    <button
                      onClick={handleDownloadAgreementPDF}
                      className="flex items-center gap-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 font-semibold text-xs shadow-lg"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      📄 Download PDF
                    </button>
                    <button
                      onClick={handleEmailAgreement}
                      disabled={isEmailingAgreement}
                      className={`flex items-center gap-1 px-4 py-2 rounded-lg transition-all duration-200 font-semibold text-xs shadow-lg ${
                        isEmailingAgreement
                          ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                          : 'bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:from-purple-700 hover:to-purple-800'
                      }`}
                    >
                      {isEmailingAgreement ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="w-3 h-3" />
                          📧 Send to Deal Desk
                        </>
                      )}
                    </button>
                    {/* After agreement generation, always show preview - no hide option */}
                    {showInlinePreview && showAgreementPreview ? (
                      <div className="flex items-center gap-1 px-4 py-2 bg-green-50 text-green-700 rounded-lg border border-green-200">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-xs font-semibold">📄 Document Loaded</span>
                      </div>
                    ) : showInlinePreview ? (
                      <button
                        onClick={() => {
                          setShowInlinePreview(false);
                          if (previewUrl) {
                            URL.revokeObjectURL(previewUrl);
                            setPreviewUrl(null);
                          }
                        }}
                        className="flex items-center gap-1 px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 transition-all duration-200 font-semibold text-xs shadow-lg"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        </svg>
                        🙈 Hide Document
                      </button>
                    ) : (
                      <button
                        onClick={handleViewInline}
                        className="flex items-center gap-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 font-semibold text-xs shadow-lg"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        setOriginalDocxAgreement(null); // Clear original DOCX
                        setShowInlinePreview(false);
                        setIsFullscreen(false);
                        if (previewUrl) {
                          URL.revokeObjectURL(previewUrl);
                          setPreviewUrl(null);
                        }
                      }}
                      className="flex items-center gap-1 px-4 py-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg hover:from-gray-700 hover:to-gray-800 transition-all duration-200 font-semibold text-xs shadow-lg"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      ❌ Close Preview
                    </button>
                  </div>
                </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Approval Workflow Modal */}
        {showApprovalModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Workflow className="w-5 h-5 text-blue-600" />
                  Start Approval Workflow
                </h3>
                <button
                  onClick={() => setShowApprovalModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <p className="text-sm text-gray-600 mb-2">
                Select the Team Approval group. Technical Team, Legal Team, and Deal Desk recipients will use the default emails.
              </p>
              <p className="text-xs text-gray-500 mb-4">
                If any approver denies, the workflow creator will be notified at <span className="font-medium">{workflowCreatorEmail}</span>.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Team Approval Group
                  </label>
                  <select
                    value={teamSelection}
                    onChange={(e) => setTeamSelection(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="SMB">SMB ({TEAM_APPROVAL_EMAILS.SMB})</option>
                    <option value="AM">AM ({TEAM_APPROVAL_EMAILS.AM})</option>
                    <option value="ENT">ENT ({TEAM_APPROVAL_EMAILS.ENT})</option>
                    <option value="DEV">DEV ({TEAM_APPROVAL_EMAILS.DEV})</option>
                    <option value="DEV2">DEV2 ({TEAM_APPROVAL_EMAILS.DEV2})</option>
                  </select>
                </div>
                
                <div className="text-xs text-gray-500">
                  Defaults:&nbsp;
                  <span className="font-medium">Technical</span> {approvalEmails.role1}&nbsp;•&nbsp;
                  <span className="font-medium">Legal</span> {approvalEmails.role2}&nbsp;•&nbsp;
                  <span className="font-medium">Deal Desk</span> {approvalEmails.role4}
                </div>
                
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowApprovalModal(false)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartApprovalWorkflow}
                  disabled={isStartingWorkflow}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {isStartingWorkflow ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Starting...
                    </>
                  ) : (
                    <>
                      <Workflow className="w-4 h-4" />
                      Start Approval Workflow
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default QuoteGenerator;