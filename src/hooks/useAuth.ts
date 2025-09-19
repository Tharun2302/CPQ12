import { useAuth as useAuthContext } from '../contexts/AuthContext';

// Re-export the useAuth hook from context for convenience
export { useAuthContext as useAuth };

// Additional auth-related hooks can be added here
export function useAuthState() {
  const { isAuthenticated, user, loading } = useAuthContext();
  
  return {
    isAuthenticated,
    user,
    loading,
    isLoggedIn: isAuthenticated,
    isLoggedOut: !isAuthenticated
  };
}

export function useAuthActions() {
  const { login, logout, signup } = useAuthContext();
  
  return {
    login,
    logout,
    signup
  };
}
