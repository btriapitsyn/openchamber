# Monorepo Multi-Runtime Architecture Plan (Nov 2025)

## Goal

Refactor OpenChamber into a unified monorepo supporting multiple deployment runtimes (web via Node.js, desktop via Tauri/Rust) while maintaining a single, shared UI codebase. Eliminate code duplication across web and desktop implementations, reduce bundle size for desktop (500MB → ~200MB), and enable future runtime targets (mobile, Electron alternatives) without UI rewrites.

## Problem Statement

Current architecture bundles OpenChamber as a monolithic Electron application containing:
- React frontend (~500KB minified)
- Zustand state management
- Full Node.js backend (Express server, terminal emulation, git operations, OpenCode process management)
- Chromium runtime (~80MB)
- Node.js runtime (~30MB)
- Complete `node_modules` (~150MB)

**Issues:**
1. **Code duplication risk**: Future Tauri desktop or web-only deployments would duplicate 95% of React/UI/state logic
2. **Large distribution size**: Desktop app exceeds 500MB (uncompressed) / ~200MB (compressed), creating friction for distribution and updates
3. **Runtime coupling**: UI components directly reference Electron IPC (`window.opencodeDesktop`, `window.opencodeDesktopSettings`)
4. **No backend separation**: Express server bundled with frontend; harder to share logic between deployment modes
5. **Mobile/web path unclear**: No clear structure for web-only or mobile-first variants

## Scope

This plan establishes the monorepo structure, API abstraction layer, and migration pathway. **Phase 1 focuses on structural refactoring only; no runtime changes yet.**

### Phase 1: Monorepo Foundation (4 weeks)

#### 1.0 Component Sharing Strategy

The monorepo supports **selective UI reuse**: most components are shared, with targeted overrides per runtime.

**Principle:** Default to sharing; override only when platform differences are unavoidable.

**Components that are 100% shared** (no overrides needed):
- Chat display (ChatContainer, MessageList, ChatMessage)
- Chat input (ChatInput, FileAttachment, CommandAutocomplete)
- Message rendering (StreamingAnimatedText, ToolPart, ReasoningPart)
- All settings dialogs (AgentsPage, CommandsPage, ProvidersPage, etc.)
- State management (Zustand stores are platform-agnostic)
- Theme system, typography, styling
- OpenCode SDK integration
- Session management (SessionSidebar, DirectoryTree)

**Components that may need overrides** (platform-specific UI):
- Header (web: hamburger menu, desktop: macOS traffic lights)
- Sidebar (web: responsive/collapsible, desktop: fixed left edge)
- Main layout grid (web: 100% responsive, desktop: fixed window chrome)
- Terminal rendering (web: xterm.js, desktop: possibly native terminal)
- Modal/dialog behavior (web: centered overlay, desktop: window sheet)
- Right sidebar (web: overlay panel, desktop: native sidebar)

**Strategy: Component Slots**

Instead of duplicating entire components, use composition with slots:

```typescript
// packages/ui/src/components/layout/Header.tsx (shared base)
export interface HeaderProps {
  onMenuToggle?: () => void;
  onSettings?: () => void;
  leading?: React.ReactNode;  // Platform-specific slot
}

export function Header({ onMenuToggle, onSettings, leading }: HeaderProps) {
  return (
    <header className="flex items-center justify-between">
      {leading}  {/* Platform renders macOS traffic lights or hamburger here */}
      <StatusIndicators onSettings={onSettings} />
    </header>
  );
}
```

```typescript
// packages/web/src/components/Header.tsx (web override)
import { Header as SharedHeader, type HeaderProps } from '@openchamber/ui/components';
import { HamburgerMenu } from './HamburgerMenu';

export function Header(props: HeaderProps) {
  return <SharedHeader {...props} leading={<HamburgerMenu />} />;
}

// packages/desktop/src/components/Header.tsx (desktop override)
import { Header as SharedHeader, type HeaderProps } from '@openchamber/ui/components';

export function Header(props: HeaderProps) {
  return <SharedHeader {...props} leading={<MacOSTrafficLights />} />;
}
```

This avoids component duplication while allowing platform differences.

#### 1.1 Create Workspace Structure

```
openchamber/
├── packages/
│   ├── ui/                           # Shared React frontend (new)
│   │   ├── src/
│   │   │   ├── components/           # All React components
│   │   │   │   ├── chat/             # 100% shared (no overrides)
│   │   │   │   ├── layout/           # Base layouts (may be overridden)
│   │   │   │   ├── sections/         # 100% shared (settings, agents, etc.)
│   │   │   │   ├── right-sidebar/    # Base implementation (may be overridden)
│   │   │   │   ├── ui/               # 100% shared (primitives)
│   │   │   │   ├── session/          # 100% shared (session management)
│   │   │   │   ├── auth/             # 100% shared (auth gate)
│   │   │   │   └── providers/        # 100% shared (context providers)
│   │   │   ├── stores/               # Zustand state management
│   │   │   ├── hooks/                # Custom React hooks
│   │   │   ├── contexts/             # React contexts
│   │   │   ├── lib/
│   │   │   │   ├── opencode/         # OpenCode SDK integration (unchanged)
│   │   │   │   ├── theme/            # Theme system (unchanged)
│   │   │   │   ├── api/              # NEW: Runtime-agnostic API interfaces
│   │   │   │   │   ├── terminal.ts   # Terminal API interface
│   │   │   │   │   ├── git.ts        # Git API interface
│   │   │   │   │   ├── files.ts      # File operations interface
│   │   │   │   │   ├── settings.ts   # Settings persistence interface
│   │   │   │   │   └── types.ts      # Shared API types
│   │   │   │   ├── markdownDisplayModes.ts
│   │   │   │   ├── fontOptions.ts
│   │   │   │   ├── utils.ts
│   │   │   │   └── [...other utils]
│   │   │   ├── types/                # TypeScript type definitions
│   │   │   ├── constants/            # Application constants
│   │   │   ├── styles/               # Global styles
│   │   │   ├── assets/               # Images, icons
│   │   │   ├── App.tsx               # Root component (with dependency injection)
│   │   │   ├── main.tsx              # Entry point
│   │   │   ├── index.css
│   │   │   └── vite-env.d.ts
│   │   ├── package.json              # Shared UI dependencies only
│   │   ├── tsconfig.json
│   │   └── vite.config.ts            # Shared Vite config
│   │
│   ├── web/                          # Node.js web deployment (existing)
│   │   ├── server/
│   │   │   ├── index.js              # Express server (unchanged)
│   │   │   ├── lib/
│   │   │   │   ├── git-service.js
│   │   │   │   ├── opencode-config.js
│   │   │   │   └── ui-auth.js
│   │   │   └── prompt-templates.js
│   │   ├── src/
│   │   │   ├── api/                  # NEW: Web-specific API implementations
│   │   │   │   ├── terminal.ts       # fetch(/api/terminal/*)
│   │   │   │   ├── git.ts            # fetch(/api/git/*)
│   │   │   │   ├── files.ts          # fetch(/api/files/*)
│   │   │   │   └── settings.ts       # localStorage + fetch
│   │   │   ├── components/           # NEW: Web-specific component overrides (optional)
│   │   │   │   └── overrides/        # Only if platform differences needed
│   │   │   │       ├── Header.tsx    # (if different from packages/ui)
│   │   │   │       ├── Sidebar.tsx   # (if different from packages/ui)
│   │   │   │       └── [others]      # Only override when necessary
│   │   │   ├── main.tsx              # Web entry point (provides APIs to UI)
│   │   │   ├── App.tsx               # Web app wrapper (provides component overrides)
│   │   │   └── lib/
│   │   │       └── [web-specific utilities]
│   │   ├── bin/
│   │   │   └── cli.js                # CLI entrypoint
│   │   ├── package.json              # Web + server dependencies
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   │
│   └── desktop/                      # Tauri desktop app (new/future)
│       ├── src-tauri/                # Rust backend
│       │   ├── src/
│       │   │   ├── main.rs           # Window management
│       │   │   ├── terminal.rs       # portable-pty wrapper
│       │   │   ├── git.rs            # git2 wrapper
│       │   │   ├── files.rs          # File operations
│       │   │   ├── settings.rs       # Settings persistence
│       │   │   └── opencode.rs       # Process management
│       │   ├── Cargo.toml
│       │   └── tauri.conf.json
│       ├── src/
│       │   ├── api/                  # NEW: Desktop-specific API implementations
│       │   │   ├── terminal.ts       # invoke('terminal_*')
│       │   │   ├── git.ts            # invoke('git_*')
│       │   │   ├── files.ts          # invoke('files_*')
│       │   │   └── settings.ts       # invoke('settings_*')
│       │   ├── components/           # NEW: Desktop-specific component overrides (optional)
│       │   │   └── overrides/        # Only if platform differences needed
│       │   │       ├── Header.tsx    # macOS traffic lights, window chrome
│       │   │       ├── Sidebar.tsx   # Desktop layout variant
│       │   │       ├── Terminal.tsx  # Native terminal rendering (if needed)
│       │   │       └── [others]      # Only override when necessary
│       │   ├── main.tsx              # Desktop entry point (provides APIs to UI)
│       │   ├── App.tsx               # Desktop app wrapper (provides component overrides)
│       │   └── lib/
│       │       └── [desktop-specific utilities]
│       ├── electron/                 # (optional: fallback/legacy)
│       ├── package.json              # Desktop + Tauri dependencies
│       ├── tsconfig.json
│       └── vite.config.ts
│
├── package.json                      # Root workspace config
├── tsconfig.json                     # Shared TS base config
├── pnpm-workspace.yaml               # (or package.json with "workspaces" field)
├── docs/plans/                       # Documentation
├── bin/cli.js                        # (moved to packages/web/bin/)
└── electron-builder.yml              # (moved to packages/desktop/)
```

**Rationale:**
- `packages/ui`: Single source of truth for React components, state, themes. Zero platform-specific code.
- `packages/web`: Node.js Express server + web deployment. Talks to OpenCode server + own backend.
- `packages/desktop`: Rust Tauri app + desktop deployment. Embedded OpenCode process + Rust backends.
- Workspace root: Single `npm install`, unified build orchestration, shared dev tooling.

#### 1.2 Component Override Strategy

The monorepo supports **selective component overrides**: most UI is shared, with targeted platform-specific versions only when necessary.

**Principle:** 95% of components are 100% reusable; override only platform chrome and UX differences.

**Components to Override (per platform):**

| Component | Web | Desktop | Reason |
|-----------|-----|---------|--------|
| Header | Optional (hamburger menu) | Optional (macOS traffic lights) | Platform chrome differs |
| Sidebar | Responsive/collapsible | Fixed left edge | Desktop has fixed window edge |
| Main layout | Full responsive | Fixed chrome height | Desktop window constraints |
| Terminal tab | xterm.js | Optional native | Rendering preference |
| Modals | Centered overlay | Sheet-style | Platform UX conventions |
| Settings | Shared | Optional native macOS settings | Rare: use web version |

**Components NEVER to Override (100% shared):**

| Component | Why |
|-----------|-----|
| ChatContainer, MessageList | Core business logic |
| ChatInput, FileAttachment | Message composition |
| StreamingAnimatedText | Rendering engine |
| All settings pages | Configuration UI |
| Zustand stores | State management |
| Theme system | Colors, typography |
| Hooks (useEventStream, etc.) | Integration logic |

**Override Pattern: Composition with Slots (Recommended)**

```typescript
// packages/ui/src/components/layout/Header.tsx (base, shared)
export interface HeaderProps {
  onMenuToggle?: () => void;
  leading?: React.ReactNode;  // Slot for platform chrome
}

export function Header({ onMenuToggle, leading }: HeaderProps) {
  return (
    <header className="flex items-center gap-2 px-4">
      {leading}  {/* Platform renders custom header chrome here */}
      <StatusIndicators onMenuToggle={onMenuToggle} />
    </header>
  );
}

// packages/web/src/components/overrides/Header.tsx (web override)
import { Header as SharedHeader } from '@openchamber/ui/components';
import { HamburgerMenu } from '../ui/HamburgerMenu';

export function Header(props: React.ComponentProps<typeof SharedHeader>) {
  return <SharedHeader {...props} leading={<HamburgerMenu />} />;
}

// packages/desktop/src/components/overrides/Header.tsx (desktop override)
import { Header as SharedHeader } from '@openchamber/ui/components';

export function Header(props: React.ComponentProps<typeof SharedHeader>) {
  // macOS traffic lights handled by Tauri window chrome
  return <SharedHeader {...props} />;
}
```

**Override Pattern: Complete Replacement (when slots insufficient)**

```typescript
// packages/ui/src/components/right-sidebar/TerminalTab.tsx (default)
export function TerminalTab() {
  return <XtermTerminal />;
}

// packages/desktop/src/components/overrides/TerminalTab.tsx (desktop override, if needed)
export function TerminalTab() {
  return <NativeTerminalUI />;  // Different rendering for desktop
}
```

**Dependency Injection at App Root:**

```typescript
// packages/web/src/App.tsx
import * as SharedComponents from '@openchamber/ui/components';
import * as WebOverrides from './components/overrides';

// Overrides layer on top of shared components
const Components = { ...SharedComponents, ...WebOverrides };

export function App() {
  return (
    <ComponentProviderContext.Provider value={Components}>
      <SharedApp apis={webAPIs} />
    </ComponentProviderContext.Provider>
  );
}
```

```typescript
// packages/desktop/src/App.tsx (same pattern)
import * as DesktopOverrides from './components/overrides';

const Components = { ...SharedComponents, ...DesktopOverrides };

export function App() {
  return (
    <ComponentProviderContext.Provider value={Components}>
      <SharedApp apis={desktopAPIs} />
    </ComponentProviderContext.Provider>
  );
}
```

**Create: `packages/ui/src/contexts/ComponentProviderContext.tsx`** (new)

```typescript
import React from 'react';
import * as DefaultComponents from '../components';

type ComponentMap = typeof DefaultComponents;

const ComponentProviderContext = React.createContext<ComponentMap>(DefaultComponents);

export function ComponentProvider({
  value,
  children,
}: {
  value: Partial<ComponentMap>;
  children: React.ReactNode;
}) {
  const merged = { ...DefaultComponents, ...value } as ComponentMap;
  return (
    <ComponentProviderContext.Provider value={merged}>
      {children}
    </ComponentProviderContext.Provider>
  );
}

export function useComponent<K extends keyof ComponentMap>(key: K): ComponentMap[K] {
  const components = React.useContext(ComponentProviderContext);
  return components[key];
}
```

#### 1.3 Define Runtime-Agnostic API Interfaces

**File: `packages/ui/src/lib/api/types.ts`** (shared type definitions)

```typescript
/**
 * Terminal session management
 */
export interface TerminalSession {
  id: string;
  cols: number;
  rows: number;
}

export interface CreateTerminalOptions {
  cwd: string;
  cols?: number;
  rows?: number;
}

export interface TerminalAPI {
  create(options: CreateTerminalOptions): Promise<TerminalSession>;
  write(sessionId: string, data: string): Promise<void>;
  read(sessionId: string): Promise<string>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  close(sessionId: string): Promise<void>;
  subscribe(sessionId: string, callback: (event: TerminalEvent) => void): () => void;
}

export type TerminalEvent = 
  | { type: 'connected'; data: undefined }
  | { type: 'data'; data: string }
  | { type: 'exit'; code: number; signal: string | null }
  | { type: 'error'; message: string };

/**
 * Git operations
 */
export interface GitStatus {
  current: string;
  tracking: string | null;
  ahead: number;
  behind: number;
  files: Array<{ path: string; index: string; working_dir: string }>;
  isClean: boolean;
}

export interface GitAPI {
  getStatus(cwd: string): Promise<GitStatus>;
  getDiff(options: GitDiffOptions): Promise<string>;
  getBranches(cwd: string): Promise<GitBranch>;
  stageFiles(cwd: string, files: string[]): Promise<void>;
  unstageFiles(cwd: string, files: string[]): Promise<void>;
  createCommit(cwd: string, message: string): Promise<{ commit: string; branch: string }>;
  getLog(cwd: string, limit: number): Promise<GitCommit[]>;
}

export interface GitDiffOptions {
  cwd: string;
  path?: string;
  staged?: boolean;
  contextLines?: number;
}

/**
 * File operations
 */
export interface FileSearchResult {
  name: string;
  path: string;
  relativePath: string;
  extension?: string;
}

export interface FilesAPI {
  search(cwd: string, query: string, limit?: number): Promise<FileSearchResult[]>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  list(path: string): Promise<string[]>;
}

/**
 * Settings persistence (theme, fonts, UI preferences)
 */
export interface SettingsAPI {
  load(): Promise<AppSettings>;
  save(settings: Partial<AppSettings>): Promise<void>;
}

export interface AppSettings {
  themeId?: string;
  useSystemTheme?: boolean;
  uiFont?: string;
  monoFont?: string;
  markdownDisplayMode?: string;
  [key: string]: unknown;
}

/**
 * Unified API container passed to App
 */
export interface RuntimeAPIs {
  terminal: TerminalAPI;
  git: GitAPI;
  files: FilesAPI;
  settings: SettingsAPI;
  isDesktop: boolean;  // Runtime type flag
}
```

**Rationale:**
- Single interface definition used by all runtimes
- Decouples UI from implementation details
- Enables mock implementations for testing
- Type-safe API contracts

#### 1.3 Refactor App Root for Dependency Injection

**File: `packages/ui/src/App.tsx`** (modified)

```typescript
import React from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import type { RuntimeAPIs } from '@/lib/api/types';

interface AppProps {
  apis: RuntimeAPIs;
}

function App({ apis }: AppProps) {
  return (
    <RuntimeAPIProvider apis={apis}>
      <MainLayout />
    </RuntimeAPIProvider>
  );
}

export default App;
```

**Create: `packages/ui/src/contexts/RuntimeAPIContext.tsx`** (new)

```typescript
import React, { createContext, useContext } from 'react';
import type { RuntimeAPIs } from '@/lib/api/types';

const RuntimeAPIContext = createContext<RuntimeAPIs | null>(null);

export function RuntimeAPIProvider({ 
  apis, 
  children 
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

**Refactor existing API calls in UI components:**

Example: Replace direct fetch calls with context-based API calls.

```typescript
// Before (in TerminalTab.tsx)
const createTerminal = async () => {
  const res = await fetch('/api/terminal/create', { /* ... */ });
  const session = await res.json();
};

// After
const createTerminal = async () => {
  const { terminal } = useRuntimeAPIs();
  const session = await terminal.create({ cwd });
};
```

#### 1.4 Implement Web Runtime (packages/web/)

**File: `packages/web/src/api/terminal.ts`** (web implementation)

```typescript
import type { TerminalAPI, TerminalSession, CreateTerminalOptions } from '@openchamber/ui/lib/api/types';

export const createTerminalAPI = (): TerminalAPI => ({
  async create(options: CreateTerminalOptions): Promise<TerminalSession> {
    const res = await fetch('/api/terminal/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cwd: options.cwd,
        cols: options.cols || 80,
        rows: options.rows || 24,
      }),
    });
    if (!res.ok) throw new Error(`Terminal create failed: ${res.statusText}`);
    return res.json();
  },

  async write(sessionId: string, data: string): Promise<void> {
    const res = await fetch(`/api/terminal/${sessionId}/write`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    });
    if (!res.ok) throw new Error(`Terminal write failed: ${res.statusText}`);
  },

  // ... other methods hit /api/terminal/* endpoints
});
```

**File: `packages/web/src/main.tsx`** (web entry point)

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@openchamber/ui';
import { createTerminalAPI } from './api/terminal';
import { createGitAPI } from './api/git';
import { createFilesAPI } from './api/files';
import { createSettingsAPI } from './api/settings';

const apis = {
  terminal: createTerminalAPI(),
  git: createGitAPI(),
  files: createFilesAPI(),
  settings: createSettingsAPI(),
  isDesktop: false,
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App apis={apis} />
  </React.StrictMode>
);
```

**Express server unchanged** (`packages/web/server/index.js`):
- Continues serving `/api/terminal/*`, `/api/git/*`, `/api/files/*` endpoints
- Proxy to OpenCode server at 4096
- Serves built frontend from `dist/`

#### 1.5 Prepare Desktop Runtime (packages/desktop/)

**File: `packages/desktop/src-tauri/src/terminal.rs`** (Rust implementation)

```rust
use portable_pty::{native_pty_system, PtySize};
use std::io::Write;
use std::sync::Arc;
use tokio::sync::Mutex;

#[tauri::command]
pub async fn terminal_create(
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<TerminalSession, String> {
    let pty_system = native_pty_system();
    let pty_pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    
    let session_id = uuid::Uuid::new_v4().to_string();
    // Store session in app state
    
    Ok(TerminalSession {
        id: session_id,
        cols: cols as i32,
        rows: rows as i32,
    })
}

#[tauri::command]
pub async fn terminal_write(session_id: String, data: String) -> Result<(), String> {
    // Write to pty master
    Ok(())
}
```

**File: `packages/desktop/src/api/terminal.ts`** (Tauri binding)

```typescript
import { invoke } from '@tauri-apps/api/core';
import type { TerminalAPI, TerminalSession, CreateTerminalOptions } from '@openchamber/ui/lib/api/types';

export const createTerminalAPI = (): TerminalAPI => ({
  async create(options: CreateTerminalOptions): Promise<TerminalSession> {
    return invoke('terminal_create', {
      cwd: options.cwd,
      cols: options.cols || 80,
      rows: options.rows || 24,
    });
  },

  async write(sessionId: string, data: string): Promise<void> {
    await invoke('terminal_write', { sessionId, data });
  },

  // ... other methods use Tauri invoke
});
```

**File: `packages/desktop/src/main.tsx`** (desktop entry point)

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@openchamber/ui';
import { createTerminalAPI } from './api/terminal';
import { createGitAPI } from './api/git';
import { createFilesAPI } from './api/files';
import { createSettingsAPI } from './api/settings';

const apis = {
  terminal: createTerminalAPI(),
  git: createGitAPI(),
  files: createFilesAPI(),
  settings: createSettingsAPI(),
  isDesktop: true,
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App apis={apis} />
  </React.StrictMode>
);
```

### Phase 1 Deliverables

1. ✅ Workspace structure created (`packages/ui`, `packages/web`, `packages/desktop`)
2. ✅ Runtime API interfaces defined (`TerminalAPI`, `GitAPI`, `FilesAPI`, `SettingsAPI`)
3. ✅ Dependency injection context (`RuntimeAPIContext`)
4. ✅ Web runtime implementations (fetch-based)
5. ✅ Desktop runtime stubs (Tauri invoke placeholders)
6. ✅ Root `App` component refactored to accept APIs
7. ✅ All UI components updated to use `useRuntimeAPIs()` hook
8. ✅ Monorepo builds and tests pass

**Timeline: 4 weeks**
- Week 1: Folder structure + workspace setup + API interfaces (3 days)
- Week 2: Web runtime implementation + refactor UI components (5 days)
- Week 3: Desktop runtime stubs + Tauri config (3 days)
- Week 4: Testing + validation + documentation (4 days)

---

## Phase 2: Desktop Runtime (Tauri) Implementation (Future)

*To be scheduled after Phase 1 completion. Estimated 4-5 weeks.*

### Goals
- Implement Rust backend (terminal, git, file operations)
- Complete Tauri desktop app
- Test both web and desktop deployments
- Establish CI/CD for multi-platform builds

### Scope
- Rust terminal wrapper (portable-pty)
- Rust git wrapper (git2)
- Rust file operations and search
- Tauri window management
- Settings persistence (Tauri store)
- macOS code signing + distribution

---

## Benefits

### Immediate (Phase 1)
1. **No code duplication**: Shared UI package is single source of truth
2. **Type safety**: Runtime APIs are typed interfaces; implementations must match contract
3. **Testability**: Mock implementations easy to create for unit tests
4. **Future-proof**: New runtimes (Electron, mobile) need only new API implementations
5. **Maintainability**: Bug fixes in UI components apply to all runtimes automatically

### Future (Phase 2)
1. **Smaller binaries**: Desktop app shrinks from ~500MB to ~200MB (Tauri + Rust backends)
2. **Lower memory**: Runtime memory drops from ~150MB to ~50MB
3. **Faster startup**: Tauri startup ~0.5s vs Electron ~1.5s
4. **Unified codebase**: One PR fixes both web and desktop
5. **Clear separation**: Backend logic independent of UI layer

## What Stays the Same

- React 19, TypeScript 5.8, Vite 7 (web builds)
- Zustand state management
- Tailwind CSS v4
- OpenCode SDK integration (HTTP API calls)
- All components, hooks, contexts
- All themes (15 total)
- All styling and typography systems
- Build validation (`pnpm run build`, `pnpm run lint`)

## Migration Path Summary

1. **Phase 1 (Nov-Dec 2025):** Monorepo + web runtime
2. **Phase 2 (Jan-Feb 2026):** Tauri desktop runtime + Rust backends
3. **Phase 3 (Mar 2026+):** CI/CD, distribution, future targets (Electron alternative, mobile web)

## Validation Checklist (Phase 1)

### Monorepo Structure
- [ ] Monorepo created with npm/pnpm workspaces
- [ ] `packages/ui`, `packages/web`, `packages/desktop` folders created
- [ ] Shared `tsconfig.json` and root `package.json` configured for workspaces
- [ ] `packages/ui/package.json` has only UI dependencies (React, Tailwind, etc.)
- [ ] `packages/web/package.json` has server dependencies (Express, node-pty, simple-git)
- [ ] `packages/desktop/package.json` has Tauri dependencies

### Shared UI Package
- [ ] `packages/ui` compiles standalone (exports React components)
- [ ] All components build without runtime-specific code
- [ ] No direct `fetch` calls to `/api/*` in components (use `useRuntimeAPIs()` instead)
- [ ] No `window.opencodeDesktop` references in UI
- [ ] Runtime API interfaces defined in `packages/ui/src/lib/api/types.ts`
- [ ] Dependency injection context created (`RuntimeAPIContext`, `RuntimeAPIProvider`)
- [ ] `App` component accepts `apis` prop

### Component Overrides
- [ ] Component override patterns documented (composition slots vs. complete replacement)
- [ ] `ComponentProviderContext` created for runtime-specific component swapping
- [ ] Web overrides folder created (`packages/web/src/components/overrides/`) if needed
- [ ] Desktop overrides folder created (`packages/desktop/src/components/overrides/`) if needed
- [ ] Both runtimes can selectively override Header, Sidebar, Layout components
- [ ] Shared chat/messaging components have no overrides (100% shared)

### API Implementations
- [ ] Web API implementations created (fetch-based for terminal, git, files, settings)
- [ ] Desktop API implementations created (Tauri invoke stubs for terminal, git, files, settings)
- [ ] Both runtimes provide identical `RuntimeAPIs` interface
- [ ] Web runtime hits all Express endpoints (`/api/terminal/*`, `/api/git/*`, etc.)
- [ ] Desktop runtime routes to Tauri invoke stubs

### Type Safety & Validation
- [ ] Type checking passes (`tsc --noEmit` in all workspaces)
- [ ] Linting passes (`eslint` in all workspaces)
- [ ] No runtime errors in console
- [ ] Both runtimes render identical core UI (chat, messages, settings)
- [ ] Settings, theme switching, state persistence work in both

### Integration Tests
- [ ] Web app builds and starts (`pnpm run build:web`)
- [ ] Desktop stub builds and starts (`pnpm run build:desktop`)
- [ ] Shared components export correctly from `packages/ui`
- [ ] Web and desktop apps can be built independently
- [ ] No circular dependencies between packages

## Notes

- **Backward compatibility:** Web deployment (Node.js) remains unchanged user-facing; performance and features identical
- **Opt-in migration:** Desktop users can stay on Electron or try Tauri; both supported during transition
- **OpenCode dependency:** Both runtimes require `opencode serve` running; no change to this requirement
- **Scaling:** Monorepo structure supports adding more runtimes (Electron, mobile web) without major refactoring

## References

- OpenCode Server API: https://opencode.ai/docs/server/
- Tauri 2.x docs: https://v2.tauri.app/
- npm workspaces: https://docs.npmjs.com/cli/v10/using-npm/workspaces
