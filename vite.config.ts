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
        manualChunks: (id) => {
          // Use function-based chunking to avoid initialization order issues
          // CRITICAL: Don't manually chunk React/ReactDOM - let Vite handle it automatically
          // This prevents "Cannot access 'R' before initialization" errors in production
          
          // Node modules go into vendor chunks
          if (id.includes('node_modules')) {
            // IMPORTANT: Let Vite automatically handle React chunks
            // Manual chunking of React can cause initialization order issues
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              // Return undefined to let Vite's automatic chunking handle React
              // This ensures proper initialization order
              return undefined;
            }
            
            // Auth vendor
            if (id.includes('@azure/msal')) {
              return 'auth-vendor';
            }
            
            // PDF vendor
            if (id.includes('pdfjs-dist') || id.includes('@react-pdf') || id.includes('pdf-lib')) {
              return 'pdf-vendor';
            }
            
            // DOCX vendor
            if (id.includes('docx') || id.includes('docxtemplater') || id.includes('mammoth') || id.includes('docx-preview')) {
              return 'docx-vendor';
            }
            
            // Utils vendor
            if (id.includes('axios') || id.includes('date-fns') || id.includes('uuid')) {
              return 'utils-vendor';
            }
            
            // Other node_modules
            return 'vendor';
          }
        },
        // Ensure proper chunk loading order
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    // Enable minification (esbuild is faster and default in Vite 7)
    minify: 'esbuild',
    // Enable source maps for production debugging (helps identify issues)
    sourcemap: true,
    // CommonJS options for better compatibility
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
  },
});
