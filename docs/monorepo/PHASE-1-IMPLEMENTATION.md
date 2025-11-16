# Phase 1 Implementation - Detailed Tasks

**Timeline:** 3-4 weeks  
**Based on:** REFINED-ARCHITECTURE.md  
**Status:** Ready for agent execution

---

## Overview

Phase 1 breaks into 4 weeks of concrete tasks. Each task specifies:
- **What** — Exact file changes
- **How** — Implementation pattern
- **Validation** — How to verify it works

All changes are **additive** (create new files) or **refactoring** (move code). No deletion until Phase 2 cleanup.

---

## Week 1: Monorepo Setup & API Interfaces

### Task 1.1: Create Monorepo Root Configuration

**Objective:** Enable `pnpm workspaces` (or npm) to recognize package structure.

**Files to create:**

1. **`/package.json`** (Root workspace config)
```json
{
  "name": "openchamber-monorepo",
  "version": "0.1.0",
  "private": true,
  "description": "OpenChamber - Web & desktop AI coding agent interface",
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "type-check": "pnpm -r type-check",
    "dev:web": "pnpm -C packages/web dev",
    "dev:desktop": "pnpm -C packages/desktop dev",
    "build:web": "pnpm -C packages/web build",
    "build:desktop": "pnpm -C packages/desktop build"
  },
  "devDependencies": {
    "typescript": "^5.8.3"
  }
}
```

2. **`/pnpm-workspace.yaml`** (Workspace definition)
```yaml
packages:
  - 'packages/*'
```

3. **`/tsconfig.json`** (Shared TypeScript base)
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": ".",
    "paths": {
      "@openchamber/ui/*": ["packages/ui/src/*"]
    }
  },
  "include": [],
  "references": [
    { "path": "packages/ui" },
    { "path": "packages/web" },
    { "path": "packages/desktop" }
  ]
}
```

**Validation:**
```bash
pnpm install
# Should succeed without errors
# Directory structure ready for packages
```

---

### Task 1.2: Create Packages Directory Structure

**Objective:** Set up empty package folders.

**Commands:**
```bash
mkdir -p packages/ui
mkdir -p packages/web
mkdir -p packages/desktop
mkdir -p packages/desktop/src-tauri
```

**Validation:** `ls packages/` shows three directories.

---

### Task 1.3: Move UI Package to `packages/ui`

**Objective:** Extract shared React frontend into its own package.

**Current structure:**
```
src/
├── components/
├── stores/
├── hooks/
├── lib/
├── types/
├── constants/
├── styles/
├── assets/
├── App.tsx
├── index.css
├── main.tsx
└── vite-env.d.ts
```

**Action:** Copy entire `src/` to `packages/ui/src/`.

**Update `packages/ui/tsconfig.json`:**
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": []
}
```

**Update `packages/ui/vite.config.ts`:**
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'OpenChamberUI',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
})
```

**Create `packages/ui/src/index.ts`:**
```typescript
// Export App as default
export { default as App } from './App';

// Export types for API implementations
export * from './lib/api/types';
export { RuntimeAPIProvider, useRuntimeAPIs } from '@/contexts/RuntimeAPIContext';

// Export stores for other packages to use
export * from './stores';
export * from './types';
export * from './constants';
```

**Update `packages/ui/package.json`:**
```json
{
  "name": "@openchamber/ui",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.umd.js",
  "module": "./dist/index.es.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "exports": {
    ".": {
      "import": "./dist/index.es.js",
      "require": "./dist/index.umd.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "vite build",
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext ts,tsx"
  },
  "dependencies": {
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "@opencode-ai/sdk": "^1.0.11",
    "@phosphor-icons/react": "^2.1.10",
    "@remixicon/react": "^4.2.0",
    "@radix-ui/react-primitives": "latest",
    "zustand": "^5.0.8",
    "tailwindcss": "^4.0.0",
    "zod": "^3.22.0",
    "flowtoken": "^1.0.40"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vite": "^7.1.2",
    "@vitejs/plugin-react": "^4.2.1"
  }
}
```

**Validation:**
```bash
pnpm -C packages/ui type-check
pnpm -C packages/ui build
# Should succeed
```

---

### Task 1.4: Create Runtime API Interfaces

**Objective:** Define all abstract API contracts.

**Create `packages/ui/src/lib/api/types.ts`:**

```typescript
/**
 * Runtime-agnostic API interfaces
 * Implemented by web and desktop packages
 */

// ============ Terminal API ============

export interface TerminalSession {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface CreateTerminalOptions {
  cwd: string;
  cols?: number;
  rows?: number;
}

export interface TerminalStreamEvent {
  type: 'connected' | 'data' | 'exit' | 'reconnecting' | 'error';
  data?: string;
  exitCode?: number;
  signal?: number | null;
  attempt?: number;
  maxAttempts?: number;
  message?: string;
}

export interface TerminalAPI {
  create(options: CreateTerminalOptions): Promise<TerminalSession>;
  write(sessionId: string, data: string): Promise<void>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  close(sessionId: string): Promise<void>;
  subscribe(
    sessionId: string,
    callback: (event: TerminalStreamEvent) => void,
    onError?: (error: Error, fatal?: boolean) => void
  ): () => void;
}

// ============ Git API ============

export interface GitStatus {
  current: string;
  tracking: string | null;
  ahead: number;
  behind: number;
  files: Array<{
    path: string;
    index: string;
    working_dir: string;
  }>;
  isClean: boolean;
  diffStats?: Record<string, { insertions: number; deletions: number }>;
}

export interface GitDiffResponse {
  diff: string;
}

export interface GetGitDiffOptions {
  path: string;
  staged?: boolean;
  contextLines?: number;
}

export interface GitBranchDetails {
  current: boolean;
  name: string;
  commit: string;
  label: string;
  tracking?: string;
  ahead?: number;
  behind?: number;
}

export interface GitBranch {
  all: string[];
  current: string;
  branches: Record<string, GitBranchDetails>;
}

export interface GitCommitResult {
  success: boolean;
  commit: string;
  branch: string;
  summary: {
    changes: number;
    insertions: number;
    deletions: number;
  };
}

export interface GitPushResult {
  success: boolean;
  pushed: Array<{
    local: string;
    remote: string;
  }>;
  repo: string;
  ref: unknown;
}

export interface GitPullResult {
  success: boolean;
  summary: {
    changes: number;
    insertions: number;
    deletions: number;
  };
  files: string[];
  insertions: number;
  deletions: number;
}

export interface GitIdentityProfile {
  id: string;
  name: string;
  userName: string;
  userEmail: string;
  sshKey?: string | null;
  color?: string | null;
  icon?: string | null;
}

export interface GitIdentitySummary {
  userName: string | null;
  userEmail: string | null;
  sshCommand: string | null;
}

export interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
  refs: string;
  body: string;
  author_name: string;
  author_email: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface GitLogResponse {
  all: GitLogEntry[];
  latest: GitLogEntry | null;
  total: number;
}

export interface GitWorktreeInfo {
  worktree: string;
  head?: string;
  branch?: string;
}

export interface GitAddWorktreePayload {
  path: string;
  branch: string;
  createBranch?: boolean;
}

export interface GitRemoveWorktreePayload {
  path: string;
  force?: boolean;
}

export interface GitDeleteBranchPayload {
  branch: string;
  force?: boolean;
}

export interface GitDeleteRemoteBranchPayload {
  branch: string;
  remote?: string;
}

export interface CreateGitCommitOptions {
  addAll?: boolean;
  files?: string[];
}

export interface GitLogOptions {
  maxCount?: number;
  from?: string;
  to?: string;
  file?: string;
}

export interface GeneratedCommitMessage {
  subject: string;
  highlights: string[];
}

export interface GitAPI {
  checkIsRepository(cwd: string): Promise<boolean>;
  getStatus(cwd: string): Promise<GitStatus>;
  getBranches(cwd: string): Promise<GitBranch>;
  getLog(cwd: string, options?: GitLogOptions): Promise<GitLogResponse>;
  getCurrentIdentity(cwd: string): Promise<GitIdentitySummary | null>;
  commit(cwd: string, message: string, options?: CreateGitCommitOptions): Promise<GitCommitResult>;
  push(cwd: string, options?: { remote?: string; branch?: string; options?: string[] }): Promise<GitPushResult>;
  pull(cwd: string, options?: { remote?: string; branch?: string }): Promise<GitPullResult>;
  fetch(cwd: string, options?: { remote?: string; branch?: string }): Promise<{ success: boolean }>;
  createBranch(cwd: string, name: string, startPoint?: string): Promise<{ success: boolean; branch: string }>;
  checkoutBranch(cwd: string, branch: string): Promise<{ success: boolean; branch: string }>;
  deleteBranch(cwd: string, payload: GitDeleteBranchPayload): Promise<{ success: boolean }>;
  deleteRemoteBranch(cwd: string, payload: GitDeleteRemoteBranchPayload): Promise<{ success: boolean }>;
  getDiff(cwd: string, options: GetGitDiffOptions): Promise<GitDiffResponse>;
  revertFile(cwd: string, filePath: string): Promise<void>;
  isLinkedWorktree(cwd: string): Promise<boolean>;
  listWorktrees(cwd: string): Promise<GitWorktreeInfo[]>;
  addWorktree(cwd: string, payload: GitAddWorktreePayload): Promise<{ success: boolean; path: string; branch: string }>;
  removeWorktree(cwd: string, payload: GitRemoveWorktreePayload): Promise<{ success: boolean }>;
  setIdentity(cwd: string, profileId: string): Promise<{ success: boolean; profile: GitIdentityProfile }>;
  ensureIgnored(cwd: string): Promise<void>;
  generateCommitMessage(cwd: string, files: string[]): Promise<{ message: GeneratedCommitMessage }>;
}

// ============ Files API ============

export interface FileSearchResult {
  name: string;
  path: string;
  relativePath: string;
  extension?: string;
}

export interface FileSearchOptions {
  limit?: number;
  query?: string;
}

export interface FilesAPI {
  search(cwd: string, options?: FileSearchOptions): Promise<FileSearchResult[]>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  list(path: string): Promise<string[]>;
}

// ============ Settings API ============

export interface AppSettings {
  themeId?: string;
  useSystemTheme?: boolean;
  themeVariant?: 'light' | 'dark';
  lightThemeId?: string;
  darkThemeId?: string;
  markdownDisplayMode?: 'compact' | 'comfort';
  showReasoningTraces?: boolean;
  lastDirectory?: string;
  homeDirectory?: string;
  pinnedDirectories?: string[];
  approvedDirectories?: string[];
  securityScopedBookmarks?: string[];
  [key: string]: unknown;
}

export interface SettingsAPI {
  load(): Promise<AppSettings>;
  save(settings: Partial<AppSettings>): Promise<AppSettings>;
}

// ============ Permissions API ============

export interface PermissionResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface PermissionsAPI {
  requestDirectoryAccess(path: string): Promise<PermissionResult>;
  startAccessingDirectory(path: string): Promise<PermissionResult>;
  stopAccessingDirectory(path: string): Promise<PermissionResult>;
  canAccess(path: string): Promise<boolean>;
}

// ============ Notifications API ============

export interface Notification {
  title?: string;
  body?: string;
}

export interface NotificationsAPI {
  notify(notification: Notification): Promise<{ success: boolean }>;
}

// ============ Unified Runtime APIs ============

export interface RuntimeAPIs {
  terminal: TerminalAPI;
  git: GitAPI;
  files: FilesAPI;
  settings: SettingsAPI;
  permissions: PermissionsAPI;
  notifications: NotificationsAPI;
  isDesktop: boolean;
}
```

**Validation:**
```bash
pnpm -C packages/ui type-check
# Should pass
```

---

### Task 1.5: Create RuntimeAPIContext

**Objective:** Enable dependency injection of APIs into components.

**Create `packages/ui/src/contexts/RuntimeAPIContext.tsx`:**

```typescript
import React, { createContext, useContext } from 'react';
import type { RuntimeAPIs } from '@/lib/api/types';

const RuntimeAPIContext = createContext<RuntimeAPIs | null>(null);

export function RuntimeAPIProvider({
  apis,
  children,
}: {
  apis: RuntimeAPIs;
  children: React.ReactNode;
}) {
  return (
    <RuntimeAPIContext.Provider value={apis}>
      {children}
    </RuntimeAPIContext.Provider>
  );
}

export function useRuntimeAPIs(): RuntimeAPIs {
  const apis = useContext(RuntimeAPIContext);
  if (!apis) {
    throw new Error('useRuntimeAPIs must be used within RuntimeAPIProvider');
  }
  return apis;
}
```

**Validation:**
```bash
pnpm -C packages/ui type-check
# Should pass
```

---

### Task 1.6: Update App.tsx to Accept APIs

**Objective:** Modify root component to accept APIs via props.

**Update `packages/ui/src/App.tsx`:**

Add at the top:
```typescript
import { RuntimeAPIProvider } from '@/contexts/RuntimeAPIContext';
import type { RuntimeAPIs } from '@/lib/api/types';
```

Wrap existing App export:
```typescript
interface AppProps {
  apis: RuntimeAPIs;
}

function AppContent() {
  // (existing App component code here)
  return <MainLayout />;
}

export default function App({ apis }: AppProps) {
  return (
    <RuntimeAPIProvider apis={apis}>
      <AppContent />
    </RuntimeAPIProvider>
  );
}
```

**Validation:**
```bash
pnpm -C packages/ui type-check
# Should pass
```

**End of Week 1 Status:**
- ✅ Monorepo structure created
- ✅ UI package isolated with API interfaces
- ✅ Dependency injection context ready
- ✅ App accepts APIs prop

---

## Week 2: Web Runtime Implementation

### Task 2.1: Create Web Package Structure

**Objective:** Move Express server + CLI to `packages/web`.

**Actions:**
```bash
# Move existing server
mkdir -p packages/web/server
cp -r server/* packages/web/server/

# Move existing bin
mkdir -p packages/web/bin
cp bin/cli.js packages/web/bin/cli.js

# Create web src directory
mkdir -p packages/web/src/api
```

**Create `packages/web/package.json`:**

```json
{
  "name": "@openchamber/web",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext ts,tsx",
    "start": "node server/index.js"
  },
  "bin": {
    "openchamber": "bin/cli.js"
  },
  "dependencies": {
    "@openchamber/ui": "workspace:*",
    "express": "^4.18.2",
    "simple-git": "^3.18.0",
    "node-pty": "^1.4.8",
    "http-proxy-middleware": "^2.0.6",
    "@opencode-ai/sdk": "^1.0.11",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vite": "^7.1.2",
    "@vitejs/plugin-react": "^4.2.1",
    "eslint": "^8.50.0"
  }
}
```

**Create `packages/web/tsconfig.json`:**
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "server"],
  "exclude": ["node_modules"]
}
```

**Create `packages/web/vite.config.ts`:**
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
```

---

### Task 2.2: Implement Web API Adapters - Terminal

**Create `packages/web/src/api/terminal.ts`:**

```typescript
import type {
  TerminalAPI,
  TerminalSession,
  CreateTerminalOptions,
  TerminalStreamEvent,
} from '@openchamber/ui/lib/api/types';

export function createTerminalAPI(): TerminalAPI {
  return {
    async create(options: CreateTerminalOptions): Promise<TerminalSession> {
      const response = await fetch('/api/terminal/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cwd: options.cwd,
          cols: options.cols || 80,
          rows: options.rows || 24,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to create terminal' }));
        throw new Error(error.error || 'Failed to create terminal session');
      }

      return response.json();
    },

    async write(sessionId: string, data: string): Promise<void> {
      const response = await fetch(`/api/terminal/${sessionId}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: data,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to send input' }));
        throw new Error(error.error || 'Failed to send terminal input');
      }
    },

    async resize(sessionId: string, cols: number, rows: number): Promise<void> {
      const response = await fetch(`/api/terminal/${sessionId}/resize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols, rows }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to resize terminal' }));
        throw new Error(error.error || 'Failed to resize terminal');
      }
    },

    async close(sessionId: string): Promise<void> {
      const response = await fetch(`/api/terminal/${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to close terminal' }));
        throw new Error(error.error || 'Failed to close terminal session');
      }
    },

    subscribe(
      sessionId: string,
      callback: (event: TerminalStreamEvent) => void,
      onError?: (error: Error, fatal?: boolean) => void
    ): () => void {
      // Use existing connectTerminalStream logic from src/lib/terminalApi.ts
      // For now, create a simple wrapper that uses the existing implementation
      
      let eventSource: EventSource | null = null;
      let retryCount = 0;
      let retryTimeout: ReturnType<typeof setTimeout> | null = null;
      let connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;
      let isClosed = false;
      let hasDispatchedOpen = false;
      let terminalExited = false;

      const maxRetries = 3;
      const initialRetryDelay = 1000;
      const maxRetryDelay = 8000;
      const connectionTimeout = 10000;

      const clearTimeouts = () => {
        if (retryTimeout) {
          clearTimeout(retryTimeout);
          retryTimeout = null;
        }
        if (connectionTimeoutId) {
          clearTimeout(connectionTimeoutId);
          connectionTimeoutId = null;
        }
      };

      const cleanup = () => {
        isClosed = true;
        clearTimeouts();
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
      };

      const connect = () => {
        if (isClosed || terminalExited) {
          return;
        }

        if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
          console.warn('Attempted to create duplicate EventSource, skipping');
          return;
        }

        hasDispatchedOpen = false;
        eventSource = new EventSource(`/api/terminal/${sessionId}/stream`);

        connectionTimeoutId = setTimeout(() => {
          if (!hasDispatchedOpen && eventSource?.readyState !== EventSource.OPEN) {
            console.error('Terminal connection timeout');
            eventSource?.close();
            handleError(new Error('Connection timeout'), false);
          }
        }, connectionTimeout);

        eventSource.onopen = () => {
          if (hasDispatchedOpen) {
            return;
          }
          hasDispatchedOpen = true;
          retryCount = 0;
          clearTimeouts();
          callback({ type: 'connected' });
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as TerminalStreamEvent;

            if (data.type === 'exit') {
              terminalExited = true;
              cleanup();
            }

            callback(data);
          } catch (error) {
            console.error('Failed to parse terminal event:', error);
            onError?.(error as Error, false);
          }
        };

        eventSource.onerror = (error) => {
          console.error('Terminal stream error:', error, 'readyState:', eventSource?.readyState);
          clearTimeouts();

          const isFatalError = terminalExited || eventSource?.readyState === EventSource.CLOSED;

          eventSource?.close();
          eventSource = null;

          if (!terminalExited) {
            handleError(new Error('Terminal stream connection error'), isFatalError);
          }
        };
      };

      const handleError = (error: Error, isFatal: boolean) => {
        if (isClosed || terminalExited) {
          return;
        }

        if (retryCount < maxRetries && !isFatal) {
          retryCount++;
          const delay = Math.min(initialRetryDelay * Math.pow(2, retryCount - 1), maxRetryDelay);

          console.log(`Reconnecting to terminal stream (attempt ${retryCount}/${maxRetries}) in ${delay}ms`);

          callback({
            type: 'reconnecting',
            attempt: retryCount,
            maxAttempts: maxRetries,
          });

          retryTimeout = setTimeout(() => {
            if (!isClosed && !terminalExited) {
              connect();
            }
          }, delay);
        } else {
          console.error(`Terminal connection failed after ${retryCount} attempts`);
          onError?.(error, true);
          cleanup();
        }
      };

      connect();

      return cleanup;
    },
  };
}
```

---

### Task 2.3: Implement Web API Adapters - Git

**Create `packages/web/src/api/git.ts`:**

Use the exact same functions from current `src/lib/gitApi.ts`, but wrap them in a factory function:

```typescript
import type { GitAPI, GitStatus, GitBranch /* ... all types */ } from '@openchamber/ui/lib/api/types';

export function createGitAPI(): GitAPI {
  const API_BASE = '/api/git';

  function buildUrl(
    path: string,
    directory: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    const url = new URL(path, window.location.origin);
    url.searchParams.set('directory', directory);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined) continue;
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  return {
    async checkIsRepository(cwd: string): Promise<boolean> {
      const response = await fetch(buildUrl(`${API_BASE}/check`, cwd));
      if (!response.ok) {
        throw new Error(`Failed to check git repository: ${response.statusText}`);
      }
      const data = await response.json();
      return data.isGitRepository;
    },

    async getStatus(cwd: string): Promise<GitStatus> {
      const response = await fetch(buildUrl(`${API_BASE}/status`, cwd));
      if (!response.ok) {
        throw new Error(`Failed to get git status: ${response.statusText}`);
      }
      return response.json();
    },

    // ... (all other git methods from gitApi.ts)
  };
}
```

**Note:** Copy all function implementations from `src/lib/gitApi.ts` into the returned object.

---

### Task 2.4: Implement Web API Adapters - Files

**Create `packages/web/src/api/files.ts`:**

```typescript
import type { FilesAPI, FileSearchResult, FileSearchOptions } from '@openchamber/ui/lib/api/types';

export function createFilesAPI(): FilesAPI {
  return {
    async search(cwd: string, options?: FileSearchOptions): Promise<FileSearchResult[]> {
      const params = new URLSearchParams();
      params.set('directory', cwd);
      if (options?.query) params.set('query', options.query);
      if (options?.limit) params.set('limit', String(options.limit));

      const response = await fetch(`/api/files/search?${params.toString()}`);
      if (!response.ok) throw new Error('File search failed');
      return response.json();
    },

    async read(path: string): Promise<string> {
      const response = await fetch(`/api/files/read?path=${encodeURIComponent(path)}`);
      if (!response.ok) throw new Error('Failed to read file');
      return response.text();
    },

    async write(path: string, content: string): Promise<void> {
      const response = await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content }),
      });
      if (!response.ok) throw new Error('Failed to write file');
    },

    async list(path: string): Promise<string[]> {
      const response = await fetch(`/api/files/list?path=${encodeURIComponent(path)}`);
      if (!response.ok) throw new Error('Failed to list directory');
      const data = await response.json();
      return data.entries || [];
    },
  };
}
```

---

### Task 2.5: Implement Web API Adapters - Settings

**Create `packages/web/src/api/settings.ts`:**

```typescript
import type { SettingsAPI, AppSettings } from '@openchamber/ui/lib/api/types';

export function createSettingsAPI(): SettingsAPI {
  return {
    async load(): Promise<AppSettings> {
      try {
        const response = await fetch('/api/config/settings', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return {};
        return response.json();
      } catch (error) {
        console.warn('Failed to load settings:', error);
        return {};
      }
    },

    async save(settings: Partial<AppSettings>): Promise<AppSettings> {
      const response = await fetch('/api/config/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error(`Failed to save settings: ${response.statusText}`);
      }

      return response.json();
    },
  };
}
```

---

### Task 2.6: Implement Web API Adapters - Permissions & Notifications (Stubs)

**Create `packages/web/src/api/permissions.ts`:**

```typescript
import type { PermissionsAPI, PermissionResult } from '@openchamber/ui/lib/api/types';

export function createPermissionsAPI(): PermissionsAPI {
  return {
    async requestDirectoryAccess(path: string): Promise<PermissionResult> {
      // Web doesn't need sandboxing permissions; return success
      return { success: true, path };
    },

    async startAccessingDirectory(path: string): Promise<PermissionResult> {
      return { success: true };
    },

    async stopAccessingDirectory(path: string): Promise<PermissionResult> {
      return { success: true };
    },

    async canAccess(path: string): Promise<boolean> {
      return true;
    },
  };
}
```

**Create `packages/web/src/api/notifications.ts`:**

```typescript
import type { NotificationsAPI, Notification } from '@openchamber/ui/lib/api/types';

export function createNotificationsAPI(): NotificationsAPI {
  return {
    async notify(notification: Notification): Promise<{ success: boolean }> {
      // Web could use Web Notifications API, for now just log
      console.log('[Notification]', notification.title, notification.body);
      return { success: true };
    },
  };
}
```

---

### Task 2.7: Create Web API Index & Main Entry Point

**Create `packages/web/src/api/index.ts`:**

```typescript
export { createTerminalAPI } from './terminal';
export { createGitAPI } from './git';
export { createFilesAPI } from './files';
export { createSettingsAPI } from './settings';
export { createPermissionsAPI } from './permissions';
export { createNotificationsAPI } from './notifications';

import type { RuntimeAPIs } from '@openchamber/ui/lib/api/types';
import { createTerminalAPI } from './terminal';
import { createGitAPI } from './git';
import { createFilesAPI } from './files';
import { createSettingsAPI } from './settings';
import { createPermissionsAPI } from './permissions';
import { createNotificationsAPI } from './notifications';

export function createWebAPIs(): RuntimeAPIs {
  return {
    terminal: createTerminalAPI(),
    git: createGitAPI(),
    files: createFilesAPI(),
    settings: createSettingsAPI(),
    permissions: createPermissionsAPI(),
    notifications: createNotificationsAPI(),
    isDesktop: false,
  };
}
```

**Create `packages/web/src/main.tsx`:**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@openchamber/ui';
import { createWebAPIs } from './api';

const apis = createWebAPIs();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App apis={apis} />
  </React.StrictMode>
);
```

---

### Task 2.8: Update Web Vite Config & HTML

**Update `packages/web/vite.config.ts`:**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
```

**Create `packages/web/index.html`:**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenChamber</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

### Task 2.9: Validation - Web Package

**Commands:**
```bash
pnpm install
pnpm -C packages/web type-check
pnpm -C packages/web build
# Should all succeed

# Test running web
pnpm -C packages/web dev
# Should start dev server and UI loads (same as before)
```

**Validation Checklist:**
- [ ] Web package builds without errors
- [ ] Type checking passes
- [ ] Dev server starts on port 5173
- [ ] UI loads identically to current version
- [ ] Settings persist to server
- [ ] Terminal works
- [ ] Git operations work

**End of Week 2 Status:**
- ✅ Web runtime fully implemented
- ✅ All API adapters for web
- ✅ Feature parity with current version
- ✅ No functionality changes

---

## Week 3: Desktop Runtime Stubs

### Task 3.1: Create Desktop Package Structure

**Objective:** Set up desktop package with stubs (no Rust yet).

```bash
mkdir -p packages/desktop/src
mkdir -p packages/desktop/src/api
mkdir -p packages/desktop/src-tauri/src
```

**Create `packages/desktop/tsconfig.json`:**
(Same as web)

**Create `packages/desktop/vite.config.ts`:**
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
```

---

### Task 3.2: Create Desktop API Stubs

All desktop API adapters follow the same pattern: call `invoke()` from Tauri, but throw placeholder errors for Phase 1.

**Create `packages/desktop/src/api/terminal.ts`:**

```typescript
import type { TerminalAPI, TerminalSession, CreateTerminalOptions, TerminalStreamEvent } from '@openchamber/ui/lib/api/types';

export function createTerminalAPI(): TerminalAPI {
  return {
    async create(options: CreateTerminalOptions): Promise<TerminalSession> {
      // Phase 2: invoke('terminal_create', options)
      throw new Error('Terminal API not yet implemented on desktop');
    },

    async write(sessionId: string, data: string): Promise<void> {
      // Phase 2: invoke('terminal_write', { sessionId, data })
      throw new Error('Terminal API not yet implemented on desktop');
    },

    async resize(sessionId: string, cols: number, rows: number): Promise<void> {
      // Phase 2: invoke('terminal_resize', { sessionId, cols, rows })
      throw new Error('Terminal API not yet implemented on desktop');
    },

    async close(sessionId: string): Promise<void> {
      // Phase 2: invoke('terminal_close', { sessionId })
      throw new Error('Terminal API not yet implemented on desktop');
    },

    subscribe(
      sessionId: string,
      callback: (event: TerminalStreamEvent) => void,
      onError?: (error: Error, fatal?: boolean) => void
    ): () => void {
      // Phase 2: listen() from Tauri events
      return () => {};
    },
  };
}
```

**Create `packages/desktop/src/api/git.ts`:**

```typescript
import type { GitAPI } from '@openchamber/ui/lib/api/types';

export function createGitAPI(): GitAPI {
  const notImplemented = () => {
    throw new Error('Git API not yet implemented on desktop');
  };

  return {
    async checkIsRepository(cwd: string) {
      notImplemented();
    },
    async getStatus(cwd: string) {
      notImplemented();
    },
    // ... all other methods throw
  } as unknown as GitAPI;
}
```

(Continue for all methods...)

**Similar stubs for:**
- `packages/desktop/src/api/files.ts`
- `packages/desktop/src/api/settings.ts`
- `packages/desktop/src/api/permissions.ts`
- `packages/desktop/src/api/notifications.ts`

---

### Task 3.3: Create Desktop API Index & Main Entry Point

**Create `packages/desktop/src/api/index.ts`:**

```typescript
export { createTerminalAPI } from './terminal';
export { createGitAPI } from './git';
export { createFilesAPI } from './files';
export { createSettingsAPI } from './settings';
export { createPermissionsAPI } from './permissions';
export { createNotificationsAPI } from './notifications';

import type { RuntimeAPIs } from '@openchamber/ui/lib/api/types';
import { createTerminalAPI } from './terminal';
import { createGitAPI } from './git';
import { createFilesAPI } from './files';
import { createSettingsAPI } from './settings';
import { createPermissionsAPI } from './permissions';
import { createNotificationsAPI } from './notifications';

export function createDesktopAPIs(): RuntimeAPIs {
  return {
    terminal: createTerminalAPI(),
    git: createGitAPI(),
    files: createFilesAPI(),
    settings: createSettingsAPI(),
    permissions: createPermissionsAPI(),
    notifications: createNotificationsAPI(),
    isDesktop: true,
  };
}
```

**Create `packages/desktop/src/main.tsx`:**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@openchamber/ui';
import { createDesktopAPIs } from './api';

const apis = createDesktopAPIs();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App apis={apis} />
  </React.StrictMode>
);
```

**Create `packages/desktop/index.html`:**
(Same as web)

---

### Task 3.4: Create Desktop Cargo Project (Empty)

**Create `packages/desktop/src-tauri/Cargo.toml`:**

```toml
[package]
name = "openchamber-desktop"
version = "0.1.0"
edition = "2021"

[lib]
name = "openchamber_lib"
path = "src/lib.rs"

[[bin]]
name = "openchamber"
path = "src/main.rs"

[dependencies]
tauri = { version = "2", features = ["shell-open", "fs-scope"] }
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1", features = ["full"] }

[profile.release]
opt-level = "z"
lto = true
```

**Create `packages/desktop/src-tauri/src/lib.rs`:**

```rust
// Phase 2: Rust implementations
```

**Create `packages/desktop/src-tauri/src/main.rs`:**

```rust
fn main() {
    println!("OpenChamber Desktop - Tauri");
}
```

---

### Task 3.5: Create Desktop Package.json

**Create `packages/desktop/package.json`:**

```json
{
  "name": "@openchamber/desktop",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext ts,tsx",
    "build": "tsc --noEmit && vite build"
  },
  "dependencies": {
    "@openchamber/ui": "workspace:*",
    "@tauri-apps/api": "^2.0.0"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vite": "^7.1.2",
    "@vitejs/plugin-react": "^4.2.1"
  }
}
```

---

### Task 3.6: Validation - Desktop Package

**Commands:**
```bash
pnpm install
pnpm -C packages/desktop type-check
pnpm -C packages/desktop build
# Should all succeed (no execution needed)
```

**Validation Checklist:**
- [ ] Desktop package type-checks
- [ ] Desktop package builds
- [ ] No runtime errors (stubs throw errors, which is expected)

**End of Week 3 Status:**
- ✅ Desktop package structure created
- ✅ API stubs in place
- ✅ Compiles successfully
- ✅ Ready for Phase 2 Rust implementation

---

## Week 4: Testing, Validation & Documentation

### Task 4.1: Global Type Checking & Linting

**Commands:**
```bash
# Type check all packages
pnpm -r type-check

# Lint all packages
pnpm -r lint

# Build all packages
pnpm -r build
```

**Expected:** All pass without errors.

---

### Task 4.2: Web Feature Validation

**Checklist:**
- [ ] Web dev server starts: `pnpm -C packages/web dev`
- [ ] UI loads without console errors
- [ ] Settings persist (change theme, refresh, verify settings.json)
- [ ] Terminal works (create session, send input, close)
- [ ] Git operations work (status, commit, branch operations)
- [ ] Prompt enhancer works
- [ ] Directory switching works
- [ ] Sessions load and switch
- [ ] All UI interactions work identically to before

**Test Script:**
```bash
# Terminal 1: Start dev server
pnpm -C packages/web dev

# Terminal 2: Test in browser
# Open http://localhost:5173
# Run manual tests from checklist above
```

---

### Task 4.3: Refactor Components to Use useRuntimeAPIs

**Affected files (small scope):**

1. **`packages/ui/src/components/right-sidebar/TerminalTab.tsx`**
   - Replace: `import { createTerminalSession, connectTerminalStream } from '@/lib/terminalApi';`
   - With: `import { useRuntimeAPIs } from '@/contexts/RuntimeAPIContext';`
   - Update calls: `const { terminal } = useRuntimeAPIs(); await terminal.create(...)`

2. **`packages/ui/src/components/right-sidebar/GitTab.tsx`**
   - Replace git API imports with `useRuntimeAPIs`
   - Update calls: `const { git } = useRuntimeAPIs(); await git.getStatus(...)`

3. **`packages/ui/src/components/right-sidebar/DiffTab.tsx`**
   - Same pattern as GitTab

4. **`packages/ui/src/stores/useDirectoryStore.ts`**
   - Remove direct imports from `@/lib/desktop`
   - Add param to store creation: `apis?: RuntimeAPIs`
   - Or: Create a separate initialization function that accepts APIs

5. **`packages/ui/src/stores/useGitIdentitiesStore.ts`**
   - Same pattern

6. **`packages/ui/src/lib/persistence.ts`**
   - Remove `isDesktopRuntime()` checks
   - Add param: `settingsAPI: SettingsAPI`
   - Use passed API instead of conditional branching

7. **`packages/ui/src/lib/appearanceAutoSave.ts`**
   - Same pattern as persistence.ts

**Pattern for hooks/stores:**

```typescript
// Before
import { isDesktopRuntime, updateDesktopSettings } from '@/lib/desktop';

export const useMyStore = create((set) => ({
  update: async (data) => {
    if (isDesktopRuntime()) {
      // ...
    } else {
      // ...
    }
  },
}));

// After (Option A: Lazy access)
export const useMyStore = create((set) => ({
  update: async (data) => {
    // Stores can't use hooks; provide via context or provider
  },
}));

// After (Option B: Provider pattern)
// Create a helper function that stores call
export function registerSettingsAPI(api: SettingsAPI) {
  globalSettings = api;
}

// In App component, before store init:
const { settings } = useRuntimeAPIs();
registerSettingsAPI(settings);
```

**Implementation priority:**
1. Easy: Components (TerminalTab, GitTab, DiffTab)
2. Medium: Utility functions (persistence.ts, appearanceAutoSave.ts)
3. Harder: Stores (useDirectoryStore, useGitIdentitiesStore) — may need refactor

---

### Task 4.4: Update CI/CD for Monorepo

**Update `.github/workflows/` files to:**
- Run builds for all packages
- Run type checks for all packages
- Run lints for all packages

**Example `.github/workflows/ci.yml`:**

```yaml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - run: pnpm install
      - run: pnpm -r type-check
      - run: pnpm -r lint
      - run: pnpm -r build
```

---

### Task 4.5: Clean Up Old Files

**What to keep:**
- Keep `src/` for backward compat (users might have imports)
- Keep `server/` for backward compat
- Keep `bin/cli.js` for backward compat
- Mark as "deprecated, moved to packages/*" in comments

**What can remove in Phase 2:**
- Old main entry point references
- Old Electron code (after desktop works on Tauri)

---

### Task 4.6: Documentation Updates

**Update `docs/plans/`:**
- Mark REFINED-ARCHITECTURE.md as "Phase 1 Complete"
- Create PHASE-2-ROADMAP.md for Tauri impl
- Update main README with monorepo structure

**Create `docs/IMPLEMENTATION-NOTES.md`:**

```markdown
# Implementation Notes - Phase 1

## Architecture Changes

- Monorepo structure: Web and desktop share UI package
- Dependency injection: APIs provided via RuntimeAPIContext
- API interfaces: All backends abstracted into typed interfaces

## File Changes Summary

### New Files
- packages/ui/src/lib/api/types.ts - API interfaces
- packages/ui/src/contexts/RuntimeAPIContext.tsx - DI context
- packages/web/src/api/* - Web implementations
- packages/desktop/src/api/* - Desktop stubs

### Modified Files
- packages/ui/src/App.tsx - Accept apis prop
- 6 component/store files - Use useRuntimeAPIs hook

### Unchanged
- All components, hooks, styles
- All Zustand stores (only 2-3 lines changed in 2 stores)
- Express server, terminal, git implementations

## How to Extend

### Adding a New API

1. Add interface to packages/ui/src/lib/api/types.ts
2. Add property to RuntimeAPIs interface
3. Implement in packages/web/src/api/
4. Create stub in packages/desktop/src/api/
5. Export from packages/*/src/api/index.ts
6. Use via useRuntimeAPIs hook in components

### Phase 2 Tauri Implementation

Replace package/desktop/src/api/* stubs with real invoke() calls.
Implement Rust backends in src-tauri/src/.

## Known Limitations (Phase 1)

- Desktop APIs throw "not yet implemented"
- File read/write via API not used yet (OpenCode SDK used)
- Permissions API stubbed (macOS sandbox in Phase 2)
- Notifications API minimal (Web Notifications API available)
```

---

### Task 4.7: Final Validation Checklist

**Code Quality:**
- [ ] `pnpm -r type-check` passes
- [ ] `pnpm -r lint` passes
- [ ] `pnpm -r build` succeeds
- [ ] No `any` types introduced
- [ ] No `eslint-disable` comments added

**Functionality:**
- [ ] Web version feature-complete (same as before)
- [ ] All API adapters for web working
- [ ] Desktop stubs compiling
- [ ] Settings persist identically
- [ ] No console errors in dev mode

**Structure:**
- [ ] Monorepo workspace configured
- [ ] All dependencies properly linked
- [ ] No circular dependencies
- [ ] Package.json files correct

**Documentation:**
- [ ] REFINED-ARCHITECTURE.md complete
- [ ] PHASE-1-IMPLEMENTATION.md complete
- [ ] IMPLEMENTATION-NOTES.md created
- [ ] README updated with monorepo structure

---

## End of Phase 1: Success Criteria

✅ **All criteria met when:**

1. Monorepo builds and type-checks cleanly
2. Web version fully functional (feature-parity)
3. Desktop stubs compile (no runtime errors expected)
4. All 6 component/store files refactored to use useRuntimeAPIs
5. No breaking changes to UI or user experience
6. Documentation complete for Phase 2 handoff

---

## Estimated Effort per Task

| Task | Effort | Notes |
|------|--------|-------|
| 1.1-1.2 | 2h | Config files |
| 1.3-1.6 | 8h | UI package + DI |
| 2.1-2.9 | 20h | Web API impl |
| 3.1-3.6 | 8h | Desktop stubs |
| 4.1-4.7 | 12h | Testing & docs |
| **Refactoring components** | **10h** | 6 files, careful review |
| **Total Phase 1** | **60h** | ~3-4 weeks with agent dev |

---

## Phase 2 Roadmap (Post-Phase-1)

1. Implement Rust backends (portable-pty, git2, etc.)
2. Complete desktop API adapters (invoke → Rust)
3. Build and package desktop app
4. CI/CD for multi-platform builds
5. Distribution (macOS code signing, etc.)

**Estimated:** 4-5 weeks

