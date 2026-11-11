import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface AuthSignalReporterProps {
  onChange: (signal: string | null) => void;
}

// App renders AuthProvider as a child, so it cannot call useAuth; this relays sign-in/out to it
// so catalog loads run after login and not on public pages.
function AuthSignalReporter({ onChange }: AuthSignalReporterProps) {
  const { isAuthenticated, user } = useAuth();
  const signal = isAuthenticated ? user?.id ?? 'signed-in' : null;

  useEffect(() => {
    onChange(signal);
  }, [signal, onChange]);

  return null;
}

export default AuthSignalReporter;
