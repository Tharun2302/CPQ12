import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // .env sets NODE_ENV=development (needed for local `npm run dev`), but Vite's dotenv
  // loader copies that into process.env.NODE_ENV even during `vite build`, which flips
  // import.meta.env.DEV back to true and dead-code-eliminates every DEV-gated branch in
  // the production bundle (e.g. api.ts's same-origin BACKEND_URL fallback). Force these
  // from the actual build mode ('production' for `vite build`) instead of trusting
  // whatever NODE_ENV happens to be in the environment.
  define: {
    'import.meta.env.DEV': JSON.stringify(mode !== 'production'),
    'import.meta.env.PROD': JSON.stringify(mode === 'production'),
  },
  server: {
    // Dev-only: browser calls same origin (/api → backend) so PDF fetches avoid CORS (5173 vs 3001)
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
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
    // Single vendor chunk avoids "ze"/"R" before initialization - no cross-chunk load order issues
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Put ALL node_modules in one vendor chunk to prevent init-order errors
          if (id.includes('node_modules')) {
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
}));
