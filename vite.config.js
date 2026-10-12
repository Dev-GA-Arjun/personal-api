import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const uiRoot = fileURLToPath(new URL('./ui/', import.meta.url));

export default defineConfig({
  root: uiRoot,
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3737',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  test: {
    include: ['../test/**/*.test.js']
  }
});
