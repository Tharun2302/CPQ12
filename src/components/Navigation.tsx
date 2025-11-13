import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Calculator, FileText, Sparkles, Upload, Building, Menu, X, CheckCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import UserMenu from './auth/UserMenu';

interface NavigationProps {
  currentTab: string;
}

const Navigation: React.FC<NavigationProps> = ({ currentTab }) => {
  const { isAuthenticated } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu when window is resized to larger screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) { // lg breakpoint
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const tabs = [
    { id: 'deal', label: 'Deal', icon: Building, path: '/dashboard/deal' },
    { id: 'configure', label: 'Configure', icon: Calculator, path: '/dashboard/configure' },
    // Pricing tab hidden per requirement
    // { id: 'pricing-config', label: 'Pricing', icon: DollarSign, path: '/dashboard/pricing-config' },
    { id: 'quote', label: 'Quote', icon: FileText, path: '/dashboard/quote' },
    { id: 'documents', label: 'Documents', icon: FileText, path: '/dashboard/documents' },
    { id: 'templates', label: 'Templates', icon: Upload, path: '/dashboard/templates' },
    { id: 'approval', label: 'Approval', icon: CheckCircle, path: '/dashboard/approval' },
    // Settings tab hidden per requirement
    // { id: 'settings', label: 'Settings', icon: Settings, path: '/dashboard/settings' },
  ];

  return (
    <nav className="bg-gradient-to-r from-white via-blue-50/50 to-indigo-50/50 shadow-2xl border-b border-blue-100/50 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center h-16 relative">
          {/* Logo Section - Clickable to navigate to Deal page */}
          <Link 
            to="/dashboard/deal" 
            className="flex items-center gap-3 absolute left-0 cursor-pointer hover:opacity-80 transition-opacity duration-200"
          >
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl">
                <Calculator className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                <Sparkles className="w-2 h-2 text-white" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              Zenop.ai
            </h1>
          </Link>

          {/* Desktop Navigation - Centered */}
          {isAuthenticated && (
            <div className="hidden lg:flex items-center space-x-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = currentTab === tab.id;
                return (
                  <Link
                    key={tab.id}
                    to={tab.path}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-300 ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                        : 'text-gray-700 hover:text-gray-900 hover:bg-white/60 hover:shadow-md'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="font-semibold text-sm">{tab.label}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* User Menu - Right Side (Desktop) */}
          {isAuthenticated && (
            <div className="hidden lg:block absolute right-0">
              <UserMenu />
            </div>
          )}

          {/* Mobile Menu Button */}
          {isAuthenticated && (
            <div className="lg:hidden absolute right-0 flex items-center space-x-3">
              <UserMenu />
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-white/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {isMobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Mobile Navigation Menu */}
        {isAuthenticated && isMobileMenuOpen && (
          <div className="lg:hidden border-t border-blue-100/50 py-4">
            <div className="flex flex-col space-y-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = currentTab === tab.id;
                return (
                  <Link
                    key={tab.id}
                    to={tab.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                        : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-semibold">{tab.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;