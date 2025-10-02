import React from 'react';
import HubSpotTestHelper from '../components/HubSpotTestHelper';

const DebugEnv: React.FC = () => {
  const clientId = import.meta.env.VITE_MSAL_CLIENT_ID as string | undefined;
  const redirectUri = (import.meta.env.VITE_MSAL_REDIRECT_URI as string | undefined) || (window.location.origin + '/auth/microsoft/callback');
  const envVars = {
    VITE_APP_NAME: import.meta.env.VITE_APP_NAME,
    VITE_APP_VERSION: import.meta.env.VITE_APP_VERSION,
    VITE_BACKEND_URL: import.meta.env.VITE_BACKEND_URL,
    VITE_MSAL_CLIENT_ID: import.meta.env.VITE_MSAL_CLIENT_ID,
    VITE_MSAL_REDIRECT_URI: import.meta.env.VITE_MSAL_REDIRECT_URI,
    VITE_HUBSPOT_API_KEY: import.meta.env.VITE_HUBSPOT_API_KEY,
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-6xl mx-auto px-4 space-y-8">
        <h1 className="text-3xl font-bold text-gray-900">Environment Variables Debug</h1>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Current Environment Variables</h2>
          <div className="space-y-2">
            {Object.entries(envVars).map(([key, value]) => (
              <div key={key} className="flex justify-between items-center py-2 border-b">
                <span className="font-mono text-sm text-gray-600">{key}</span>
                <span className="font-mono text-sm text-gray-900">
                  {value || <span className="text-red-500">Not set</span>}
                </span>
              </div>
            ))}
          </div>
        </div>

        <HubSpotTestHelper />
      </div>
    </div>
  );
};

export default DebugEnv;


