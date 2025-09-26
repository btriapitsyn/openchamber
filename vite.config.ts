import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { themeStoragePlugin } from './vite-theme-plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), themeStoragePlugin()],
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
    rollupOptions: {
      external: ['node:child_process', 'node:fs', 'node:path', 'node:url']
    }
  },
  server: {
    // No proxy needed - always use Express server
  }
})