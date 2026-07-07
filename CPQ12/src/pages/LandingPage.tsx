import React from 'react';
import { Link } from 'react-router-dom';
import { Calculator } from 'lucide-react';

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50">

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <div className="mb-8">
            <span className="inline-block bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-lg font-bold px-8 py-3 rounded-full shadow-lg transform hover:scale-105 transition-all duration-300">
              ✨ Welcome to CloudFuze Zenop.ai Quote ✨
            </span>
          </div>
          <p className="text-xl text-gray-600 mb-8 max-w-4xl mx-auto leading-relaxed">
            Streamline your sales process with CloudFuze's powerful Zenop.ai solution. 
            Generate accurate quotes, manage templates, and integrate with HubSpot 
            to close more deals faster.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/signin"
              className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:from-indigo-700 hover:to-violet-700 transition-colors shadow-lg"
            >
              Sign In
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-8 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center mb-4">
            <Calculator className="h-6 w-6 text-indigo-400 mr-2" />
            <span className="text-xl font-bold">Zenop.ai</span>
          </div>
          <p className="text-gray-400">
            © 2025 Zenop.ai. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
