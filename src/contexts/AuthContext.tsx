import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, AuthContextType } from '../types/auth';
import { track, identify } from '../analytics/clarity';
import { identifyHotjarUser } from '../analytics/hotjar';
import { BACKEND_URL } from '../config/api';
import { clearUserSessionData, clearDataIfDifferentUser, getAuthHeaders } from '../utils/authUtils';
import { SESSION_IDLE_TIMEOUT_MS, SessionCallResult, SessionEndKind, SessionGuard, startSessionGuard } from '../utils/sessionGuard';
import SessionTimeoutWarning from '../components/SessionTimeoutWarning';
import { getMicrosoftAuthorizeUrl, getMicrosoftTenantId } from '../utils/microsoftAuthority';
import { microsoftBackendErrorMessage, microsoftPopupErrorMessage, createMicrosoftServerError } from '../utils/microsoftSignInErrors';

// Create the context
const AuthContext = createContext<AuthContextType | undefined>(undefined);
 
// Microsoft authentication using custom OAuth implementation (single-tenant authority, see microsoftAuthority.ts)
// This avoids MSAL library issues that cause white page problems

interface AuthProviderComponentProps {
  children: ReactNode;
}

type SessionEndReason = 'user' | SessionEndKind;

interface SessionTimes {
  idleRemainingMs: number;
  maxAgeRemainingMs?: number;
}

const DEFAULT_SESSION_TIMES: SessionTimes = { idleRemainingMs: SESSION_IDLE_TIMEOUT_MS };

const readSessionTimes = (data: any): SessionTimes | null => {
  const idle = Number(data?.session?.idleRemainingMs);
  if (!Number.isFinite(idle)) return null;
  const maxAge = Number(data?.session?.maxAgeRemainingMs);
  return Number.isFinite(maxAge) ? { idleRemainingMs: idle, maxAgeRemainingMs: maxAge } : { idleRemainingMs: idle };
};

// Lets the other open tabs show why they were signed out; only honoured briefly so a stale value is never shown
const SIGN_OUT_REASON_KEY = 'cpq_signout_reason';
const SIGN_OUT_REASON_MAX_AGE_MS = 15 * 1000;

function shareSignOutReason(reason: SessionEndReason): void {
  try {
    localStorage.setItem(SIGN_OUT_REASON_KEY, JSON.stringify({ reason, at: Date.now() }));
  } catch {
    // Other tabs then sign out without the explanation
  }
}

function readSharedSignOutReason(): SessionEndReason | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(SIGN_OUT_REASON_KEY) || 'null');
    if (!parsed || Date.now() - Number(parsed.at) > SIGN_OUT_REASON_MAX_AGE_MS) return null;
    return ['user', 'idle', 'limit'].includes(parsed.reason) ? parsed.reason : null;
  } catch {
    return null;
  }
}

async function callSessionEndpoint(path: string, method: 'GET' | 'POST'): Promise<SessionCallResult> {
  try {
    const response = await fetch(`${BACKEND_URL}${path}`, { method, headers: getAuthHeaders() });
    if (response.status === 401) return { status: 'expired' };
    if (!response.ok) return { status: 'error' };
    const times = readSessionTimes(await response.json());
    return times ? { status: 'ok', ...times } : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

// keepalive lets the request finish even when the page is closing
function endServerSession(token: string): void {
  fetch(`${BACKEND_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    keepalive: true,
  }).catch(() => undefined);
}

const SIGN_OUT_MESSAGES: Record<SessionEndReason, { title: string; body: string; autoCloseMs: number | null }> = {
  user: {
    title: 'Thank you for visiting CloudFuze CPQ Quote!',
    body: 'We hope to see you again soon for your quoting needs.',
    autoCloseMs: 3000,
  },
  // Stays up until dismissed: the user was away and needs to see why they are signed out
  idle: {
    title: 'You were signed out',
    body: 'For security, you were signed out after 60 minutes of inactivity. Please sign in again.',
    autoCloseMs: null,
  },
  limit: {
    title: 'You were signed out',
    body: 'For security, each sign-in lasts at most 12 hours. Please sign in again.',
    autoCloseMs: null,
  },
};

export const AuthProvider: React.FC<AuthProviderComponentProps> = ({ children }) => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<{ deadline: number; kind: SessionEndKind } | null>(null);
  const sessionTimesRef = useRef<SessionTimes>(DEFAULT_SESSION_TIMES);
  const guardRef = useRef<SessionGuard | null>(null);

  // Single identify point covering every auth path (restored session, Microsoft, HubSpot):
  // the first render where `user` is set is the first moment the app knows who this is.
  useEffect(() => {
    if (user) identifyHotjarUser(user);
  }, [user?.email, user?.role]);
 
  // Restores a saved login; also re-run when another tab signs in
  const restoreSession = useCallback(async () => {
    try {
      const storedUser = localStorage.getItem('cpq_user');
      const storedToken = localStorage.getItem('cpq_token');

      if (storedUser && storedToken) {
        // Only server-issued JWTs are trusted; fake tokens from older builds must sign in again
        if (storedToken.split('.').length !== 3) {
          clearUserSessionData();
        } else {
          try {
            const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
              headers: {
                'Authorization': `Bearer ${storedToken}`
              }
            });

            if (response.ok) {
              const data = await response.json();
              if (data.success) {
                sessionTimesRef.current = readSessionTimes(data) ?? DEFAULT_SESSION_TIMES;
                // Sync the refreshed user (with isApprovalAdmin and effective role) back to localStorage
                localStorage.setItem('cpq_user', JSON.stringify(data.user));
                setUser(data.user);
                setIsAuthenticated(true);

                // Identify user in Clarity (for already logged-in users)
                identify(data.user.email, {
                  name: data.user.name,
                  email: data.user.email,
                  userId: data.user.id
                });
              } else {
                clearUserSessionData();
              }
            } else if (response.status === 401) {
              // Expired, idle, signed out, or issued before server sessions existed
              clearUserSessionData();
            }
          } catch (backendError) {
            // Stored user data is unverified, so an unreachable server must not count as signed in
            console.error('Backend auth check failed:', backendError);
          }
        }
      }
    } catch (error) {
      console.error('Error checking authentication:', error);
      clearUserSessionData();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);
 
  // PKCE helpers for Microsoft OAuth (S256)
  const generateRandomString = (length: number): string => {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const randomValues = new Uint8Array(length);
    window.crypto.getRandomValues(randomValues);
    let result = '';
    for (let i = 0; i < randomValues.length; i++) {
      result += charset[randomValues[i] % charset.length];
    }
    return result;
  };
 
  const base64UrlEncode = (arrayBuffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  };
 
  const createCodeChallenge = async (verifier: string): Promise<string> => {
    // Check if crypto.subtle is available (requires secure context/HTTPS)
    if (!window.crypto || !window.crypto.subtle) {
      const errorMsg = 'Crypto API not available. Microsoft authentication requires a secure context (HTTPS). ' +
        'If you are using a self-signed certificate, please accept it in your browser or use a valid SSL certificate.';
      console.error('❌', errorMsg);
      throw new Error(errorMsg);
    }
    
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(verifier);
      const digest = await window.crypto.subtle.digest('SHA-256', data);
      return base64UrlEncode(digest);
    } catch (error) {
      console.error('❌ Error creating code challenge:', error);
      throw new Error('Failed to create PKCE code challenge. Please ensure you are using HTTPS with a valid certificate.');
    }
  };
 
  const loginWithMicrosoft = async (): Promise<boolean> => {
    try {
      setLoading(true);
      console.log('🚀 Starting Microsoft sign-in...');
     
      // Simple Microsoft OAuth redirect (no complex libraries)
      const clientId = import.meta.env.VITE_MSAL_CLIENT_ID as string;
      console.log('🔑 Client ID:', clientId ? 'Found' : 'Missing');
     
      if (!clientId || clientId.trim() === '') {
        const err = new Error('NOT_CONFIGURED') as Error & { code?: string };
        err.code = 'NOT_CONFIGURED';
        throw err;
      }

      // Throws NOT_CONFIGURED before any popup opens when the tenant is missing or malformed
      const authorizeUrl = getMicrosoftAuthorizeUrl();

      // Create Microsoft OAuth URL with PKCE
      const redirectBase = (import.meta.env.VITE_MSAL_REDIRECT_URI as string) || (window.location.origin + '/auth/microsoft/callback');
      const redirectUri = encodeURIComponent(redirectBase);
      const scopes = encodeURIComponent('openid profile email offline_access https://graph.microsoft.com/User.Read');
      const parentOrigin = window.location.origin;
      const state = Math.random().toString(36).substring(2, 15) + '|' + encodeURIComponent(parentOrigin);
 
      // PKCE: generate code verifier and challenge
      let codeVerifier: string | null = null;
      let codeChallenge: string | null = null;
      
      try {
        codeVerifier = generateRandomString(64);
        codeChallenge = await createCodeChallenge(codeVerifier);
        // Use localStorage so the popup callback window can access it
        localStorage.setItem('msal_code_verifier', codeVerifier);
      } catch (error) {
        console.error('❌ PKCE generation failed:', error);
        // Show user-friendly error
        alert('Microsoft authentication requires HTTPS with a valid SSL certificate. ' +
          'Please ensure your development server is using HTTPS with a trusted certificate, ' +
          'or accept the self-signed certificate in your browser settings.');
        setLoading(false);
        return false;
      }

      // Build auth URL with PKCE
      const authUrl = `${authorizeUrl}?` +
        `client_id=${clientId}&` +
        `response_type=code&` +
        `redirect_uri=${redirectUri}&` +
        `scope=${scopes}&` +
        `response_mode=query&` +
        `state=${state}&` +
        `code_challenge=${encodeURIComponent(codeChallenge!)}&` +
        `code_challenge_method=S256&` +
        `prompt=select_account`;
 
      console.log('🌐 Microsoft OAuth URL:', authUrl);
      console.log('🔗 Redirect URI:', redirectBase);
 
      // Store client ID for callback page (in localStorage for cross-window access)
      localStorage.setItem('msal_client_id', clientId);
      localStorage.setItem('msal_tenant_id', getMicrosoftTenantId());

      // Open popup window
      const popup = window.open(
        authUrl,
        'microsoft-auth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );
     
      console.log('🪟 Popup window opened:', popup ? 'Success' : 'Failed');
     
      if (!popup) {
        console.error('Failed to open Microsoft auth popup - popup blocked or failed');
        alert('Please allow popups for this site to use Microsoft authentication');
        return false;
      }
     
      // Callback can load on redirect URI origin (e.g. 5173) when app is on another port (e.g. 3001)
      const callbackOrigin = redirectBase.replace(/\/auth\/microsoft\/callback.*$/, '').replace(/\/$/, '');
      const allowedOrigins = [window.location.origin];
      if (callbackOrigin && callbackOrigin !== window.location.origin) allowedOrigins.push(callbackOrigin);

      // Wait for popup to close or receive message
      return new Promise<boolean>((resolve, reject) => {
        console.log('⏳ Waiting for popup to close or receive message...');
       
        // Add timeout to prevent infinite loading
        const timeout = setTimeout(() => {
          console.log('⏰ Microsoft auth timeout - popup took too long');
          clearInterval(checkClosed);
          window.removeEventListener('message', messageListener);
          try {
            if (!popup.closed) popup.close();
          } catch (_) { /* COOP may block */ }
          resolve(false);
        }, 60000); // 60 second timeout
       
        const checkClosed = setInterval(() => {
          try {
            if (popup.closed) {
              console.log('🪟 Popup window closed');
              clearInterval(checkClosed);
              clearTimeout(timeout);
              resolve(false);
            }
          } catch (_) {
            // Cross-Origin-Opener-Policy may block reading popup.closed when callback is on another port; ignore
          }
        }, 1000);
       
        // Listen for messages from popup (allow same origin or callback origin for cross-port dev)
        const messageListener = async (event: MessageEvent) => {
          console.log('📨 Message received from popup:', event.data);
         
          if (!allowedOrigins.includes(event.origin)) {
            console.log('❌ Message from wrong origin:', event.origin, 'allowed:', allowedOrigins);
            return;
          }
         
          if (event.data.type === 'MICROSOFT_AUTH_SUCCESS') {
            console.log('✅ Microsoft auth success! User data:', event.data.user);
           
            // Check if there was an error stored in localStorage
            const storedError = localStorage.getItem('microsoft_auth_error');
            if (storedError) {
              const errorDetails = JSON.parse(storedError);
              console.error('🚨 Microsoft Graph API Error Details:', errorDetails);
              console.error('🚨 Full Error Message:', errorDetails.fullError);
              console.error('🚨 Error Stack:', errorDetails.stack);
              localStorage.removeItem('microsoft_auth_error'); // Clean up
            }
           
            clearInterval(checkClosed);
            clearTimeout(timeout);
            window.removeEventListener('message', messageListener);
            popup.close();
           
            // Send Microsoft user data to backend
            const microsoftUser = event.data.user;
            
            // Validate email format and restrict to cloudfuze.com domain only
            if (!microsoftUser.email || !microsoftUser.email.includes('@')) {
              console.error('❌ Access denied: Invalid email address format');
              clearInterval(checkClosed);
              window.removeEventListener('message', messageListener);
              popup.close();
              resolve(false);
              return;
            }
            
            // Restrict access to only cloudfuze.com domain
            if (!microsoftUser.email.endsWith('@cloudfuze.com')) {
              console.error('❌ Access denied: Only cloudfuze.com domain is allowed');
              alert('Access denied: Only users with @cloudfuze.com email addresses are allowed to access this application.');
              clearInterval(checkClosed);
              window.removeEventListener('message', messageListener);
              popup.close();
              resolve(false);
              return;
            }
            
            const backendUrl = BACKEND_URL;
           
            let signedIn = false;
            let serverError: ReturnType<typeof createMicrosoftServerError> | null = null;
            try {
              const response = await fetch(`${backendUrl}/api/auth/microsoft`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  id: microsoftUser.id,
                  name: microsoftUser.name,
                  email: microsoftUser.email,
                  accessToken: microsoftUser.accessToken
                })
              });
 
              if (response.ok) {
                const data = await response.json();
               
                if (data.success) {
                  clearDataIfDifferentUser(data.user);
                  sessionTimesRef.current = readSessionTimes(data) ?? DEFAULT_SESSION_TIMES;
                  // Store user and token from backend
                  localStorage.setItem('cpq_user', JSON.stringify(data.user));
                  localStorage.setItem('cpq_token', data.token);
                 
                  // Update state
                  setUser(data.user);
                  setIsAuthenticated(true);
                  
                  // Identify user in Clarity (so email appears in dashboard)
                  identify(data.user.email, {
                    name: data.user.name,
                    email: data.user.email,
                    userId: data.user.id
                  });
                  
                  // Track Microsoft sign-in event
                  track('user.sign_in', {
                    method: 'microsoft',
                    email: data.user.email
                  });
                  signedIn = true;
                } else {
                  console.error('Backend rejected Microsoft sign-in');
                }
              } else {
                console.error('Backend Microsoft sign-in failed with status', response.status);
                const body = await response.json().catch(() => null);
                const message = microsoftBackendErrorMessage(response.status, body);
                if (message) serverError = createMicrosoftServerError(response.status, message);
              }
            } catch (backendError) {
              console.error('Backend Microsoft auth error:', backendError);
            }
           
            // Cleanup PKCE artifacts
            try {
              localStorage.removeItem('msal_code_verifier');
              localStorage.removeItem('msal_client_id');
            } catch (_) {}
           
            if (serverError) {
              reject(serverError);
              return;
            }
            resolve(signedIn);
          } else if (event.data.type === 'MICROSOFT_AUTH_ERROR') {
            clearInterval(checkClosed);
            clearTimeout(timeout);
            window.removeEventListener('message', messageListener);
            popup.close();
            console.error('Microsoft authentication error:', event.data.error);
            // Cleanup PKCE artifacts on error
            try {
              localStorage.removeItem('msal_code_verifier');
              localStorage.removeItem('msal_client_id');
            } catch (_) {}
            const popupMessage = microsoftPopupErrorMessage(event.data.error);
            if (popupMessage) {
              reject(createMicrosoftServerError(0, popupMessage));
              return;
            }
            resolve(false);
          }
        };
       
        window.addEventListener('message', messageListener);
      });
     
    } catch (error: any) {
      if (error?.code === 'NOT_CONFIGURED' || error?.message === 'NOT_CONFIGURED') {
        setLoading(false);
        throw error;
      }
      console.error('Microsoft login error:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };
 
  // fromOtherTab: another tab already ended the server session and cleared storage
  const endSession = (reason: SessionEndReason, fromOtherTab = false) => {
    const token = localStorage.getItem('cpq_token');
    if (!fromOtherTab && token) endServerSession(token);

    guardRef.current?.stop();
    guardRef.current = null;
    setWarning(null);

    const showSignOutMessage = ({ title, body, autoCloseMs }: { title: string; body: string; autoCloseMs: number | null }) => {
      // Create a custom modal for better UX
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`;
     
      modal.innerHTML = `
        <div style="
          background: white;
          padding: 2rem;
          border-radius: 12px;
          text-align: center;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
          max-width: 400px;
          margin: 1rem;
        ">
          <div style="
            width: 60px;
            height: 60px;
            background: #10B981;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1rem;
            font-size: 24px;
          ">✓</div>
          <h3 data-sign-out-title style="
            color: #1F2937;
            margin: 0 0 0.5rem;
            font-size: 1.25rem;
            font-weight: 600;
          "></h3>
          <p data-sign-out-body style="
            color: #6B7280;
            margin: 0 0 1.5rem;
            font-size: 0.875rem;
          "></p>
          <button onclick="this.closest('div').parentElement.remove()" style="
            background: #3B82F6;
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            font-weight: 500;
            cursor: pointer;
            font-size: 0.875rem;
          ">Continue</button>
        </div>
      `;
     
      const titleEl = modal.querySelector('[data-sign-out-title]');
      const bodyEl = modal.querySelector('[data-sign-out-body]');
      if (titleEl) titleEl.textContent = title;
      if (bodyEl) bodyEl.textContent = body;

      document.body.appendChild(modal);

      if (autoCloseMs !== null) {
        setTimeout(() => {
          if (modal.parentElement) {
            modal.remove();
          }
        }, autoCloseMs);
      }
    };

    // A tab closed by another tab's sign-out only explains timeouts; the user who clicked Sign out saw it there
    if (!fromOtherTab || reason !== 'user') showSignOutMessage(SIGN_OUT_MESSAGES[reason]);

    // Written before the token is removed so other tabs can read it when they react to the removal
    if (!fromOtherTab) shareSignOutReason(reason);

    // Shared PCs: the next person must not find this user's quotes or client details.
    // Removing cpq_token here is also what signs out the other open tabs.
    clearUserSessionData();

    setUser(null);
    setIsAuthenticated(false);

    navigate('/');
  };

  const logout = () => endSession('user');

  // Timers and listeners below must always call the latest endSession, not the one from their first render
  const endSessionRef = useRef(endSession);
  endSessionRef.current = endSession;

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const guard = startSessionGuard({
      initialRemainingMs: sessionTimesRef.current.idleRemainingMs,
      initialMaxAgeRemainingMs: sessionTimesRef.current.maxAgeRemainingMs,
      sendActivity: () => callSessionEndpoint('/api/auth/activity', 'POST'),
      checkSession: () => callSessionEndpoint('/api/auth/me', 'GET'),
      onWarningChange: (open, deadline, kind) => setWarning(open ? { deadline, kind } : null),
      onExpire: (kind) => endSessionRef.current(kind),
    });
    guardRef.current = guard;
    return () => {
      guard.stop();
      if (guardRef.current === guard) guardRef.current = null;
      setWarning(null);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      // key is null when another tab cleared storage wholesale
      if (event.key !== 'cpq_token' && event.key !== null) return;
      const token = localStorage.getItem('cpq_token');
      if (!token && isAuthenticated) endSessionRef.current(readSharedSignOutReason() ?? 'user', true);
      // Covers a sign-in in another tab, including as a different user
      else if (token && event.key === 'cpq_token' && event.oldValue !== token) restoreSession();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [isAuthenticated, restoreSession]);

  const staySignedIn = () => {
    guardRef.current?.staySignedIn();
  };

  const value: AuthContextType = {
    isAuthenticated,
    user,
    loginWithMicrosoft,
    logout,
    loading
  };
 
  return (
    <AuthContext.Provider value={value}>
      {children}
      {warning !== null && (
        <SessionTimeoutWarning
          deadline={warning.deadline}
          kind={warning.kind}
          onStaySignedIn={staySignedIn}
          onSignOut={logout}
        />
      )}
    </AuthContext.Provider>
  );
};
 
// Custom hook to use auth context
// For screens that also open outside AuthProvider (approval portals reached from email links).
export const useOptionalAuth = (): AuthContextType | undefined => useContext(AuthContext);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}