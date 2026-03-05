import * as pdfjsLib from 'pdfjs-dist';

// pdfjs-dist v5+ uses .mjs worker; only set if not already set (e.g. by EsignPdfPageView from node_modules)
export function configurePDFWorker() {
  try {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    }
    console.log('✅ PDF.js worker configured successfully');
    console.log(`📄 PDF.js version: ${pdfjsLib.version}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to configure PDF.js worker:', error);
    return false;
  }
}

// Alternative worker configuration for local development
export function configurePDFWorkerLocal() {
  try {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }
    console.log('✅ PDF.js worker configured for local development');
    return true;
  } catch (error) {
    console.error('❌ Failed to configure local PDF.js worker:', error);
    return false;
  }
}

// Check if PDF.js is available
export function checkPDFJSAvailability(): boolean {
  try {
    return typeof pdfjsLib !== 'undefined' && pdfjsLib.getDocument !== undefined;
  } catch (error) {
    console.error('PDF.js not available:', error);
    return false;
  }
}

// Get PDF.js version
export function getPDFJSVersion(): string {
  try {
    return pdfjsLib.version || 'Unknown';
  } catch (error) {
    return 'Not available';
  }
}

// Initialize PDF.js with error handling
export function initializePDFJS(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const isConfigured = configurePDFWorker();
      const isAvailable = checkPDFJSAvailability();
      
      if (isConfigured && isAvailable) {
        console.log('✅ PDF.js initialized successfully');
        resolve(true);
      } else {
        console.error('❌ PDF.js initialization failed');
        resolve(false);
      }
    } catch (error) {
      console.error('❌ PDF.js initialization error:', error);
      resolve(false);
    }
  });
}
