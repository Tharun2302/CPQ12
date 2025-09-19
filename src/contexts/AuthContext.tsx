import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, AuthContextType, SignUpData, AuthProvider as AuthProviderType } from '../types/auth';
 
// Create the context
const AuthContext = createContext<AuthContextType | undefined>(undefined);
 
// Microsoft authentication using custom OAuth implementation
// This avoids MSAL library issues that cause white page problems
 
// Mock user database (in a real app, this would be API calls)
const mockUsers: User[] = [
  {
    id: 'user_1',
    name: 'raya',
    email: 'raya@gmail.com',
    provider: 'email',
    createdAt: '2024-01-01T00:00:00Z'
  },
  {
    id: 'user_2',
    name: 'tharun',
    email: 'tharun@gmail.com',
    provider: 'email',
    createdAt: '2024-01-02T00:00:00Z'
  }
];
 
// Mock passwords (in a real app, these would be hashed)
const mockPasswords: { [key: string]: string } = {
  'raya@gmail.com': 'raya123',
  'tharun@gmail.com': 'tharun123'
};
 
interface AuthProviderComponentProps {
  children: ReactNode;
}
 
export const AuthProvider: React.FC<AuthProviderComponentProps> = ({ children }) => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
 
  // Check for existing authentication on app load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const storedUser = localStorage.getItem('cpq_user');
        const storedToken = localStorage.getItem('cpq_token');
       
        if (storedUser && storedToken) {
          // Only call backend if the token looks like a JWT we issued
          const looksLikeJwt = (t: string) => t.split('.').length === 3;
          const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
         
          if (looksLikeJwt(storedToken)) {
            // Verify token with backend
            try {
              const response = await fetch(`${backendUrl}/api/auth/me`, {
                headers: {
                  'Authorization': `Bearer ${storedToken}`
                }
              });
 
              if (response.ok) {
                const data = await response.json();
                if (data.success) {
                  setUser(data.user);
                  setIsAuthenticated(true);
                } else {
                  // Token invalid, clear storage
                  localStorage.removeItem('cpq_user');
                  localStorage.removeItem('cpq_token');
                }
              } else {
                // Token invalid, clear storage
                localStorage.removeItem('cpq_user');
                localStorage.removeItem('cpq_token');
              }
            } catch (backendError) {
              console.error('Backend auth check failed:', backendError);
              // Fallback to local storage if backend is down
              const userData = JSON.parse(storedUser);
              setUser(userData);
              setIsAuthenticated(true);
            }
          } else {
            // Token is not a JWT (likely local/mock/MS access token). Use local user only.
            try {
              const userData = JSON.parse(storedUser);
              setUser(userData);
              setIsAuthenticated(true);
            } catch (e) {
              localStorage.removeItem('cpq_user');
              localStorage.removeItem('cpq_token');
            }
          }
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        // Clear invalid data
        localStorage.removeItem('cpq_user');
        localStorage.removeItem('cpq_token');
      } finally {
        setLoading(false);
      }
    };
 
    checkAuth();
  }, []);
 
  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setLoading(true);
     
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password })
      });
 
      if (response.ok) {
        const data = await response.json();
       
        if (data.success) {
          // Store user and token
          localStorage.setItem('cpq_user', JSON.stringify(data.user));
          localStorage.setItem('cpq_token', data.token);
         
          // Update state
          setUser(data.user);
          setIsAuthenticated(true);
         
          return true;
        }
      }
     
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };
 
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
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(digest);
  };
 
  const signup = async (userData: SignUpData): Promise<boolean> => {
    try {
      setLoading(true);
     
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: userData.name,
          email: userData.email,
          password: userData.password
        })
      });
 
      if (response.ok) {
        const data = await response.json();
       
        if (data.success) {
          // Store user and token
          localStorage.setItem('cpq_user', JSON.stringify(data.user));
          localStorage.setItem('cpq_token', data.token);
         
          // Update state
          setUser(data.user);
          setIsAuthenticated(true);
         
          return true;
        }
      }
     
      return false;
    } catch (error) {
      console.error('Signup error:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };
 
  const loginWithMicrosoft = async (): Promise<boolean> => {
    try {
      setLoading(true);
      console.log('🚀 Starting Microsoft sign-in...');
     
      // Simple Microsoft OAuth redirect (no complex libraries)
      const clientId = import.meta.env.VITE_MSAL_CLIENT_ID as string;
      console.log('🔑 Client ID:', clientId ? 'Found' : 'Missing');
     
      if (!clientId) {
        console.warn('Microsoft authentication is not configured - Client ID missing or invalid');
        return false;
      }
     
      // Create Microsoft OAuth URL with PKCE
      const redirectBase = (import.meta.env.VITE_MSAL_REDIRECT_URI as string) || (window.location.origin + '/auth/microsoft/callback');
      const redirectUri = encodeURIComponent(redirectBase);
      const scopes = encodeURIComponent('openid profile email offline_access https://graph.microsoft.com/User.Read');
      const state = Math.random().toString(36).substring(2, 15);
 
      // PKCE: generate code verifier and challenge
      const codeVerifier = generateRandomString(64);
      const codeChallenge = await createCodeChallenge(codeVerifier);
      // Use localStorage so the popup callback window can access it
      localStorage.setItem('msal_code_verifier', codeVerifier);
 
      const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
        `client_id=${clientId}&` +
        `response_type=code&` +
        `redirect_uri=${redirectUri}&` +
        `scope=${scopes}&` +
        `response_mode=query&` +
        `state=${state}&` +
        `code_challenge=${encodeURIComponent(codeChallenge)}&` +
        `code_challenge_method=S256&` +
        `prompt=select_account`;
 
      console.log('🌐 Microsoft OAuth URL:', authUrl);
      console.log('🔗 Redirect URI:', redirectBase);
 
      // Store client ID for callback page (in localStorage for cross-window access)
      localStorage.setItem('msal_client_id', clientId);
     
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
     
      // Wait for popup to close or receive message
      return new Promise((resolve) => {
        console.log('⏳ Waiting for popup to close or receive message...');
       
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            console.log('🪟 Popup window closed');
            clearInterval(checkClosed);
            resolve(false);
          }
        }, 1000);
       
        // Listen for messages from popup
        const messageListener = async (event: MessageEvent) => {
          console.log('📨 Message received from popup:', event.data);
         
          if (event.origin !== window.location.origin) {
            console.log('❌ Message from wrong origin:', event.origin);
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
            window.removeEventListener('message', messageListener);
            popup.close();
           
            // Send Microsoft user data to backend
            const microsoftUser = event.data.user;
            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
           
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
                  // Store user and token from backend
                  localStorage.setItem('cpq_user', JSON.stringify(data.user));
                  localStorage.setItem('cpq_token', data.token);
                 
                  // Update state
                  setUser(data.user);
                  setIsAuthenticated(true);
                } else {
                  // Backend may be disabled in Render free deploys; store MS access token locally and skip backend auth
                  const user: User = {
                    id: microsoftUser.id,
                    name: microsoftUser.name,
                    email: microsoftUser.email,
                    provider: 'microsoft' as AuthProviderType,
                    createdAt: new Date().toISOString()
                  };
                  localStorage.setItem('cpq_user', JSON.stringify(user));
                  localStorage.setItem('cpq_token', microsoftUser.accessToken);
                  setUser(user);
                  setIsAuthenticated(true);
                }
              } else {
                // Same fallback as above if backend returns non-OK
                const user: User = {
                  id: microsoftUser.id,
                  name: microsoftUser.name,
                  email: microsoftUser.email,
                  provider: 'microsoft' as AuthProviderType,
                  createdAt: new Date().toISOString()
                };
                localStorage.setItem('cpq_user', JSON.stringify(user));
                localStorage.setItem('cpq_token', microsoftUser.accessToken);
                setUser(user);
                setIsAuthenticated(true);
              }
            } catch (backendError) {
              console.error('Backend Microsoft auth error:', backendError);
              // Fallback to local storage if backend fails
              const user: User = {
                id: microsoftUser.id,
                name: microsoftUser.name,
                email: microsoftUser.email,
                provider: 'microsoft' as AuthProviderType,
                createdAt: new Date().toISOString()
              };
             
              localStorage.setItem('cpq_user', JSON.stringify(user));
              localStorage.setItem('cpq_token', microsoftUser.accessToken);
             
              setUser(user);
              setIsAuthenticated(true);
            }
           
            // Cleanup PKCE artifacts
            try {
              localStorage.removeItem('msal_code_verifier');
              localStorage.removeItem('msal_client_id');
            } catch (_) {}
           
            resolve(true);
          } else if (event.data.type === 'MICROSOFT_AUTH_ERROR') {
            clearInterval(checkClosed);
            window.removeEventListener('message', messageListener);
            popup.close();
            console.error('Microsoft authentication error:', event.data.error);
            // Cleanup PKCE artifacts on error
            try {
              localStorage.removeItem('msal_code_verifier');
              localStorage.removeItem('msal_client_id');
            } catch (_) {}
            resolve(false);
          }
        };
       
        window.addEventListener('message', messageListener);
      });
     
    } catch (error) {
      console.error('Microsoft login error:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };
 
  const signupWithMicrosoft = async (): Promise<boolean> => {
    // For Microsoft, signup and login are the same process
    return await loginWithMicrosoft();
  };
 
  const logout = () => {
    // Show thank you message with a more elegant approach
    const showThankYouMessage = () => {
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
          <h3 style="
            color: #1F2937;
            margin: 0 0 0.5rem;
            font-size: 1.25rem;
            font-weight: 600;
          ">Thank you for visiting CloudFuze CPQ Quote!</h3>
          <p style="
            color: #6B7280;
            margin: 0 0 1.5rem;
            font-size: 0.875rem;
          ">We hope to see you again soon for your quoting needs.</p>
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
     
      document.body.appendChild(modal);
     
      // Auto-remove after 3 seconds
      setTimeout(() => {
        if (modal.parentElement) {
          modal.remove();
        }
      }, 3000);
    };
   
    // Show the message
    showThankYouMessage();
   
    // Clear localStorage
    localStorage.removeItem('cpq_user');
    localStorage.removeItem('cpq_token');
   
    // Update state
    setUser(null);
    setIsAuthenticated(false);
   
    // Navigate to home page after logout
    navigate('/');
  };
 
  const value: AuthContextType = {
    isAuthenticated,
    user,
    login,
    loginWithMicrosoft,
    logout,
    signup,
    signupWithMicrosoft,
    loading
  };
 
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
 
// Custom hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}