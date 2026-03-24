import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Navigation from './Navigation';

/**
 * Layout for Agreements: left sidebar on list page (upload for signature); back button on nested pages.
 */
const EsignLayout: React.FC = () => {
  const location = useLocation();
  const isListPage = location.pathname === '/esign' || location.pathname === '/esign/';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-100/50">
      {/* Left sidebar on Agreements list page (upload for signature) */}
      {isListPage && <Navigation currentTab="esign" />}

      {/* Top bar: back button (only on nested pages, e.g. place-fields, send) */}
      {!isListPage && (
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-14">
              <Link
                to="/esign"
                className="inline-flex items-center gap-2 text-slate-700 hover:text-indigo-600 font-medium transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to e sign
              </Link>
            </div>
          </div>
        </header>
      )}

      <main className={isListPage ? 'lg:pl-64 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-10 transition-all duration-300' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-10 transition-all duration-300'}>
        <Outlet />
      </main>
    </div>
  );
};

export default EsignLayout;
