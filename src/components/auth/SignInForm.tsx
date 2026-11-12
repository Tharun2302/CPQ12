import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { MICROSOFT_FAILED_MESSAGE, isMicrosoftServerError } from '../../utils/microsoftSignInErrors';

interface SignInFormProps {
  onSuccess?: () => void;
  onError?: (message: string) => void;
}

const MICROSOFT_NOT_CONFIGURED_MESSAGE =
  'Microsoft sign-in is not configured. Please contact your administrator.';

// Microsoft is the only way to sign in; there is no email/password form.
const SignInForm: React.FC<SignInFormProps> = ({ onSuccess, onError }) => {
  const { loginWithMicrosoft } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false);

  const showError = (message: string) => {
    setErrorMessage(message);
    onError?.(message);
  };

  const handleMicrosoftLogin = async () => {
    setIsMicrosoftLoading(true);
    setErrorMessage(null);

    try {
      const success = await loginWithMicrosoft();
      if (success) {
        onSuccess?.();
      } else {
        showError(MICROSOFT_FAILED_MESSAGE);
      }
    } catch (error: unknown) {
      const { code, message } = (error ?? {}) as { code?: string; message?: string };
      if (code === 'NOT_CONFIGURED' || message === 'NOT_CONFIGURED') {
        showError(MICROSOFT_NOT_CONFIGURED_MESSAGE);
      } else if (isMicrosoftServerError(error)) {
        showError(error.message);
      } else {
        console.error('Microsoft login error:', error);
        showError(MICROSOFT_FAILED_MESSAGE);
      }
    } finally {
      setIsMicrosoftLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto min-h-[400px] flex items-center justify-center p-4">
      <div className="bg-white shadow-xl rounded-xl overflow-hidden w-full">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white text-center py-4 px-4">
          <span className="text-sm sm:text-base font-bold">
            ✨ Welcome to CloudFuze Zenop.ai Quote ✨
          </span>
        </div>

        <div className="p-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-blue-600 text-center mb-8">Sign In</h2>

          {errorMessage && (
            <div role="alert" className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {errorMessage}
            </div>
          )}

          <button
            onClick={handleMicrosoftLogin}
            disabled={isMicrosoftLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-800 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
              <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
              <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
              <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
            </svg>
            {isMicrosoftLoading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent" />
                Signing in...
              </span>
            ) : (
              'Continue with Microsoft Account'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignInForm;
