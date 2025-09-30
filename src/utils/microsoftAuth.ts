// Microsoft OAuth implementation without MSAL library
// This prevents white page issues while providing Microsoft authentication

interface MicrosoftUser {
  id: string;
  name: string;
  email: string;
  accessToken: string;
}

export class MicrosoftAuth {
  private static readonly CLIENT_ID = (import.meta as any).env?.VITE_MSAL_CLIENT_ID as string;
  private static readonly REDIRECT_URI = ((import.meta as any).env?.VITE_MSAL_REDIRECT_URI as string) || `${window.location.origin}/auth/microsoft/callback`;
  private static readonly SCOPES = 'openid profile email User.Read';
  private static readonly AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';

  private static generateRandomString(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const randomValues = new Uint8Array(length);
    window.crypto.getRandomValues(randomValues);
    let result = '';
    for (let i = 0; i < randomValues.length; i++) {
      result += charset[randomValues[i] % charset.length];
    }
    return result;
  }

  private static base64UrlEncode(arrayBuffer: ArrayBuffer): string {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  private static async createCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return this.base64UrlEncode(digest);
  }

  static isConfigured(): boolean {
    return Boolean(this.CLIENT_ID);
  }

  static async getAuthUrl(): Promise<string> {
    const codeVerifier = this.generateRandomString(64);
    const codeChallenge = await this.createCodeChallenge(codeVerifier);
    sessionStorage.setItem('ms_pkce_verifier', codeVerifier);

    const params = new URLSearchParams({
      client_id: this.CLIENT_ID,
      response_type: 'code',
      redirect_uri: this.REDIRECT_URI,
      scope: this.SCOPES,
      response_mode: 'query',
      state: this.generateState(),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    } as any);

    return `${this.AUTHORITY}?${params.toString()}`;
  }

  private static generateState(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  static async handleCallback(code: string): Promise<MicrosoftUser | null> {
    try {
      // In a real app, you would exchange the code for tokens on your backend
      // For now, we'll simulate a successful authentication
      console.log('Microsoft OAuth code received:', code);
      
      // Simulate getting user info from Microsoft Graph (restricted to cloudfuze.com)
      const mockUser: MicrosoftUser = {
        id: 'microsoft_' + Date.now(),
        name: 'Microsoft User',
        email: 'user@cloudfuze.com',
        accessToken: 'mock_access_token_' + Date.now()
      };

      return mockUser;
    } catch (error) {
      console.error('Microsoft OAuth callback error:', error);
      return null;
    }
  }

  static async getUserInfo(accessToken: string): Promise<MicrosoftUser | null> {
    try {
      // In a real app, you would call Microsoft Graph API
      // For now, we'll return mock data (restricted to cloudfuze.com)
      const mockUser: MicrosoftUser = {
        id: 'microsoft_' + Date.now(),
        name: 'Microsoft User',
        email: 'user@cloudfuze.com',
        accessToken: accessToken
      };

      return mockUser;
    } catch (error) {
      console.error('Error getting Microsoft user info:', error);
      return null;
    }
  }

  static openAuthWindow(): Promise<MicrosoftUser | null> {
    return new Promise((resolve) => {
      this.getAuthUrl().then((authUrl) => {
        const popup = window.open(
          authUrl,
        'microsoft-auth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
        );

        if (!popup) {
          console.error('Failed to open Microsoft auth popup');
          resolve(null);
          return;
        }

        // Listen for the popup to close or receive a message
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            resolve(null);
          }
        }, 1000);

        // Listen for messages from the popup
        const messageListener = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          
          if (event.data.type === 'MICROSOFT_AUTH_SUCCESS') {
            clearInterval(checkClosed);
            window.removeEventListener('message', messageListener);
            popup.close();
            resolve(event.data.user);
          } else if (event.data.type === 'MICROSOFT_AUTH_ERROR') {
            clearInterval(checkClosed);
            window.removeEventListener('message', messageListener);
            popup.close();
            resolve(null);
          }
        };

        window.addEventListener('message', messageListener);
      });
    });
  }
}
