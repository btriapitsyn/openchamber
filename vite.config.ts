import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { themeStoragePlugin } from './vite-theme-plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    themeStoragePlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@opencode-ai/sdk': path.resolve(__dirname, './node_modules/@opencode-ai/sdk/dist/client.js'),
    },
  },
  worker: {
    format: 'es',
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['@opencode-ai/sdk'],
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      external: ['node:child_process', 'node:fs', 'node:path', 'node:url'],
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          const match = id.split('node_modules/')[1]
          if (!match) return undefined

          const segments = match.split('/')
          const packageName = match.startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0]

          if (packageName === 'react' || packageName === 'react-dom') return 'vendor-react'
          if (packageName === 'zustand' || packageName === 'zustand/middleware') return 'vendor-zustand'
          if (packageName === '@opencode-ai/sdk') return 'vendor-opencode-sdk'
          if (packageName.includes('remark') || packageName.includes('rehype') || packageName === 'react-markdown') return 'vendor-markdown'
          if (packageName.startsWith('@radix-ui')) return 'vendor-radix'
          if (packageName.includes('react-syntax-highlighter') || packageName.includes('highlight.js')) return 'vendor-syntax'

          const sanitized = packageName.replace(/^@/, '').replace(/\//g, '-')
          return `vendor-${sanitized}`
        },
      },
    },
  },
})
