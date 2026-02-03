import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { validateSignInForm, getFieldError } from '../../utils/validation';
import { AuthError } from '../../types/auth';
import { sanitizeEmailInput } from '../../utils/emojiSanitizer';
import { Eye, EyeOff } from 'lucide-react';


interface SignInFormProps {
  onSuccess?: () => void;
  onError?: (message: string) => void;
}

const SignInForm: React.FC<SignInFormProps> = ({ onSuccess, onError }) => {
  const { login, loginWithMicrosoft, loading } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [errors, setErrors] = useState<AuthError[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showManualSignIn, setShowManualSignIn] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    // Apply sanitization for email field
    const processedValue = name === 'email' ? sanitizeEmailInput(value) : value;
    setFormData(prev => ({
      ...prev,
      [name]: processedValue
    }));
    
    // Clear errors when user starts typing
    if (errors.length > 0) {
      setErrors([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    const validation = validateSignInForm(formData.email, formData.password);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);
    
    try {
      const success = await login(formData.email, formData.password);
      
      if (success) {
        onSuccess?.();
      } else {
        setErrors([{ field: 'general', message: 'Access denied. Only authorized accounts can access this application.' }]);
        onError?.('Access denied. Only authorized accounts can access this application.');
      }
    } catch (error) {
      console.error('Sign in error:', error);
      setErrors([{ field: 'general', message: 'An error occurred. Please try again.' }]);
      onError?.('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleMicrosoftLogin = async () => {
    setIsMicrosoftLoading(true);
    
    try {
      const success = await loginWithMicrosoft();
      
      if (success) {
        onSuccess?.();
      } else {
        setErrors([{ field: 'general', message: 'Microsoft authentication failed. Please try again or use email/password.' }]);
        onError?.('Microsoft authentication failed. Please try again or use email/password.');
      }
    } catch (error) {
      console.error('Microsoft login error:', error);
      setErrors([{ field: 'general', message: 'Microsoft authentication error. Please try again or use email/password.' }]);
      onError?.('Microsoft authentication error. Please try again or use email/password.');
    } finally {
      setIsMicrosoftLoading(false);
    }
  };

  const emailError = getFieldError(errors, 'email');
  const passwordError = getFieldError(errors, 'password');
  const generalError = getFieldError(errors, 'general');

  return (
    <div className="w-full max-w-md mx-auto min-h-[400px] flex items-center justify-center p-4">
      <div className="bg-white shadow-xl rounded-xl overflow-hidden w-full">
        {/* Gradient header bar - blue to purple */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white text-center py-4 px-4">
          <span className="text-sm sm:text-base font-bold">
            ✨ Welcome to CloudFuze Zenop.ai Quote ✨
          </span>
        </div>

        <div className="p-8">
          {/* Sign In title - bold blue, centered */}
          <h2 className="text-2xl sm:text-3xl font-bold text-blue-600 text-center mb-8">Sign In</h2>

          {/* Microsoft Sign In Button - primary action */}
          <button
            onClick={handleMicrosoftLogin}
            disabled={isSubmitting || isMicrosoftLoading}
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

          {!showManualSignIn ? (
            /* Or manual sign in - blue link style, centered */
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={() => setShowManualSignIn(true)}
                className="text-sm text-blue-600 hover:text-blue-700 underline font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
              >
                Or manual sign in
              </button>
            </div>
        ) : (
          <>
            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or continue with</span>
              </div>
            </div>

            {/* Manual Sign In - Email/Password form */}
            <form onSubmit={handleSubmit} className="space-y-6">
          {/* General Error */}
          {generalError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {generalError}
            </div>
          )}

          {/* Email Field */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                emailError ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Enter your email"
              required
            />
            {emailError && (
              <p className="mt-1 text-sm text-red-600">{emailError}</p>
            )}
          </div>

          {/* Password Field */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                className={`w-full px-3 py-2 pr-10 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  passwordError ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {passwordError && (
              <p className="mt-1 text-sm text-red-600">{passwordError}</p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || isMicrosoftLoading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Signing In...
              </div>
            ) : (
              'Sign In'
            )}
          </button>
            </form>
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setShowManualSignIn(false)}
                className="text-sm text-gray-500 hover:text-gray-700 focus:outline-none focus:underline"
              >
                Back to Microsoft sign in
              </button>
            </div>
          </>
        )}

        </div>
      </div>
    </div>
  );
};

export default SignInForm;
