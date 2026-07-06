import React, { useEffect } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MainApp } from './components/MainApp';
import { initializePDFJS } from './utils/pdfWorkerConfig';
import { SecurityValidator } from './utils/securityConfig';
import './App.css';

function AppNew() {
  useEffect(() => {
    // Initialize PDF.js worker
    initializePDFJS().then((success) => {
      if (success) {
        console.log('✅ PDF.js initialized successfully');
      } else {
        console.error('❌ PDF.js initialization failed');
      }
    });

    // Initialize security validator
    console.log('🔒 Security validator initialized');
    console.log('📊 Security config:', SecurityValidator.getSecurityStatus());
  }, []);

  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

export default AppNew;
