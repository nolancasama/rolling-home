import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5190, strictPort: true },
  preview: { port: 5191, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
});
