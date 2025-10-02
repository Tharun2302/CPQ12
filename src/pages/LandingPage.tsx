import React from 'react';
import { Link } from 'react-router-dom';
import { Calculator, Users, FileText, BarChart3, Shield, Zap } from 'lucide-react';

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <div className="mb-8">
            <span className="inline-block bg-gradient-to-r from-blue-600 to-purple-600 text-white text-lg font-bold px-8 py-3 rounded-full shadow-lg transform hover:scale-105 transition-all duration-300">
              ✨ Welcome to CloudFuze ZENOP Quote ✨
            </span>
          </div>
          <p className="text-xl text-gray-600 mb-8 max-w-4xl mx-auto leading-relaxed">
            Streamline your sales process with CloudFuze's powerful ZENOP solution. 
            Generate accurate quotes, manage templates, and integrate with HubSpot 
            to close more deals faster.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/signup"
              className="bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Get Started Free
            </Link>
            <Link
              to="/signin"
              className="bg-white text-blue-600 px-8 py-3 rounded-lg text-lg font-semibold border-2 border-blue-600 hover:bg-blue-50 transition-colors"
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
            <div className="bg-white p-6 rounded-lg shadow-md">
              <Calculator className="h-12 w-12 text-blue-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Smart Pricing</h3>
              <p className="text-gray-600">
                Dynamic pricing calculations based on your product configurations and business rules.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <FileText className="h-12 w-12 text-green-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Template Management</h3>
              <p className="text-gray-600">
                Create and manage professional quote templates with drag-and-drop simplicity.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <Users className="h-12 w-12 text-purple-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">HubSpot Integration</h3>
              <p className="text-gray-600">
                Seamlessly sync with HubSpot CRM to manage deals, contacts, and companies.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <Shield className="h-12 w-12 text-red-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Digital Signatures</h3>
              <p className="text-gray-600">
                Secure digital signature workflow for quote approval and contract management.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <BarChart3 className="h-12 w-12 text-yellow-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Analytics</h3>
              <p className="text-gray-600">
                Track quote performance, conversion rates, and sales insights.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <Zap className="h-12 w-12 text-orange-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Fast & Reliable</h3>
              <p className="text-gray-600">
                Lightning-fast quote generation with 99.9% uptime and enterprise security.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-20 bg-blue-600 rounded-2xl p-12 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to transform your sales process?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Trusted by leading companies worldwide to streamline their quoting process.
          </p>
          <Link
            to="/signup"
            className="bg-white text-blue-600 px-8 py-3 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-colors"
          >
            Start Your Free Trial
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center mb-4">
            <Calculator className="h-6 w-6 text-blue-400 mr-2" />
            <span className="text-xl font-bold">ZENOP Pro</span>
          </div>
          <p className="text-gray-400">
            © 2025 ZENOP Pro. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
