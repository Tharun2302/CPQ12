// Lightweight Microsoft Clarity integration for SPA
// Usage:
//   initClarity(import.meta.env.VITE_CLARITY_ID)
//   track('event_name', { prop: 'value' })
//   trackConfiguration({ migrationType: 'Content', numberOfUsers: 100 })
//   trackPricingCalculation({ totalCost: 5000, tier: 'Standard' })

declare global {
  interface Window {
    clarity?: (...args: any[]) => void;
  }
}

export function initClarity(projectId?: string) {
  try {
    if (!projectId) return; // No project configured
    if (typeof window === 'undefined') return;
    if (window.clarity) return; // Already initialized

    // Only initialize in production builds by default, unless explicitly enabled for dev
    const mode = (import.meta as any)?.env?.MODE;
    const enableDev = (import.meta as any)?.env?.VITE_CLARITY_ENABLE_DEV === '1';
    if (mode && mode !== 'production' && !enableDev) return;

    (function (c: any, l: Document, a: string, r: string, i: string, t?: HTMLScriptElement, y?: HTMLScriptElement) {
      (c as any)[a] = (c as any)[a] || function () {
        ((c as any)[a].q = (c as any)[a].q || []).push(arguments);
      };
      t = l.createElement(r) as HTMLScriptElement;
      if (t) {
        t.async = true;
        t.src = 'https://www.clarity.ms/tag/' + i;
        y = l.getElementsByTagName(r)[0] as HTMLScriptElement | undefined;
        if (y && y.parentNode) {
          y.parentNode.insertBefore(t, y);
        }
      }
    })(window as any, document, 'clarity', 'script', projectId);
  } catch {
    // no-op
  }
}

export function track(name: string, props?: Record<string, any>) {
  try {
    window.clarity?.('event', name, props || {});
  } catch {
    // no-op
  }
}

/**
 * Identify a user in Clarity analytics
 * This allows you to see user email addresses and track individual users in the Clarity dashboard
 * @param userId - User identifier (typically email address)
 * @param userData - Optional user metadata (name, email, etc.)
 */
export function identify(userId: string, userData?: { name?: string; email?: string; [key: string]: any }) {
  try {
    if (!userId) {
      console.warn('⚠️ Clarity identify: userId is required');
      return;
    }

    // Wait for Clarity to be ready with retry logic
    let retryCount = 0;
    const maxRetries = 50; // Try for up to 5 seconds (50 * 100ms)
    
    const tryIdentify = () => {
      if (!window.clarity) {
        retryCount++;
        if (retryCount < maxRetries) {
          // Retry after a short delay if Clarity isn't ready yet
          setTimeout(tryIdentify, 100);
          return;
        } else {
          console.warn('⚠️ Clarity identify: Clarity not loaded after retries. User:', userId);
          return;
        }
      }
      
      try {
        // Microsoft Clarity uses 'identify' to associate sessions with users
        // This makes user email addresses visible in the Clarity dashboard
        window.clarity('identify', userId);
        
        // Set email as a custom variable (this is what Clarity uses to display emails)
        window.clarity('set', 'userEmail', userId);
        
        // Also set custom metadata if provided
        if (userData) {
          if (userData.name) {
            window.clarity('set', 'userName', userData.name);
          }
          if (userData.email) {
            window.clarity('set', 'userEmail', userData.email);
          }
          if (userData.userId) {
            window.clarity('set', 'userId', userData.userId);
          }
          
          // Set any other custom properties
          Object.keys(userData).forEach(key => {
            if (userData[key] !== undefined && !['name', 'email', 'userId'].includes(key) && window.clarity) {
              window.clarity('set', key, userData[key]);
            }
          });
        }
        
        console.log('✅ Clarity user identified:', userId, userData?.name || '');
      } catch (error) {
        console.error('❌ Error identifying user in Clarity:', error, userId);
      }
    };
    
    // Start the identification process
    tryIdentify();
  } catch (error) {
    console.error('❌ Error in identify function:', error);
  }
}

/**
 * Track configuration form submission
 */
export function trackConfiguration(config: {
  migrationType?: string;
  numberOfUsers?: number;
  instanceType?: string;
  numberOfInstances?: number;
  duration?: number;
  dataSizeGB?: number;
  messages?: number;
  combination?: string;
  hasDiscount?: boolean;
  discountValue?: number;
}) {
  track('configuration.submitted', {
    migration_type: config.migrationType,
    number_of_users: config.numberOfUsers,
    instance_type: config.instanceType,
    number_of_instances: config.numberOfInstances,
    duration_months: config.duration,
    data_size_gb: config.dataSizeGB,
    messages: config.messages,
    combination: config.combination,
    has_discount: config.hasDiscount,
    discount_value: config.discountValue
  });
}

/**
 * Track pricing calculation
 */
export function trackPricingCalculation(calc: {
  totalCost?: number;
  tier?: string;
  userCost?: number;
  dataCost?: number;
  migrationCost?: number;
  instanceCost?: number;
  configuration?: any;
}) {
  track('pricing.calculated', {
    total_cost: calc.totalCost,
    tier: calc.tier,
    user_cost: calc.userCost,
    data_cost: calc.dataCost,
    migration_cost: calc.migrationCost,
    instance_cost: calc.instanceCost,
    migration_type: calc.configuration?.migrationType,
    number_of_users: calc.configuration?.numberOfUsers
  });
}

/**
 * Track tier selection
 */
export function trackTierSelection(tier: {
  tierName?: string;
  totalCost?: number;
  userCost?: number;
  dataCost?: number;
  migrationCost?: number;
  instanceCost?: number;
}) {
  track('pricing.tier_selected', {
    tier_name: tier.tierName,
    total_cost: tier.totalCost,
    user_cost: tier.userCost,
    data_cost: tier.dataCost,
    migration_cost: tier.migrationCost,
    instance_cost: tier.instanceCost
  });
}

/**
 * Track template operations
 */
export function trackTemplateOperation(operation: {
  action: 'selected' | 'uploaded' | 'deleted' | 'previewed' | 'downloaded';
  templateId?: string;
  templateName?: string;
  templateType?: 'docx' | 'pdf';
  isDefault?: boolean;
}) {
  track(`template.${operation.action}`, {
    template_id: operation.templateId,
    template_name: operation.templateName,
    template_type: operation.templateType,
    is_default: operation.isDefault
  });
}

/**
 * Track quote operations
 */
export function trackQuoteOperation(operation: {
  action: 'generated' | 'viewed' | 'edited' | 'deleted' | 'downloaded' | 'sent' | 'previewed';
  quoteId?: string;
  clientName?: string;
  clientEmail?: string;
  totalCost?: number;
  tier?: string;
  templateId?: string;
  templateName?: string;
}) {
  track(`quote.${operation.action}`, {
    quote_id: operation.quoteId,
    client_name: operation.clientName,
    client_email: operation.clientEmail,
    total_cost: operation.totalCost,
    tier: operation.tier,
    template_id: operation.templateId,
    template_name: operation.templateName
  });
}

/**
 * Track approval workflow events
 */
export function trackApprovalEvent(event: {
  action: 'workflow_started' | 'approved' | 'rejected' | 'pending' | 'viewed';
  workflowId?: string;
  quoteId?: string;
  formId?: string;
  approverRole?: string;
  approverEmail?: string;
  comments?: string;
}) {
  track(`approval.${event.action}`, {
    workflow_id: event.workflowId,
    quote_id: event.quoteId,
    form_id: event.formId,
    approver_role: event.approverRole,
    approver_email: event.approverEmail,
    has_comments: !!event.comments
  });
}

/**
 * Track HubSpot integration events
 */
export function trackHubSpotEvent(event: {
  action: 'connected' | 'disconnected' | 'deal_selected' | 'contact_selected' | 'sync_failed' | 'sync_success';
  dealId?: string;
  dealName?: string;
  contactId?: string;
  contactEmail?: string;
}) {
  track(`hubspot.${event.action}`, {
    deal_id: event.dealId,
    deal_name: event.dealName,
    contact_id: event.contactId,
    contact_email: event.contactEmail
  });
}

/**
 * Track navigation/page views
 */
export function trackPageView(page: {
  pageName: string;
  pagePath?: string;
  tab?: string;
  previousPage?: string;
}) {
  track('page.viewed', {
    page_name: page.pageName,
    page_path: page.pagePath,
    tab: page.tab,
    previous_page: page.previousPage
  });
}

/**
 * Track form field interactions
 */
export function trackFieldInteraction(field: {
  fieldName: string;
  fieldType?: string;
  action: 'focused' | 'blurred' | 'changed' | 'validated' | 'error';
  value?: any;
  hasError?: boolean;
  errorMessage?: string;
}) {
  track(`form.field_${field.action}`, {
    field_name: field.fieldName,
    field_type: field.fieldType,
    has_value: field.value !== undefined && field.value !== null && field.value !== '',
    has_error: field.hasError,
    error_message: field.errorMessage
  });
}

/**
 * Track errors
 */
export function trackError(error: {
  errorType: string;
  errorMessage: string;
  errorStack?: string;
  page?: string;
  component?: string;
  userAction?: string;
}) {
  track('error.occurred', {
    error_type: error.errorType,
    error_message: error.errorMessage,
    page: error.page,
    component: error.component,
    user_action: error.userAction,
    has_stack: !!error.errorStack
  });
}

/**
 * Track user engagement metrics
 */
export function trackEngagement(metric: {
  action: 'time_spent' | 'scroll_depth' | 'click' | 'download' | 'share';
  value?: number;
  unit?: string;
  element?: string;
  page?: string;
}) {
  track(`engagement.${metric.action}`, {
    value: metric.value,
    unit: metric.unit,
    element: metric.element,
    page: metric.page
  });
}

/**
 * Track document operations
 */
export function trackDocumentOperation(operation: {
  action: 'downloaded' | 'previewed' | 'generated' | 'converted' | 'uploaded';
  documentType?: 'quote' | 'agreement' | 'template' | 'pdf' | 'docx';
  documentId?: string;
  documentName?: string;
  fileSize?: number;
  format?: string;
}) {
  track(`document.${operation.action}`, {
    document_type: operation.documentType,
    document_id: operation.documentId,
    document_name: operation.documentName,
    file_size_kb: operation.fileSize,
    format: operation.format
  });
}

/**
 * Track authentication events
 */
export function trackAuthEvent(event: {
  action: 'sign_in' | 'sign_out' | 'sign_up' | 'sign_in_failed' | 'token_refreshed';
  method?: 'email' | 'microsoft' | 'hubspot';
  email?: string;
  success?: boolean;
  errorMessage?: string;
}) {
  track(`auth.${event.action}`, {
    method: event.method,
    email: event.email,
    success: event.success,
    error_message: event.errorMessage
  });
}

/**
 * Track search operations
 */
export function trackSearch(search: {
  query: string;
  resultsCount?: number;
  searchType?: 'template' | 'contact' | 'deal' | 'quote';
  filters?: Record<string, any>;
}) {
  track('search.performed', {
    query: search.query,
    results_count: search.resultsCount,
    search_type: search.searchType,
    has_filters: !!search.filters && Object.keys(search.filters).length > 0
  });
}


