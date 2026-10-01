import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  worker: {
    format: 'es',
    plugins: () => [viteSingleFile()],
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000, // Inline everything
    chunkSizeWarningLimit: 100000,
  },
  optimizeDeps: {
    include: ['@noble/ciphers'],
  },
});
