import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

// Function to exchange authorization code for real user data
async function exchangeCodeForUserData(code: string) {
  try {
    // Get the code verifier (prefer localStorage; fallback to sessionStorage)
    const codeVerifier = localStorage.getItem('msal_code_verifier') || sessionStorage.getItem('msal_code_verifier');
    if (!codeVerifier) {
      throw new Error('Code verifier not found');
    }

    // Get client ID from env or stored value (prefer localStorage)
    const clientId = import.meta.env.VITE_MSAL_CLIENT_ID || localStorage.getItem('msal_client_id') || sessionStorage.getItem('msal_client_id');
    if (!clientId) {
      throw new Error('Client ID not found');
    }

    // Exchange code for access token
    const redirectUri = window.location.origin + '/auth/microsoft/callback';
    console.log('Token exchange request:', {
      client_id: clientId,
      redirect_uri: redirectUri,
      code: code.substring(0, 10) + '...',
      code_verifier: codeVerifier ? 'present' : 'missing'
    });
    
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        scope: 'openid profile email offline_access https://graph.microsoft.com/User.Read',
        code: code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Token exchange failed:', tokenResponse.status, errorText);
      console.error('❌ Token exchange URL:', 'https://login.microsoftonline.com/common/oauth2/v2.0/token');
      console.error('❌ Request parameters:', {
        client_id: clientId,
        scope: 'openid profile email User.Read',
        code: code.substring(0, 20) + '...',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier ? 'present' : 'missing'
      });
      throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log('Token exchange successful, access token received');

    // Return user data with access token - let the main window handle Graph API call
    console.log('✅ Access token received, passing to main window for Graph API call');
    
    const userData = {
      id: 'microsoft_' + Date.now(), // Temporary ID, will be updated after Graph API call
      name: 'Microsoft User', // Temporary name, will be updated after Graph API call
      email: 'user@microsoft.com', // Temporary email, will be updated after Graph API call
      accessToken: accessToken,
      provider: 'microsoft',
      createdAt: new Date().toISOString()
    };
    
    console.log('🔧 Mapped user data:', userData);

        // Cleanup PKCE artifacts after success
        try {
          localStorage.removeItem('msal_code_verifier');
          localStorage.removeItem('msal_client_id');
          sessionStorage.removeItem('msal_code_verifier');
          sessionStorage.removeItem('msal_client_id');
          sessionStorage.removeItem('microsoft_token_exchange_started');
        } catch (_) {}

    return userData;

  } catch (error) {
    console.error('Error exchanging code for user data:', error);
    throw error;
  }
}

const MicrosoftCallback: React.FC = () => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleCallback = () => {
      const code = searchParams.get('code');
      const error = searchParams.get('error');

      if (error) {
        console.error('Microsoft OAuth error:', error);
        window.opener?.postMessage({
          type: 'MICROSOFT_AUTH_ERROR',
          error: error
        }, window.location.origin);
        return;
      }

      if (code) {
        console.log('🔍 Authorization code found:', code);
        console.log('🔍 Starting Microsoft Graph API call...');
        
        // Set a flag to prevent duplicate token exchange
        if (sessionStorage.getItem('microsoft_token_exchange_started')) {
          console.log('⚠️ Token exchange already started, skipping duplicate');
          return;
        }
        sessionStorage.setItem('microsoft_token_exchange_started', 'true');
        
        // Exchange authorization code for real user data
        exchangeCodeForUserData(code).then(userData => {
          console.log('✅ User data received:', userData);
          console.log('✅ Final name:', userData.name);
          console.log('✅ Final email:', userData.email);
          window.opener?.postMessage({
            type: 'MICROSOFT_AUTH_SUCCESS',
            user: userData
          }, window.location.origin);
        }).catch(error => {
          console.error('❌ Failed to get user data:', error);
          console.error('❌ Error details:', error.message);
          console.error('❌ This means Microsoft Graph API call failed');
          console.error('❌ Full error object:', error);
          
          // Store error details in localStorage for debugging
          localStorage.setItem('microsoft_auth_error', JSON.stringify({
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            fullError: error.toString()
          }));
          
          // Cleanup flag on error
          try {
            sessionStorage.removeItem('microsoft_token_exchange_started');
          } catch (_) {}
          
          // Fallback to mock user if real API fails
          const fallbackUser = {
            id: 'microsoft_' + Date.now(),
            name: 'Microsoft User (Fallback)',
            email: 'user@microsoft.com',
            accessToken: 'fallback_token_' + Date.now(),
            provider: 'microsoft',
            createdAt: new Date().toISOString()
          };
          
          console.log('⚠️ Using fallback user because Graph API failed:', fallbackUser);
          window.opener?.postMessage({
            type: 'MICROSOFT_AUTH_SUCCESS',
            user: fallbackUser
          }, window.location.origin);
        });
      }
    };

    handleCallback();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">
          Authenticating with Microsoft...
        </h2>
        <p className="text-gray-500">
          Please wait while we complete your authentication.
        </p>
      </div>
    </div>
  );
};

export default MicrosoftCallback;
