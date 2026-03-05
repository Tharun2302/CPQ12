import React from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';

/**
 * Layout for E-Signature app routes: shows the main app left sidebar (Deal, Configure, Quote, Documents, E-Sign, etc.)
 * and renders the matching E-Sign page in the main content area with left margin.
 */
const EsignLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-100/50">
      <Navigation currentTab="esign" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-10 transition-all duration-300 lg:ml-64">
        <Outlet />
      </main>
    </div>
  );
};

export default EsignLayout;
