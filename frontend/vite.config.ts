/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    // Proxy all /api requests to the backend (Member 2's server)
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

  test: {
    // Vitest uses globals so we don't need to import describe/it/expect
    globals: true,
    // jsdom gives us a browser-like environment for React testing
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
