import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Upload, Building, Menu, X, CheckCircle, FolderOpen, PenLine, BarChart3, FileCheck, Lock, HelpCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import UserMenu from './auth/UserMenu';
import ContactUsModal from './ContactUsModal';

interface NavigationProps {
  currentTab: string;
  /** Shows "Start Manual Approval" below Exhibits on every tab; opens manual flow (navigates to /approval if needed). */
  onStartManualApproval?: () => void;
  /** When false, the eSign and eSign Status tabs are grayed out and non-clickable until an approval workflow is approved. */
  isEsignEnabled?: boolean;
}

const Navigation: React.FC<NavigationProps> = ({ currentTab, onStartManualApproval, isEsignEnabled = true }) => {
  const { isAuthenticated, user } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);

  // Close mobile menu when window is resized to larger screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const tabs = [
    { id: 'deal',      label: 'Deal',         icon: Building,   path: '/deal' },
    { id: 'configure', label: 'Configure',    icon: FileText,   path: '/configure' },
    { id: 'quote',     label: 'Quote',        icon: FileText,   path: '/quote' },
    { id: 'approval',  label: 'Approval',     icon: CheckCircle,path: '/approval' },
    { id: 'esign',     label: 'e sign',       icon: PenLine,    path: '/esign' },
    { id: 'esign-tracking', label: 'e sign status', icon: BarChart3, path: '/esign-tracking' },
    { id: 'templates', label: 'Templates',    icon: Upload,     path: '/templates' },
    { id: 'exhibits',  label: 'Exhibits',     icon: FolderOpen, path: '/exhibits' },
    { id: 'documents', label: 'Documents',    icon: FileText,   path: '/documents' },
  ];

  const renderTabLink = (tab: typeof tabs[0], mobile = false) => {
    const Icon = tab.icon;
    const isActive = currentTab === tab.id;
    const isEsignTab = tab.id === 'esign' || tab.id === 'esign-tracking';
    const isDisabled = isEsignTab && !isEsignEnabled;

    if (isDisabled) {
      return (
        <div
          key={tab.id}
          title="Complete the approval workflow to unlock e-sign"
          className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-not-allowed opacity-40 select-none text-gray-400"
        >
          <Icon className="w-5 h-5 shrink-0" />
          <span className={`font-semibold ${mobile ? '' : 'text-sm'}`}>{tab.label}</span>
          <Lock className="w-3.5 h-3.5 ml-auto shrink-0" />
        </div>
      );
    }

    return (
      <Link
        key={tab.id}
        to={tab.path}
        onClick={mobile ? () => setIsMobileMenuOpen(false) : undefined}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-gray-700 hover:text-gray-900 hover:bg-white/60 hover:shadow-md ${
          isActive ? 'bg-white/70 text-gray-900 shadow-sm' : ''
        }`}
      >
        <Icon className="w-5 h-5 shrink-0 text-current" />
        <span className={`font-semibold ${mobile ? '' : 'text-sm'}`}>{tab.label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Contact Us Modal */}
      <ContactUsModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        userName={user?.name || ''}
        userEmail={user?.email || ''}
      />

      {/* Desktop Vertical Sidebar */}
      {isAuthenticated && (
        <nav className="hidden lg:flex fixed left-0 top-0 h-full w-64 bg-gradient-to-b from-white via-blue-50/50 to-indigo-50/50 shadow-2xl border-r border-blue-100/50 backdrop-blur-md z-50 flex-col">
          {/* Logo */}
          <Link
            to="/deal"
            className="flex items-center gap-3 px-6 py-6 cursor-pointer hover:opacity-80 transition-opacity duration-200 border-b border-blue-100/50"
          >
            <h1 className="text-xl font-bold text-blue-600">Zenop.ai</h1>
          </Link>

          {/* Nav Links */}
          <div className="flex-1 flex flex-col py-4 px-3 space-y-2 overflow-y-auto">
            {tabs.map((tab) => renderTabLink(tab))}

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

          {/* Bottom: Help + User Menu */}
          <div className="px-3 pb-3 border-t border-blue-100/50 flex flex-col gap-1 pt-3">
            <button
              type="button"
              onClick={() => setIsContactModalOpen(true)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-gray-600 hover:text-blue-700 hover:bg-blue-50/70 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <HelpCircle className="h-5 w-5 shrink-0" />
              <span>Help / Contact Us</span>
            </button>
            <UserMenu />
          </div>
        </nav>
      )}

      {/* Mobile Navigation Bar */}
      <nav className="lg:hidden bg-gradient-to-r from-white via-blue-50/50 to-indigo-50/50 shadow-2xl border-b border-blue-100/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              to="/deal"
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity duration-200"
            >
              <h1 className="text-xl font-bold text-blue-600">Zenop.ai</h1>
            </Link>

            {isAuthenticated && (
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setIsContactModalOpen(true)}
                  className="p-2 rounded-md text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Help / Contact Us"
                >
                  <HelpCircle className="w-5 h-5" />
                </button>
                <UserMenu />
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-white/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
              </div>
            )}
          </div>

          {/* Mobile Menu */}
          {isAuthenticated && isMobileMenuOpen && (
            <div className="border-t border-blue-100/50 py-4">
              <div className="flex flex-col space-y-2">
                {tabs.map((tab) => renderTabLink(tab, true))}

                {onStartManualApproval && (
                  <button
                    type="button"
                    onClick={() => { setIsMobileMenuOpen(false); onStartManualApproval(); }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-semibold text-gray-700 transition-all duration-300 hover:bg-white/60 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <FileCheck className="h-5 w-5 shrink-0" />
                    <span className="leading-tight">Start Manual Approval</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => { setIsMobileMenuOpen(false); setIsContactModalOpen(true); }}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-semibold text-gray-600 hover:text-blue-700 hover:bg-blue-50/70 transition-all duration-200"
                >
                  <HelpCircle className="h-5 w-5 shrink-0" />
                  <span>Help / Contact Us</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>
    </>
  );
};

export default Navigation;
