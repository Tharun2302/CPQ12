import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
export function configurePDFWorker() {
  try {
    // Set worker source
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    
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
    // For local development, you might want to use a local worker file
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
    
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
