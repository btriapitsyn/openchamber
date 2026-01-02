import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname, 'webview'),
  base: './',  // Use relative paths for VS Code webview
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../ui/src'),
      '@vscode': path.resolve(__dirname, './webview'),
      '@openchamber/ui': path.resolve(__dirname, '../ui/src'),
      '@opencode-ai/sdk': path.resolve(__dirname, '../../node_modules/@opencode-ai/sdk/dist/client.js'),
    },
  },
  worker: {
    format: 'es',
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'global': 'globalThis',
  },
  envPrefix: ['VITE_'],
  optimizeDeps: {
    include: ['@opencode-ai/sdk'],
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/webview'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'webview/index.html'),
      external: ['node:child_process', 'node:fs', 'node:path', 'node:url'],
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
