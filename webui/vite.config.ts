import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import * as path from 'path';

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@shared': path.resolve(__dirname, '..', 'src', 'shared') },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4178' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
