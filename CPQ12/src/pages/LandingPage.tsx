import React from 'react';
import { Link } from 'react-router-dom';
import { Calculator, Users, FileText, BarChart3, Shield, Zap } from 'lucide-react';

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

        {/* Features Section */}
        <div className="mt-20">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Everything you need to succeed
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              <span className="inline-block bg-indigo-100 rounded-full p-3 mb-4">
                <Calculator className="h-8 w-8 text-indigo-600" />
              </span>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Smart Pricing</h3>
              <p className="text-gray-600">
                Dynamic pricing calculations based on your product configurations and business rules.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              <span className="inline-block bg-violet-100 rounded-full p-3 mb-4">
                <FileText className="h-8 w-8 text-violet-600" />
              </span>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Template Management</h3>
              <p className="text-gray-600">
                Create and manage professional quote templates with drag-and-drop simplicity.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              <span className="inline-block bg-sky-100 rounded-full p-3 mb-4">
                <Users className="h-8 w-8 text-sky-600" />
              </span>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">HubSpot Integration</h3>
              <p className="text-gray-600">
                Seamlessly sync with HubSpot CRM to manage deals, contacts, and companies.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              <span className="inline-block bg-rose-100 rounded-full p-3 mb-4">
                <Shield className="h-8 w-8 text-rose-600" />
              </span>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Digital Signatures</h3>
              <p className="text-gray-600">
                Secure digital signature workflow for quote approval and contract management.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              <span className="inline-block bg-amber-100 rounded-full p-3 mb-4">
                <BarChart3 className="h-8 w-8 text-amber-600" />
              </span>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Analytics</h3>
              <p className="text-gray-600">
                Track quote performance, conversion rates, and sales insights.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              <span className="inline-block bg-teal-100 rounded-full p-3 mb-4">
                <Zap className="h-8 w-8 text-teal-600" />
              </span>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Fast & Reliable</h3>
              <p className="text-gray-600">
                Lightning-fast quote generation with 99.9% uptime and enterprise security.
              </p>
            </div>
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
