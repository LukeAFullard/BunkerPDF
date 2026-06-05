import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vite.dev/config/
export default defineConfig({
  base: '/BunkerPDF/',
  plugins: [
    react(),
    tailwindcss(),
    wasm(),
    topLevelAwait(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/pdfjs-dist/build/*',
          dest: 'pdfjs-dist/build'
        },
        {
          src: 'node_modules/pdfjs-dist/cmaps/*',
          dest: 'pdfjs-dist/cmaps'
        },
        {
          src: 'node_modules/pdfjs-dist/standard_fonts/*',
          dest: 'pdfjs-dist/standard_fonts'
        }
      ]
    })
  ],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'esnext'
  },
  optimizeDeps: {
    exclude: [],
  },
});
