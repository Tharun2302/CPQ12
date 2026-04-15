/**
 * API Configuration
 * Reads backend URL from environment variables with development fallback
 */

// Get backend URL from environment
const getBackendUrl = (): string => {
  // Vite dev: relative base so /api hits the dev server and vite proxies to :3001 (avoids CORS).
  // Vite's proxy is active on whatever port it starts (5173, 5174, 5177, …), so use it for
  // any localhost/127.0.0.1 origin in dev mode — not just port 5173.
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return '';
    }
  }

  const envUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim();

  // Production (or preview) opened from a real host (e.g. phone via http://159.x.x.x:3001):
  // same server serves SPA + API — use current origin so we never call localhost from the device.
  if (!import.meta.env.DEV && typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocalPage = host === 'localhost' || host === '127.0.0.1';
    if (!envUrl) {
      return window.location.origin;
    }
    if (!isLocalPage && /localhost|127\.0\.0\.1/i.test(envUrl)) {
      return window.location.origin;
    }
  }

  if (!envUrl) {
    const developmentUrl = 'http://localhost:3001';
    console.warn('⚠️ VITE_BACKEND_URL is not set in .env file!');
    console.warn('📝 Using development fallback:', developmentUrl);
    console.warn('📝 For production, please add VITE_BACKEND_URL to your .env file');
    return developmentUrl;
  }

  return envUrl;
};

// Export the backend URL (with development fallback)
export const BACKEND_URL = getBackendUrl();

// Helper function to get full API endpoint
export const getApiEndpoint = (path: string): string => {
  const baseUrl = BACKEND_URL
    ? BACKEND_URL.endsWith('/')
      ? BACKEND_URL.slice(0, -1)
      : BACKEND_URL
    : '';
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
  
  // E-Signature (built-in)
  ESIGN_UPLOAD: '/api/esign/documents/upload',
  ESIGN_DOCUMENTS: '/api/esign/documents',
  ESIGN_DOCUMENT: (id: string) => `/api/esign/documents/${id}`,
  ESIGN_DOCUMENT_FILE: (id: string) => `/api/esign/documents/${id}/file`,
  ESIGN_SIGNATURE_FIELDS: (id: string) => `/api/esign/signature-fields/${id}`,
  ESIGN_GENERATE_SIGNED: '/api/esign/documents/generate-signed',
  
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
  console.log(
    '   Backend URL:',
    BACKEND_URL || '(same origin; /api proxied to VITE_BACKEND_URL / localhost:3001)',
  );
}

