import React from 'react';
import { Calculator, FileText, Settings, BarChart3, Sparkles, DollarSign, MessageSquare, Upload, Building } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import UserMenu from './auth/UserMenu';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  const { isAuthenticated } = useAuth();
  
  const tabs = [
    { id: 'deal', label: 'Deal', icon: Building },
    { id: 'configure', label: 'Configure', icon: Calculator },
    { id: 'pricing-config', label: 'Pricing', icon: DollarSign },
    { id: 'quote', label: 'Quote', icon: FileText },
    { id: 'quotes', label: 'Quotes', icon: FileText },
    { id: 'templates', label: 'Templates', icon: Upload },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="bg-gradient-to-r from-white via-blue-50/50 to-indigo-50/50 shadow-2xl border-b border-blue-100/50 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl">
                <Calculator className="w-7 h-7 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                CPQ
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Navigation Tabs - Only show if authenticated */}
            {isAuthenticated && (
              <div className="flex space-x-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => onTabChange(tab.id)}
                      className={`flex items-center gap-3 px-6 py-3 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                        activeTab === tab.id
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                          : 'text-gray-700 hover:text-gray-900 hover:bg-white/60 hover:shadow-md'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-semibold">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            
            {/* User Menu - Only show if authenticated */}
            {isAuthenticated && <UserMenu />}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;