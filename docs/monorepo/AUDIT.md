# OpenChamber Monorepo Refactoring - Codebase Audit

## Executive Summary

Current architecture has **clear separation** between UI (React/TypeScript) and backend API calls (fetch-based). Electron coupling exists but is **isolated to desktop-specific concerns** (window control, directory access, settings persistence). The codebase is **well-positioned for monorepo refactoring** with minimal coupling to remove.

**Key Findings:**
1. All backend APIs use fetch() with consistent patterns
2. Settings file (JSON) is single source of truth for both web & desktop
3. OpenCode SDK is HTTP-based, platform-agnostic
4. Electron coupling concentrated in 2-3 specific areas (window chrome, settings, directory permissions)
5. Component-to-API relationships are clean and traceable

---

## 1. API Patterns & Integration Points

### 1.1 Current Architecture

```
UI Components (React/TypeScript)
    ↓ (import)
API Clients (terminalApi.ts, gitApi.ts, promptApi.ts, ...)
    ↓ (fetch)
Express Server (/api/* endpoints)
    ↓
Backend Services (node-pty, simple-git, OpenCode process)
```

### 1.2 API Implementations in `src/lib/`

#### A. Terminal API (`terminalApi.ts`)
- **Functions:** `createTerminalSession()`, `connectTerminalStream()`, `sendTerminalInput()`, `resizeTerminal()`, `closeTerminal()`
- **Endpoints:** 
  - POST `/api/terminal/create` → Create new terminal session
  - GET `/api/terminal/{sessionId}/stream` → SSE stream (with reconnection logic)
  - POST `/api/terminal/{sessionId}/input` → Send input to terminal
  - POST `/api/terminal/{sessionId}/resize` → Resize terminal
  - DELETE `/api/terminal/{sessionId}` → Close terminal
- **Consumers:** `TerminalTab.tsx` (right sidebar)
- **Implementation:** Event-based streaming with exponential backoff retry (up to 3 attempts)

#### B. Git API (`gitApi.ts`) - **52 exported functions**
- **Categories:**
  - Status/info: `getGitStatus()`, `checkIsGitRepository()`, `getGitLog()`, `getCurrentGitIdentity()`
  - Operations: `createGitCommit()`, `gitPush()`, `gitPull()`, `gitFetch()`, `createBranch()`, `checkoutBranch()`
  - Diff: `getGitDiff()`, `revertGitFile()`
  - Worktrees: `listGitWorktrees()`, `addGitWorktree()`, `removeGitWorktree()`, `isLinkedWorktree()`
  - Identities: `setGitIdentity()`, `ensureOpenChamberIgnored()`
  - Metadata: `getGitBranches()`, `deleteGitBranch()`, `deleteRemoteBranch()`, `generateCommitMessage()`
- **URL Pattern:** `buildUrl()` constructs `{API_BASE}/endpoint?directory={cwd}&...params`
  - Base: `/api/git`
  - Always includes `directory` query parameter (current working directory)
- **Consumers:** `GitTab.tsx`, `DiffTab.tsx` (right sidebar), `useGitIdentitiesStore`
- **Note:** Directory passed as query param, not in path → allows multi-repo support

#### C. Prompt Enhancement API (`promptApi.ts`)
- **Functions:** `fetchPromptEnhancerConfig()`, `persistPromptEnhancerConfig()`, `generatePromptEnhancement()`, `previewPromptEnhancement()`
- **Endpoints:**
  - GET/PUT `/api/config/prompt-enhancer` → Config CRUD
  - POST `/api/prompts/refine` → Generate enhanced prompt
  - POST `/api/prompts/refine/preview` → Preview system prompt + context
- **Consumers:** `PromptEnhancerPage.tsx`, `usePromptEnhancerConfig` store

#### D. OpenCode SDK (`src/lib/opencode/client.ts`)
- **Wrapper:** `OpencodeService` class wraps `@opencode-ai/sdk`
- **Base URL:** `VITE_OPENCODE_URL || "/api"` (relative by default)
- **Methods:** Session.*, Message.*, Agent.*, Provider.*, Config.*, Project.*, Path.*
- **SSE Streaming:** `sendMessage()` → AsyncGenerator with auto-retry (2 attempts, exponential backoff)
- **Directory Awareness:** `setOpenCodeWorkingDirectory()` → Updates OpenCode server's working directory
- **File Search:** `searchProjectFiles()` → Uses OpenCode SDK for codebase analysis
- **Key:** Already platform-agnostic, returns TypeScript interfaces

#### E. Settings/Configuration APIs
Several overlapping APIs handle settings:
1. **Desktop Settings** (`src/lib/desktop.ts`):
   - `getDesktopSettings()` → Calls `window.opencodeDesktopSettings.getSettings()`
   - `updateDesktopSettings()` → Calls `window.opencodeDesktopSettings.updateSettings()`
   - Types: `DesktopSettings` interface with theme, directory, security, markdown prefs

2. **Appearance Persistence** (`src/lib/appearancePersistence.ts`):
   - Desktop path: `window.opencodeAppearance.load/save()`
   - Web path: `localStorage.getItem('appearance-preferences')`
   - Subset of settings (markdown mode, reasoning traces)

3. **Configuration Store** (`server/index.js`):
   - GET `/api/config/settings` → Returns settings JSON from `~/.config/.openchamber/settings.json`
   - PUT `/api/config/settings` → Writes to same file
   - Used by `useConfigStore` (agents, commands, custom configs)

4. **Config Auto-Save** (`src/lib/appearanceAutoSave.ts`):
   - Watches state changes, syncs to settings endpoint
   - Different save paths: Desktop API vs `/api/config/settings`

---

## 2. Settings File Structure & Persistence

### 2.1 File Location
- **Path:** `~/.config/.openchamber/settings.json`
- **Environment Variable:** `OPENCHAMBER_DATA_DIR` (read by server)
- **Contains:** Theme, fonts, markdown display, reasoning traces, last directory, etc.

### 2.2 Current Persistence Pattern
```
Desktop App → Electron IPC → window.opencodeDesktopSettings → Electron main → File I/O
Web App → fetch → Express → File I/O
Both read/write same JSON file
```

### 2.3 Settings Schema (Inferred)
```typescript
{
  themeId?: string;
  useSystemTheme?: boolean;
  lightThemeId?: string;
  darkThemeId?: string;
  markdownDisplayMode?: 'compact' | 'comfort';
  showReasoningTraces?: boolean;
  lastDirectory?: string;
  homeDirectory?: string;
  pinnedDirectories?: string[];
  approvedDirectories?: string[];
  securityScopedBookmarks?: string[];
  [key: string]: unknown; // other configs
}
```

### 2.4 Key Insight: Dual Persistence Paths
- **Desktop:** `window.opencodeDesktopSettings.load/save()` → File I/O via Electron
- **Web:** POST/GET `/api/config/settings` → File I/O via Express
- **Both:** Read same JSON file, but via different mechanisms
- **Issue:** Code bifurcation in `appearancePersistence.ts` checks `isDesktopRuntime()` to pick path

---

## 3. Electron Coupling Analysis

### 3.1 Runtime Detection
- **Function:** `isDesktopRuntime()` in `src/lib/desktop.ts`
- **Check:** `typeof window.opencodeDesktop !== 'undefined'`
- **Usage:** Scattered throughout codebase to conditionally call Electron APIs

### 3.2 Electron-Specific APIs
Located in `src/lib/desktop.ts`, exposed via `window.opencodeDesktop`:

| API | Purpose | Used By | Abstractable? |
|-----|---------|---------|---|
| `getServerInfo()` | Fetch web/OpenCode ports | `useDesktopServerInfo` hook | Yes → Settings API |
| `restartOpenCode()` | Restart OpenCode process | Header, config reload | Yes → Settings API |
| `getSettings()` | Read desktop settings JSON | `appearancePersistence.ts` | Yes → Settings API |
| `updateSettings()` | Write desktop settings JSON | `appearanceAutoSave.ts` | Yes → Settings API |
| `requestDirectoryAccess()` | macOS sandbox permission | `useDirectoryStore` | Yes → Permissions API |
| `startAccessingDirectory()` | Begin securely accessing dir | `useDirectoryStore` | Yes → Permissions API |
| `stopAccessingDirectory()` | Stop accessing dir | Cleanup logic | Yes → Permissions API |
| `windowControl()` | Close/minimize/maximize window | `FixedSessionsButton` | Maybe (desktop-only) |
| `notifyAssistantCompletion()` | macOS notification | Completion callbacks | Yes → Notifications API |
| `homeDirectory` | Get user home path | `useDirectoryStore` | Yes → Settings API |

**6 out of 9** are settings/permissions abstractions disguised as Electron IPC. Only `windowControl()` is genuinely platform-specific.

### 3.3 Runtime Detection Usage
```bash
rg "isDesktopRuntime()" src/
# Results in:
# - appearancePersistence.ts (settings path selection)
# - appearanceAutoSave.ts (save path selection)
# - src/lib/desktop.ts (all desktop API calls)
# - Header.tsx (platform-specific padding for traffic lights)
# - potentially others in stores
```

### 3.4 Component Runtime-Specific Code
**Header.tsx (`FixedSessionsButton`):**
- Detects `window.opencodeDesktop` to show custom session button
- Checks macOS platform via `navigator.userAgent`
- Only renders on desktop macOS
- **Can be abstracted:** Component slot pattern (show/hide leading element)

---

## 4. OpenCode SDK Integration

### 4.1 Current Usage Pattern
```typescript
// src/lib/opencode/client.ts
const client = createOpencodeClient({ baseUrl });
// Calls HTTP endpoints via SDK
const sessions = await client.session.list();
const response = await client.message.create(...);
```

### 4.2 Key Insight: Already HTTP-Based
- SDK makes HTTP calls to `/api` (relative) or `VITE_OPENCODE_URL`
- **NOT** Electron-specific
- Works for both web and desktop (Tauri can also make HTTP calls)

### 4.3 Generated HTTP Client Alternative
- OpenCode serves OpenAPI 3.1 spec at `/doc`
- Could generate TypeScript client with `openapi-generator` or `orval`
- **Advantage:** Explicit HTTP calls, no SDK wrapper
- **Disadvantage:** Lose SDK types, maintain separate client

### 4.4 Recommendation: Keep SDK
- Switch web to use SDK (currently not explicitly shown, but likely via proxy)
- Desktop can also use SDK (just HTTP, no Electron dependency)
- Cleaner than switching to generated client

---

## 5. Component-to-API Mapping

### 5.1 Right Sidebar Components
| Component | API Calls | Responsibility |
|-----------|-----------|---|
| `TerminalTab.tsx` | Terminal API | Terminal session management, streaming |
| `GitTab.tsx` | Git API | Status, commit, identity mgmt |
| `DiffTab.tsx` | Git API (diff, status) | Diff view, revert |
| `PromptRefinerTab.tsx` | Prompt API | Enhance/preview prompts |

### 5.2 Stores
| Store | API Calls | Note |
|-------|-----------|------|
| `useDirectoryStore` | OpenCode SDK, Desktop API | Directory switching, home directory |
| `useSessionStore` | OpenCode SDK | Session CRUD |
| `useCommandsStore` | OpenCode SDK | Commands list |
| `useAgentsStore` | OpenCode SDK | Agents list |
| `useConfigStore` | `/api/config/*`, Desktop API | Configuration state |
| `useGitIdentitiesStore` | `/api/git/identities` | Git profile management |
| `usePromptEnhancerConfig` | Prompt API | Enhancer settings |

### 5.3 Patterns
- All API calls are **abstracted into library functions** (terminalApi, gitApi, etc.)
- No direct fetch() in components
- Stores orchestrate API calls and manage state
- **Good:** Easy to swap implementation without touching components

---

## 6. Express Server Endpoints (59 total)

### 6.1 Categories
| Category | Count | Purpose |
|----------|-------|---------|
| Terminal | ~6 | Terminal session mgmt + SSE streaming |
| Git | ~28 | Status, diff, commit, branches, worktrees, identities |
| Config | ~8 | Settings, agents, commands, prompt enhancer |
| Prompt Refinement | ~2 | Enhance + preview |
| Files | ~5 | Search, read, list, home dir |
| Auth | ~2 | Session status |
| Health | 1 | Liveness check |
| OpenCode Proxy | 1 | Forward to OpenCode server |
| Metadata | 1 | Models metadata |

### 6.2 Key Insight
- All `/api/*` endpoints are **self-contained in server/index.js**
- No separate router files
- Logic could be extracted to modules (e.g., `server/routes/git.js`)
- Clean input validation and error handling

---

## 7. Missing APIs vs. Existing

### 7.1 Not Yet Abstracted (Desktop-Specific Features)
1. **Window Control** (`windowControl()`)
   - Close/minimize/maximize
   - **Desktop-only concern**
   - Could stay platform-specific

2. **Directory Permissions** (macOS Sandbox)
   - `requestDirectoryAccess()`
   - `startAccessingDirectory()`
   - `stopAccessingDirectory()`
   - **Could be abstracted** as optional `PermissionsAPI`

3. **Notifications** (`notifyAssistantCompletion()`)
   - **Could be abstracted** as `NotificationsAPI` (web: nothing, desktop: native)

### 7.2 Implied Missing API: File Operations
- Current: OpenCode SDK `searchProjectFiles()` (codebase search)
- Server has file search: `POST /api/files/search`
- **Not exposed** in UI yet
- Could be abstracted as `FilesAPI` (but currently works via OpenCode SDK)

---

## 8. Settings Persistence Reality Check

### Current Flow (Desktop)
1. User changes markdown mode in Settings UI
2. `useUIStore.setMarkdownDisplayMode()` updates state
3. `appearanceAutoSave.ts` watches store, detects change
4. Calls `saveAppearancePreferences()`
5. → `window.opencodeAppearance.save(preferences)`
6. Electron IPC → Main process writes to `~/.config/.openchamber/settings.json`
7. Next restart loads from file

### Current Flow (Web)
1. User changes markdown mode
2. `useUIStore.setMarkdownDisplayMode()` updates state
3. `appearanceAutoSave.ts` watches store, detects change
4. Calls `saveAppearancePreferences()` (returns false for web)
5. → `localStorage.setItem()` (fallback)
6. Settings are never persisted to server's settings.json!

**Issue Found:** Web version doesn't persist appearance to server. Uses localStorage only.

---

## 9. Type Safety & Dependencies

### 9.1 API Implementations Are Already Typed
```typescript
// Example: TerminalAPI types
export interface TerminalSession { ... }
export interface TerminalStreamEvent { ... }
export interface CreateTerminalOptions { ... }
```

### 9.2 All Stores Use Zustand
- Consistent state management
- Middleware: devtools, persist
- **Can work for both web & desktop**

### 9.3 Tailwind + Theme System
- CSS variable generation from theme definitions
- Platform-agnostic
- Works everywhere

---

## 10. Current Assumptions vs. Reality

| Assumption | Reality | Impact |
|-----------|---------|--------|
| Web uses SDK | Unclear; likely uses `/api` proxy | No change needed |
| Settings bifurcated | Yes: Desktop IPC vs web localStorage | Must unify |
| Directory access is platform-agnostic | No: macOS sandbox permissions required | Optional API |
| Window control is universal | No: Desktop-only | Keep platform-specific |
| Electron coupling is pervasive | No: Isolated to 2-3 files | Easy to abstract |
| File search is unified | No: OpenCode SDK + server endpoint | Pick one strategy |

---

## 11. Phase 1 Refactoring Scope (Revised)

### APIs to Abstract (Unified Interface)
1. **SettingsAPI** - Unify desktop (IPC) + web (endpoint) persistence
2. **TerminalAPI** - Already exists, move to interface
3. **GitAPI** - Already exists, move to interface
4. **FilesAPI** - Extract from server endpoints
5. **PermissionsAPI** (optional) - Directory access + macOS sandbox
6. **NotificationsAPI** (optional) - Desktop notifications

### Components to Extract/Override
1. **Header.tsx** - Extract traffic light padding to slot
2. **TerminalTab.tsx** - Currently shares xterm.js (no override needed for Phase 1)

### Code to Remove
1. `isDesktopRuntime()` checks in components → replace with context
2. `window.opencodeDesktop` references → dependency injection
3. `appearancePersistence.ts` branching logic → unified SettingsAPI

---

## 12. Questions Requiring Product Input

1. **Settings persistence:** Should web version persist appearance to server (`/api/config/settings`), or keep localStorage-only for now?
2. **File search strategy:** Use OpenCode SDK or expose server endpoint?
3. **Directory permissions:** Implement PermissionsAPI abstraction, or keep as desktop-only in Phase 1?
4. **Notifications:** Worth abstracting, or skip for Phase 1?
5. **Window control:** Definitely skip (desktop-only), agreed?

