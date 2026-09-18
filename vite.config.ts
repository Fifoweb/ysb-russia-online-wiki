import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // GitHub Pages hosts the site under /ysb-russia-online-wiki/ (only in build; dev stays at /)
  base: '/ysb-russia-online-wiki/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});