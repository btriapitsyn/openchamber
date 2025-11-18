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

### 1. Filesystem (`RuntimeAPIs.files`)

**Mirrors:** `/api/fs/list` and `/api/fs/search` inside `server/index.js`.

1. Implement `list_directory(path: &str)` in Rust using `std::fs::read_dir` (or `walkdir`). Return `{ directory, entries: FileListEntry[] }` with the same fields (name, path, isDirectory, size, modifiedTime).
2. Implement fuzzy search by shelling out to `rg --files` + `rg <query>` similar to the Node implementation (check how `server/index.js` handles search today). For macOS, depend on `ignore` crate or call `rg` via `Command` to reuse developer tooling.
3. Enforce sandbox: resolve input paths against the approved workspace root kept in `settings.lastDirectory` or the `DirectoryStore` value cached in the renderer. Reject any path that escapes via `..` traversal.
4. Update `packages/desktop/src/api/files.ts` to call `invoke('list_directory', ...)` / `invoke('search_files', ...)` and remove any HTTP fallbacks.

### 2. Git (`RuntimeAPIs.git`)

**Mirrors:** the entire `/api/git/*` surface in `server/index.js` plus helper functions in `packages/ui/src/lib/gitApi.ts`.

1. Reuse the Git CLI for parity. Create a utility in Rust that runs `git` with env vars `GIT_OPTIONAL_LOCKS=0`, `LC_ALL=C`, and the same cwd as the web server.
2. Implement commands for:
   - `check_is_git_repository`, `status`, `diff`, `revert`, `branches`, `branch_delete`, `branch_delete_remote`.
   - Worktree management (`git worktree list/add/remove`).
   - Commit/pull/push/fetch (including streaming progress events for long operations via `tauri::Window::emit`).
   - Identity helpers: reuse the logic currently in `server/index.js` that reads `~/.config/openchamber/git-identities.json` (confirm path there) and set user.name/email via `git config`.
3. Serialize responses with the same shapes defined in `packages/ui/src/lib/api/types.ts` (e.g., `GitStatus`, `GitBranch`, `GitLogResponse`).
4. Replace the notImplemented stubs in `packages/desktop/src/api/git.ts` with thin wrappers that call `invoke` and convert errors to `Error` objects so UI toasts stay consistent.

### 3. Terminal (`RuntimeAPIs.terminal`)

**Mirrors:** `/api/terminal/*` SSE handlers that currently rely on `node-pty` via `packages/ui/src/lib/terminalApi.ts`.

1. Add a Rust PTY implementation using `portable-pty` or `tokio::process::Command` + `libc` pty APIs (macOS arm64 is fully supported). Each session should map to a handle stored in a `tokio::sync::Mutex<HashMap<SessionId, PtyProcess>>`.
2. Commands:
   - `create_terminal_session(payload)` → allocate PTY, return `{ sessionId, cols, rows }`.
   - `connect_terminal_stream(session_id)` → spawn a background task that reads from the PTY and emits `terminal://<sessionId>` events carrying `{ type: 'data', data }`.
   - `send_terminal_input`, `resize_terminal`, `close_terminal` – all map to the same semantics as the REST endpoints.
3. Auto-reconnect behavior: when macOS sleeps or the window loses connection, spawn a replacement PTY and emit `type: 'reconnecting'` / `type: 'connected'` events exactly like the web SSE implementation so the UI terminal resumes seamlessly.
4. Update the renderer’s `createDesktopTerminalAPI()` to subscribe to Tauri events using `const unlisten = await listen<TerminalStreamEvent>(...)` and implement `Subscription.close()` by calling the event unlistener plus the IPC close command.

### 4. Settings & Config Sync (`RuntimeAPIs.settings`)

**Mirrors:** `/api/config/settings` handlers in `server/index.js` and UI helpers in `packages/ui/src/lib/desktop.ts`.

1. Implement Rust helpers that perform the same sanitization as `readSettingsFromDisk` / `writeSettingsToDisk` (see lines ~720+ in the server). Consider porting the sanitization logic to a shared TypeScript module imported by both runtimes to avoid drift.
2. Expose commands:
   - `load_settings` → returns `{ settings, source: 'desktop' }`.
   - `save_settings(changes)` → merges with the existing JSON, writes to disk, returns the new object.
   - `restart_opencode` (optional) → replicates `/api/config/reload` by relaunching the child OpenCode process if/when the desktop ships a bundled agent.
3. Ensure the renderer’s `createDesktopSettingsAPI()` updates `window.__OPENCHAMBER_RUNTIME_APIS__.settings` so the UI automatically prefers the desktop source.

### 5. Permissions (`RuntimeAPIs.permissions`)

**Mirrors:** browser prompts handled today via the web runtime + manual dialogs.

1. Use `tauri::api::dialog::FileDialogBuilder` to implement:
   - `request_directory_access({ path? })` – when `path` is missing, open a folder picker; store results inside `settings.approvedDirectories` so the UI can highlight them.
   - `start_accessing_directory` / `stop_accessing_directory` – on macOS, translate to security-scoped bookmark handling if/when needed; for Phase 2, maintain an in-memory allowlist and return `{ success: true }` to mirror Node’s optimistic behavior.
2. Emit permission outcomes back to the UI so `DirectoryStore` can refresh `approvedDirectories` immediately.

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
