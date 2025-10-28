/**
 * API Configuration
 * Reads backend URL from environment variables
 * No hardcoded URLs - everything comes from .env file
 */

// Get backend URL from environment
const getBackendUrl = (): string => {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  
  if (!backendUrl) {
    console.error('⚠️ VITE_BACKEND_URL is not set in .env file!');
    console.error('📝 Please add VITE_BACKEND_URL to your .env file');
    throw new Error('Backend URL not configured. Please set VITE_BACKEND_URL in .env file');
  }
  
  return backendUrl;
};

// Export the backend URL (no fallback, pure environment variable)
export const BACKEND_URL = getBackendUrl();

// Helper function to get full API endpoint
export const getApiEndpoint = (path: string): string => {
  const baseUrl = BACKEND_URL.endsWith('/') ? BACKEND_URL.slice(0, -1) : BACKEND_URL;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};

// Export commonly used endpoints
export const API_ENDPOINTS = {
  // Authentication
  AUTH_ME: '/api/auth/me',
  AUTH_LOGIN: '/api/auth/login',
  AUTH_MICROSOFT: '/api/auth/microsoft',
  
  // Quotes
  QUOTES: '/api/quotes',
  QUOTE_BY_ID: (id: string) => `/api/quotes/${id}`,
  
  // Templates
  TEMPLATES: '/api/templates',
  TEMPLATE_FILE: (id: string) => `/api/templates/${id}/file`,
  
  // Documents
  DOCUMENTS: '/api/documents',
  DOCUMENT_PREVIEW: (id: string) => `/api/documents/${id}/preview`,
  DOCUMENT_FILE: (id: string) => `/api/documents/${id}`,
  
  // Signature
  SIGNATURE_CREATE_FORM: '/api/signature/create-form',
  SIGNATURE_FORM: (id: string) => `/api/signature/form/${id}`,
  SIGNATURE_SUBMIT: '/api/signature/submit',
  SIGNATURE_FORMS_BY_QUOTE: (quoteId: string) => `/api/signature/forms-by-quote/${quoteId}`,
  SIGNATURE_ANALYTICS: '/api/signature/analytics',
  SIGNATURE_TRACK_INTERACTION: '/api/signature/track-interaction',
  
  // HubSpot
  HUBSPOT_CONTACTS: '/api/hubspot/contacts',
  HUBSPOT_DEALS: '/api/hubspot/deals',
  HUBSPOT_HEALTH: '/api/health',
  HUBSPOT_TEST: '/api/hubspot/test',
  
  // Approval Workflows
  APPROVAL_WORKFLOWS: '/api/approval-workflows',
  APPROVAL_WORKFLOW: (id: string) => `/api/approval-workflows/${id}`,
  APPROVAL_WORKFLOW_STEP: (id: string, step: number) => `/api/approval-workflows/${id}/step/${step}`,
  
  // Email
  EMAIL_SEND: '/api/email/send',
  SEND_MANAGER_EMAIL: '/api/send-manager-email',
  SEND_CEO_EMAIL: '/api/send-ceo-email',
  SEND_CLIENT_EMAIL: '/api/send-client-email',
  
  // Convert
  CONVERT_DOCX_TO_PDF: '/api/convert/docx-to-pdf',
};

// Debug info (only in development)
if (import.meta.env.DEV) {
  console.log('🔧 API Configuration:');
  console.log('   Backend URL:', BACKEND_URL);
  console.log('   Source: Environment variable (VITE_BACKEND_URL)');
}

