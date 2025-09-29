import { Configuration, PopupRequest } from '@azure/msal-browser';

// MSAL configuration for port 5173
export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID as string,
    authority: 'https://login.microsoftonline.com/2c5bdaf4-8ff2-4bd9-bd54-7c50ab219590',
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
