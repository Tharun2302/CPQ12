import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Layout for E-Signature app routes: no left sidebar; back button at top left to E-Sign list.
 */
const EsignLayout: React.FC = () => {
  const location = useLocation();
  const isListPage = location.pathname === '/esign' || location.pathname === '/esign/';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-100/50">
      {/* Top bar: back button top left (hidden on E-Sign list page) */}
      {!isListPage && (
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-14">
              <Link
                to="/esign"
                className="inline-flex items-center gap-2 text-slate-700 hover:text-indigo-600 font-medium transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to E-Sign
              </Link>
            </div>
          </div>
        </header>
      )}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-10 transition-all duration-300">
        <Outlet />
      </main>
    </div>
  );
};

export default EsignLayout;
