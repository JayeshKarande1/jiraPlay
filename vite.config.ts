import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset paths and a manifest let the VS Code extension load the same build in a webview.
  base: './',
  build: {
    manifest: 'manifest.json',
  },
  server: {
    // PORT matches the API server's, so a second copy can run alongside with e.g. PORT=8798.
    proxy: { '/api': `http://127.0.0.1:${process.env.PORT ?? 8787}` },
  },
});
