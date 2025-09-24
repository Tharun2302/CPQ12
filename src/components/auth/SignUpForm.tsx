import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { validateSignUpForm, getFieldError } from '../../utils/validation';
import { AuthError } from '../../types/auth';

interface SignUpFormProps {
  onSuccess?: () => void;
  onError?: (message: string) => void;
}

const SignUpForm: React.FC<SignUpFormProps> = ({ onSuccess, onError }) => {
  const { signup, signupWithMicrosoft, loading } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState<AuthError[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear errors when user starts typing
    if (errors.length > 0) {
      setErrors([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    const validation = validateSignUpForm(
      formData.name,
      formData.email,
      formData.password,
      formData.confirmPassword
    );
    
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);
    
    try {
      const success = await signup(formData);
      
      if (success) {
        onSuccess?.();
      } else {
        setErrors([{ field: 'general', message: 'Email already exists. Please use a different email.' }]);
        onError?.('Email already exists. Please use a different email.');
      }
    } catch (error) {
      console.error('Sign up error:', error);
      setErrors([{ field: 'general', message: 'An error occurred. Please try again.' }]);
      onError?.('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignup = async () => {
    setIsGoogleLoading(true);
    
    try {
      // Google authentication will be implemented
      console.log('Google signup clicked - to be implemented');
      setErrors([{ field: 'general', message: 'Google authentication is coming soon!' }]);
      onError?.('Google authentication is coming soon!');
    } catch (error) {
      console.error('Google signup error:', error);
      setErrors([{ field: 'general', message: 'An error occurred with Google authentication.' }]);
      onError?.('An error occurred with Google authentication.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleMicrosoftSignup = async () => {
    setIsMicrosoftLoading(true);
    
    try {
      const success = await signupWithMicrosoft();
      
      if (success) {
        onSuccess?.();
      } else {
        setErrors([{ field: 'general', message: 'Microsoft authentication is not configured. Please use email/password for now.' }]);
        onError?.('Microsoft authentication is not configured. Please use email/password for now.');
      }
    } catch (error) {
      console.error('Microsoft signup error:', error);
      setErrors([{ field: 'general', message: 'Microsoft authentication is coming soon! Please use email/password for now.' }]);
      onError?.('Microsoft authentication is coming soon! Please use email/password for now.');
    } finally {
      setIsMicrosoftLoading(false);
    }
  };

  const nameError = getFieldError(errors, 'name');
  const emailError = getFieldError(errors, 'email');
  const passwordError = getFieldError(errors, 'password');
  const confirmPasswordError = getFieldError(errors, 'confirmPassword');
  const generalError = getFieldError(errors, 'general');

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white shadow-lg rounded-lg p-8">
        <div className="text-center mb-6">
          <div className="mb-4">
            <span className="inline-block bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm sm:text-base font-bold px-4 sm:px-6 py-2 sm:py-3 rounded-full shadow-lg transform hover:scale-105 transition-all duration-300 text-center max-w-full">
              ✨ Welcome to CloudFuze CPQ Quote ✨
            </span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Sign Up</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* General Error */}
          {generalError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {generalError}
            </div>
          )}

          {/* Name Field */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Full Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                nameError ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Enter your full name"
              required
            />
            {nameError && (
              <p className="mt-1 text-sm text-red-600">{nameError}</p>
            )}
          </div>

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
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                passwordError ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Create a password"
              required
            />
            {passwordError && (
              <p className="mt-1 text-sm text-red-600">{passwordError}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Password must be at least 6 characters with letters and numbers
            </p>
          </div>

          {/* Confirm Password Field */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                confirmPasswordError ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Confirm your password"
              required
            />
            {confirmPasswordError && (
              <p className="mt-1 text-sm text-red-600">{confirmPasswordError}</p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || isGoogleLoading || isMicrosoftLoading}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Creating Account...
              </div>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or continue with</span>
          </div>
        </div>

        {/* Google Sign Up Button */}
        <button
          onClick={handleGoogleSignup}
          disabled={isSubmitting || isGoogleLoading || isMicrosoftLoading}
          className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-3"
        >
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {isGoogleLoading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
              Creating account...
            </div>
          ) : (
            'Continue with Google'
          )}
        </button>

        {/* Microsoft Sign Up Button */}
        <button
          onClick={handleMicrosoftSignup}
          disabled={isSubmitting || isGoogleLoading || isMicrosoftLoading}
          className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
            <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
            <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
            <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
            <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
          </svg>
          {isMicrosoftLoading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
              Creating account...
            </div>
          ) : (
            'Continue with Microsoft Account'
          )}
        </button>

        {/* Sign In Link */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/signin" className="text-green-600 hover:text-green-700 font-medium">
              Sign in
            </Link>
          </p>
        </div>

        {/* Terms and Privacy */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            By creating an account, you agree to our{' '}
            <a href="#" className="text-blue-600 hover:text-blue-500">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#" className="text-blue-600 hover:text-blue-500">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignUpForm;
