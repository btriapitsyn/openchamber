# OpenChamber Monorepo Refactoring - Refined Architecture Plan

**Status:** Ready for Phase 1 Implementation  
**Last Updated:** Nov 16, 2025  
**Based on:** Codebase audit (docs/AUDIT.md)

---

## Executive Summary

Current codebase is **well-structured** for monorepo refactoring. All APIs are already abstracted into clean library functions. Electron coupling is minimal and isolated. Settings persistence already works identically for web and desktop via shared JSON file.

**Phase 1 goal:** Extract abstraction layer + split into monorepo structure. No functionality changes, only reorganization.

**Phase 1 timeline:** 3-4 weeks (realistic, not guessed)

---

## Key Architectural Principles

1. **Default to sharing** — 95% of UI/state/logic is runtime-agnostic
2. **Abstraction via dependency injection** — APIs provided at app startup, not imported directly
3. **Unified settings** — Single JSON file, two persistence paths (API endpoint vs Electron IPC)
4. **Keep what works** — OpenCode SDK stays, Express server unchanged, Zustand stores unified
5. **Platform-specific code isolated** — Only 2-3 files contain Electron references; easy to swap

---

## Part 1: API Abstraction Layer

### 1.1 Define Runtime API Interfaces

Create `packages/ui/src/lib/api/types.ts` with unified interfaces for all backend operations.

#### Terminal API
```typescript
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
  ): () => void; // Returns unsubscribe function
}
```

#### Git API
```typescript
// Type definitions (copy from current gitApi.ts)
export interface GitStatus { ... }
export interface GitBranch { ... }
export interface GitCommitResult { ... }
// ... all other types

export interface GitAPI {
  // Status & info
  checkIsGitRepository(cwd: string): Promise<boolean>;
  getStatus(cwd: string): Promise<GitStatus>;
  getBranches(cwd: string): Promise<GitBranch>;
  getLog(cwd: string, options?: GitLogOptions): Promise<GitLogResponse>;
  getCurrentIdentity(cwd: string): Promise<GitIdentitySummary | null>;
  
  // Operations
  commit(cwd: string, message: string, options?: CreateGitCommitOptions): Promise<GitCommitResult>;
  push(cwd: string, options?: GitPushOptions): Promise<GitPushResult>;
  pull(cwd: string, options?: GitPullOptions): Promise<GitPullResult>;
  fetch(cwd: string, options?: GitFetchOptions): Promise<{ success: boolean }>;
  
  // Branches
  createBranch(cwd: string, name: string, startPoint?: string): Promise<{ success: boolean; branch: string }>;
  checkoutBranch(cwd: string, branch: string): Promise<{ success: boolean; branch: string }>;
  deleteBranch(cwd: string, payload: GitDeleteBranchPayload): Promise<{ success: boolean }>;
  deleteRemoteBranch(cwd: string, payload: GitDeleteRemoteBranchPayload): Promise<{ success: boolean }>;
  
  // Diff & revert
  getDiff(cwd: string, options: GetGitDiffOptions): Promise<GitDiffResponse>;
  revertFile(cwd: string, filePath: string): Promise<void>;
  
  // Worktrees
  isLinkedWorktree(cwd: string): Promise<boolean>;
  listWorktrees(cwd: string): Promise<GitWorktreeInfo[]>;
  addWorktree(cwd: string, payload: GitAddWorktreePayload): Promise<{ success: boolean; path: string; branch: string }>;
  removeWorktree(cwd: string, payload: GitRemoveWorktreePayload): Promise<{ success: boolean }>;
  
  // Identity
  setIdentity(cwd: string, profileId: string): Promise<{ success: boolean; profile: GitIdentityProfile }>;
  
  // Utility
  ensureIgnored(cwd: string): Promise<void>;
  generateCommitMessage(cwd: string, files: string[]): Promise<{ message: GeneratedCommitMessage }>;
}
```

#### Files API
```typescript
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
```

#### Settings API
```typescript
export interface AppSettings {
  // Theme
  themeId?: string;
  useSystemTheme?: boolean;
  themeVariant?: 'light' | 'dark';
  lightThemeId?: string;
  darkThemeId?: string;
  
  // Display
  markdownDisplayMode?: 'compact' | 'comfort';
  showReasoningTraces?: boolean;
  
  // Directories
  lastDirectory?: string;
  homeDirectory?: string;
  pinnedDirectories?: string[];
  approvedDirectories?: string[];
  securityScopedBookmarks?: string[];
  
  // Extensible
  [key: string]: unknown;
}

export interface SettingsAPI {
  load(): Promise<AppSettings>;
  save(settings: Partial<AppSettings>): Promise<AppSettings>;
}
```

#### Permissions API (macOS Sandbox + Directory Access)
```typescript
export interface PermissionRequest {
  path: string;
  reason?: string;
}

export interface PermissionResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface PermissionsAPI {
  // Request user permission (macOS file picker)
  requestDirectoryAccess(path: string): Promise<PermissionResult>;
  
  // Start using security-scoped bookmark
  startAccessingDirectory(path: string): Promise<PermissionResult>;
  
  // Stop using security-scoped bookmark (cleanup)
  stopAccessingDirectory(path: string): Promise<PermissionResult>;
  
  // Check if path is accessible
  canAccess(path: string): Promise<boolean>;
}
```

#### Notifications API
```typescript
export interface Notification {
  title?: string;
  body?: string;
}

export interface NotificationsAPI {
  notify(notification: Notification): Promise<{ success: boolean }>;
}
```

#### Unified Runtime APIs Container
```typescript
export interface RuntimeAPIs {
  terminal: TerminalAPI;
  git: GitAPI;
  files: FilesAPI;
  settings: SettingsAPI;
  permissions: PermissionsAPI;
  notifications: NotificationsAPI;
  isDesktop: boolean;  // Runtime type flag
}
```

**File location:** `packages/ui/src/lib/api/types.ts`

---

### 1.2 Create Dependency Injection Context

**File:** `packages/ui/src/contexts/RuntimeAPIContext.tsx`

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

**Usage in components:**
```typescript
import { useRuntimeAPIs } from '@/contexts/RuntimeAPIContext';

export function TerminalTab() {
  const { terminal } = useRuntimeAPIs();
  
  const createSession = async () => {
    const session = await terminal.create({ cwd: '/some/path' });
    // ...
  };
}
```

---

### 1.3 Refactor App Root for DI

**File:** `packages/ui/src/App.tsx` (modified)

```typescript
import React from 'react';
import { RuntimeAPIProvider } from '@/contexts/RuntimeAPIContext';
import type { RuntimeAPIs } from '@/lib/api/types';
import { MainLayout } from '@/components/layout/MainLayout';

interface AppProps {
  apis: RuntimeAPIs;
}

export default function App({ apis }: AppProps) {
  return (
    <RuntimeAPIProvider apis={apis}>
      <MainLayout />
    </RuntimeAPIProvider>
  );
}
```

**Update:** `packages/ui/src/main.tsx` will be removed; entry points handled by `packages/web` and `packages/desktop`.

---

## Part 2: Monorepo Structure

### 2.1 Directory Layout

```
openchamber/
├── packages/
│   ├── ui/                           # Shared React frontend (new)
│   │   ├── src/
│   │   │   ├── components/           # All React components (unchanged)
│   │   │   ├── stores/               # Zustand stores (unchanged)
│   │   │   ├── hooks/                # Custom hooks (unchanged)
│   │   │   ├── contexts/
│   │   │   │   ├── RuntimeAPIContext.tsx  # NEW: DI context
│   │   │   │   ├── FireworksContext.tsx   # (existing)
│   │   │   │   └── ...
│   │   │   ├── lib/
│   │   │   │   ├── api/
│   │   │   │   │   └── types.ts      # NEW: Runtime API interfaces
│   │   │   │   ├── opencode/         # (existing, unchanged)
│   │   │   │   ├── theme/            # (existing, unchanged)
│   │   │   │   └── ...               # (all other libs)
│   │   │   ├── types/                # (existing)
│   │   │   ├── constants/            # (existing)
│   │   │   ├── styles/               # (existing)
│   │   │   ├── assets/               # (existing)
│   │   │   ├── App.tsx               # MODIFIED: Accept apis prop
│   │   │   ├── index.css             # (existing)
│   │   │   └── vite-env.d.ts         # (existing)
│   │   ├── package.json              # Shared UI dependencies only
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   │
│   ├── web/                          # Node.js web deployment (existing)
│   │   ├── server/
│   │   │   ├── index.js              # Express server (unchanged)
│   │   │   └── lib/
│   │   │       ├── git-service.js
│   │   │       ├── opencode-config.js
│   │   │       └── ui-auth.js
│   │   ├── src/
│   │   │   ├── api/                  # NEW: Web-specific API implementations
│   │   │   │   ├── terminal.ts       # fetch-based TerminalAPI impl
│   │   │   │   ├── git.ts            # fetch-based GitAPI impl
│   │   │   │   ├── files.ts          # fetch-based FilesAPI impl
│   │   │   │   ├── settings.ts       # fetch-based SettingsAPI impl
│   │   │   │   ├── permissions.ts    # Web stub (no-op or error)
│   │   │   │   ├── notifications.ts  # Web stub (no-op)
│   │   │   │   └── index.ts          # Export all APIs
│   │   │   ├── main.tsx              # NEW: Web entry point
│   │   │   └── lib/
│   │   │       └── [web-specific utilities]
│   │   ├── bin/
│   │   │   └── cli.js                # CLI entrypoint (existing)
│   │   ├── package.json              # Web + server dependencies
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   │
│   └── desktop/                      # Tauri desktop app (new/future)
│       ├── src-tauri/                # Rust backend (Phase 2)
│       │   ├── src/
│       │   │   ├── main.rs
│       │   │   ├── terminal.rs
│       │   │   ├── git.rs
│       │   │   ├── files.rs
│       │   │   ├── settings.rs
│       │   │   └── permissions.rs
│       │   ├── Cargo.toml
│       │   └── tauri.conf.json
│       ├── src/
│       │   ├── api/                  # NEW: Desktop-specific API implementations
│       │   │   ├── terminal.ts       # Tauri invoke-based TerminalAPI impl
│       │   │   ├── git.ts            # Tauri invoke-based GitAPI impl
│       │   │   ├── files.ts          # Tauri invoke-based FilesAPI impl
│       │   │   ├── settings.ts       # Tauri invoke-based SettingsAPI impl
│       │   │   ├── permissions.ts    # Tauri invoke-based PermissionsAPI impl
│       │   │   ├── notifications.ts  # Tauri invoke-based NotificationsAPI impl
│       │   │   └── index.ts          # Export all APIs
│       │   ├── main.tsx              # NEW: Desktop entry point
│       │   └── lib/
│       │       └── [desktop-specific utilities]
│       ├── package.json              # Desktop + Tauri dependencies
│       ├── tsconfig.json
│       └── vite.config.ts
│
├── package.json                      # Root workspace config (NEW)
├── pnpm-workspace.yaml               # Workspace config (NEW) or package.json workspaces
├── tsconfig.json                     # Shared TS base config (NEW)
├── docs/
│   ├── AUDIT.md                      # Codebase audit
│   ├── plans/
│   │   ├── REFINED-ARCHITECTURE.md   # This file
│   │   ├── PHASE-1-IMPLEMENTATION.md # (To be created)
│   │   └── ...
│   └── ...
├── electron/                         # (Keep for now, remove in Phase 2)
├── .github/workflows/
│   └── build.yml                     # (Updated for monorepo)
└── ...
```

---

## Part 3: Implementation Phases

### Phase 1: Foundation (3-4 weeks)

**Goal:** Extract abstraction layer + split into monorepo structure. **No functionality changes.**

#### Week 1: Setup & API Interfaces
- [ ] Create monorepo root structure (`package.json`, `pnpm-workspace.yaml`, `tsconfig.json`)
- [ ] Create `packages/ui` folder, move `src/` contents
- [ ] Create `packages/web` folder, move Express server + cli.js
- [ ] Create `packages/desktop` folder (stubs only)
- [ ] Define all API interfaces (`packages/ui/src/lib/api/types.ts`)
- [ ] Create dependency injection context (`RuntimeAPIContext.tsx`)
- [ ] Update `packages/ui/src/App.tsx` to accept `apis` prop

#### Week 2: Web Runtime Implementation
- [ ] Implement web API adapters in `packages/web/src/api/`:
  - `terminal.ts` — Wrap existing `terminalApi.ts` functions
  - `git.ts` — Wrap existing `gitApi.ts` functions
  - `files.ts` — New, wrap server `/api/files/search` endpoint
  - `settings.ts` — Wrap existing persistence logic (unified for web)
  - `permissions.ts` — Stub (throw error or no-op)
  - `notifications.ts` — Stub (no-op)
- [ ] Create `packages/web/src/main.tsx` entry point that:
  - Imports shared `App` from `@openchamber/ui`
  - Creates web API implementations
  - Builds `RuntimeAPIs` object
  - Renders `<App apis={webAPIs} />`
- [ ] Update build config to use monorepo structure
- [ ] Verify web version builds and runs identically to current

#### Week 3: Desktop Runtime Stubs
- [ ] Create `packages/desktop/src/api/` with stubs (all invoke() calls):
  - `terminal.ts` — Tauri invoke stubs (will be impl'd in Phase 2)
  - `git.ts` — Tauri invoke stubs
  - `files.ts` — Tauri invoke stubs
  - `settings.ts` — Tauri invoke stubs
  - `permissions.ts` — Tauri invoke stubs
  - `notifications.ts` — Tauri invoke stubs
- [ ] Create `packages/desktop/src/main.tsx` entry point (identical structure to web)
- [ ] Create minimal `Cargo.toml` for future Rust impl
- [ ] Verify desktop stub compiles (invoke calls won't work yet; that's Phase 2)

#### Week 4: Testing & Validation
- [ ] Ensure monorepo builds:
  - `npm run build` (or `pnpm -r build`)
  - `npm run lint` (or `pnpm -r lint`)
  - `tsc --noEmit` in all workspaces
- [ ] Verify web version:
  - Builds identically
  - All settings persist to `~/.config/.openchamber/settings.json`
  - Terminal, git, prompt enhancer work
  - No console errors
- [ ] Verify desktop stub:
  - Compiles
  - Loads UI (will fail on API calls; expected)
- [ ] Update CI/CD (GitHub Actions) for monorepo
- [ ] Document API implementation pattern
- [ ] Clean up old files (move to Phase 2 cleanup)

#### Deliverables
1. Monorepo structure fully set up
2. All API interfaces defined and typed
3. Web runtime fully functional (feature-parity with current)
4. Desktop runtime stubs (compiles, no functionality)
5. No functional changes to UI or user experience

---

### Phase 2: Desktop Runtime (Tauri) Implementation (Future)

**Note:** Phase 2 is not yet planned in detail. This section outlines the scope and approach. A detailed Phase 2 plan will be created after Phase 1 completes.

**Goal:** Implement Rust backends + complete Tauri desktop app. **Eliminate Electron completely.**

#### Scope
- Implement Rust terminal wrapper (portable-pty)
- Implement Rust git wrapper (git2)
- Implement Rust file operations and search
- Implement Tauri window management
- Implement settings persistence (Tauri store)
- Complete all invoke() commands in desktop API adapters
- Test both web and desktop deployments
- Establish CI/CD for multi-platform builds
- **Remove all Electron code** (`electron/` folder, electron dependencies, Electron-specific logic)

#### Deliverables
1. Rust backend fully implemented
2. Desktop API adapters complete (invoke → Rust)
3. Desktop app builds and packages
4. Both web and desktop deployments tested
5. CI/CD pipeline for multi-platform builds
6. **Electron completely eliminated** (all code, dependencies, references removed)

---

## Part 4: Critical Implementation Details

### 4.1 Settings API Unification

**Current state:** Settings already work identically for web and desktop via shared JSON file.

**What Phase 1 does:** Abstracts both paths under `SettingsAPI` interface.

**Implementation:**

```typescript
// packages/web/src/api/settings.ts
import type { SettingsAPI, AppSettings } from '@openchamber/ui/lib/api/types';

export function createSettingsAPI(): SettingsAPI {
  return {
    async load(): Promise<AppSettings> {
      const response = await fetch('/api/config/settings', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return {};
      return response.json();
    },

    async save(settings: Partial<AppSettings>): Promise<AppSettings> {
      const response = await fetch('/api/config/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error(`Failed to save settings: ${response.statusText}`);
      return response.json();
    },
  };
}
```

```typescript
// packages/desktop/src/api/settings.ts (Phase 2)
import { invoke } from '@tauri-apps/api/core';
import type { SettingsAPI, AppSettings } from '@openchamber/ui/lib/api/types';

export function createSettingsAPI(): SettingsAPI {
  return {
    async load(): Promise<AppSettings> {
      return invoke('settings_load');
    },

    async save(settings: Partial<AppSettings>): Promise<AppSettings> {
      return invoke('settings_save', { settings });
    },
  };
}
```

**Key insight:** Same interface, two implementations. Components never know the difference.

### 4.2 Files API (New)

**Current state:** File search exists in server but is not exposed via `FilesAPI`.

**Phase 1 task:** Extract `/api/files/search` into FilesAPI, unify with OpenCode SDK.

```typescript
// packages/web/src/api/files.ts
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

### 4.3 Web/Desktop Entry Points

**packages/web/src/main.tsx:**
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@openchamber/ui';
import {
  createTerminalAPI,
  createGitAPI,
  createFilesAPI,
  createSettingsAPI,
  createPermissionsAPI,
  createNotificationsAPI,
} from './api';

const apis = {
  terminal: createTerminalAPI(),
  git: createGitAPI(),
  files: createFilesAPI(),
  settings: createSettingsAPI(),
  permissions: createPermissionsAPI(),
  notifications: createNotificationsAPI(),
  isDesktop: false,
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App apis={apis} />
  </React.StrictMode>
);
```

**packages/desktop/src/main.tsx:**
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@openchamber/ui';
import {
  createTerminalAPI,
  createGitAPI,
  createFilesAPI,
  createSettingsAPI,
  createPermissionsAPI,
  createNotificationsAPI,
} from './api';

const apis = {
  terminal: createTerminalAPI(),
  git: createGitAPI(),
  files: createFilesAPI(),
  settings: createSettingsAPI(),
  permissions: createPermissionsAPI(),
  notifications: createNotificationsAPI(),
  isDesktop: true,
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App apis={apis} />
  </React.StrictMode>
);
```

---

## Part 5: Refactoring Existing Code (Minimal)

### 5.1 What Changes in Components

**Before:**
```typescript
import { createTerminalSession, connectTerminalStream } from '@/lib/terminalApi';

export function TerminalTab() {
  const createSession = async () => {
    const session = await createTerminalSession({ cwd });
  };
}
```

**After:**
```typescript
import { useRuntimeAPIs } from '@/contexts/RuntimeAPIContext';

export function TerminalTab() {
  const { terminal } = useRuntimeAPIs();
  
  const createSession = async () => {
    const session = await terminal.create({ cwd });
  };
}
```

**Change:** Replace direct imports with `useRuntimeAPIs()` hook.

**Affected files:**
- `TerminalTab.tsx` (right-sidebar) — 1 component
- `GitTab.tsx` (right-sidebar) — 1 component
- `DiffTab.tsx` (right-sidebar) — 1 component
- Stores: `useDirectoryStore.ts`, `useGitIdentitiesStore.ts` — 2 stores
- Utilities: `appearancePersistence.ts`, `appearanceAutoSave.ts` — 2 utils

**Total: ~6 files to refactor** (small scope)

### 5.2 What Doesn't Change

- `src/components/` — 100% unchanged
- `src/stores/` (except 2 above) — unchanged
- `src/hooks/` — unchanged
- `src/lib/opencode/` — unchanged
- `src/lib/theme/` — unchanged
- All Zustand stores — unchanged
- All React hooks — unchanged
- Express server — unchanged (just moves to `packages/web/server/`)

---

## Part 6: Workspace Configuration

### Root `package.json`
```json
{
  "name": "openchamber-monorepo",
  "version": "0.1.0",
  "private": true,
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
  }
}
```

### Root `tsconfig.json` (Shared)
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
    "outDir": "./dist"
  }
}
```

### `pnpm-workspace.yaml`
```yaml
packages:
  - 'packages/*'
```

---

## Part 7: Build & Type Safety

### Validation Checklist

#### Monorepo Setup
- [ ] Root `package.json` with workspaces configured
- [ ] `pnpm-workspace.yaml` or npm workspaces
- [ ] Shared `tsconfig.json` in root
- [ ] All workspaces inherit from root tsconfig
- [ ] `npm install` (or `pnpm install`) installs all dependencies

#### Shared UI Package (`packages/ui`)
- [ ] Compiles standalone: `pnpm -C packages/ui build`
- [ ] Type check passes: `pnpm -C packages/ui type-check`
- [ ] Exports `App` as default export
- [ ] Exports all types from `lib/api/types.ts`
- [ ] Exports `RuntimeAPIContext` and `useRuntimeAPIs`
- [ ] Zero runtime-specific code (no `isDesktopRuntime()`)

#### Web Runtime (`packages/web`)
- [ ] Imports `App` from `@openchamber/ui`
- [ ] Builds identically to current: `pnpm -C packages/web build`
- [ ] All tests pass (if any)
- [ ] Type check: `tsc --noEmit` passes
- [ ] Runs: `pnpm -C packages/web dev` works (Express server + web UI)
- [ ] All features work: terminal, git, settings, prompt enhancer

#### Desktop Runtime (`packages/desktop`)
- [ ] Imports `App` from `@openchamber/ui`
- [ ] Compiles (doesn't need to run in Phase 1)
- [ ] Type check: `tsc --noEmit` passes

#### Global Validation
- [ ] `pnpm lint` passes across all workspaces
- [ ] `tsc --noEmit` passes across all workspaces
- [ ] `pnpm build` builds all packages sequentially
- [ ] No circular dependencies between packages

---

## Part 8: Questions to Confirm

Before implementation starts, confirm:

1. **Permissions API scope:** Should it include macOS security-scoped bookmark mgmt, or just directory access validation?

2. **Files API scope:** Should it wrap only `/api/files/search`, or include read/write/list as well?

3. **Desktop in Phase 1:** Should `packages/desktop` stubs compile to TypeScript, or can they be empty folders that Phase 2 fills?

4. **Workspace manager:** Prefer `pnpm-workspace.yaml` or npm `workspaces` in root `package.json`?

5. **Express server location:** Keep in `packages/web/server/`, or extract to separate package `packages/server/`?

6. **OpenCode SDK usage:** Keep wrapping in `src/lib/opencode/client.ts`, or expose directly in components once DI is in place?

---

## Part 9: Success Criteria

Phase 1 is **complete** when:

1. ✅ Monorepo structure created and builds
2. ✅ All runtime API interfaces defined
3. ✅ Dependency injection context implemented
4. ✅ Web runtime fully functional (feature-parity with current)
5. ✅ Desktop runtime stubs (code compiles, stubs can't execute)
6. ✅ All type checks pass (`tsc --noEmit`)
7. ✅ All linting passes (`eslint`)
8. ✅ No breaking changes to UI/UX
9. ✅ Settings persist identically (web and desktop)
10. ✅ Documentation updated for Phase 2

---

## Part 10: Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Breaking web functionality | Comprehensive testing during Phase 1; keep feature parity checklist |
| Circular package dependencies | Strict dependency review; clear API contracts between packages |
| Type safety regression | `tsc --noEmit` must pass at all times; no `any` casts |
| Component refactoring errors | Small scope (6 files); peer review each change |
| Monorepo build complexity | Document build order; use `pnpm -r` for parallel builds |
| Desktop stubs incomplete | Phase 1 doesn't execute desktop code; Phase 2 fills in impl |

---

## Summary

**Phase 1 transforms the codebase from single-app to monorepo** while maintaining 100% functional compatibility with web version. All backend APIs are abstracted into typed interfaces. Desktop stubs are created for Phase 2 to implement.

**No users, no data migration, no backward compatibility concerns.** Pure refactoring.

**Next step:** Create detailed implementation tasks (`PHASE-1-IMPLEMENTATION.md`) with exact file changes and testing steps.

