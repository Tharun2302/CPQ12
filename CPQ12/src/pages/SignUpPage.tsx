import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calculator } from 'lucide-react';
import SignUpForm from '../components/auth/SignUpForm';

const SignUpPage: React.FC = () => {
  const navigate = useNavigate();

  const handleSuccess = () => {
    navigate('/deal');
  };

  const handleError = (message: string) => {
    console.error('Sign up error:', message);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex flex-col">

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          <SignUpForm onSuccess={handleSuccess} onError={handleError} />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-gray-500">
            © 2025 CloudFuze Zenop.ai Quote. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default SignUpPage;
