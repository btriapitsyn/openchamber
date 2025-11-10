import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { themeStoragePlugin } from './vite-theme-plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const OPENCHAMBER_DATA_DIR = process.env.OPENCHAMBER_DATA_DIR
  ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
  : path.join(os.homedir(), '.config', 'openchamber')
const PROMPT_ENHANCER_CONFIG_PATH = path.join(OPENCHAMBER_DATA_DIR, 'prompt-enhancer-config.json')
const readSettingsConfig = async () => {
  try {
    const raw = await fs.promises.readFile(SETTINGS_CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === 'ENOENT') {
      return {}
    }
    console.warn('Failed to read settings config:', error)
    return {}
  }
}

const writeSettingsConfig = async (settings: Record<string, unknown>) => {
  await fs.promises.mkdir(OPENCHAMBER_DATA_DIR, { recursive: true })
  await fs.promises.writeFile(SETTINGS_CONFIG_PATH, JSON.stringify(settings, null, 2), 'utf8')
}

const sanitizeTypographySizesPayload = (input: unknown) => {
  if (!input || typeof input !== 'object') {
    return undefined
  }
  const candidate = input as Record<string, unknown>
  const result: Record<string, string> = {}
  let populated = false

  const assign = (key: string) => {
    const value = candidate[key]
    if (typeof value === 'string' && value.length > 0) {
      result[key] = value
      populated = true
    }
  }

  assign('markdown')
  assign('code')
  assign('uiHeader')
  assign('uiLabel')
  assign('meta')
  assign('micro')

  return populated ? result : undefined
}

const normalizeStringList = (input: unknown) => {
  if (!Array.isArray(input)) {
    return []
  }
  return input.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

const sanitizeSettingsPayload = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return {}
  }

  const candidate = payload as Record<string, unknown>
  const result: Record<string, unknown> = {}

  if (typeof candidate.themeId === 'string' && candidate.themeId.length > 0) {
    result.themeId = candidate.themeId
  }
  if (typeof candidate.themeVariant === 'string' && (candidate.themeVariant === 'light' || candidate.themeVariant === 'dark')) {
    result.themeVariant = candidate.themeVariant
  }
  if (typeof candidate.useSystemTheme === 'boolean') {
    result.useSystemTheme = candidate.useSystemTheme
  }
  if (typeof candidate.lightThemeId === 'string' && candidate.lightThemeId.length > 0) {
    result.lightThemeId = candidate.lightThemeId
  }
  if (typeof candidate.darkThemeId === 'string' && candidate.darkThemeId.length > 0) {
    result.darkThemeId = candidate.darkThemeId
  }
  if (typeof candidate.lastDirectory === 'string' && candidate.lastDirectory.length > 0) {
    result.lastDirectory = candidate.lastDirectory
  }
  if (typeof candidate.homeDirectory === 'string' && candidate.homeDirectory.length > 0) {
    result.homeDirectory = candidate.homeDirectory
  }

  if (Array.isArray(candidate.approvedDirectories)) {
    result.approvedDirectories = normalizeStringList(candidate.approvedDirectories)
  }
  if (Array.isArray(candidate.securityScopedBookmarks)) {
    result.securityScopedBookmarks = normalizeStringList(candidate.securityScopedBookmarks)
  }
  if (Array.isArray(candidate.pinnedDirectories)) {
    result.pinnedDirectories = normalizeStringList(candidate.pinnedDirectories)
  }

  if (typeof candidate.uiFont === 'string' && candidate.uiFont.length > 0) {
    result.uiFont = candidate.uiFont
  }
  if (typeof candidate.monoFont === 'string' && candidate.monoFont.length > 0) {
    result.monoFont = candidate.monoFont
  }
  if (typeof candidate.markdownDisplayMode === 'string' && candidate.markdownDisplayMode.length > 0) {
    result.markdownDisplayMode = candidate.markdownDisplayMode
  }

  const typography = sanitizeTypographySizesPayload(candidate.typographySizes)
  if (typography) {
    result.typographySizes = typography
  }

  return result
}

const mergeSettingsConfig = (current: Record<string, unknown>, changes: Record<string, unknown>) => {
  const sanitizeSet = (value?: unknown[]) =>
    Array.from(new Set((value ?? []).filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)))

  const baseApproved = (Array.isArray(changes.approvedDirectories)
    ? changes.approvedDirectories
    : Array.isArray(current.approvedDirectories)
      ? current.approvedDirectories
      : []) as unknown[]

  const additionalApproved: string[] = []
  if (typeof changes.lastDirectory === 'string' && changes.lastDirectory.length > 0) {
    additionalApproved.push(changes.lastDirectory)
  }
  if (typeof changes.homeDirectory === 'string' && changes.homeDirectory.length > 0) {
    additionalApproved.push(changes.homeDirectory)
  }

  const approvedDirectories = sanitizeSet([...baseApproved, ...additionalApproved])

  const baseBookmarks = (Array.isArray(changes.securityScopedBookmarks)
    ? changes.securityScopedBookmarks
    : Array.isArray(current.securityScopedBookmarks)
      ? current.securityScopedBookmarks
      : []) as unknown[]

  const securityScopedBookmarks = sanitizeSet(baseBookmarks)

  const typographySizes = changes.typographySizes
    ? {
        ...(typeof current.typographySizes === 'object' && current.typographySizes !== null
          ? current.typographySizes as Record<string, string>
          : {}),
        ...(changes.typographySizes as Record<string, string>)
      }
    : current.typographySizes

  const pinnedDirectories = Array.isArray(changes.pinnedDirectories)
    ? sanitizeSet(changes.pinnedDirectories as unknown[])
    : Array.isArray(current.pinnedDirectories)
      ? sanitizeSet(current.pinnedDirectories as unknown[])
      : []

  return {
    ...current,
    ...changes,
    approvedDirectories,
    securityScopedBookmarks,
    pinnedDirectories,
    typographySizes
  }
}

const formatSettingsConfig = (settings: Record<string, unknown>) => ({
  ...sanitizeSettingsPayload(settings),
  approvedDirectories: normalizeStringList(settings.approvedDirectories),
  securityScopedBookmarks: normalizeStringList(settings.securityScopedBookmarks),
  pinnedDirectories: normalizeStringList(settings.pinnedDirectories),
  typographySizes: sanitizeTypographySizesPayload(settings.typographySizes)
})
const SETTINGS_CONFIG_PATH = path.join(OPENCHAMBER_DATA_DIR, 'settings.json')

// Dev-only middleware for custom API endpoints with mock data
function devApiPlugin() {
  return {
    name: 'dev-api-middleware',
    configureServer(server: { middlewares: { use: (handler: (req: { url?: string; method?: string; headers: { accept?: string }; on: (event: string, handler: (data?: unknown) => void) => void }, res: { setHeader: (name: string, value: string) => void; end: (data: string) => void; statusCode: number; write: (data: string) => void }, next: () => void) => void | Promise<void>) => void } }) {
      server.middlewares.use(async (req: { url?: string; method?: string; headers: { accept?: string }; on: (event: string, handler: (data?: unknown) => void) => void }, res: { setHeader: (name: string, value: string) => void; end: (data: string) => void; statusCode: number; write: (data: string) => void }, next: () => void) => {
        const url = req.url || ''
        res.setHeader('Content-Type', 'application/json')

        // Filesystem endpoints
        if (url === '/api/fs/home') {
          try {
            const home = os.homedir()
            res.end(JSON.stringify({ home }))
          } catch {
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'Failed to resolve home directory' }))
          }
          return
        }

        if (url.startsWith('/api/fs/list')) {
          // Mock directory listing
          res.end(JSON.stringify({
            entries: [
              { name: 'src', path: '/mock/src', isDirectory: true, isFile: false },
              { name: 'package.json', path: '/mock/package.json', isDirectory: false, isFile: true },
              { name: 'README.md', path: '/mock/README.md', isDirectory: false, isFile: true },
            ]
          }))
          return
        }

        if (url === '/api/fs/mkdir' && req.method === 'POST') {
          res.end(JSON.stringify({ success: true }))
          return
        }

        // Git endpoints with realistic mock data
        if (url === '/api/git/check') {
          res.end(JSON.stringify({ isGitRepo: true, hasChanges: true }))
          return
        }

        if (url === '/api/git/status') {
          res.end(JSON.stringify({
            modified: ['src/lib/theme/themes/catppuccin-dark.ts', 'src/components/ui/button.tsx'],
            added: ['src/components/new-feature.tsx'],
            deleted: ['old-file.ts'],
            untracked: ['temp.txt'],
            staged: { modified: ['vite.config.ts'], added: [], deleted: [] },
            current: 'main',
            tracking: 'origin/main',
            ahead: 2,
            behind: 0
          }))
          return
        }

        if (url === '/api/git/diff') {
          res.end(JSON.stringify({
            diff: `diff --git a/src/lib/theme/themes/catppuccin-dark.ts b/src/lib/theme/themes/catppuccin-dark.ts
index 1234567..abcdefg 100644
--- a/src/lib/theme/themes/catppuccin-dark.ts
+++ b/src/lib/theme/themes/catppuccin-dark.ts
@@ -10,7 +10,7 @@ export const catppuccinDark: ThemeDefinition = {
   colors: {
-    background: '#1e1e2e',
+    background: '#11111b',
     foreground: '#cdd6f4',
     primary: '#89b4fa',
   }
`
          }))
          return
        }

        if (url === '/api/git/branches') {
          res.end(JSON.stringify({
            branches: [
              { name: 'main', current: true, tracking: 'origin/main' },
              { name: 'feature/theme-updates', current: false, tracking: null },
              { name: 'fix/color-contrast', current: false, tracking: 'origin/fix/color-contrast' }
            ]
          }))
          return
        }

        if (url === '/api/git/current-identity') {
          res.end(JSON.stringify({
            name: 'Developer',
            email: 'dev@example.com'
          }))
          return
        }

        if (url === '/api/git/identities') {
          // Returns array of profiles directly
          res.end(JSON.stringify([
            {
              id: 'work-profile',
              name: 'Work Profile',
              userName: 'Work User',
              userEmail: 'work@company.com',
              sshKey: null,
              color: 'primary',
              icon: 'briefcase'
            },
            {
              id: 'personal-profile',
              name: 'Personal',
              userName: 'Personal User',
              userEmail: 'personal@email.com',
              sshKey: null,
              color: 'accent',
              icon: 'user'
            }
          ]))
          return
        }

        if (url === '/api/git/log') {
          res.end(JSON.stringify({
            commits: [
              { hash: 'abc123', message: 'feat: add new theme colors', author: 'Developer', date: new Date().toISOString() },
              { hash: 'def456', message: 'fix: improve contrast in dark mode', author: 'Developer', date: new Date(Date.now() - 86400000).toISOString() }
            ]
          }))
          return
        }

        // Git write operations - just return success
        if (url.startsWith('/api/git/') && req.method === 'POST') {
          res.end(JSON.stringify({ success: true, message: 'Mock operation completed' }))
          return
        }

        if (url.startsWith('/api/git/') && req.method === 'DELETE') {
          res.end(JSON.stringify({ success: true }))
          return
        }

        // Prompt enhancer config endpoints
        if (url === '/api/config/prompt-enhancer') {
          if (req.method === 'GET') {
            try {
              const raw = await fs.promises.readFile(PROMPT_ENHANCER_CONFIG_PATH, 'utf8')
              const config = JSON.parse(raw)
              res.end(JSON.stringify(config))
            } catch (error: unknown) {
              if ((error as { code?: string })?.code === 'ENOENT') {
                // Return defaults from file
                try {
                  const defaults = await fs.promises.readFile(
                    path.join(__dirname, 'prompt-enhancer-defaults.json'),
                    'utf8'
                  )
                  res.end(defaults)
                } catch {
                  res.statusCode = 404
                  res.end(JSON.stringify({ error: 'Config not found' }))
                }
              } else {
                res.statusCode = 500
                res.end(JSON.stringify({ error: (error as { message?: string })?.message || 'Failed to read config' }))
              }
            }
            return
          }

          if (req.method === 'PUT') {
            let body = ''
            req.on('data', (chunk: unknown) => { body += chunk })
            req.on('end', async () => {
              try {
                const config = JSON.parse(body)
                await fs.promises.mkdir(path.dirname(PROMPT_ENHANCER_CONFIG_PATH), { recursive: true })
                await fs.promises.writeFile(PROMPT_ENHANCER_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
                res.end(JSON.stringify(config))
              } catch (error: unknown) {
                res.statusCode = 500
                res.end(JSON.stringify({ error: (error as { message?: string })?.message || 'Failed to save config' }))
              }
            })
            return
          }
        }

        if (url === '/api/config/settings') {
          if (req.method === 'GET') {
            try {
              const settings = await readSettingsConfig()
              res.end(JSON.stringify(formatSettingsConfig(settings)))
            } catch (error: unknown) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: (error as { message?: string })?.message || 'Failed to read settings' }))
            }
            return
          }

          if (req.method === 'PUT') {
            let body = ''
            req.on('data', (chunk: unknown) => { body += chunk })
            req.on('end', async () => {
              try {
                const payload = JSON.parse(body || '{}') as Record<string, unknown>
                const current = await readSettingsConfig()
                const sanitized = sanitizeSettingsPayload(payload)
                const next = mergeSettingsConfig(current, sanitized)
                await writeSettingsConfig(next)
                res.end(JSON.stringify(formatSettingsConfig(next)))
              } catch (error: unknown) {
                res.statusCode = 500
                res.end(JSON.stringify({ error: (error as { message?: string })?.message || 'Failed to save settings' }))
              }
            })
            return
          }
        }

        // Other config endpoints (mock)
        if (url.startsWith('/api/config/')) {
          if (req.method === 'GET') {
            res.end(JSON.stringify({ config: {} }))
          } else {
            res.end(JSON.stringify({ success: true }))
          }
          return
        }

        // Terminal endpoints - minimal mock
        if (url.startsWith('/api/terminal/create') && req.method === 'POST') {
          res.end(JSON.stringify({
            sessionId: 'mock-terminal-' + Date.now(),
            rows: 24,
            cols: 80
          }))
          return
        }

        if (url.match(/\/api\/terminal\/[^/]+\/stream$/)) {
          res.setHeader('Content-Type', 'text/event-stream')
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Connection', 'keep-alive')
          res.write('data: {"type":"output","data":"Welcome to mock terminal\\r\\n"}\n\n')
          // Keep connection open
          const interval = setInterval(() => {
            res.write('data: {"type":"ping"}\n\n')
          }, 5000)
          req.on('close', () => { clearInterval(interval) })
          return
        }

        if (url.startsWith('/api/terminal/') && req.method === 'POST') {
          res.end(JSON.stringify({ success: true }))
          return
        }

        if (url.startsWith('/api/terminal/') && req.method === 'DELETE') {
          res.end(JSON.stringify({ success: true }))
          return
        }

        // OpenChamber metadata
        if (url === '/api/openchamber/models-metadata') {
          res.end(JSON.stringify({ models: [] }))
          return
        }

        next()
      })
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    themeStoragePlugin(),
    devApiPlugin(),
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
            .replace(/\//g, '-');

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
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('Sending Request to the Target:', req.method, req.url);
            // Add headers for EventSource requests
            if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
              proxyReq.setHeader('Accept', 'text/event-stream');
              proxyReq.setHeader('Cache-Control', 'no-cache');
            }
          });
          proxy.on('proxyRes', (proxyRes, req) => {
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
