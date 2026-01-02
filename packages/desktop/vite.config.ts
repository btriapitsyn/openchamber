import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { themeStoragePlugin } from '../../vite-theme-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

export default defineConfig({
  root: path.resolve(__dirname, '.'),
  plugins: [react(), themeStoragePlugin()],
  resolve: {
    alias: {
      '@desktop': path.resolve(__dirname, './src'),
      '@openchamber/ui': path.resolve(__dirname, '../ui/src'),
      '@': path.resolve(__dirname, '../ui/src'),
      '@opencode-ai/sdk': path.resolve(__dirname, '../../node_modules/@opencode-ai/sdk/dist/client.js'),
    },
  },
  worker: {
    format: 'es',
  },
  define: {
    'process.env': {},
    'process.platform': JSON.stringify('darwin'),
    'process.version': JSON.stringify('v20.0.0'),
    'process.versions': JSON.stringify({}),
    global: 'globalThis',
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  optimizeDeps: {
    include: ['@opencode-ai/sdk'],
    exclude: [
      '@tauri-apps/plugin-dialog',
      '@tauri-apps/api/core',
      '@tauri-apps/api/path',
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 1421,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: '127.0.0.1',
      port: 1421,
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          const match = id.split('node_modules/')[1];
          if (!match) return undefined;

          const segments = match.split('/');
          const packageName = match.startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];

          if (packageName === 'react' || packageName === 'react-dom') return 'vendor-react';
          if (packageName === 'zustand' || packageName === 'zustand/middleware') return 'vendor-zustand';

          if (packageName === '@opencode-ai/sdk') return 'vendor-opencode-sdk';
          if (packageName.includes('remark') || packageName.includes('rehype') || packageName === 'react-markdown') return 'vendor-markdown';
          if (packageName.startsWith('@radix-ui')) return 'vendor-radix';
          if (packageName.includes('react-syntax-highlighter') || packageName.includes('highlight.js')) return 'vendor-syntax';
          if (packageName.startsWith('@tauri-apps')) return 'vendor-tauri';

          const sanitized = packageName.replace(/^@/, '').replace(/\//g, '-');
          return `vendor-${sanitized}`;
        },
      },
    },
  },
});
