import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { User, LogOut, Settings, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const UserMenu: React.FC = () => {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
    logout();
    setIsOpen(false);
  };

  if (!user) return null;

  return (
    <div className="relative" ref={menuRef}>
      {/* User Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-3 text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg px-3 py-2 hover:bg-gray-50 transition-all duration-200"
      >
        <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-md">
          <User className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
        </div>
        <div className="hidden md:flex flex-col text-left leading-tight">
          <span className="font-medium text-sm">{user.name}</span>
          <span className="text-sm text-gray-700">{user.email}</span>
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-0' : 'rotate-180'}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div 
          className="absolute right-0 bottom-full mb-2 w-56 bg-white rounded-xl shadow-2xl py-2 z-[9999] border border-gray-100 overflow-hidden"
          style={{
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            isolation: 'isolate',
            position: 'relative',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}
        >
          {/* User Info */}
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-md">
                <User className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                <p className="text-xs text-gray-600 truncate">{user.email}</p>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          {/* Settings menu item hidden per requirement */}
          {/* <button
            onClick={() => {
              setIsOpen(false);
              navigate('/dashboard');
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('navigateToTab', { detail: 'settings' }));
              }, 0);
            }}
            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            <Settings className="w-4 h-4 mr-3" />
            Settings
          </button> */}

          <button
            onClick={handleLogout}
            className="flex items-center w-full px-5 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors duration-200 group"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100 group-hover:bg-red-200 transition-colors duration-200 mr-3">
              <LogOut className="w-4 h-4 text-red-600" />
            </div>
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
