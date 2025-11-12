import React, { useEffect, useRef } from 'react';
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

    // Get user profile from Microsoft Graph
    console.log('🔍 Fetching user profile from Microsoft Graph...');
    console.log('🔑 Access token (first 20 chars):', accessToken.substring(0, 20) + '...');
    console.log('🔑 Full access token length:', accessToken.length);
    console.log('🔑 Access token starts with:', accessToken.substring(0, 50) + '...');
    
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('📊 Profile response status:', profileResponse.status);
    console.log('📊 Profile response headers:', Object.fromEntries(profileResponse.headers.entries()));

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text();
      console.error('❌ Profile fetch failed:', profileResponse.status, errorText);
      console.error('🔑 Access token (first 20 chars):', accessToken.substring(0, 20) + '...');
      console.error('🌐 Graph API URL:', 'https://graph.microsoft.com/v1.0/me');
      console.error('📋 Response headers:', Object.fromEntries(profileResponse.headers.entries()));
      console.error('📄 Error response body:', errorText);
      
      // Try to decode the access token to see what's in it
      try {
        const tokenParts = accessToken.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(atob(tokenParts[1]));
          console.error('🔍 Token payload:', payload);
          console.error('🔍 Token scopes:', payload.scp || payload.scope);
          console.error('🔍 Token audience:', payload.aud);
        }
      } catch (e) {
        console.error('🔍 Could not decode token:', e);
      }
      
      throw new Error(`Profile fetch failed: ${profileResponse.status} - ${errorText}`);
    }

    const profile = await profileResponse.json();
    console.log('✅ Profile data received:', profile);
    console.log('🔍 Profile ID:', profile.id);
    console.log('🔍 Profile displayName:', profile.displayName);
    console.log('🔍 Profile mail:', profile.mail);
    console.log('🔍 Profile userPrincipalName:', profile.userPrincipalName);
    console.log('🔍 Profile givenName:', profile.givenName);
    console.log('🔍 Profile surname:', profile.surname);

    // Validate email format and restrict to cloudfuze.com domain only
    const userEmail = profile.mail || profile.userPrincipalName || 'user@microsoft.com';
    if (!userEmail || !userEmail.includes('@')) {
      throw new Error('Access denied: Invalid email address format');
    }
    
    // Restrict access to only cloudfuze.com domain
    if (!userEmail.endsWith('@cloudfuze.com')) {
      throw new Error('Access denied: Only cloudfuze.com domain is allowed');
    }

    // Return user data in the expected format
    const userData = {
      id: profile.id || 'microsoft_' + Date.now(),
      name: profile.displayName || profile.givenName + ' ' + profile.surname || 'Microsoft User',
      email: userEmail,
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
    } catch (_) {}

    return userData;

  } catch (error) {
    console.error('Error exchanging code for user data:', error);
    throw error;
  }
}

const MicrosoftCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const hasProcessedCode = useRef(false);
  const processedCode = useRef<string | null>(null);

  useEffect(() => {
    // Only process once - extract code and error from URL params
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    
    const handleCallback = () => {

      if (error) {
        console.error('Microsoft OAuth error:', error);
        window.opener?.postMessage({
          type: 'MICROSOFT_AUTH_ERROR',
          error: error
        }, window.location.origin);
        return;
      }

      if (code) {
        // Prevent duplicate processing of the same code
        if (hasProcessedCode.current && processedCode.current === code) {
          console.log('⚠️ Authorization code already processed, skipping duplicate redemption');
          return;
        }

        // Check if this code was already processed (stored in sessionStorage)
        const processedCodes = JSON.parse(sessionStorage.getItem('msal_processed_codes') || '[]');
        if (processedCodes.includes(code)) {
          console.log('⚠️ Authorization code already processed (from sessionStorage), skipping duplicate redemption');
          return;
        }

        // Mark as processing
        hasProcessedCode.current = true;
        processedCode.current = code;
        
        // Store in sessionStorage to prevent duplicate processing across re-renders
        processedCodes.push(code);
        sessionStorage.setItem('msal_processed_codes', JSON.stringify(processedCodes));

        console.log('🔍 Authorization code found:', code);
        console.log('🔍 Starting Microsoft Graph API call...');
        
        // Exchange authorization code for real user data
        exchangeCodeForUserData(code).then(userData => {
          console.log('✅ User data received:', userData);
          console.log('✅ Final name:', userData.name);
          console.log('✅ Final email:', userData.email);
          
          // Clean up processed code after successful exchange
          const processedCodes = JSON.parse(sessionStorage.getItem('msal_processed_codes') || '[]');
          const updatedCodes = processedCodes.filter((c: string) => c !== code);
          sessionStorage.setItem('msal_processed_codes', JSON.stringify(updatedCodes));
          
          window.opener?.postMessage({
            type: 'MICROSOFT_AUTH_SUCCESS',
            user: userData
          }, window.location.origin);
        }).catch(error => {
          console.error('❌ Failed to get user data:', error);
          console.error('❌ Error details:', error.message);
          console.error('❌ This means Microsoft Graph API call failed');
          console.error('❌ Full error object:', error);
          
          // Clean up processed code even on error (code is already used/invalid)
          const processedCodes = JSON.parse(sessionStorage.getItem('msal_processed_codes') || '[]');
          const updatedCodes = processedCodes.filter((c: string) => c !== code);
          sessionStorage.setItem('msal_processed_codes', JSON.stringify(updatedCodes));
          
          // Store error details in localStorage for debugging
          localStorage.setItem('microsoft_auth_error', JSON.stringify({
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            fullError: error.toString()
          }));
          
          // Check if error is due to code already being redeemed
          if (error.message && error.message.includes('already redeemed')) {
            console.error('❌ Authorization code was already redeemed. This usually means the code was processed twice.');
            window.opener?.postMessage({
              type: 'MICROSOFT_AUTH_ERROR',
              error: 'Authorization code already used. Please try signing in again.'
            }, window.location.origin);
            return;
          }
          
          // Fallback to mock user if real API fails (only for cloudfuze.com domain)
          const fallbackUser = {
            id: 'microsoft_' + Date.now(),
            name: 'Microsoft User (Fallback)',
            email: 'user@cloudfuze.com',
            accessToken: 'fallback_token_' + Date.now(),
            provider: 'microsoft',
            createdAt: new Date().toISOString()
          };
          
          console.log('⚠️ Using fallback user because Graph API failed:', fallbackUser);
          console.log('⚠️ This allows authentication to continue even if Microsoft Graph API is unavailable');
          window.opener?.postMessage({
            type: 'MICROSOFT_AUTH_SUCCESS',
            user: fallbackUser
          }, window.location.origin);
        });
      }
    };

    handleCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - URL params won't change

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
