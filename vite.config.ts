import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { themeStoragePlugin } from './vite-theme-plugin'
import { createDevConfigApiMiddleware } from './scripts/dev-config-api'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    themeStoragePlugin(),
    {
      name: 'opencode-config-api-dev-middleware',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use(createDevConfigApiMiddleware())
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@opencode-ai/sdk": path.resolve(__dirname, "./node_modules/@opencode-ai/sdk/dist/client.js"),
    },
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['@opencode-ai/sdk']
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      external: ['node:child_process', 'node:fs', 'node:path', 'node:url'],
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          const match = id.split('node_modules/')[1];
          if (!match) return undefined;

          const segments = match.split('/');
          const packageName = match.startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];

          if (packageName === 'react' || packageName === 'react-dom') {
            return 'vendor-react';
          }

          if (packageName === 'zustand' || packageName === 'zustand/middleware') {
            return 'vendor-zustand';
          }

          if (packageName.includes('flowtoken')) {
            return 'vendor-flowtoken';
          }

          if (packageName === '@opencode-ai/sdk') {
            return 'vendor-opencode-sdk';
          }

          if (
            packageName.includes('remark') ||
            packageName.includes('rehype') ||
            packageName === 'react-markdown'
          ) {
            return 'vendor-markdown';
          }

          if (packageName.startsWith('@radix-ui')) {
            return 'vendor-radix';
          }

          if (packageName.includes('react-syntax-highlighter') || packageName.includes('highlight.js')) {
            return 'vendor-syntax';
          }

          const sanitized = packageName
            .replace(/^@/, '')
            .replace(/[\/]/g, '-');

          return `vendor-${sanitized}`;
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.OPENCODE_URL || 'http://localhost:4096',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
            // Add headers for EventSource requests
            if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
              proxyReq.setHeader('Accept', 'text/event-stream');
              proxyReq.setHeader('Cache-Control', 'no-cache');
            }
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
            // Add CORS headers for EventSource responses
            if (req.url?.includes('/event')) {
              proxyRes.headers['Access-Control-Allow-Origin'] = '*';
              proxyRes.headers['Access-Control-Allow-Headers'] = 'Cache-Control, Accept';
              proxyRes.headers['Content-Type'] = 'text/event-stream';
              proxyRes.headers['Cache-Control'] = 'no-cache';
              proxyRes.headers['Connection'] = 'keep-alive';
            }
          });
        },
        ws: true, // Enable WebSocket proxy for EventSource
      }
    }
  }
})
