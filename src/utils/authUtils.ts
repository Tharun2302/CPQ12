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

// Clear all authentication data
export function clearAuthData(): void {
  try {
    localStorage.removeItem('cpq_user');
    localStorage.removeItem('cpq_token');
  } catch (error) {
    console.error('Error clearing auth data:', error);
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
