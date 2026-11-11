import { User } from '../types/auth';

// Generate a simple user ID
export function generateUserId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Generate a simple auth token
export function generateAuthToken(): string {
  return Date.now().toString();
}

// Check if user is authenticated (localStorage check)
export function isUserAuthenticated(): boolean {
  try {
    const user = localStorage.getItem('cpq_user');
    const token = localStorage.getItem('cpq_token');
    return !!(user && token);
  } catch (error) {
    console.error('Error checking authentication:', error);
    return false;
  }
}

// Get current user from localStorage
export function getCurrentUser(): User | null {
  try {
    const userData = localStorage.getItem('cpq_user');
    return userData ? JSON.parse(userData) : null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

// Bearer header for backend routes that verify the caller; empty when signed out
export function getAuthHeaders(): Record<string, string> {
  try {
    const token = localStorage.getItem('cpq_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

// True when the stored token is a JWT that hasn't expired (the server re-verifies it)
export function hasUsableAuthToken(nowMs: number = Date.now()): boolean {
  try {
    const token = localStorage.getItem('cpq_token');
    const parts = token ? token.split('.') : [];
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp !== 'number' || payload.exp * 1000 > nowMs;
  } catch {
    return false;
  }
}

// A 401 from a verified route means the saved login is missing or expired
export function authAwareError(status: number, serverMessage: string | undefined, fallback: string): string {
  if (status === 401) return 'Your login has expired. Please sign out, sign in again, and retry.';
  return serverMessage || fallback;
}

// Clear all authentication data
export function clearAuthData(): void {
  try {
    localStorage.removeItem('cpq_user');
    localStorage.removeItem('cpq_token');
  } catch (error) {
    console.error('Error clearing auth data:', error);
  }
}

// Auth plus everything that can hold client names, emails, pricing or documents. Tour flags,
// exhibitUploadGuideHidden, cpq_discount_policy and third-party keys (Hotjar/Clarity) are left alone.
export const USER_SESSION_STORAGE_KEYS: readonly string[] = [
  'cpq_user', 'cpq_token',
  'msal_code_verifier', 'msal_client_id', 'msal_tenant_id', 'msal_processed_codes',
  'ms_pkce_verifier', 'microsoft_auth_error',
  'cpq_quotes', 'cpq_client_info', 'cpq_quote_client_info', 'cpq_contact_info', 'cpq_configure_contact_info',
  'cpq_hubspot_data', 'hubspotState', 'companyInfo', 'dealInfo',
  'cpq_team_approval_settings',
  'cpq_selected_template', 'cpq_selected_exhibits', 'cpq_templates', 'cpq_templates_cache_v2', 'templates', 'templateFromPdf',
  'pricingTiers', 'pricingTierConfigurations',
  'cpq_discount', 'cpq_discount_session', 'cpq_discount_session_started',
  'cpq_quote_custom_line_items', 'cpq_quote_custom_line_items_discount',
  'cpq_configuration_session', 'cpq_navigation_state', 'cpq_combination_tiers',
  'cpq_selected_tiers_per_combination', 'cpq_pricing_plan_per_combination',
  'quotePendingApproval', 'migration_projects',
  'esign_saved_recipients', 'esign_saved_groups', 'esign_default_group_id',
];

// LocalStorageHelper writes cpq_app_data_<name>
export const USER_SESSION_STORAGE_PREFIXES: readonly string[] = ['cpq_app_data'];

function clearUserKeysFrom(store: Storage): void {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key) keys.push(key);
  }
  keys.forEach((key) => {
    if (USER_SESSION_STORAGE_KEYS.includes(key) || USER_SESSION_STORAGE_PREFIXES.some((p) => key.startsWith(p))) {
      store.removeItem(key);
    }
  });
}

// Never localStorage.clear(): that would also wipe tour flags and third-party keys
export function clearUserSessionData(): void {
  [() => localStorage, () => sessionStorage].forEach((getStore) => {
    try {
      clearUserKeysFrom(getStore());
    } catch (error) {
      console.error('Error clearing user session data:', error);
    }
  });
}

// Wipes the previous user's data when someone else signs in on the same browser; same user keeps theirs
export function clearDataIfDifferentUser(nextUser: { id?: string; email?: string } | null | undefined): void {
  try {
    const raw = localStorage.getItem('cpq_user');
    if (!raw || !nextUser) return;
    let previous: { id?: string; email?: string } | null = null;
    try { previous = JSON.parse(raw); } catch { previous = null; }
    const sameId = !!previous?.id && !!nextUser.id && String(previous.id) === String(nextUser.id);
    const sameEmail = !!previous?.email && !!nextUser.email
      && previous.email.toLowerCase() === nextUser.email.toLowerCase();
    if (!sameId && !sameEmail) clearUserSessionData();
  } catch (error) {
    console.error('Error comparing signed-in users:', error);
  }
}

// Format user display name
export function formatUserName(user: User): string {
  return user.name || user.email.split('@')[0];
}

// Check if email is already registered (mock function)
export function isEmailRegistered(email: string): boolean {
  // In a real app, this would be an API call
  const mockEmails = ['john@example.com', 'jane@example.com'];
  return mockEmails.includes(email.toLowerCase());
}

// Validate token expiration (simple timestamp check)
export function isTokenExpired(token: string): boolean {
  try {
    const tokenTime = parseInt(token);
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    return (now - tokenTime) > oneDay;
  } catch (error) {
    console.error('Error checking token expiration:', error);
    return true;
  }
}

// Refresh token if needed
export function refreshTokenIfNeeded(): boolean {
  try {
    const token = localStorage.getItem('cpq_token');
    if (!token) return false;
    
    if (isTokenExpired(token)) {
      const newToken = generateAuthToken();
      localStorage.setItem('cpq_token', newToken);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return false;
  }
}
