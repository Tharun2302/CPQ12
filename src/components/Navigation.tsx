import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
<<<<<<< HEAD
import { FileText, Upload, Building, Menu, X, CheckCircle, FolderOpen, PenLine, BarChart3, FileCheck } from 'lucide-react';
=======
import { FileText, Upload, Building, Menu, X, CheckCircle, FolderOpen, PenLine, BarChart3 } from 'lucide-react';
>>>>>>> e8263ea5092ac3fd8517326dfcbc2b2e599c8d5e
import { useAuth } from '../hooks/useAuth';
import UserMenu from './auth/UserMenu';

interface NavigationProps {
  currentTab: string;
  /** Shows “Start Manual Approval” below Exhibits on every tab; opens manual flow (navigates to /approval if needed). */
  onStartManualApproval?: () => void;
}

const Navigation: React.FC<NavigationProps> = ({ currentTab, onStartManualApproval }) => {
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
    { id: 'deal',      label: 'Deal',      icon: Building, path: '/deal' },
    { id: 'configure', label: 'Configure', icon: FileText, path: '/configure' },
    // Pricing tab hidden per requirement
    // { id: 'pricing-config', label: 'Pricing', icon: DollarSign, path: '/dashboard/pricing-config' },
    { id: 'quote',     label: 'Quote',     icon: FileText, path: '/quote' },
<<<<<<< HEAD
    { id: 'documents', label: 'Documents', icon: FileText, path: '/documents' },
=======
>>>>>>> e8263ea5092ac3fd8517326dfcbc2b2e599c8d5e
    { id: 'approval',  label: 'Approval',  icon: CheckCircle, path: '/approval' },
    { id: 'esign',     label: 'e sign',   icon: PenLine, path: '/esign' },
    { id: 'esign-tracking', label: 'e sign status', icon: BarChart3, path: '/esign-tracking' },
    { id: 'templates', label: 'Templates', icon: Upload,   path: '/templates' },
    { id: 'exhibits',  label: 'Exhibits',  icon: FolderOpen, path: '/exhibits' },
    { id: 'documents', label: 'Documents', icon: FileText, path: '/documents' },
    // Settings tab hidden per requirement
    // { id: 'settings', label: 'Settings', icon: Settings, path: '/dashboard/settings' },
  ];

  return (
    <>
      {/* Desktop Vertical Sidebar - hidden on screens < lg (1024px) to prevent overlap */}
      {isAuthenticated && (
        <nav className="hidden lg:flex fixed left-0 top-0 h-full w-64 bg-gradient-to-b from-white via-blue-50/50 to-indigo-50/50 shadow-2xl border-r border-blue-100/50 backdrop-blur-md z-50 flex-col">
          {/* Logo Section */}
          <Link
            to="/deal"
            className="flex items-center gap-3 px-6 py-6 cursor-pointer hover:opacity-80 transition-opacity duration-200 border-b border-blue-100/50"
          >
            <h1 className="text-xl font-bold text-emerald-600">
              Zenop.ai
            </h1>
          </Link>

          {/* Vertical Navigation Links */}
          <div className="flex-1 flex flex-col py-4 px-3 space-y-2 overflow-y-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              const useActiveHighlight = isActive && tab.id !== 'approval';
              return (
                <Link
                  key={tab.id}
                  to={tab.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                    useActiveHighlight
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-white/60 hover:shadow-md'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0 text-current" />
                  <span className="font-semibold text-sm">{tab.label}</span>
                </Link>
              );
            })}
            {onStartManualApproval && (
              <button
                type="button"
                onClick={onStartManualApproval}
                className="flex w-full shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-gray-700 transition-all duration-300 hover:bg-white/60 hover:text-gray-900 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <FileCheck className="h-5 w-5 shrink-0" />
                <span className="leading-tight">Start Manual Approval</span>
              </button>
            )}
          </div>

          {/* User Menu at Bottom */}
          <div className="px-3 py-4 border-t border-blue-100/50">
            <UserMenu />
          </div>
        </nav>
      )}

      {/* Mobile Horizontal Navigation Bar */}
      <nav className="lg:hidden bg-gradient-to-r from-white via-blue-50/50 to-indigo-50/50 shadow-2xl border-b border-blue-100/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo Section */}
            <Link
              to="/deal"
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity duration-200"
            >
              <h1 className="text-xl font-bold text-emerald-600">
                Zenop.ai
              </h1>
            </Link>

            {/* Mobile Menu Button */}
            {isAuthenticated && (
              <div className="flex items-center space-x-3">
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
            <div className="border-t border-blue-100/50 py-4">
              <div className="flex flex-col space-y-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = currentTab === tab.id;
                  const useActiveHighlight = isActive && tab.id !== 'approval';
                  return (
                    <Link
                      key={tab.id}
                      to={tab.path}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                        useActiveHighlight
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg'
                          : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
                      }`}
                    >
                      <Icon className="w-5 h-5 shrink-0 text-current" />
                      <span className="font-semibold">{tab.label}</span>
                    </Link>
                  );
                })}
                {onStartManualApproval && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onStartManualApproval();
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-semibold text-gray-700 transition-all duration-300 hover:bg-white/60 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <FileCheck className="h-5 w-5 shrink-0" />
                    <span className="leading-tight">Start Manual Approval</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>
    </>
  );
};

export default Navigation;