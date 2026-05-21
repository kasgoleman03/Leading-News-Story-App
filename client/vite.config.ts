import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config.
//
// The /api proxy here means the React app can call `/api/top-stories` in
// both development and production without caring where the Express proxy
// actually lives. In dev, requests are forwarded to localhost:4000. In
// production, you'd typically deploy the client behind a reverse proxy
// (nginx, Vercel rewrites, etc.) configured the same way.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
