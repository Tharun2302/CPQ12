import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
    ],
    exclude: ['lucide-react'],
  },
  build: {
    // Enable code splitting and chunk optimization
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks for better caching
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'auth-vendor': ['@azure/msal-browser', '@azure/msal-react'],
          'pdf-vendor': ['pdfjs-dist', '@react-pdf/renderer', 'pdf-lib'],
          'docx-vendor': ['docx', 'docxtemplater', 'mammoth', 'docx-preview'],
          'utils-vendor': ['axios', 'date-fns', 'uuid'],
        },
      },
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    // Enable minification (esbuild is faster and default in Vite 7)
    // Keep console logs for debugging
    minify: 'esbuild',
    // Enable source maps for production debugging (optional)
    sourcemap: false,
  },
});
