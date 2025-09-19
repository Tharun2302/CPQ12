import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calculator } from 'lucide-react';
import SignInForm from '../components/auth/SignInForm';

const SignInPage: React.FC = () => {
  const navigate = useNavigate();

  const handleSuccess = () => {
    navigate('/dashboard');
  };

  const handleError = (message: string) => {
    console.error('Sign in error:', message);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col">

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          <SignInForm onSuccess={handleSuccess} onError={handleError} />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-gray-500">
            © 2025 CloudFuze CPQ Quote. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default SignInPage;
