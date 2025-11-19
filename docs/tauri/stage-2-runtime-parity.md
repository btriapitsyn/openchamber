# Stage 2 – Native Runtime API Parity

**Objective:** eliminate the temporary HTTP fallbacks introduced in Stage 1 and expose first-class native Rust implementations for every runtime capability expected by `@openchamber/ui`—including prompt-enhancer/config endpoints—without launching any Node processes. The desktop app must keep behavior identical to the web runtime (`packages/web/server/index.js`) while operating offline.

## Global Requirements

1. **Contract fidelity** – Every Tauri command must serialize responses exactly like the Express handlers defined in `packages/web/server/index.js` so the UI stores (git/session/terminal) continue to work without modifications.
2. **Settings single source** – Continue reading and writing `~/.config/openchamber/settings.json` (and `prompt-enhancer-config.json`) through the same shapes defined in `packages/ui/src/lib/desktop.ts` and `packages/ui/src/lib/api/types.ts`.
3. **Error parity** – Match the error messages and HTTP status codes currently surfaced by the web API. When moving to IPC, emit the same `.message` strings so existing toast/sonner handlers display consistent copy.
4. **Security** – Desktop-only commands must never operate outside the approved workspace root. Reuse `DirectoryStore` heuristics (e.g., last directory, pinned directories) before touching the filesystem.
5. **Rust-only services** – All previously Express-based endpoints (prompt enhancer, config reload, etc.) now live in Rust; no Node or `packages/web` code is invoked at runtime.
6. **No auth flow** – Desktop builds must not prompt for, store, or exchange authentication credentials. Any auth-aware UI hooks should continue short-circuiting to local behavior just as they did in Stage 1.

## Command Bus Layout

- Create `packages/desktop/src-tauri/src/commands/mod.rs` containing submodules (`terminal.rs`, `git.rs`, `files.rs`, `settings.rs`, `permissions.rs`, `notifications.rs`).
- Each module exposes the Tauri command functions annotated with `#[tauri::command]`. Shared structs should derive `Serialize`/`Deserialize` to stay shape-compatible with TypeScript counterparts.
- Register all commands inside `tauri::Builder::default().invoke_handler(tauri::generate_handler![...])`.

## Subsystem Work Items

### 1. Filesystem (`RuntimeAPIs.files`) ✅ COMPLETE

**Mirrors:** `/api/fs/list` and `/api/fs/search` inside `server/index.js`.

1. ✅ Implemented `list_directory(path: &str)` in Rust using `std::fs::read_dir` (or `walkdir`). Return `{ directory, entries: FileListEntry[] }` with the same fields (name, path, isDirectory, size, modifiedTime).
2. ✅ Implemented fuzzy search by shelling out to `rg --files` + `rg <query>` similar to the Node implementation (check how `server/index.js` handles search today). For macOS, depend on `ignore` crate or call `rg` via `Command` to reuse developer tooling.
3. ✅ Enforce sandbox: resolve input paths against the approved workspace root kept in `settings.lastDirectory` or the `DirectoryStore` value cached in the renderer. Reject any path that escapes via `..` traversal.
4. ✅ Update `packages/desktop/src/api/files.ts` to call `invoke('list_directory', ...)` / `invoke('search_files', ...)` and remove any HTTP fallbacks.

### 2. Git (`RuntimeAPIs.git`) ✅ COMPLETE

**Mirrors:** the entire `/api/git/*` surface in `server/index.js` plus helper functions in `packages/ui/src/lib/gitApi.ts`.

1. ✅ Reuse the Git CLI for parity. Created a utility in Rust that runs `git` with env vars `GIT_OPTIONAL_LOCKS=0`, `LC_ALL=C`, and the same cwd as the web server.
2. ✅ Implemented commands for:
   - `check_is_git_repository`, `status`, `diff`, `revert`, `branches`, `branch_delete`, `branch_delete_remote`.
   - Worktree management (`git worktree list/add/remove`).
   - Commit/pull/push/fetch (including streaming progress events for long operations via `tauri::Window::emit`).
   - Identity helpers: reuse the logic currently in `server/index.js` that reads `~/.config/openchamber/git-identities.json` (confirm path there) and set user.name/email via `git config`.
3. ✅ Serialize responses with the same shapes defined in `packages/ui/src/lib/api/types.ts` (e.g., `GitStatus`, `GitBranch`, `GitLogResponse`).
4. ✅ Replace the notImplemented stubs in `packages/desktop/src/api/git.ts` with thin wrappers that call `invoke` and convert errors to `Error` objects so UI toasts stay consistent.

**Implementation Details:**
- Implemented all commands in `commands/git.rs`.
- Replicated `git status` parsing logic including `numstat` aggregation for diff stats.
- Replicated `git log` parsing logic with stats.
- Implemented AI commit message generation via `reqwest` proxy to `opencode.ai`.
- Implemented identity storage using `~/.config/openchamber/git-identities.json`.
- Updated `desktop/src/api/git.ts` to bridge all calls.

### 3. Terminal (`RuntimeAPIs.terminal`)

**Mirrors:** `/api/terminal/*` SSE handlers that currently rely on `node-pty` via `packages/ui/src/lib/terminalApi.ts`.

1. Add a Rust PTY implementation using `portable-pty` or `tokio::process::Command` + `libc` pty APIs (macOS arm64 is fully supported). Each session should map to a handle stored in a `tokio::sync::Mutex<HashMap<SessionId, PtyProcess>>`.
2. Commands:
   - `create_terminal_session(payload)` → allocate PTY, return `{ sessionId, cols, rows }`.
   - `connect_terminal_stream(session_id)` → spawn a background task that reads from the PTY and emits `terminal://<sessionId>` events carrying `{ type: 'data', data }`.
   - `send_terminal_input`, `resize_terminal`, `close_terminal` – all map to the same semantics as the REST endpoints.
3. Auto-reconnect behavior: when macOS sleeps or the window loses connection, spawn a replacement PTY and emit `type: 'reconnecting'` / `type: 'connected'` events exactly like the web SSE implementation so the UI terminal resumes seamlessly.
4. Update the renderer’s `createDesktopTerminalAPI()` to subscribe to Tauri events using `const unlisten = await listen<TerminalStreamEvent>(...)` and implement `Subscription.close()` by calling the event unlistener plus the IPC close command.

### 4. Settings & Config Sync (`RuntimeAPIs.settings`) ✅ COMPLETE

**Mirrors:** `/api/config/settings` handlers in `server/index.js` and UI helpers in `packages/ui/src/lib/desktop.ts`.

1. ✅ Implemented Rust helpers with exact sanitization parity as Express: `sanitizeSettingsUpdate`, `mergePersistedSettings`, `formatSettingsResponse`
2. ✅ Exposed commands:
   - `load_settings` → returns `{ settings, source: 'desktop' }`.
   - `save_settings(changes)` → merges with existing JSON, writes to disk, returns new object.
   - `restart_opencode` → replicates `/api/config/reload` behavior.
3. ✅ Updated renderer: `main.tsx` uses `invoke()` instead of fetch, proper TypeScript types, UI now uses desktop source automatically.

**Validation:** All commands use `~/.config/openchamber/settings.json`, exact web runtime behavior, pass lint/build/type-check.

### 5. Permissions & Directory Access (`RuntimeAPIs.permissions`) ✅ COMPLETE

**Mirrors:** browser prompts handled today via the web runtime + manual dialogs.

#### macOS Native Directory Picker with Security-Scoped Bookmark Persistence & OpenCode Restart Integration

1. ✅ **Implemented production-ready native directory picker:**
   - Frontend uses `@tauri-apps/plugin-dialog` native macOS picker with `directory: true` option
   - No UI forms - uses actual macOS Finder dialog for directory selection
   - Proper async/await integration with user interaction

2. ✅ **Complete Rust bookmark and settings system:**
   - `create_bookmark()` - Creates persistent bookmarks with hash identifiers
   - `process_directory_selection()` - Handles frontend selection, creates bookmark, updates settings, **and triggers OpenCode restart**
   - `restore_bookmarks_on_startup()` - Automatically restores all bookmarks on app start
   - Bookmarks stored in `settings.securityScopedBookmarks` with timestamps

3. ✅ **Production workflow integration:**
   - Frontend opens native macOS dialog → user selects directory → frontend calls `process_directory_selection`
   - Automatic `lastDirectory` persistence to settings
   - **OpenCode CLI restarts with new working directory** (via `OpenCodeManager.set_working_directory()` + `restart()`)
   - `restore_bookmarks_on_startup` called during app initialization
   - Full error handling and cancellation support

4. ✅ **DirectoryStore integration:**
   - `requestDirectoryAccess()` triggers native picker and processes result
   - **Calls `setDirectory()` after successful selection to trigger UI updates and session refresh**
   - Seamless integration with existing `useDirectoryStore` state management
   - Settings automatically updated when directory selected

5. ✅ **HTTP endpoint parity with web runtime:**
   - **`POST /api/opencode/directory`** endpoint implemented in Rust (mirrors `packages/web/server/index.js`)
   - Updates `OpenCodeManager.working_dir` and restarts OpenCode process
   - Response format: `{ success: true, restarted: boolean, path: string }`
   - Validates directory exists and is accessible before restart

**Production Implementation Details:**
- **Frontend:** Uses `open({ directory: true, title: 'Select Working Directory' })` native dialog
- **Backend:** Handles bookmark creation, settings updates, OpenCode restart coordination
- **Settings:** `~/.config/openchamber/settings.json` with `securityScopedBookmarks` array
- **Startup:** Automatic bookmark restoration without user prompts
- **OpenCode integration:** `OpenCodeManager` now has mutable `working_dir: Arc<RwLock<PathBuf>>` with `set_working_directory()` and `get_working_directory()` methods
- **No placeholders** - This is the real working implementation

**Files Modified:**
- `packages/desktop/src-tauri/src/commands/permissions.rs` - Full bookmark, directory processing, and OpenCode restart integration
- `packages/desktop/src-tauri/src/opencode_manager.rs` - Added mutable working_dir with getter/setter methods
- `packages/desktop/src-tauri/src/main.rs` - Added `/api/opencode/directory` POST endpoint handler, registered new commands, exposed `opencode()` accessor
- `packages/desktop/src/main.tsx` - Native dialog integration with proper error handling
- `packages/ui/src/components/session/SessionSidebar.tsx` - Calls `setDirectory()` after successful selection to trigger full restart workflow
- `packages/ui/src/lib/opencode/client.ts` - Fixed `listSessions()` to use `Array.isArray()` check (prevents `sessions.forEach is not a function` error)

**Validation:** Complete build success, all lint/type-check passes, native macOS directory picker functional, OpenCode CLI restart verified.

### 5.1. HTTP Proxy to OpenCode ✅ COMPLETE

**CRITICAL: MIRROR THE WEB SERVER PROXY BEHAVIOR EXACTLY. DO NOT INVENT NEW LOGIC.**

**Mirrors:** `packages/web/server/index.js` proxy middleware behavior.

The desktop HTTP server proxies OpenCode API requests exactly like the web server:

1. ✅ **Custom OpenChamber endpoints** handled directly in Rust BEFORE proxy:
   - `/api/opencode/directory` - Directory change and OpenCode restart
   - Future: `/api/config/*`, `/api/git/*`, `/api/terminal/*`, etc. will be Rust commands

2. ✅ **OpenCode API proxy** - All other `/api/*` requests forwarded to OpenCode CLI:
   - **Path rewriting:** Strip `/api` prefix before forwarding to OpenCode
   - Example: `/api/session` → `http://127.0.0.1:{opencode_port}/session`
   - Example: `/api/agent` → `http://127.0.0.1:{opencode_port}/agent`
   - **NO API PREFIX DETECTION** - OpenCode runs without `/api` prefix, always strip it
   - Returns 503 Service Unavailable when OpenCode is not running
   - Returns 502 Bad Gateway when OpenCode connection fails

3. ✅ **Health endpoint:**
   - `/health` returns `{ status: "ok", isOpenCodeReady: bool, ... }`
   - Frontend checks `isOpenCodeReady` to determine if OpenCode is available
   - Health URL resolution: `baseUrl.endsWith('/api')` → strip `/api` → add `/health`

**Implementation:**
- `packages/desktop/src-tauri/src/main.rs` - Axum router with custom routes before catch-all proxy
- `packages/desktop/src-tauri/src/opencode_manager.rs` - Simple `rewrite_path()` strips `/api` prefix
- `packages/ui/src/lib/opencode/client.ts` - Health check handles desktop baseUrl format

**RULE FOR FUTURE AGENTS: THE WEB SERVER IN `packages/web/server/index.js` IS THE SOURCE OF TRUTH. WHEN IMPLEMENTING ANY PROXY OR API BEHAVIOR, READ THE WEB SERVER CODE FIRST AND MIRROR IT EXACTLY. DO NOT ASSUME, DO NOT INVENT, DO NOT DETECT PREFIXES THAT DON'T EXIST. JUST COPY THE WEB BEHAVIOR.**

**Validation:** Sessions load, agents load, all OpenCode SDK calls work, no 404s, proxy logs show correct path rewrites.

### 5.2. Window Customization & Dragging ✅ COMPLETE

**macOS window appearance with traffic lights overlay and custom drag regions.**

1. ✅ **Window configuration:**
   - `titleBarStyle: "Overlay"` - Traffic lights overlay on content
   - `hiddenTitle: true` - Hide title text
   - `decorations: true` - Keep native rounded corners
   - `trafficLightPosition: { x: 17, y: 26 }` - Aligned with UI

2. ✅ **Manual window dragging (required for Overlay mode):**
   - `data-tauri-drag-region` doesn't work with Overlay mode - needs manual API
   - Added `core:window:allow-start-dragging` permission
   - Implemented `handleDragStart` in Header and Sidebar using `getCurrentWindow().startDragging()`
   - Dynamic import of `@tauri-apps/api/window` to avoid bundling in web builds
   - Blocks dragging on interactive elements (buttons, inputs)

**Files Modified:**
- `packages/desktop/src-tauri/tauri.conf.json` - Window appearance config
- `packages/desktop/src-tauri/capabilities/default.json` - Added start-dragging permission
- `packages/ui/package.json` - Added `@tauri-apps/api` devDependency
- `packages/ui/src/components/layout/Header.tsx` - Manual drag handler for desktop header
- `packages/ui/src/components/layout/Sidebar.tsx` - Manual drag handler for titlebar spacer

**Validation:** Header dragging works, sidebar top-40px area dragging works, traffic lights positioned correctly.

### 6. Notifications (`RuntimeAPIs.notifications`)

**Mirrors:** currently web toasts; desktop must use the OS layer.

1. Add `tauri-plugin-notification` (or the core `notification` feature) and request permission on app start.
2. Implement command `notify_agent_completion(payload)` that shows a macOS notification using the title/body passed from the UI. Respect the `showReasoningTraces` flag if the UI decides to include extra content.

### 7. Runtime Metadata & Diagnostics

1. Populate `runtime.worktrees` by sharing the worktree cache created in the git module (optional but keeps parity with the web header chips).
2. Emit structured logs from each Tauri command (target `info` level) so troubleshooting mirrors the Express logs developers are used to.

## Acceptance Criteria

- Desktop build runs without the embedded Node server; unplugging network access no longer breaks git/terminal/files/settings flows.
- All runtime calls invoked via DevTools (`window.__OPENCHAMBER_RUNTIME_APIS__`) resolve using Tauri IPC; no HTTP requests hit `/api/*`.
- Editing appearance settings in the desktop app updates `~/.config/openchamber/settings.json` with the same schema as the web runtime.
- Terminal streaming (including auto-reconnect after sleep), git status/diff/commit, filesystem browsing, permission prompts, notifications, and prompt-enhancer flows all behave exactly like the web version (matching UI toasts and store updates).

All implementation decisions for this stage have been confirmed with Bohdan (native Rust for every subsystem, prompt-enhancer parity, auto-reconnect terminal behavior, no Node helpers). This document is authoritative for Stage 2.
