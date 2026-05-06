import React, { useState, useEffect } from 'react';
import { ConfigurationData, PricingTier } from '../types/pricing';
import { ArrowRight, Users, Server, Clock, Database, FileText, Calculator, Sparkles, Calendar, Percent, MessageSquare, Search, X, Mail, ChevronDown, Plus } from 'lucide-react';
import { trackConfiguration } from '../analytics/clarity';
import ExhibitSelector from './ExhibitSelector';
import { getEffectiveDurationMonths } from '../utils/configDuration';
import { PRICING_TIERS, calculateCombinationPricing, formatCurrency } from '../utils/pricing';
import { getContentTimelineByServerType, formatServerTypeLabel, type SourceEnvironment, type ContentMigrationType } from '../utils/timelineProjection';
import { BACKEND_URL } from '../config/api';

interface ConfigurationFormProps {
  onConfigurationChange: (config: ConfigurationData) => void;
  onSubmit: () => void;
  selectedExhibits: string[];
  onExhibitsChange: (exhibitIds: string[]) => void;
  selectedTier?: { tier: { name: string } } | null;
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
  selectedExhibits,
  onExhibitsChange,
  selectedTier,
  dealData, 
  onContactInfoChange,
  templates = [],
  selectedTemplate,
  onTemplateSelect
}) => {
  const [config, setConfig] = useState<ConfigurationData>({
    numberOfUsers: 1,
    instanceType: 'Small',
    numberOfInstances: 1,
    duration: 1,
    migrationType: '' as any, // Start with empty to hide other fields
    dataSizeGB: 1,
    messages: 1,
    combination: '',
    messagingConfig: undefined,
    contentConfig: undefined,
    // New: Service plan + Customer Location (region multiplier)
    servicePlan: 'Migrate',
    customerLocation: '1'
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

  // State to track which exhibit categories are selected (for Multi combination)
  const [selectedExhibitCategories, setSelectedExhibitCategories] = useState<{
    hasMessaging: boolean;
    hasContent: boolean;
    hasEmail: boolean;
  }>({ hasMessaging: false, hasContent: false, hasEmail: false });

  // State to track selected tier for each content/messaging/email configuration
  const [contentTiers, setContentTiers] = useState<Record<string, PricingTier>>({});
  const [messagingTiers, setMessagingTiers] = useState<Record<string, PricingTier>>({});
  const [emailTiers, setEmailTiers] = useState<Record<string, PricingTier>>({});

  // Shared instance type state - common for all project configurations
  const [sharedInstanceType, setSharedInstanceType] = useState<string>('Small');

  // State to track collapsed/expanded sections
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [noteExpanded, setNoteExpanded] = useState<boolean>(false);

  // Combinations from API (user-managed via Combination Manager); fallback to hardcoded if empty
  const [apiCombinations, setApiCombinations] = useState<Array<{ value: string; label: string; migrationType: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/combinations`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success && Array.isArray(data.combinations)) {
          setApiCombinations(
            data.combinations.map((c: any) => ({
              value: c.value || '',
              label: c.label || c.value || '',
              migrationType: c.migrationType || ''
            }))
          );
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  // Dynamically detect which exhibit categories are selected (for Multi combination)
  useEffect(() => {
    const fetchExhibitsAndCategorize = async () => {
      if (config.migrationType !== 'Multi combination' || selectedExhibits.length === 0) {
        setSelectedExhibitCategories({ hasMessaging: false, hasContent: false, hasEmail: false });
        return;
      }

      try {
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        const response = await fetch(`${BACKEND_URL}/api/exhibits`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.exhibits) {
            const exhibits = data.exhibits;
            
            let hasMessaging = false;
            let hasContent = false;
            let hasEmail = false;
            
            // Normalize base combination keys so "same folder" doesn't create duplicate configs
            // (e.g. "onedrive-/-sharepoint---onedrive-/-sharepoint" vs "onedrive-/-sharepoint-onedrive-/-sharepoint")
            const normalizeBaseCombinationKey = (input: string): string => {
              if (!input) return '';
              let s = String(input).toLowerCase();
              s = s
                .replace(/\//g, '-') // treat "/" as separator
                .replace(/[^a-z0-9-]+/g, '-') // everything else -> "-"
                .replace(/-+/g, '-') // collapse dashes
                .replace(/^-+|-+$/g, ''); // trim

              // Collapse duplicated halves: "a-b-a-b" -> "a-b"
              const parts = s.split('-').filter(Boolean);
              if (parts.length > 0 && parts.length % 2 === 0) {
                const half = parts.length / 2;
                const first = parts.slice(0, half).join('-');
                const second = parts.slice(half).join('-');
                if (first === second) s = first;
              }
              return s;
            };

            const baseKeyToDisplayLabel = (baseKey: string): string => {
              if (!baseKey) return '';
              // Keep requested business label for OneDrive/SharePoint folder
              if (baseKey === 'onedrive-sharepoint' || baseKey === 'onedrive-to-sharepoint') {
                return 'OneDrive / SharePoint - OneDrive / SharePoint';
              }
              // Box to Google MyDrive covers both MyDrive and Shared Drive
              if (baseKey === 'box-to-google-mydrive') {
                return 'Box to Google My Drive & Shared Drive';
              }
              // Default: "testing-to-production" -> "Testing To Production"
              return baseKey
                .split('-')
                .filter(Boolean)
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')
                .trim();
            };

            // Helper function to extract base combination from exhibit
            // Priority: Use combinations field (base combination), fallback to name extraction
            const extractCombinationName = (exhibit: any): string => {
              // First, try to extract base combination from combinations field
              if (exhibit.combinations && exhibit.combinations.length > 0) {
                const primaryCombination = exhibit.combinations[0];
                if (primaryCombination && primaryCombination !== 'all') {
                  // Extract base combination (remove include/notinclude and plan type suffixes)
                  const base = primaryCombination
                    .replace(/-(included|include|notincluded|notinclude|not-include|basic|standard|advanced)$/i, '')
                    .replace(/-(included|include|notincluded|notinclude|not-include|basic|standard|advanced)$/i, ''); // Run twice to catch both
                  
                  if (base && base !== 'all' && base.length >= 3) {
                    const baseKey = normalizeBaseCombinationKey(base);
                    const label = baseKeyToDisplayLabel(baseKey);
                    return label || base.trim();
                  }
                }
              }
              
              // Fallback: Extract from exhibit name (for backward compatibility)
              const exhibitName = exhibit.name || '';
              if (!exhibitName || exhibitName === 'New Exhibit') {
                return exhibitName;
              }
              
              // Remove common suffixes like:
              // - " Standard Plan - Included Features"
              // - " Advanced Plan - Included Features"
              // - " Basic Plan - Not Included Features"
              const patterns = [
                /\s+(Standard|Advanced|Basic|Premium|Enterprise)\s+Plan\s*-\s*.*$/i,
                /\s+Plan\s*-\s*.*$/i,
                /\s+-\s*Included\s+Features$/i,
                /\s+-\s*Not\s+Included\s+Features$/i,
                /\s+-\s*.*$/i,
              ];
              
              let cleaned = exhibitName;
              for (const pattern of patterns) {
                cleaned = cleaned.replace(pattern, '');
              }
              
              return cleaned.trim() || exhibitName;
            };
            
            // Build per-combination config arrays (group exhibits by combination)
            const messagingCombinationMap = new Map<string, { exhibitIds: string[]; exhibitName: string; category: string }>();
            const contentCombinationMap = new Map<string, { exhibitIds: string[]; exhibitName: string; category: string }>();
            const emailCombinationMap = new Map<string, { exhibitIds: string[]; exhibitName: string; category: string }>();
            
            // Dedupe exhibit IDs to avoid double-counting/grouping issues
            const uniqueSelectedExhibits = Array.from(
              new Set((selectedExhibits || []).map((id) => (id ?? '').toString()).filter(Boolean))
            );

            uniqueSelectedExhibits.forEach(exhibitId => {
              const exhibit = exhibits.find((ex: any) => ex._id === exhibitId);
              if (exhibit) {
                const rawCategory = (exhibit.category || 'content');
                const category = rawCategory.toLowerCase();
                // Extract base combination name (prioritizes combinations field over name)
                const combinationName = extractCombinationName(exhibit);
                
                if (category === 'messaging' || category === 'message') {
                  hasMessaging = true;
                  if (!messagingCombinationMap.has(combinationName)) {
                    messagingCombinationMap.set(combinationName, { exhibitIds: [], exhibitName: combinationName, category });
                  }
                  messagingCombinationMap.get(combinationName)!.exhibitIds.push(exhibitId);
                } else if (category === 'content') {
                  hasContent = true;
                  if (!contentCombinationMap.has(combinationName)) {
                    contentCombinationMap.set(combinationName, { exhibitIds: [], exhibitName: combinationName, category });
                  }
                  contentCombinationMap.get(combinationName)!.exhibitIds.push(exhibitId);
                } else if (
                  category === 'email' ||
                  category === 'mail' ||
                  category.includes('email') ||
                  category.includes('mailbox') ||
                  category.includes('outlook') ||
                  category.includes('gmail')
                ) {
                  hasEmail = true;
                  if (!emailCombinationMap.has(combinationName)) {
                    emailCombinationMap.set(combinationName, { exhibitIds: [], exhibitName: combinationName, category });
                  }
                  emailCombinationMap.get(combinationName)!.exhibitIds.push(exhibitId);
                }
              }
            });
            
            // Convert maps to config arrays (one config per combination, not per exhibit)
            const newMessagingConfigs: ConfigurationData['messagingConfigs'] = [];
            const newContentConfigs: ConfigurationData['contentConfigs'] = [];
            const newEmailConfigs: ConfigurationData['emailConfigs'] = [];
            
            // Build messaging configs (one per combination)
            messagingCombinationMap.forEach((group, combinationName) => {
              // Use first exhibit ID as the primary ID, but store all IDs in the name or use combination name
              const primaryExhibitId = group.exhibitIds[0];
              const primaryExhibit = exhibits.find((ex: any) => ex._id === primaryExhibitId);
              const existing = (config.messagingConfigs || []).find(c => 
                c.exhibitId === primaryExhibitId || c.exhibitName === combinationName
              );
              
              // Get plan type from exhibit if available
              let exhibitPlanType = '';
              if (primaryExhibit?.planType) {
                exhibitPlanType = primaryExhibit.planType.toLowerCase();
              }
              
              if (existing) {
                // Preserve existing config but update planType if not set
                // Preserve existing instanceType - don't override with sharedInstanceType
                newMessagingConfigs.push({
                  ...existing,
                  planType: existing.planType || exhibitPlanType,
                });
              } else {
                newMessagingConfigs.push({
                  exhibitId: primaryExhibitId, // Store first exhibit ID, but display combination name
                  exhibitName: combinationName, // Display the combination name, not individual exhibit name
                  numberOfUsers: config.messagingConfig?.numberOfUsers || 1,
                  instanceType: sharedInstanceType,
                  numberOfInstances: config.messagingConfig?.numberOfInstances || 1,
                  duration: config.messagingConfig?.duration || 1,
                  messages: config.messagingConfig?.messages || 1,
                  planType: exhibitPlanType, // Store plan type from exhibit
                });
              }
            });
            
            // Build content configs (one per combination)
            contentCombinationMap.forEach((group, combinationName) => {
              const primaryExhibitId = group.exhibitIds[0];
              const primaryExhibit = exhibits.find((ex: any) => ex._id === primaryExhibitId);
              const existing = (config.contentConfigs || []).find(c => 
                c.exhibitId === primaryExhibitId || c.exhibitName === combinationName
              );
              
              // Get plan type from exhibit if available
              let exhibitPlanType = '';
              if (primaryExhibit?.planType) {
                exhibitPlanType = primaryExhibit.planType.toLowerCase();
              }
              
              if (existing) {
                // Preserve existing config but update planType if not set
                // Preserve existing instanceType - don't override with sharedInstanceType
                newContentConfigs.push({
                  ...existing,
                  planType: existing.planType || exhibitPlanType,
                });
              } else {
                newContentConfigs.push({
                  exhibitId: primaryExhibitId,
                  exhibitName: combinationName, // Display the combination name
                  numberOfUsers: config.contentConfig?.numberOfUsers || 1,
                  instanceType: sharedInstanceType,
                  numberOfInstances: config.contentConfig?.numberOfInstances || 1,
                  duration: config.contentConfig?.duration || 1,
                  dataSizeGB: config.contentConfig?.dataSizeGB || 1,
                  planType: exhibitPlanType, // Store plan type from exhibit
                });
              }
            });
            
            // Build email configs (one per combination)
            emailCombinationMap.forEach((group, combinationName) => {
              const primaryExhibitId = group.exhibitIds[0];
              const existing = (config.emailConfigs || []).find(c => 
                c.exhibitId === primaryExhibitId || c.exhibitName === combinationName
              );
              
              newEmailConfigs.push(
                existing ? {
                  ...existing,
                  // Preserve existing instanceType - don't override with sharedInstanceType
                } : {
                  exhibitId: primaryExhibitId,
                  exhibitName: combinationName, // Display the combination name
                  numberOfUsers: 1,
                  instanceType: sharedInstanceType,
                  numberOfInstances: 1,
                  duration: 1,
                  messages: 1,
                }
              );
            });
            
            setSelectedExhibitCategories({ hasMessaging, hasContent, hasEmail });
            console.log('📊 Selected exhibit categories:', { hasMessaging, hasContent, hasEmail });
            
            // Persist per-exhibit configs
            setConfig(prev => ({
              ...prev,
              messagingConfigs: newMessagingConfigs,
              contentConfigs: newContentConfigs,
              emailConfigs: newEmailConfigs,
            }));
          }
        }
      } catch (error) {
        console.error('Error fetching exhibits for categorization:', error);
      }
    };

    fetchExhibitsAndCategorize();
  }, [config.migrationType, selectedExhibits]);

  // Propagate config changes to parent whenever config state changes
  useEffect(() => {
    onConfigurationChange(config);
  }, [config]);

  // Multi combination: discount UI is intentionally not available.
  // Clear any previously persisted discount so other screens (e.g. PricingComparison) don't show "Save X% off"
  // due to a stale sessionStorage value.
  useEffect(() => {
    if (config.migrationType !== 'Multi combination') return;
    setDiscountValue('');
    try {
      sessionStorage.setItem('cpq_discount_session', '');
      localStorage.setItem('cpq_discount', '');
      window.dispatchEvent(new CustomEvent('discountUpdated'));
    } catch {}
  }, [config.migrationType]);

  // For Multi combination, keep the top-level duration in sync so all downstream
  // quote generators/templates don't fall back to "1 month".
  useEffect(() => {
    if (config.migrationType !== 'Multi combination') return;

    // Use shared helper (Multi combination = summed duration across categories)
    const effective = getEffectiveDurationMonths(config);
    if (effective > 0 && config.duration !== effective) {
      setConfig(prev => ({ ...prev, duration: effective }));
    }
  }, [config.migrationType, config.messagingConfigs, config.contentConfigs, config.emailConfigs, config.messagingConfig?.duration, config.contentConfig?.duration, config.duration]);
  
  // Contact information validation state
  const [contactValidationErrors, setContactValidationErrors] = useState({
    clientName: false,
    clientEmail: false,
    company: false
  });

  // Which option to show: Migration Type or Timeline Projection (two-option choice in one box)
  const [migrationOrTimeline, setMigrationOrTimeline] = useState<'migration' | 'timeline'>(() =>
    (config.timelineProjection && !config.migrationType) ? 'timeline' : 'migration'
  );
  useEffect(() => {
    if (config.timelineProjection && !config.migrationType) setMigrationOrTimeline('timeline');
    else if (config.migrationType) setMigrationOrTimeline('migration');
  }, [config.migrationType, config.timelineProjection]);

  // Which timeline projection category is selected: Content, Messaging, or Email
  const [timelineProjectionCategory, setTimelineProjectionCategory] = useState<'content' | 'messaging' | 'email' | ''>('');
  // Content migration timeline: source environment and migration type for factor lookup
  const [contentSourceEnvironment, setContentSourceEnvironment] = useState<SourceEnvironment>('Others');
  const [contentMigrationType, setContentMigrationType] = useState<ContentMigrationType>('Data, Root & Sub-Folder permissions, Hyperlinks');

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

  // Helper function to get display label for combination value (uses API list when available)
  const getCombinationLabel = (combinationValue: string): string => {
    const fromApi = apiCombinations.find(c => c.value === combinationValue);
    if (fromApi?.label) return fromApi.label;
    const combinationLabels: Record<string, string> = {
      'dropbox-to-microsoft': 'DROPBOX TO MICROSOFT (ONEDRIVE/SHAREPOINT)',
      'dropbox-to-google': 'DROPBOX TO GOOGLE (SHARED DRIVE/MYDRIVE)',
      'dropbox-to-box': 'DROPBOX TO BOX',
      'dropbox-to-onedrive': 'DROPBOX TO ONEDRIVE',
      'dropbox-to-egnyte': 'DROPBOX TO EGNYTE',
      'box-to-box': 'BOX TO BOX',
      'box-to-dropbox': 'BOX TO DROPBOX',
      'box-to-sharefile': 'BOX TO SHAREFILE',
      'box-to-google-mydrive': 'BOX TO GOOGLE MYDRIVE & SHARED DRIVE',
      'box-to-aws-s3': 'BOX TO AWS S3',
      'box-to-microsoft': 'BOX TO MICROSOFT (ONEDRIVE/SHAREPOINT)',
      'box-to-sharepoint': 'BOX TO SHAREPOINT',
      'box-to-google-sharedrive': 'BOX TO GOOGLE SHARED DRIVE',
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
      'onedrive-to-onedrive': 'ONEDRIVE TO ONEDRIVE',
      'onedrive-to-google-mydrive': 'ONEDRIVE TO GOOGLE MYDRIVE',
      'sharefile-to-google-mydrive': 'SHAREFILE TO GOOGLE MYDRIVE',
      'sharefile-to-google-sharedrive': 'SHAREFILE TO GOOGLE SHARED DRIVE',
      'sharefile-to-onedrive': 'SHAREFILE TO ONEDRIVE',
      'sharefile-to-sharepoint': 'SHAREFILE TO SHAREPOINT',
      'sharepoint-online-to-egnyte': 'SHAREPOINT ONLINE TO EGNYTE',
      'sharepoint-online-to-google-sharedrive': 'SHAREPOINT ONLINE TO GOOGLE SHARED DRIVE',
      'sharefile-to-sharefile': 'SHAREFILE TO SHAREFILE',
      'nfs-to-google': 'NFS TO GOOGLE (MYDRIVE/SHARED DRIVE)',
      'nfs-to-microsoft': 'NFS TO MICROSOFT (ONEDRIVE/SHAREPOINT)',
      'egnyte-to-google': 'EGNYTE TO GOOGLE (SHARED DRIVE / MYDRIVE)',
      'egnyte-to-google-sharedrive': 'EGNYTE TO GOOGLE SHARED DRIVE',
      'egnyte-to-microsoft': 'EGNYTE TO MICROSOFT (ONEDRIVE/SHAREPOINT)',
      'overage-agreement': 'OVERAGE AGREEMENT',
      'multi-combination': 'ORIGINAL MULTI COMBINATION',
      'slack-to-teams': 'SLACK TO TEAMS',
      'slack-to-google-chat': 'SLACK TO GOOGLE CHAT',
      'teams-to-slack': 'TEAMS TO SLACK'
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

  // Detect exhibit categories when exhibits change (for Multi combination)
  useEffect(() => {
    if (config.migrationType !== 'Multi combination' || selectedExhibits.length === 0) {
      setSelectedExhibitCategories({ hasMessaging: false, hasContent: false, hasEmail: false });
      return;
    }

    // Fetch exhibit details to determine categories
    const fetchExhibitCategories = async () => {
      try {
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        const response = await fetch(`${BACKEND_URL}/api/exhibits`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.exhibits) {
            const exhibits = data.exhibits;
            const selectedExhibitsData = exhibits.filter((ex: any) => selectedExhibits.includes(ex._id));
            
            const hasMessaging = selectedExhibitsData.some((ex: any) => 
              (ex.category || 'content').toLowerCase() === 'messaging' || 
              (ex.category || 'content').toLowerCase() === 'message'
            );
            const hasContent = selectedExhibitsData.some((ex: any) => 
              (ex.category || 'content').toLowerCase() === 'content'
            );
            const hasEmail = selectedExhibitsData.some((ex: any) => 
              (ex.category || 'content').toLowerCase() === 'email'
            );

            setSelectedExhibitCategories({ hasMessaging, hasContent, hasEmail });
            console.log('📊 Selected exhibit categories:', { hasMessaging, hasContent, hasEmail });
          }
        }
      } catch (error) {
        console.error('Error fetching exhibit categories:', error);
      }
    };

    fetchExhibitCategories();
  }, [selectedExhibits, config.migrationType]);

  // Propagate config changes including multi configs
  useEffect(() => {
    onConfigurationChange(config);
  }, [config.messagingConfig, config.contentConfig]);

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
          numberOfUsers: typeof parsed.numberOfUsers === 'number' ? parsed.numberOfUsers : 1,
          instanceType: parsed.instanceType || 'Small',
          numberOfInstances: typeof parsed.numberOfInstances === 'number' ? parsed.numberOfInstances : 1,
          duration: typeof parsed.duration === 'number' ? parsed.duration : 1,
          migrationType: parsed.migrationType || ('' as any),
          dataSizeGB: typeof parsed.dataSizeGB === 'number' ? parsed.dataSizeGB : 1,
          messages: typeof parsed.messages === 'number' ? parsed.messages : 1,
          combination: parsed.combination || '', // Preserve previously selected combination
          // Restore per-combination configs (messagingConfigs, contentConfigs, emailConfigs)
          messagingConfigs: parsed.messagingConfigs || [],
          contentConfigs: parsed.contentConfigs || [],
          emailConfigs: parsed.emailConfigs || [],
          // Restore legacy single configs for backward compatibility
          messagingConfig: parsed.messagingConfig,
          contentConfig: parsed.contentConfig,
          emailConfig: parsed.emailConfig,
          // Restore other fields
          startDate: parsed.startDate,
          endDate: parsed.endDate
        } as ConfigurationData;
        
        // Initialize shared instance type from first available config
        if (parsed.messagingConfigs && parsed.messagingConfigs.length > 0 && parsed.messagingConfigs[0].instanceType) {
          setSharedInstanceType(parsed.messagingConfigs[0].instanceType);
        } else if (parsed.contentConfigs && parsed.contentConfigs.length > 0 && parsed.contentConfigs[0].instanceType) {
          setSharedInstanceType(parsed.contentConfigs[0].instanceType);
        } else if (parsed.emailConfigs && parsed.emailConfigs.length > 0 && parsed.emailConfigs[0].instanceType) {
          setSharedInstanceType(parsed.emailConfigs[0].instanceType);
        } else if (parsed.instanceType) {
          setSharedInstanceType(parsed.instanceType);
        }
        
        console.log('📋 === CRITICAL CHECK ===');
        console.log('📋 Merged combination value:', merged.combination);
        console.log('📋 Full merged config:', merged);
        console.log('📋 ========================');
        
        setConfig(merged);
        // Use setTimeout to avoid React warning about updating parent during render
        setTimeout(() => {
          onConfigurationChange(merged);
          console.log('📋 Configuration set and parent notified');
        }, 0);
        
        // Force combination sync after config is loaded
        if (merged.combination && merged.combination !== '') {
          setCombination(merged.combination);
          console.log('📋 Force syncing combination state:', merged.combination);
        }
        
        console.log('📋 === CONFIGURATION LOADING END ===');
        
        // Also restore tier selections (plan selections) for each combination
        try {
          // First, try to restore from ConfigurationForm's own storage (by exhibitId)
          const savedTiers = sessionStorage.getItem('cpq_combination_tiers');
          if (savedTiers) {
            const parsedTiers = JSON.parse(savedTiers);
            if (parsedTiers.messagingTiers) {
              setMessagingTiers(parsedTiers.messagingTiers);
              console.log('📋 Restored messaging tiers (by exhibitId):', parsedTiers.messagingTiers);
            }
            if (parsedTiers.contentTiers) {
              setContentTiers(parsedTiers.contentTiers);
              console.log('📋 Restored content tiers (by exhibitId):', parsedTiers.contentTiers);
            }
            if (parsedTiers.emailTiers) {
              setEmailTiers(parsedTiers.emailTiers);
              console.log('📋 Restored email tiers (by exhibitId):', parsedTiers.emailTiers);
            }
          }
        } catch (tierError) {
          console.warn('📋 Could not restore tier selections:', tierError);
        }
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

  // Also restore tier selections from PricingComparison (by combinationName) after config is loaded
  // This handles cases where user selected plans in PricingComparison component
  useEffect(() => {
    if (config.migrationType === 'Multi combination' && (config.messagingConfigs?.length || config.contentConfigs?.length || config.emailConfigs?.length)) {
      try {
        const pricingTiers = sessionStorage.getItem('cpq_selected_tiers_per_combination');
        if (pricingTiers) {
          const parsedPricingTiers = JSON.parse(pricingTiers);
          console.log('📋 Found PricingComparison tier selections:', parsedPricingTiers);
          
          // Map combinationName → exhibitId for messaging configs
          if (config.messagingConfigs && config.messagingConfigs.length > 0) {
            const messagingTiersMap: Record<string, PricingTier> = {};
            config.messagingConfigs.forEach(cfg => {
              const tierName = parsedPricingTiers[cfg.exhibitName];
              if (tierName) {
                const tier = PRICING_TIERS.find(t => t.name === tierName);
                if (tier) {
                  messagingTiersMap[cfg.exhibitId] = tier;
                }
              }
            });
            if (Object.keys(messagingTiersMap).length > 0) {
              setMessagingTiers(prev => {
                // Only update if not already set (preserve existing selections)
                const updated = { ...prev };
                Object.keys(messagingTiersMap).forEach(key => {
                  if (!updated[key]) {
                    updated[key] = messagingTiersMap[key];
                  }
                });
                return updated;
              });
              console.log('📋 Mapped PricingComparison tiers to messaging exhibitIds:', messagingTiersMap);
            }
          }
          
          // Map combinationName → exhibitId for content configs
          if (config.contentConfigs && config.contentConfigs.length > 0) {
            const contentTiersMap: Record<string, PricingTier> = {};
            config.contentConfigs.forEach(cfg => {
              const tierName = parsedPricingTiers[cfg.exhibitName];
              if (tierName) {
                const tier = PRICING_TIERS.find(t => t.name === tierName);
                if (tier) {
                  contentTiersMap[cfg.exhibitId] = tier;
                }
              }
            });
            if (Object.keys(contentTiersMap).length > 0) {
              setContentTiers(prev => {
                // Only update if not already set (preserve existing selections)
                const updated = { ...prev };
                Object.keys(contentTiersMap).forEach(key => {
                  if (!updated[key]) {
                    updated[key] = contentTiersMap[key];
                  }
                });
                return updated;
              });
              console.log('📋 Mapped PricingComparison tiers to content exhibitIds:', contentTiersMap);
            }
          }
          
          // Map combinationName → exhibitId for email configs
          if (config.emailConfigs && config.emailConfigs.length > 0) {
            const emailTiersMap: Record<string, PricingTier> = {};
            config.emailConfigs.forEach(cfg => {
              const tierName = parsedPricingTiers[cfg.exhibitName];
              if (tierName) {
                const tier = PRICING_TIERS.find(t => t.name === tierName);
                if (tier) {
                  emailTiersMap[cfg.exhibitId] = tier;
                }
              }
            });
            if (Object.keys(emailTiersMap).length > 0) {
              setEmailTiers(prev => {
                // Only update if not already set (preserve existing selections)
                const updated = { ...prev };
                Object.keys(emailTiersMap).forEach(key => {
                  if (!updated[key]) {
                    updated[key] = emailTiersMap[key];
                  }
                });
                return updated;
              });
              console.log('📋 Mapped PricingComparison tiers to email exhibitIds:', emailTiersMap);
            }
          }
        }
      } catch (tierError) {
        console.warn('📋 Could not map PricingComparison tier selections:', tierError);
      }
    }
  }, [config.migrationType, config.messagingConfigs, config.contentConfigs, config.emailConfigs]);

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
        clientName: contactInfo.clientName || '',
        clientEmail: contactInfo.clientEmail || '',
        company: contactInfo.company || '',
        companyName2: contactInfo.companyName2 || contactInfo.company || ''
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

  // Persist multi-combo nested configs (messaging/content) on change so they survive navigation
  useEffect(() => {
    if (isInitialLoad) return;
    try {
      sessionStorage.setItem('cpq_configuration_session', JSON.stringify(config));
      const existingNavState = sessionStorage.getItem('cpq_navigation_state');
      if (existingNavState) {
        try {
          const parsed = JSON.parse(existingNavState);
          if (!parsed.sessionState) parsed.sessionState = {};
          parsed.sessionState.configuration = config;
          sessionStorage.setItem('cpq_navigation_state', JSON.stringify(parsed));
        } catch (navError) {
          console.warn('💾 Could not save multi combo config to navigation state:', navError);
        }
      }
      console.log('💾 Persisted nested multi-combination config changes');
    } catch (error) {
      console.error('💾 Error saving nested config to sessionStorage:', error);
    }
  }, [config.messagingConfigs, config.contentConfigs, config.migrationType, config.combination, isInitialLoad, config]);

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
      onContactInfoChange({
        clientName: newContactInfo.clientName || '',
        clientEmail: newContactInfo.clientEmail || '',
        company: newContactInfo.company || '',
        companyName2: newContactInfo.companyName2 || newContactInfo.company || ''
      });
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

    // Manage Standalone has its own input set (manageUsers / manageDataGB) and
    // does NOT use migrationType / combination / numberOfUsers / instance / duration
    // / dataSizeGB. Validate manageUsers only, then skip the rest.
    if (config.servicePlan === 'Manage') {
      const mu = config.manageUsers;
      if (mu === undefined || mu === null || mu <= 0) {
        alert('Please enter the number of users for the Manage plan');
        return;
      }
      // manageDataGB = 0 is valid (no data cost). No further checks needed.
      console.log('✅ Manage validation passed, submitting configuration');
      onSubmit();
      setTimeout(() => {
        const pricingSection = document.getElementById('pricing-comparison');
        if (pricingSection) {
          pricingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
      return;
    }

    if (!config.migrationType) {
      alert('Please select a migration type');
      return;
    }

    // Multi combination validation
    if (config.migrationType === 'Multi combination') {
      // Require a combination to be selected (e.g. Original Multi combination)
      if (!config.combination) {
        alert('Please select a combination');
        return;
      }
      // Require at least one exhibit (Messaging, Content, or Email)
      if (!selectedExhibitCategories.hasMessaging && !selectedExhibitCategories.hasContent && !selectedExhibitCategories.hasEmail) {
        alert('Please select at least one exhibit to proceed.');
        return;
      }
      
      // Validate Messaging section if present (check per-exhibit configs array)
      if (selectedExhibitCategories.hasMessaging) {
        const messagingConfigs = config.messagingConfigs || [];
        if (messagingConfigs.length === 0) {
          // Fallback to single config for backward compatibility
          if (!config.messagingConfig || config.messagingConfig.numberOfUsers <= 0) {
            alert('Please enter number of users for Messaging configuration');
            return;
          }
          if (!config.messagingConfig.duration || config.messagingConfig.duration <= 0) {
            alert('Please enter duration for Messaging configuration');
            return;
          }
        } else {
          // Validate each messaging config in the array
          for (const msgCfg of messagingConfigs) {
            if (!msgCfg.numberOfUsers || msgCfg.numberOfUsers <= 0) {
              alert(`Please enter number of users for Messaging configuration: ${msgCfg.exhibitName}`);
              return;
            }
            if (!msgCfg.duration || msgCfg.duration <= 0) {
              alert(`Please enter duration for Messaging configuration: ${msgCfg.exhibitName}`);
              return;
            }
          }
        }
      }
      
      // Validate Content section if present (check per-exhibit configs array)
      if (selectedExhibitCategories.hasContent) {
        const contentConfigs = config.contentConfigs || [];
        if (contentConfigs.length === 0) {
          // Fallback to single config for backward compatibility
          if (!config.contentConfig || config.contentConfig.numberOfUsers <= 0) {
            alert('Please enter number of users for Content configuration');
            return;
          }
          if (!config.contentConfig.dataSizeGB || config.contentConfig.dataSizeGB <= 0) {
            alert('Please enter data size for Content configuration');
            return;
          }
          if (!config.contentConfig.duration || config.contentConfig.duration <= 0) {
            alert('Please enter duration for Content configuration');
            return;
          }
        } else {
          // Validate each content config in the array
          for (const contentCfg of contentConfigs) {
            if (!contentCfg.numberOfUsers || contentCfg.numberOfUsers <= 0) {
              alert(`Please enter number of users for Content configuration: ${contentCfg.exhibitName}`);
              return;
            }
            if (!contentCfg.dataSizeGB || contentCfg.dataSizeGB <= 0) {
              alert(`Please enter data size for Content configuration: ${contentCfg.exhibitName}`);
              return;
            }
            if (!contentCfg.duration || contentCfg.duration <= 0) {
              alert(`Please enter duration for Content configuration: ${contentCfg.exhibitName}`);
              return;
            }
          }
        }
      }
      
      // Validate Email section if present (check per-exhibit configs array)
      if (selectedExhibitCategories.hasEmail) {
        const emailConfigs = config.emailConfigs || [];
        if (emailConfigs.length > 0) {
          // Validate each email config in the array
          for (const emailCfg of emailConfigs) {
            if (!emailCfg.numberOfUsers || emailCfg.numberOfUsers <= 0) {
              alert(`Please enter number of mailboxes for Email configuration: ${emailCfg.exhibitName}`);
              return;
            }
            if (!emailCfg.duration || emailCfg.duration <= 0) {
              alert(`Please enter duration for Email configuration: ${emailCfg.exhibitName}`);
              return;
            }
          }
        }
      }
    } else if (!config.combination) {
      alert('Please select a combination');
      return;
    }
    
    // For single migration types, validate base fields; Multi combination uses per-section validation above.
    if (config.migrationType !== 'Multi combination') {
      // Require users field to be entered (0 allowed, but check value first, then touch status)
      if (config.combination !== 'overage-agreement') {
        // If value exists and is valid, accept it (even if not touched - e.g., loaded from sessionStorage)
        if (config.numberOfUsers === undefined || config.numberOfUsers === null) {
          // Value is missing - check if field was touched
          if (!fieldTouched.users) {
            const fieldLabel = config.migrationType === 'Email' ? 'number of mailboxes' : 'number of users';
            alert(`Please enter the ${fieldLabel}`);
            return;
          }
        }
        // Check if value is negative
        if (config.numberOfUsers < 0) {
          const fieldLabel = config.migrationType === 'Email' ? 'number of mailboxes' : 'number of users';
          alert(`Please enter the ${fieldLabel} (minimum 0)`);
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
        const messages = config.messages ?? 0;
        if (messages <= 0) {
          if (!fieldTouched.messages) {
            alert('Please enter the number of messages for Messaging migration');
            return;
          }
          if (messages <= 0) {
            alert('Please enter the number of messages (minimum 1)');
            return;
          }
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
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Contact Information and Migration Type - Side by Side */}
        <div className={`grid gap-6 mb-8 ${(dealData || contactInfo.clientName || contactInfo.clientEmail || contactInfo.company) ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
          {/* Contact Information Display - Show when deal data exists */}
          {(dealData || contactInfo.clientName || contactInfo.clientEmail || contactInfo.company) && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-8 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                <Users className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Contact Information</h3>
              <span className="ml-auto text-xs font-medium text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
                {dealData && !contactInfo.clientName && !contactInfo.clientEmail ? 'From HubSpot Deal' : 'Saved Contact'}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Contact Name */}
              <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-200/80">
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
                        clientName: newContactInfo.clientName || '',
                        clientEmail: newContactInfo.clientEmail || '',
                        company: newContactInfo.company || '',
                        companyName2: newContactInfo.companyName2 || newContactInfo.company || ''
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
                      : 'border-slate-200 focus:ring-blue-500 focus:border-blue-500'
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
              <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-200/80">
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
                        clientName: newContactInfo.clientName || '',
                        clientEmail: newContactInfo.clientEmail || '',
                        company: newContactInfo.company || '',
                        companyName2: newContactInfo.companyName2 || newContactInfo.company || ''
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
                      : 'border-slate-200 focus:ring-blue-500 focus:border-blue-500'
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
              <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-200/80">
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
                        clientName: newContactInfo.clientName || '',
                        clientEmail: newContactInfo.clientEmail || '',
                        company: newContactInfo.company || '',
                        companyName2: newContactInfo.companyName2 || newContactInfo.company || ''
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
                      : 'border-slate-200 focus:ring-blue-500 focus:border-blue-500'
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
            
            <div 
              className="mt-4 p-3 bg-blue-50/80 rounded-xl border border-blue-100 cursor-pointer hover:bg-blue-50 transition-colors duration-200"
              onClick={() => setNoteExpanded(!noteExpanded)}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-700">
                  <strong>📌 Note:</strong>
                  {noteExpanded && (
                    <span className="ml-2"> Edit the contact information above. Changes will be automatically saved and reflected in your quotes and agreements.</span>
                  )}
                </p>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${noteExpanded ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </div>
          )}

          {/* Migration Type or Timeline Projection - Two options, then one dropdown */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-8 hover:shadow-md transition-shadow duration-200">
            <div className={`mx-auto ${(dealData || contactInfo.clientName || contactInfo.clientEmail || contactInfo.company) ? 'max-w-md' : 'max-w-lg'}`}>
              <label className="flex items-center gap-3 text-lg font-semibold text-slate-800 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                  <ArrowRight className="w-5 h-5 text-white" />
                </div>
                Choose one
              </label>
              {/* Service plan tabs (Migrate / Manage / Bundle) + Timeline Projection */}
              {(() => {
                const activePlan = config.servicePlan || 'Migrate';
                const onMigration = migrationOrTimeline === 'migration';

                const selectServicePlan = (plan: 'Migrate' | 'Manage' | 'Bundle') => {
                  setMigrationOrTimeline('migration');
                  setTimelineProjectionCategory('');
                  // Switching away from Migrate clears migrationType/combination since
                  // Manage/Bundle don't carry combination-based migration types.
                  const newConfig: ConfigurationData = {
                    ...config,
                    servicePlan: plan,
                    timelineProjection: '',
                    ...(plan !== 'Migrate' ? { migrationType: '' as any, combination: '' } : {})
                  };
                  setConfig(newConfig);
                  if (plan !== 'Migrate') setCombination('');
                  onConfigurationChange(newConfig);
                  try {
                    sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                    const navState = JSON.parse(sessionStorage.getItem('cpq_navigation_state') || '{}');
                    if (plan !== 'Migrate') {
                      navState.migrationType = '';
                      navState.combination = '';
                    }
                    sessionStorage.setItem('cpq_navigation_state', JSON.stringify(navState));
                  } catch (err) { console.warn('Could not save to sessionStorage:', err); }
                };

                const selectTimeline = () => {
                  setMigrationOrTimeline('timeline');
                  setTimelineProjectionCategory('');
                  const newConfig = { ...config, migrationType: '' as any, combination: '' };
                  setConfig(newConfig);
                  setCombination('');
                  onConfigurationChange(newConfig);
                  try {
                    sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                    const navState = JSON.parse(sessionStorage.getItem('cpq_navigation_state') || '{}');
                    navState.migrationType = '';
                    navState.combination = '';
                    sessionStorage.setItem('cpq_navigation_state', JSON.stringify(navState));
                  } catch (err) { console.warn('Could not save to sessionStorage:', err); }
                };

                const tabBtn = (label: string, isActive: boolean, onClick: () => void) => (
                  <button
                    key={label}
                    type="button"
                    onClick={onClick}
                    className={`flex-1 px-3 py-3 rounded-lg font-medium transition-all duration-200 text-sm ${
                      isActive
                        ? 'bg-white text-slate-900 shadow-md border border-slate-200'
                        : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                );

                return (
                  <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 rounded-xl mb-4">
                    {tabBtn('Migrate', onMigration && activePlan === 'Migrate', () => selectServicePlan('Migrate'))}
                    {tabBtn('Manage',  onMigration && activePlan === 'Manage',  () => selectServicePlan('Manage'))}
                    {tabBtn('Bundle',  onMigration && activePlan === 'Bundle',  () => selectServicePlan('Bundle'))}
                    {tabBtn('Timeline Projection', migrationOrTimeline === 'timeline', selectTimeline)}
                  </div>
                );
              })()}

              {/* Migrate: full migration type dropdown (all combinations live here) */}
              {migrationOrTimeline === 'migration' && (config.servicePlan || 'Migrate') === 'Migrate' && (
                <select
                  value={config.migrationType}
                  onChange={(e) => {
                    const newMigrationType = e.target.value as 'Multi combination' | 'Messaging' | 'Content' | 'Email' | 'Overage Agreement';
                    const newConfig = { ...config, migrationType: newMigrationType, combination: '', timelineProjection: '', servicePlan: 'Migrate' as const };
                    setConfig(newConfig);
                    setCombination('');
                    onConfigurationChange(newConfig);
                    try {
                      sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                      const navState = JSON.parse(sessionStorage.getItem('cpq_navigation_state') || '{}');
                      navState.migrationType = newMigrationType;
                      navState.combination = '';
                      sessionStorage.setItem('cpq_navigation_state', JSON.stringify(navState));
                    } catch (err) { console.warn('Could not save to sessionStorage:', err); }
                  }}
                  className="w-full px-6 py-4 border-2 border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white hover:border-slate-300 text-base font-medium"
                >
                  <option value="">Select Migration Type</option>
                  <option value="Messaging">Messaging</option>
                  <option value="Content">Content</option>
                  <option value="Email">Email</option>
                  <option value="Multi combination">Multi combination</option>
                  <option value="Overage Agreement">Overage</option>
                </select>
              )}

              {/* Manage Standalone — collects E99 (manageUsers) and E100 (manageDataGB).
                  These are intentionally separate from B51/B56 (Migrate inputs). */}
              {migrationOrTimeline === 'migration' && config.servicePlan === 'Manage' && (
                <div className="rounded-xl border-2 border-slate-200 bg-white px-6 py-6">
                  <p className="text-sm font-semibold text-slate-800 mb-4">Manage plan inputs</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-2">
                        Number of Users <span className="text-gray-400 font-normal">[E99]</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={config.manageUsers ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          handleChange('manageUsers', v === '' ? 0 : (parseInt(v) || 0));
                        }}
                        className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-base"
                        placeholder="Enter number of users"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-2">
                        Content data size in GB <span className="text-gray-400 font-normal">[E100]</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={config.manageDataGB ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          handleChange('manageDataGB', v === '' ? 0 : (parseInt(v) || 0));
                        }}
                        className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-base"
                        placeholder="0 is valid (no data cost)"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                </div>
              )}
              {/* Bundle placeholder — Bundle reuses Migrate inputs (B51/B56) */}
              {migrationOrTimeline === 'migration' && config.servicePlan === 'Bundle' && (
                <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center">
                  <p className="text-sm font-semibold text-slate-700 mb-1">Bundle plan selected</p>
                  <p className="text-xs text-slate-500">
                    Migration type and combination selection are not required for the Bundle plan.
                  </p>
                </div>
              )}
              {/* When Timeline Projection: show option to select Content, Messaging, or Email projection */}
              {migrationOrTimeline === 'timeline' && (
                <div className="mt-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Category</label>
                  <select
                    value={timelineProjectionCategory}
                    onChange={(e) => setTimelineProjectionCategory(e.target.value as 'content' | 'messaging' | 'email' | '')}
                    className="w-full px-6 py-4 border-2 border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white hover:border-slate-300 text-base font-medium"
                  >
                    <option value="">Select projection type</option>
                    <option value="content">Content projection</option>
                    <option value="messaging">Messaging projection</option>
                    <option value="email">Email projection</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Timeline Projection: show selected category card (Content, Messaging, or Email) */}
          {migrationOrTimeline === 'timeline' && timelineProjectionCategory && (
            <div className="mt-6">
              {/* Content Migration - two tables side by side like reference UI */}
              {timelineProjectionCategory === 'content' && (() => {
                const totalSizeGB = config.dataSizeGB ?? 0;
                const noOfServers = Math.max(1, config.numberOfInstances ?? 1);
                const contentTimelineRows = getContentTimelineByServerType(totalSizeGB, noOfServers, contentSourceEnvironment, contentMigrationType);
                return (
              <div className="flex flex-wrap gap-0 border border-black overflow-hidden bg-white shadow-md max-w-4xl">
                {/* Left table: CONTENT MIGRATION */}
                <div className="flex-1 min-w-[280px] border-r border-black">
                  <div className="bg-green-500 text-white font-bold text-center py-2.5 px-3 text-sm uppercase tracking-wide border-b border-black">
                    CONTENT MIGRATION
                  </div>
                  <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr className="border-b border-black">
                        <td className="border-b border-black border-r border-black py-2 px-3 bg-white font-medium text-gray-900">Source Environment</td>
                        <td className="border-b border-black py-2 px-3 bg-white">
                          <select
                            value={contentSourceEnvironment}
                            onChange={(e) => setContentSourceEnvironment(e.target.value as SourceEnvironment)}
                            className="w-full min-w-0 py-1 px-2 border border-gray-300 rounded text-gray-900 bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                          >
                            <option value="Citrix/Egnyte/Fileshare/Box/DropBox">Citrix/Egnyte/Fileshare/Box/DropBox</option>
                            <option value="Others">Others</option>
                          </select>
                        </td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-b border-black border-r border-black py-2 px-3 bg-white font-medium text-gray-900">Total Size to be Migrated in GB</td>
                        <td className="border-b border-black py-2 px-3 bg-white">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={totalSizeGB || ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              const num = v === '' ? 0 : Math.max(0, parseInt(v, 10) || 0);
                              handleChange('dataSizeGB', num);
                            }}
                            className="w-full min-w-0 py-1 px-2 border border-gray-300 rounded text-gray-900 bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                            placeholder="e.g. 7000"
                          />
                        </td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-b border-black border-r border-black py-2 px-3 bg-white font-medium text-gray-900">Migration Type</td>
                        <td className="border-b border-black py-2 px-3 bg-white">
                          <select
                            value={contentMigrationType}
                            onChange={(e) => setContentMigrationType(e.target.value as ContentMigrationType)}
                            className="w-full min-w-0 py-1 px-2 border border-gray-300 rounded text-gray-900 bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                          >
                            <option value="Data & Root Permissions Only">Data & Root Permissions Only</option>
                            <option value="Data, Root & Sub-Folder permissions, Hyperlinks">Data, Root & Sub-Folder permissions, Hyperlinks</option>
                          </select>
                        </td>
                      </tr>
                      <tr>
                        <td className="border-r border-black py-2 px-3 bg-white font-medium text-gray-900">No of Servers</td>
                        <td className="py-2 px-3 bg-white">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={noOfServers}
                            onChange={(e) => {
                              const v = e.target.value;
                              const num = v === '' ? 1 : Math.max(1, parseInt(v, 10) || 1);
                              handleChange('numberOfInstances', num);
                            }}
                            className="w-full min-w-0 py-1 px-2 border border-gray-300 rounded text-gray-900 bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {/* Right table: Server Type | Days */}
                <div className="w-64 min-w-[200px]">
                  <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th className="bg-blue-800 text-white font-bold text-left py-2.5 px-3 border-b border-black border-r border-black">Server Type</th>
                        <th className="bg-blue-800 text-white font-bold text-left py-2.5 px-3 border-b border-black">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contentTimelineRows.map(({ serverType, days }, i) => (
                        <tr key={serverType}>
                          <td className="border-b border-black border-r border-black py-2 px-3 bg-sky-100 text-gray-900">{formatServerTypeLabel(serverType)}</td>
                          <td className="border-b border-black py-2 px-3 bg-white">{days}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
                );
              })()}

              {/* Messaging Migration */}
              {timelineProjectionCategory === 'messaging' && (
              <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-lg bg-white">
                <div className="bg-blue-600 text-white font-bold text-center py-3 px-4 text-sm uppercase tracking-wide">
                  Messaging Migration
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex justify-between text-sm border-b border-gray-100 pb-2">
                    <span className="text-gray-600">Source Environment</span>
                    <span className="font-medium">—</span>
                  </div>
                  <div className="flex justify-between text-sm border-b border-gray-100 pb-2">
                    <span className="text-gray-600">Total Size / Messages</span>
                    <span className="font-medium">—</span>
                  </div>
                  <div className="flex justify-between text-sm border-b border-gray-100 pb-2">
                    <span className="text-gray-600">Migration Type</span>
                    <span className="font-medium text-right text-xs">Messages, Channels, Permissions</span>
                  </div>
                  <div className="flex justify-between text-sm pb-2">
                    <span className="text-gray-600">No of Servers</span>
                    <span className="font-medium">—</span>
                  </div>
                </div>
                <div className="border-t border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-700 text-white">
                        <th className="text-left py-2 px-3 font-semibold">Server Type</th>
                        <th className="text-left py-2 px-3 font-semibold">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-100"><td className="py-2 px-3">Small</td><td className="py-2 px-3">17</td></tr>
                      <tr className="border-b border-gray-100"><td className="py-2 px-3">Standard</td><td className="py-2 px-3">11</td></tr>
                      <tr className="border-b border-gray-100"><td className="py-2 px-3">Large</td><td className="py-2 px-3">7</td></tr>
                      <tr><td className="py-2 px-3">Extra Large (Bare Metal)</td><td className="py-2 px-3">5</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              )}

              {/* Email Migration */}
              {timelineProjectionCategory === 'email' && (
              <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-lg bg-white">
                <div className="bg-amber-600 text-white font-bold text-center py-3 px-4 text-sm uppercase tracking-wide">
                  Email Migration
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex justify-between text-sm border-b border-gray-100 pb-2">
                    <span className="text-gray-600">Source Environment</span>
                    <span className="font-medium">—</span>
                  </div>
                  <div className="flex justify-between text-sm border-b border-gray-100 pb-2">
                    <span className="text-gray-600">Total Mailboxes</span>
                    <span className="font-medium">—</span>
                  </div>
                  <div className="flex justify-between text-sm border-b border-gray-100 pb-2">
                    <span className="text-gray-600">Migration Type</span>
                    <span className="font-medium text-right text-xs">Mailboxes, Folders, Rules</span>
                  </div>
                  <div className="flex justify-between text-sm pb-2">
                    <span className="text-gray-600">No of Servers</span>
                    <span className="font-medium">—</span>
                  </div>
                </div>
                <div className="border-t border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-700 text-white">
                        <th className="text-left py-2 px-3 font-semibold">Server Type</th>
                        <th className="text-left py-2 px-3 font-semibold">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-100"><td className="py-2 px-3">Small</td><td className="py-2 px-3">17</td></tr>
                      <tr className="border-b border-gray-100"><td className="py-2 px-3">Standard</td><td className="py-2 px-3">11</td></tr>
                      <tr className="border-b border-gray-100"><td className="py-2 px-3">Large</td><td className="py-2 px-3">7</td></tr>
                      <tr><td className="py-2 px-3">Extra Large (Bare Metal)</td><td className="py-2 px-3">5</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">

          {/* Template Selection - Show when migration type is selected (Messaging, Content, Email, Multi combination, Overage) */}
          {config.migrationType && (
            <div data-section="template-selection" className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl shadow-lg border border-purple-200 p-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Select Combination</h3>
                <p className="text-gray-600">Choose a combination for your {config.migrationType === 'Multi combination' ? 'multi combination' : config.migrationType.toLowerCase()} migration quote</p>
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
                      {/* Messaging combinations - from API (Combination Manager) or fallback hardcoded */}
                      {config.migrationType === 'Messaging' && (() => {
                        const fromApi = apiCombinations.filter(c => c.migrationType === 'Messaging');
                        const messagingCombinations = fromApi.length > 0 ? fromApi : [
                          { value: 'slack-to-teams', label: 'SLACK TO TEAMS' },
                          { value: 'slack-to-google-chat', label: 'SLACK TO GOOGLE CHAT' },
                          { value: 'teams-to-slack', label: 'TEAMS TO SLACK' }
                        ];
                        const filtered = messagingCombinations.filter(combo =>
                          combo.label.toLowerCase().includes(combinationSearch.toLowerCase())
                        );
                        return filtered.map(combo => (
                          <option key={combo.value} value={combo.value}>{combo.label}</option>
                        ));
                      })()}
                      {/* Content combinations - from API or fallback hardcoded */}
                      {config.migrationType === 'Content' && (() => {
                        const fromApi = apiCombinations.filter(c => c.migrationType === 'Content');
                        const contentCombinationsDefault = [
                          { value: 'dropbox-to-google', label: 'DROPBOX TO GOOGLE (SHARED DRIVE/MYDRIVE)' },
                          { value: 'dropbox-to-microsoft', label: 'DROPBOX TO MICROSOFT (ONEDRIVE/SHAREPOINT)' },
                          { value: 'dropbox-to-box', label: 'DROPBOX TO BOX' },
                          { value: 'dropbox-to-onedrive', label: 'DROPBOX TO ONEDRIVE' },
                          { value: 'dropbox-to-egnyte', label: 'DROPBOX TO EGNYTE' },
                          { value: 'box-to-box', label: 'BOX TO BOX' },
                          { value: 'box-to-dropbox', label: 'BOX TO DROPBOX' },
                          { value: 'box-to-sharefile', label: 'BOX TO SHAREFILE' },
                          { value: 'box-to-google-mydrive', label: 'BOX TO GOOGLE MYDRIVE & SHARED DRIVE' },
                          { value: 'box-to-aws-s3', label: 'BOX TO AWS S3' },
                          { value: 'box-to-microsoft', label: 'BOX TO MICROSOFT (ONEDRIVE/SHAREPOINT)' },
                          { value: 'box-to-sharepoint', label: 'BOX TO SHAREPOINT' },
                          { value: 'box-to-google-sharedrive', label: 'BOX TO GOOGLE SHARED DRIVE' },
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
                          { value: 'onedrive-to-onedrive', label: 'ONEDRIVE TO ONEDRIVE' },
                          { value: 'onedrive-to-google-mydrive', label: 'ONEDRIVE TO GOOGLE MYDRIVE' },
                          { value: 'sharefile-to-google-mydrive', label: 'SHAREFILE TO GOOGLE MYDRIVE' },
                          { value: 'sharefile-to-google-sharedrive', label: 'SHAREFILE TO GOOGLE SHARED DRIVE' },
                          { value: 'sharefile-to-onedrive', label: 'SHAREFILE TO ONEDRIVE' },
                          { value: 'sharefile-to-sharepoint', label: 'SHAREFILE TO SHAREPOINT' },
                          { value: 'sharepoint-online-to-google-sharedrive', label: 'SHAREPOINT ONLINE TO GOOGLE SHARED DRIVE' },
                          { value: 'sharepoint-online-to-egnyte', label: 'SHAREPOINT ONLINE TO EGNYTE' },
                          { value: 'sharefile-to-sharefile', label: 'SHAREFILE TO SHAREFILE' },
                          { value: 'nfs-to-google', label: 'NFS TO GOOGLE (MYDRIVE/SHARED DRIVE)' },
                          { value: 'nfs-to-microsoft', label: 'NFS TO MICROSOFT (ONEDRIVE/SHAREPOINT)' },
                          { value: 'egnyte-to-google', label: 'EGNYTE TO GOOGLE (SHARED DRIVE / MYDRIVE)' },
                          { value: 'egnyte-to-google-sharedrive', label: 'EGNYTE TO GOOGLE SHARED DRIVE' },
                          { value: 'egnyte-to-microsoft', label: 'EGNYTE TO MICROSOFT (ONEDRIVE/SHAREPOINT)' }
                        ];
                        const contentCombinations = fromApi.length > 0 ? fromApi : contentCombinationsDefault;
                        const filtered = contentCombinations.filter(combo =>
                          combo.label.toLowerCase().includes(combinationSearch.toLowerCase())
                        );
                        return filtered.map(combo => (
                          <option key={combo.value} value={combo.value}>{combo.label}</option>
                        ));
                      })()}
                      {/* Email combinations - from API or fallback */}
                      {config.migrationType === 'Email' && (() => {
                        const fromApi = apiCombinations.filter(c => c.migrationType === 'Email');
                        const emailCombinations = fromApi.length > 0 ? fromApi : [
                          { value: 'gmail-to-outlook', label: 'GMAIL TO OUTLOOK' },
                          { value: 'gmail-to-gmail', label: 'GMAIL TO GMAIL' },
                          { value: 'outlook-to-outlook', label: 'OUTLOOK TO OUTLOOK' },
                          { value: 'outlook-to-gmail', label: 'OUTLOOK TO GMAIL' }
                        ];
                        const filtered = emailCombinations.filter(combo =>
                          combo.label.toLowerCase().includes(combinationSearch.toLowerCase())
                        );
                        return filtered.map(combo => (
                          <option key={combo.value} value={combo.value}>{combo.label}</option>
                        ));
                      })()}
                      {/* Overage Agreement - from API or fallback */}
                      {config.migrationType === 'Overage Agreement' && (() => {
                        const fromApi = apiCombinations.filter(c => c.migrationType === 'Overage Agreement');
                        const overageCombinations = fromApi.length > 0 ? fromApi : [
                          { value: 'overage-agreement', label: 'OVERAGE AGREEMENT' }
                        ];
                        const filtered = overageCombinations.filter(combo =>
                          combo.label.toLowerCase().includes(combinationSearch.toLowerCase())
                        );
                        return filtered.map(combo => (
                          <option key={combo.value} value={combo.value}>{combo.label}</option>
                        ));
                      })()}
                      {/* Multi combination - from API or fallback */}
                      {config.migrationType === 'Multi combination' && (() => {
                        const fromApi = apiCombinations.filter(c => c.migrationType === 'Multi combination');
                        const multiCombinationOptions = fromApi.length > 0 ? fromApi : [
                          { value: 'multi-combination', label: 'ORIGINAL MULTI COMBINATION' }
                        ];
                        const filtered = multiCombinationOptions.filter(combo =>
                          combo.label.toLowerCase().includes(combinationSearch.toLowerCase())
                        );
                        return filtered.map(combo => (
                          <option key={combo.value} value={combo.value}>{combo.label}</option>
                        ));
                      })()}
                    </select>
                    
                    {/* Show filtered count - uses same API-or-fallback as dropdown */}
                    {combinationSearch && (
                      <div className="mt-2 text-sm text-purple-600">
                        {(() => {
                          const msg = apiCombinations.filter(c => c.migrationType === 'Messaging');
                          const messagingCombinations = msg.length > 0 ? msg : [{ value: 'slack-to-teams', label: 'SLACK TO TEAMS' }, { value: 'slack-to-google-chat', label: 'SLACK TO GOOGLE CHAT' }, { value: 'teams-to-slack', label: 'TEAMS TO SLACK' }];
                          const cont = apiCombinations.filter(c => c.migrationType === 'Content');
                          const contentCombinations = cont.length > 0 ? cont : [{ value: 'dropbox-to-google', label: 'DROPBOX TO GOOGLE' }];
                          const eml = apiCombinations.filter(c => c.migrationType === 'Email');
                          const emailCombinations = eml.length > 0 ? eml : [{ value: 'gmail-to-outlook', label: 'GMAIL TO OUTLOOK' }, { value: 'gmail-to-gmail', label: 'GMAIL TO GMAIL' }, { value: 'outlook-to-outlook', label: 'OUTLOOK TO OUTLOOK' }, { value: 'outlook-to-gmail', label: 'OUTLOOK TO GMAIL' }];
                          const ov = apiCombinations.filter(c => c.migrationType === 'Overage Agreement');
                          const overageCombinations = ov.length > 0 ? ov : [{ value: 'overage-agreement', label: 'OVERAGE AGREEMENT' }];
                          const multi = apiCombinations.filter(c => c.migrationType === 'Multi combination');
                          const multiCombinationOptions = multi.length > 0 ? multi : [{ value: 'multi-combination', label: 'ORIGINAL MULTI COMBINATION' }];
                          let allCombinations: { value: string; label: string }[] = [];
                          if (config.migrationType === 'Messaging') allCombinations = messagingCombinations;
                          else if (config.migrationType === 'Content') allCombinations = contentCombinations;
                          else if (config.migrationType === 'Email') allCombinations = emailCombinations;
                          else if (config.migrationType === 'Overage Agreement') allCombinations = overageCombinations;
                          else if (config.migrationType === 'Multi combination') allCombinations = multiCombinationOptions;
                          const filtered = allCombinations.filter(combo => combo.label.toLowerCase().includes(combinationSearch.toLowerCase()));
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

          {/* Exhibits selection - ONLY show for Multi combination after a combination is selected (e.g. Original Multi combination) */}
          {config.migrationType === 'Multi combination' && config.combination && (
            <div data-section="exhibits-selection">
              <ExhibitSelector
                combination={config.combination || 'multi-combination'}
                selectedExhibits={selectedExhibits}
                onExhibitsChange={onExhibitsChange}
                // Multi-combination can include multiple migrations with different tiers.
                // Don't filter exhibit list by a single global tier selection.
                selectedTier={null}
              />
            </div>
          )}

          {/* Common Customer Location (Region) — Multi combination shared field */}
          {config.migrationType === 'Multi combination' && config.combination && Array.isArray(selectedExhibits) && selectedExhibits.length > 0 && (
            <div className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-xl shadow-md border-2 border-sky-200 p-6 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-sky-500 rounded-full flex items-center justify-center shadow-lg">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <label className="block text-base font-bold text-gray-900 mb-1">
                    Customer Location
                  </label>
                  <p className="text-sm text-gray-600 mb-3">
                    Region multiplier applied to all combinations in this multi-migration.
                  </p>
                  <select
                    value={config.customerLocation || '1'}
                    onChange={(e) => handleChange('customerLocation', e.target.value as '1' | '0.8' | '0.65')}
                    className="w-full max-w-md px-4 py-3 border-2 border-sky-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all bg-white text-base font-medium shadow-sm hover:border-sky-400"
                  >
                    <option value="1">Region 1 — US, Canada, UK (x1.0)</option>
                    <option value="0.8">Region 2 — AUS, NZ, EU (x0.8)</option>
                    <option value="0.65">Region 3 — Rest of World (x0.65)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Common Instance Type Selector - appears after exhibits are selected */}
          {config.migrationType === 'Multi combination' && config.combination && Array.isArray(selectedExhibits) && selectedExhibits.length > 0 && (() => {
            // Calculate if all instance types are the same
            const allInstanceTypes: string[] = [
              ...(config.messagingConfigs || []).map(cfg => cfg.instanceType || 'Small'),
              ...(config.contentConfigs || []).map(cfg => cfg.instanceType || 'Small'),
              ...(config.emailConfigs || []).map(cfg => cfg.instanceType || 'Small')
            ];
            const uniqueTypes = Array.from(new Set(allInstanceTypes.filter(Boolean)));
            const allSame = uniqueTypes.length <= 1;
            const commonValue = allSame && uniqueTypes.length > 0 ? uniqueTypes[0] : (sharedInstanceType || 'Small');
            const displayValue = allSame ? commonValue : 'Mixed';
            
            return (
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl shadow-md border-2 border-purple-200 p-6 mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                    <Server className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-base font-bold text-gray-900 mb-1">
                      Common Instance Type
                    </label>
                    <p className="text-sm text-gray-600 mb-3">
                      Quick-set: Apply the same instance type to all panels at once. You can also set different instance types using the dropdowns in each panel below.
                    </p>
                    <select
                      value={displayValue}
                      onChange={(e) => {
                        const value = e.target.value as any;
                        if (value === 'Mixed') return; // Don't allow selecting "Mixed"
                        setSharedInstanceType(value);
                        setConfig(prev => {
                          const newConfig = {
                            ...prev,
                            // Update all messaging configs
                            messagingConfigs: (prev.messagingConfigs || []).map(cfg => ({
                              ...cfg,
                              instanceType: value
                            })),
                            // Update all content configs
                            contentConfigs: (prev.contentConfigs || []).map(cfg => ({
                              ...cfg,
                              instanceType: value
                            })),
                            // Update all email configs
                            emailConfigs: (prev.emailConfigs || []).map(cfg => ({
                              ...cfg,
                              instanceType: value
                            })),
                          };
                          // Explicitly save to sessionStorage
                          try {
                            sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                          } catch (e) {
                            console.warn('Could not save config:', e);
                          }
                          onConfigurationChange(newConfig);
                          return newConfig;
                        });
                      }}
                      className="w-full max-w-xs px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-base font-medium shadow-sm hover:border-purple-400"
                    >
                      {!allSame && <option value="Mixed" disabled>Mixed (use individual panels below)</option>}
                      <option value="Small">Small</option>
                      <option value="Standard">Standard</option>
                      <option value="Large">Large</option>
                      <option value="Extra Large">Extra Large</option>
                    </select>
                    {!allSame && (
                      <p className="text-xs text-amber-600 mt-2 font-medium">
                        ⚠️ Panels have different instance types. Use this selector to sync them all, or set them individually below.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* MULTI COMBINATION: Show separate sections for Messaging, Content, and Email */}
          {config.migrationType === 'Multi combination' && config.combination && Array.isArray(selectedExhibits) && selectedExhibits.length > 0 && (
            <>

              {/* Messaging Project Configuration Section - one card per messaging exhibit */}
              {selectedExhibitCategories.hasMessaging && (config.messagingConfigs || []).map((messagingCfg, messagingIndex) => {
                // Get or initialize tier for this messaging config
                // Use planType from config if available, otherwise default to Standard
                const planTypeFromConfig = (messagingCfg as any).planType;
                const defaultTierName = planTypeFromConfig 
                  ? planTypeFromConfig.charAt(0).toUpperCase() + planTypeFromConfig.slice(1)
                  : 'Standard';
                const currentTier = messagingTiers[messagingCfg.exhibitId] || 
                  PRICING_TIERS.find(t => t.name === defaultTierName) || 
                  PRICING_TIERS.find(t => t.name === 'Standard') || 
                  PRICING_TIERS[1];
                
                // Calculate pricing for this messaging configuration
                const messagingConfigData: ConfigurationData = {
                  numberOfUsers: messagingCfg.numberOfUsers || 0,
                  instanceType: messagingCfg.instanceType || 'Small',
                  numberOfInstances: messagingCfg.numberOfInstances || 0,
                  duration: messagingCfg.duration || 0,
                  messages: messagingCfg.messages || 0,
                  dataSizeGB: 0, // Not used for messaging
                  combination: messagingCfg.exhibitName || '',
                  migrationType: 'messaging' as any
                };
                
                const pricing = calculateCombinationPricing(
                  messagingCfg.exhibitName || '',
                  'messaging',
                  messagingConfigData,
                  currentTier
                ) || {
                  userCost: 0,
                  migrationCost: 0,
                  instanceCost: 0,
                  totalCost: 0
                };
                
                const sectionId = `messaging-${messagingCfg.exhibitId}`;
                const isCollapsed = collapsedSections.has(sectionId);
                
                return (
                <div
                  key={messagingCfg.exhibitId}
                  data-section={`messaging-configuration-${messagingCfg.exhibitId}`}
                  className="bg-white rounded-xl shadow-lg border border-gray-100 p-4 mb-4"
                >
                  {/* Header with white background */}
                  <div className="bg-white border border-gray-200 rounded-lg p-2 mb-3 -mx-1 -mt-1 shadow-sm">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionId)}
                        className="flex items-center gap-2 flex-1 text-left cursor-pointer hover:bg-gray-50 transition-all duration-200 rounded-lg p-1 -m-1"
                      >
                        <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center transition-transform duration-200 hover:scale-110">
                          <MessageSquare className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900 mb-0.5 transition-colors duration-200">Project Configuration – {messagingCfg.exhibitName}</h3>
                          <p className="text-[10px] text-gray-600 transition-colors duration-200">Configure your messaging migration requirements for this exhibit.</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionId)}
                        className="flex items-center justify-center w-6 h-6 hover:bg-gray-100 rounded transition-all duration-200 hover:scale-110"
                        aria-label={isCollapsed ? "Expand section" : "Collapse section"}
                      >
                        <ChevronDown className={`w-3.5 h-3.5 text-gray-700 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`} />
                      </button>
                    </div>
                  </div>
                  
                  {!isCollapsed && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left Column: Configuration Inputs in 2 columns */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Left Column of Inputs */}
                      <div className="space-y-6">
                        {/* Messaging: Number of Users */}
                        <div className="group">
                          <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                            <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                              <Users className="w-4 h-4 text-white" />
                            </div>
                            Number of Users
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={messagingCfg.numberOfUsers || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              const numValue = value === '' ? 0 : parseInt(value) || 0;
                              setConfig(prev => {
                                const newConfig = {
                                  ...prev,
                                  messagingConfigs: (prev.messagingConfigs || []).map((cfg, i) =>
                                    i === messagingIndex ? { ...cfg, numberOfUsers: numValue } : cfg
                                  ),
                                };
                                // Explicitly save to sessionStorage
                                try {
                                  sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                                } catch (e) {
                                  console.warn('Could not save config:', e);
                                }
                                onConfigurationChange(newConfig);
                                return newConfig;
                              });
                            }}
                            className="w-full px-4 py-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-base"
                            placeholder="Enter number of users"
                            autoComplete="off"
                          />
                        </div>

                        {/* Messaging: Number of Instances */}
                        <div className="group">
                          <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                            <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                              <Server className="w-4 h-4 text-white" />
                            </div>
                            Number of Instances
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={messagingCfg.numberOfInstances || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              const numValue = value === '' ? 0 : parseInt(value) || 0;
                              setConfig(prev => {
                                const newConfig = {
                                  ...prev,
                                  messagingConfigs: (prev.messagingConfigs || []).map((cfg, i) =>
                                    i === messagingIndex ? { ...cfg, numberOfInstances: numValue } : cfg
                                  ),
                                };
                                // Explicitly save to sessionStorage
                                try {
                                  sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                                } catch (e) {
                                  console.warn('Could not save config:', e);
                                }
                                onConfigurationChange(newConfig);
                                return newConfig;
                              });
                            }}
                            className="w-full px-4 py-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-base"
                            placeholder="Enter number of instances"
                            autoComplete="off"
                          />
                        </div>

                        {/* Messaging: Messages (required) */}
                        <div className="group">
                          <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                            <div className="w-8 h-8 bg-teal-500 rounded-full flex items-center justify-center">
                              <MessageSquare className="w-4 h-4 text-white" />
                            </div>
                            Messages
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={messagingCfg.messages || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              const numValue = value === '' ? 0 : parseInt(value) || 0;
                              setConfig(prev => {
                                const newConfig = {
                                  ...prev,
                                  messagingConfigs: (prev.messagingConfigs || []).map((cfg, i) =>
                                    i === messagingIndex ? { ...cfg, messages: numValue } : cfg
                                  ),
                                };
                                // Explicitly save to sessionStorage
                                try {
                                  sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                                } catch (e) {
                                  console.warn('Could not save config:', e);
                                }
                                onConfigurationChange(newConfig);
                                return newConfig;
                              });
                            }}
                            className="w-full px-4 py-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-base"
                            placeholder="Enter number of messages"
                            autoComplete="off"
                          />
                          <p className="text-xs text-gray-500 mt-2">Number of messages for the messaging migration.</p>
                        </div>
                      </div>

                      {/* Right Column of Inputs */}
                      <div className="space-y-6">
                        {/* Messaging: Instance Type */}
                        <div className="group">
                          <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                              <Server className="w-4 h-4 text-white" />
                            </div>
                            Instance Type
                          </label>
                          <select
                            value={messagingCfg.instanceType || 'Small'}
                            onChange={(e) => {
                              const value = e.target.value as any;
                              setConfig(prev => {
                                const newConfig = {
                                  ...prev,
                                  messagingConfigs: (prev.messagingConfigs || []).map((cfg, i) =>
                                    i === messagingIndex ? { ...cfg, instanceType: value } : cfg
                                  ),
                                };
                                // Explicitly save to sessionStorage
                                try {
                                  sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                                } catch (e) {
                                  console.warn('Could not save config:', e);
                                }
                                onConfigurationChange(newConfig);
                                return newConfig;
                              });
                            }}
                            className="w-full px-4 py-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-base"
                          >
                            <option value="Small">Small</option>
                            <option value="Standard">Standard</option>
                            <option value="Large">Large</option>
                            <option value="Extra Large">Extra Large</option>
                          </select>
                        </div>

                        {/* Messaging: Duration */}
                        <div className="group">
                          <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                            <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                              <Clock className="w-4 h-4 text-white" />
                            </div>
                            Duration (Months)
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={messagingCfg.duration || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              const numValue = value === '' ? 0 : parseInt(value) || 0;
                              setConfig(prev => {
                                const newConfig = {
                                  ...prev,
                                  messagingConfigs: (prev.messagingConfigs || []).map((cfg, i) =>
                                    i === messagingIndex ? { ...cfg, duration: numValue } : cfg
                                  ),
                                };
                                // Explicitly save to sessionStorage
                                try {
                                  sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                                } catch (e) {
                                  console.warn('Could not save config:', e);
                                }
                                onConfigurationChange(newConfig);
                                return newConfig;
                              });
                            }}
                            className="w-full px-4 py-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-base"
                            placeholder="Enter duration"
                            autoComplete="off"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Pricing Section */}
                    <div className="bg-blue-50/30 rounded-lg border border-blue-200 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-bold text-gray-900">Pricing</h4>
                        <select
                          value={currentTier.name}
                          onChange={(e) => {
                            const selectedTier = PRICING_TIERS.find(t => t.name === e.target.value) || PRICING_TIERS[1];
                            setMessagingTiers(prev => {
                              const updated = {
                                ...prev,
                                [messagingCfg.exhibitId]: selectedTier
                              };
                              // Save tier selections to sessionStorage
                              try {
                                const savedTiers = sessionStorage.getItem('cpq_combination_tiers');
                                const tiersData = savedTiers ? JSON.parse(savedTiers) : {};
                                tiersData.messagingTiers = updated;
                                sessionStorage.setItem('cpq_combination_tiers', JSON.stringify(tiersData));
                              } catch (e) {
                                console.warn('Could not save messaging tiers:', e);
                              }
                              return updated;
                            });
                          }}
                          className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          {PRICING_TIERS.map(tier => (
                            <option key={tier.id} value={tier.name}>{tier.name} Plan</option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">User Cost:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(pricing.userCost)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">Migration Cost:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(pricing.migrationCost)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">Instance Cost:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(pricing.instanceCost)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm bg-blue-100 rounded p-3 mt-4">
                          <span className="font-bold text-gray-900">Subtotal:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(pricing.totalCost)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              );
              })}

              {/* Content Project Configuration Section - one card per content exhibit */}
              {selectedExhibitCategories.hasContent && (config.contentConfigs || []).map((contentCfg, contentIndex) => {
                // Get or initialize tier for this content config
                // Use planType from config if available, otherwise default to Standard
                const planTypeFromConfig = (contentCfg as any).planType;
                const defaultTierName = planTypeFromConfig 
                  ? planTypeFromConfig.charAt(0).toUpperCase() + planTypeFromConfig.slice(1)
                  : 'Standard';
                const currentTier = contentTiers[contentCfg.exhibitId] || 
                  PRICING_TIERS.find(t => t.name === defaultTierName) || 
                  PRICING_TIERS.find(t => t.name === 'Standard') || 
                  PRICING_TIERS[1];
                
                // Calculate pricing for this content configuration
                const contentConfigData: ConfigurationData = {
                  numberOfUsers: contentCfg.numberOfUsers || 0,
                  instanceType: contentCfg.instanceType || 'Small',
                  numberOfInstances: contentCfg.numberOfInstances || 0,
                  duration: contentCfg.duration || 0,
                  dataSizeGB: contentCfg.dataSizeGB || 0,
                  combination: contentCfg.exhibitName || '',
                  migrationType: 'content' as any
                };
                
                const pricing = calculateCombinationPricing(
                  contentCfg.exhibitName || '',
                  'content',
                  contentConfigData,
                  currentTier
                );
                
                const sectionId = `content-${contentCfg.exhibitId}`;
                const isCollapsed = collapsedSections.has(sectionId);
                
                return (
                <div
                  key={contentCfg.exhibitId}
                  data-section={`content-configuration-${contentCfg.exhibitId}`}
                  className="bg-white rounded-xl shadow-lg border border-gray-100 p-4 mb-4"
                >
                  {/* Header with white background */}
                  <div className="bg-white border border-gray-200 rounded-lg p-2 mb-3 -mx-1 -mt-1 shadow-sm">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionId)}
                        className="flex items-center gap-2 flex-1 text-left cursor-pointer hover:bg-gray-50 transition-all duration-200 rounded-lg p-1 -m-1"
                      >
                        <div className="w-6 h-6 bg-emerald-500 rounded flex items-center justify-center transition-transform duration-200 hover:scale-110">
                          <Database className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900 mb-0.5 transition-colors duration-200">{contentCfg.exhibitName}</h3>
                          <p className="text-[10px] text-gray-600 transition-colors duration-200">Configure your content migration requirements for this exhibit.</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionId)}
                        className="flex items-center justify-center w-6 h-6 hover:bg-gray-100 rounded transition-all duration-200 hover:scale-110"
                        aria-label={isCollapsed ? "Expand section" : "Collapse section"}
                      >
                        <ChevronDown className={`w-3.5 h-3.5 text-gray-700 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`} />
                      </button>
                    </div>
                  </div>
                  
                  {!isCollapsed && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left Column: Configuration Inputs in 2 columns */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Left Column of Inputs */}
                      <div className="space-y-6">
                        {/* Content: Number of Users */}
                        <div className="group">
                          <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                            <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                              <Users className="w-4 h-4 text-white" />
                            </div>
                            Number of Users
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={contentCfg.numberOfUsers || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              const numValue = value === '' ? 0 : parseInt(value) || 0;
                              setConfig(prev => {
                                const newConfig = {
                                  ...prev,
                                  contentConfigs: (prev.contentConfigs || []).map((cfg, i) =>
                                    i === contentIndex ? { ...cfg, numberOfUsers: numValue } : cfg
                                  ),
                                };
                                // Explicitly save to sessionStorage
                                try {
                                  sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                                } catch (e) {
                                  console.warn('Could not save config:', e);
                                }
                                onConfigurationChange(newConfig);
                                return newConfig;
                              });
                            }}
                            className="w-full px-4 py-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-base"
                            placeholder="Enter number of users"
                            autoComplete="off"
                          />
                        </div>

                        {/* Content: Number of Instances */}
                        <div className="group">
                          <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                            <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                              <Server className="w-4 h-4 text-white" />
                            </div>
                            Number of Instances
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={contentCfg.numberOfInstances || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              const numValue = value === '' ? 0 : parseInt(value) || 0;
                              setConfig(prev => {
                                const newConfig = {
                                  ...prev,
                                  contentConfigs: (prev.contentConfigs || []).map((cfg, i) =>
                                    i === contentIndex ? { ...cfg, numberOfInstances: numValue } : cfg
                                  ),
                                };
                                // Explicitly save to sessionStorage
                                try {
                                  sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                                } catch (e) {
                                  console.warn('Could not save config:', e);
                                }
                                onConfigurationChange(newConfig);
                                return newConfig;
                              });
                            }}
                            className="w-full px-4 py-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-base"
                            placeholder="Enter number of instances"
                            autoComplete="off"
                          />
                        </div>

                        {/* Content: Data Size (required) */}
                        <div className="group">
                          <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                            <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                              <Database className="w-4 h-4 text-white" />
                            </div>
                            Data Size (GB)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={contentCfg.dataSizeGB || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              const numValue = value === '' ? 0 : parseInt(value) || 0;
                              setConfig(prev => {
                                const newConfig = {
                                  ...prev,
                                  contentConfigs: (prev.contentConfigs || []).map((cfg, i) =>
                                    i === contentIndex ? { ...cfg, dataSizeGB: numValue } : cfg
                                  ),
                                };
                                // Explicitly save to sessionStorage
                                try {
                                  sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                                } catch (e) {
                                  console.warn('Could not save config:', e);
                                }
                                onConfigurationChange(newConfig);
                                return newConfig;
                              });
                            }}
                            className="w-full px-4 py-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-base"
                            placeholder="Enter data size in GB"
                            autoComplete="off"
                          />
                          <p className="text-xs text-gray-500 mt-2">Total data size for the content migration.</p>
                        </div>
                      </div>

                      {/* Right Column of Inputs */}
                      <div className="space-y-6">
                        {/* Content: Instance Type */}
                        <div className="group">
                          <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                              <Server className="w-4 h-4 text-white" />
                            </div>
                            Instance Type
                          </label>
                          <select
                            value={contentCfg.instanceType || 'Small'}
                            onChange={(e) => {
                              const value = e.target.value as any;
                              setConfig(prev => {
                                const newConfig = {
                                  ...prev,
                                  contentConfigs: (prev.contentConfigs || []).map((cfg, i) =>
                                    i === contentIndex ? { ...cfg, instanceType: value } : cfg
                                  ),
                                };
                                // Explicitly save to sessionStorage
                                try {
                                  sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                                } catch (e) {
                                  console.warn('Could not save config:', e);
                                }
                                onConfigurationChange(newConfig);
                                return newConfig;
                              });
                            }}
                            className="w-full px-4 py-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-base"
                          >
                            <option value="Small">Small</option>
                            <option value="Standard">Standard</option>
                            <option value="Large">Large</option>
                            <option value="Extra Large">Extra Large</option>
                          </select>
                        </div>

                        {/* Content: Duration */}
                        <div className="group">
                          <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                            <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                              <Clock className="w-4 h-4 text-white" />
                            </div>
                            Duration (Months)
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={contentCfg.duration || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              const numValue = value === '' ? 0 : parseInt(value) || 0;
                              setConfig(prev => {
                                const newConfig = {
                                  ...prev,
                                  contentConfigs: (prev.contentConfigs || []).map((cfg, i) =>
                                    i === contentIndex ? { ...cfg, duration: numValue } : cfg
                                  ),
                                };
                                // Explicitly save to sessionStorage
                                try {
                                  sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                                } catch (e) {
                                  console.warn('Could not save config:', e);
                                }
                                onConfigurationChange(newConfig);
                                return newConfig;
                              });
                            }}
                            className="w-full px-4 py-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-base"
                            placeholder="Enter duration"
                            autoComplete="off"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Pricing Section */}
                    <div className="bg-emerald-50/30 rounded-lg border border-emerald-200 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-bold text-gray-900">Pricing</h4>
                        <select
                          value={currentTier.name}
                          onChange={(e) => {
                            const selectedTier = PRICING_TIERS.find(t => t.name === e.target.value) || PRICING_TIERS[1];
                            setContentTiers(prev => {
                              const updated = {
                                ...prev,
                                [contentCfg.exhibitId]: selectedTier
                              };
                              // Save tier selections to sessionStorage
                              try {
                                const savedTiers = sessionStorage.getItem('cpq_combination_tiers');
                                const tiersData = savedTiers ? JSON.parse(savedTiers) : {};
                                tiersData.contentTiers = updated;
                                sessionStorage.setItem('cpq_combination_tiers', JSON.stringify(tiersData));
                              } catch (e) {
                                console.warn('Could not save content tiers:', e);
                              }
                              return updated;
                            });
                          }}
                          className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        >
                          {PRICING_TIERS.map(tier => (
                            <option key={tier.id} value={tier.name}>{tier.name} Plan</option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">User Cost:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(pricing.userCost)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">Data Cost:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(pricing.dataCost)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">Migration Cost:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(pricing.migrationCost)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">Instance Cost:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(pricing.instanceCost)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm bg-blue-100 rounded p-3 mt-4">
                          <span className="font-bold text-gray-900">Subtotal:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(pricing.totalCost)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              );
              })}

              {/* Email Project Configuration Section - one card per email exhibit */}
              {selectedExhibitCategories.hasEmail && (config.emailConfigs || []).map((emailCfg, emailIndex) => {
                // Get or initialize tier for this email config
                const currentTier = emailTiers[emailCfg.exhibitId] || PRICING_TIERS.find(t => t.name === 'Standard') || PRICING_TIERS[1];
                
                // Calculate pricing for this email configuration
                const emailConfigData: ConfigurationData = {
                  numberOfUsers: emailCfg.numberOfUsers || 0,
                  instanceType: emailCfg.instanceType || 'Small',
                  numberOfInstances: emailCfg.numberOfInstances || 0,
                  duration: emailCfg.duration || 0,
                  messages: 0,
                  dataSizeGB: emailCfg.dataSizeGB || 0,
                  combination: emailCfg.exhibitName || '',
                  migrationType: 'email' as any
                };
                
                const pricing = calculateCombinationPricing(
                  emailCfg.exhibitName || '',
                  'email',
                  emailConfigData,
                  currentTier
                ) || {
                  userCost: 0,
                  migrationCost: 0,
                  instanceCost: 0,
                  totalCost: 0
                };
                
                const sectionId = `email-${emailCfg.exhibitId}`;
                const isCollapsed = collapsedSections.has(sectionId);
                
                return (
                <div
                  key={emailCfg.exhibitId}
                  data-section={`email-configuration-${emailCfg.exhibitId}`}
                  className="bg-white rounded-xl shadow-lg border border-gray-100 p-4 mb-4"
                >
                  {/* Header with white background */}
                  <div className="bg-white border border-gray-200 rounded-lg p-2 mb-3 -mx-1 -mt-1 shadow-sm">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionId)}
                        className="flex items-center gap-2 flex-1 text-left cursor-pointer hover:bg-gray-50 transition-all duration-200 rounded-lg p-1 -m-1"
                      >
                        <div className="w-6 h-6 bg-rose-500 rounded flex items-center justify-center transition-transform duration-200 hover:scale-110">
                          <Mail className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900 mb-0.5 transition-colors duration-200">Project Configuration – {emailCfg.exhibitName}</h3>
                          <p className="text-[10px] text-gray-600 transition-colors duration-200">Configure your email migration requirements for this exhibit.</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionId)}
                        className="flex items-center justify-center w-6 h-6 hover:bg-gray-100 rounded transition-all duration-200 hover:scale-110"
                        aria-label={isCollapsed ? "Expand section" : "Collapse section"}
                      >
                        <ChevronDown className={`w-3.5 h-3.5 text-gray-700 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`} />
                      </button>
                    </div>
                  </div>

                  {!isCollapsed && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left Column: Configuration Inputs in 2 columns */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Left Column of Inputs */}
                      <div className="space-y-6">
                        {/* Email: Number of Mailboxes */}
                        <div className="group">
                          <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                            <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                              <Users className="w-4 h-4 text-white" />
                            </div>
                            Number of Mailboxes
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={emailCfg.numberOfUsers || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              const numValue = value === '' ? 0 : parseInt(value) || 0;
                              setConfig(prev => {
                                const newConfig = {
                                  ...prev,
                                  emailConfigs: (prev.emailConfigs || []).map((cfg, i) =>
                                    i === emailIndex ? { ...cfg, numberOfUsers: numValue } : cfg
                                  ),
                                };
                                // Explicitly save to sessionStorage
                                try {
                                  sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                                } catch (e) {
                                  console.warn('Could not save config:', e);
                                }
                                onConfigurationChange(newConfig);
                                return newConfig;
                              });
                            }}
                            className="w-full px-4 py-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-base"
                            placeholder="Enter number of mailboxes"
                            autoComplete="off"
                          />
                        </div>

                        {/* Email: Number of Instances */}
                        <div className="group">
                          <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                            <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                              <Server className="w-4 h-4 text-white" />
                            </div>
                            Number of Instances
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={emailCfg.numberOfInstances || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              const numValue = value === '' ? 0 : parseInt(value) || 0;
                              setConfig(prev => {
                                const newConfig = {
                                  ...prev,
                                  emailConfigs: (prev.emailConfigs || []).map((cfg, i) =>
                                    i === emailIndex ? { ...cfg, numberOfInstances: numValue } : cfg
                                  ),
                                };
                                // Explicitly save to sessionStorage
                                try {
                                  sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                                } catch (e) {
                                  console.warn('Could not save config:', e);
                                }
                                onConfigurationChange(newConfig);
                                return newConfig;
                              });
                            }}
                            className="w-full px-4 py-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-base"
                            placeholder="Enter number of instances"
                            autoComplete="off"
                          />
                        </div>

                        {/* Email: Data Size (GB) */}
                        <div className="group">
                          <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                            <div className="w-8 h-8 bg-teal-500 rounded-full flex items-center justify-center">
                              <Database className="w-4 h-4 text-white" />
                            </div>
                            Data Size (GB)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={emailCfg.dataSizeGB || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              const numValue = value === '' ? 0 : parseFloat(value) || 0;
                              setConfig(prev => ({
                                ...prev,
                                emailConfigs: (prev.emailConfigs || []).map((cfg, i) =>
                                  i === emailIndex ? { ...cfg, dataSizeGB: numValue } : cfg
                                ),
                              }));
                            }}
                            className="w-full px-4 py-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-base"
                            placeholder="Enter data size in GB"
                            autoComplete="off"
                          />
                          <p className="text-xs text-gray-500 mt-2">Data size in gigabytes for the email migration (optional).</p>
                        </div>
                      </div>

                      {/* Right Column of Inputs */}
                      <div className="space-y-6">
                        {/* Email: Instance Type */}
                        <div className="group">
                          <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                              <Server className="w-4 h-4 text-white" />
                            </div>
                            Instance Type
                          </label>
                          <select
                            value={emailCfg.instanceType || 'Small'}
                            onChange={(e) => {
                              const value = e.target.value as any;
                              setConfig(prev => {
                                const newConfig = {
                                  ...prev,
                                  emailConfigs: (prev.emailConfigs || []).map((cfg, i) =>
                                    i === emailIndex ? { ...cfg, instanceType: value } : cfg
                                  ),
                                };
                                // Explicitly save to sessionStorage
                                try {
                                  sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                                } catch (e) {
                                  console.warn('Could not save config:', e);
                                }
                                onConfigurationChange(newConfig);
                                return newConfig;
                              });
                            }}
                            className="w-full px-4 py-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-base"
                          >
                            <option value="Small">Small</option>
                            <option value="Standard">Standard</option>
                            <option value="Large">Large</option>
                            <option value="Extra Large">Extra Large</option>
                          </select>
                        </div>

                        {/* Email: Duration */}
                        <div className="group">
                          <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                            <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                              <Clock className="w-4 h-4 text-white" />
                            </div>
                            Duration (Months)
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={emailCfg.duration || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              const numValue = value === '' ? 0 : parseInt(value) || 0;
                              setConfig(prev => {
                                const newConfig = {
                                  ...prev,
                                  emailConfigs: (prev.emailConfigs || []).map((cfg, i) =>
                                    i === emailIndex ? { ...cfg, duration: numValue } : cfg
                                  ),
                                };
                                // Explicitly save to sessionStorage
                                try {
                                  sessionStorage.setItem('cpq_configuration_session', JSON.stringify(newConfig));
                                } catch (e) {
                                  console.warn('Could not save config:', e);
                                }
                                onConfigurationChange(newConfig);
                                return newConfig;
                              });
                            }}
                            className="w-full px-4 py-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-base"
                            placeholder="Enter duration"
                            autoComplete="off"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Pricing Section */}
                    <div className="bg-rose-50/30 rounded-lg border border-rose-200 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-bold text-gray-900">Pricing</h4>
                        <select
                          value={currentTier.name}
                          onChange={(e) => {
                            const selectedTier = PRICING_TIERS.find(t => t.name === e.target.value) || PRICING_TIERS[1];
                            setEmailTiers(prev => {
                              const updated = {
                                ...prev,
                                [emailCfg.exhibitId]: selectedTier
                              };
                              // Save tier selections to sessionStorage
                              try {
                                const savedTiers = sessionStorage.getItem('cpq_combination_tiers');
                                const tiersData = savedTiers ? JSON.parse(savedTiers) : {};
                                tiersData.emailTiers = updated;
                                sessionStorage.setItem('cpq_combination_tiers', JSON.stringify(tiersData));
                              } catch (e) {
                                console.warn('Could not save email tiers:', e);
                              }
                              return updated;
                            });
                          }}
                          className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                        >
                          {PRICING_TIERS.map(tier => (
                            <option key={tier.id} value={tier.name}>{tier.name} Plan</option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">User Cost:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(pricing.userCost)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">Migration Cost:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(pricing.migrationCost)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">Instance Cost:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(pricing.instanceCost)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm bg-blue-100 rounded p-3 mt-4">
                          <span className="font-bold text-gray-900">Subtotal:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(pricing.totalCost)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              );
              })}
            </>
          )}

          {/* Multi combination: Discount input removed - not available for Multi combination migration type */}

          {/* OTHER MIGRATION TYPES: Standard single configuration */}
          {config.migrationType && config.migrationType !== 'Multi combination' && !!config.combination && (
            <div data-section="project-configuration" className="bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/50 rounded-2xl shadow-2xl border border-blue-100/50 p-8 backdrop-blur-sm">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Project Configuration</h3>
                <p className="text-gray-600">Configure your {config.migrationType.toLowerCase()} migration requirements</p>
              </div>

              {/* Service plan tabs (Migrate / Manage / Bundle) — all combinations live under Migrate */}
              <div className="flex justify-center mb-6">
                <div className="inline-flex bg-gray-100 rounded-xl p-1 shadow-inner">
                  {(['Migrate', 'Manage', 'Bundle'] as const).map((plan) => {
                    const active = (config.servicePlan || 'Migrate') === plan;
                    const activeClasses =
                      plan === 'Migrate' ? 'bg-blue-50 text-blue-700 shadow' :
                      plan === 'Manage'  ? 'bg-teal-50 text-teal-700 shadow' :
                                           'bg-purple-50 text-purple-700 shadow';
                    return (
                      <button
                        key={plan}
                        type="button"
                        onClick={() => handleChange('servicePlan', plan)}
                        className={`px-6 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                          active ? activeClasses : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {plan}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Customer Location (region multiplier) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                <div className="group">
                  <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-sky-500 to-sky-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    Customer Location
                  </label>
                  <select
                    value={config.customerLocation || '1'}
                    onChange={(e) => handleChange('customerLocation', e.target.value as '1' | '0.8' | '0.65')}
                    className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium"
                  >
                    <option value="1">Region 1 — US, Canada, UK (x1.0)</option>
                    <option value="0.8">Region 2 — AUS, NZ, EU (x0.8)</option>
                    <option value="0.65">Region 3 — Rest of World (x0.65)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Number of Users/Mailboxes - HIDE for overage agreement */}
            {config.combination !== 'overage-agreement' && (
              <div className="group">
                <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Users className="w-4 h-4 text-white" />
                  </div>
                  {config.migrationType === 'Email' ? 'Number of Mailboxes' : 'Number of Users'}
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
                  placeholder={config.migrationType === 'Email' ? 'Enter number of mailboxes' : 'Enter number of users'}
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

            {/* Data Size (GB) - Show for Email migration type */}
            {config.migrationType === 'Email' && config.combination !== 'overage-agreement' && (
              <div className="group">
                <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
                  <div className="w-8 h-8 bg-teal-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Database className="w-4 h-4 text-white" />
                  </div>
                  Data Size (GB)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={config.dataSizeGB || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    const numValue = value === '' ? 0 : parseFloat(value) || 0;
                    handleChange('dataSizeGB', numValue);
                    setFieldTouched(prev => ({ ...prev, dataSize: true }));
                  }}
                  className="w-full px-5 py-4 border-2 border-purple-200 rounded-xl focus:ring-4 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-purple-300 text-lg font-medium"
                  placeholder="Enter data size in GB"
                  autoComplete="off"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Data size in gigabytes for the email migration (optional).
                </p>
              </div>
            )}

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
                      
                      // Save to sessionStorage + localStorage (source-of-truth used by QuoteGenerator),
                      // and notify other components
                      try { 
                        sessionStorage.setItem('cpq_discount_session', raw);
                        localStorage.setItem('cpq_discount', raw);
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

          {/* Add More Exhibits Option - Show when at least one exhibit is configured */}
          {config.migrationType === 'Multi combination' && config.combination &&
           (selectedExhibitCategories.hasMessaging || selectedExhibitCategories.hasContent || selectedExhibitCategories.hasEmail) && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-lg border border-blue-200 p-4 mb-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Plus className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-base font-bold text-gray-900 whitespace-nowrap">Want to add more exhibits?</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const exhibitSection = document.querySelector('[data-section="exhibits-selection"]');
                    if (exhibitSection) {
                      exhibitSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      // Highlight the section briefly
                      exhibitSection.classList.add('ring-4', 'ring-blue-400', 'ring-opacity-50');
                      setTimeout(() => {
                        exhibitSection.classList.remove('ring-4', 'ring-blue-400', 'ring-opacity-50');
                      }, 2000);
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg whitespace-nowrap flex-shrink-0"
                >
                  <ArrowRight className="w-4 h-4" />
                  Go to Exhibit Selection
                </button>
              </div>
            </div>
          )}

        </form>
      </div>
    </div>
  );
};

export default ConfigurationForm;
