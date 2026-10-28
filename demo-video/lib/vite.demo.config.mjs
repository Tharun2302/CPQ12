// The app's own vite.config.ts proxies /api to :3001 (the developer's live server); the demo points it at its own backend.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import base from '../../vite.config.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default (env) => {
  const config = typeof base === 'function' ? base(env) : base;
  return {
    ...config,
    root: appRoot,
    cacheDir: path.join(appRoot, 'demo-video/out/.vite-cache'),
    server: {
      ...config.server,
      port: 5273,
      strictPort: true,
      proxy: { '/api': { target: 'http://localhost:3101', changeOrigin: true } },
    },
  };
};
