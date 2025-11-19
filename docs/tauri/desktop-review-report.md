# Desktop Tauri Review Report

## Overview

This report captures the gaps between the Stage‑2/Stage‑3 plans and the current repository implementation. I reviewed the files under `packages/desktop` and verified all runtime bridges used by `@openchamber/ui`. The desktop shell is runnable, but a few critical parity points remain before we can consider the runtime production ready.

## Key Gaps

1. **Prompt-enhancer config is still handled by the OpenCode HTTP proxy.**  
   The embedded Axum router only registers `/health` and `/api/opencode/directory` before proxying every other `/api/*` call (see `packages/desktop/src-tauri/src/main.rs#L263-L345`). There are no Tauri commands for `GET/PUT /api/config/prompt-enhancer`, which means the UI keeps talking directly to the CLI instead of the Rust endpoint described in Stage 2.

2. **Git push / pull / commit results are placeholders.**  
   `create_git_commit`, `git_push`, and `git_pull` (`packages/desktop/src-tauri/src/commands/git.rs#L726-L814`) call the git CLI but return fixed commit hashes/summary values (`"HEAD"`, zeros) and omit the granular push metadata that the web runtime surfaces. Push/pull also block until completion with no streaming or progress events, so toast/progress states cannot be mirrored.

3. **Terminal stream lacks reconnect/exit signals.**  
   The backend only emits `{ type: 'data' }` through `window.emit` (`packages/desktop/src-tauri/src/commands/terminal.rs#L44-L190`), and the renderer listens to those events via `packages/desktop/src/api/terminal.ts#L11-L93`. There is no mechanism to emit `'exit'` or `'reconnecting'`, so the UI cannot show reconnection banners or recover automatically after macOS sleep.

4. **Structured logging & diagnostics are absent.**  
   Most Rust modules log via `println!`/`eprintln!` (see `main.rs`, `opencode_manager.rs` and other command files), and there is no `~/Library/Logs/OpenChamber/desktop.log` sink or UI hook to download logs. The stage goal to mirror the Express log structure is not yet satisfied.

5. **Stage 3 polish items are still untouched.**  
   `packages/desktop/src-tauri/tauri.conf.json` has no `updater` block, and `Cargo.toml` does not reference `tauri-plugin-updater`/`tauri-plugin-os-api` or any secure storage bridge. The root `package.json` exposes only `desktop:dev`, `desktop:build`, `desktop:lint`, and `desktop:type-check` (`package.json#L23-L47`), so there are no `desktop:dist:*` scripts, no packaging upload flow, and no documentation for signing/notarization. There is also no `packages/desktop-tests` harness or Playwright configuration yet.

## Recommendations

1. Implement native Tauri commands for prompt-enhancer config (matching `packages/web/server/index.js`) so the UI no longer proxies to the OpenCode CLI.  
2. Parse git push/pull/commit outputs to provide real hashes/stats and emit streaming progress events for long-running operations.  
3. Extend the terminal emitter to send `'exit'` and `'reconnecting'` events (reusing the `TerminalStreamEvent` shape) so the UI can respond to sleep/resume.  
4. Introduce structured logging (`log::info`, `log::error`) and persist logs to `~/Library/Logs/OpenChamber/desktop.log`, then wire a download button in the diagnostics drawer.  
5. Prioritize Stage 3 blockers: add an updater manifest + config, keychain-backed secret commands, `desktop:dist:*` scripts, and a Playwright/tauri-driver QA suite before publishing the first release.
