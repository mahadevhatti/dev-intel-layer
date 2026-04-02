import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'src/ui',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 4171,
    proxy: {
      '/api': 'http://localhost:4170',
      '/mcp': 'http://localhost:4170',
    },
  },
});
