import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { pwaPlugin } from './scripts/pwa-plugin.ts';
export default defineConfig({
  base: './',
  // Prefer the maintained sources over any older compiler output beside them.
  resolve: { extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'] },
  plugins: [pwaPlugin()],
  build: { rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), story: resolve(import.meta.dirname, 'story.html') } } },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
