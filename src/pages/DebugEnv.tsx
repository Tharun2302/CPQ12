import React from 'react';

const DebugEnv: React.FC = () => {
  const clientId = import.meta.env.VITE_MSAL_CLIENT_ID as string | undefined;
  const redirectUri = (import.meta.env.VITE_MSAL_REDIRECT_URI as string | undefined) || (window.location.origin + '/auth/microsoft/callback');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-xl w-full bg-white rounded-xl shadow p-6 space-y-4">
        <h1 className="text-xl font-semibold text-gray-800">Vite Env Debug</h1>
        <div className="text-sm text-gray-700">
          <p><strong>VITE_MSAL_CLIENT_ID:</strong> {clientId ? 'SET' : 'NOT SET'}</p>
          {clientId && <p className="break-all text-gray-600">{clientId}</p>}
          <p className="mt-2"><strong>VITE_MSAL_REDIRECT_URI:</strong> {redirectUri}</p>
          <p className="mt-2"><strong>Callback Route:</strong> /auth/microsoft/callback</p>
        </div>
      </div>
    </div>
  );
};

export default DebugEnv;


