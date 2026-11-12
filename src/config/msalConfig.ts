import { Configuration, PopupRequest } from '@azure/msal-browser';
import { getMicrosoftAuthority } from '../utils/microsoftAuthority';

// MSAL configuration for port 5173
export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID as string,
    // Getter so a missing tenant fails when MSAL reads it, not when this module is imported
    get authority() {
      return getMicrosoftAuthority();
    },
    redirectUri: (import.meta.env.VITE_MSAL_REDIRECT_URI as string) || (window.location.origin + '/auth/microsoft/callback'),
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

// Add scopes here for Microsoft Graph API
export const loginRequest: PopupRequest = {
  scopes: ['User.Read', 'openid', 'profile', 'email'],
  prompt: 'select_account',
};

// Add scopes here for Microsoft Graph API
export const graphConfig = {
  graphMeEndpoint: 'https://graph.microsoft.com/v1.0/me',
};

// Check if Microsoft authentication is properly configured
export const isMicrosoftAuthConfigured = () => {
  return Boolean(import.meta.env.VITE_MSAL_CLIENT_ID);
};
