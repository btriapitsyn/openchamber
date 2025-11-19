# OpenChamber Tauri Desktop Plan (macOS arm64)

## Context & Goals

- Replace the deprecated Electron build with a first-class Tauri desktop app that reuses the existing `@openchamber/ui` bundle and runtime contracts.
- macOS arm64 is the only supported target for Phase 1; no Windows/Linux paths are required yet.
- Maintain parity with the web runtime by exposing the same runtime APIs (`terminal`, `git`, `files`, `settings`, `permissions`, `notifications`).
- Keep all work inside `packages/desktop` and ensure pnpm scripts integrate with the root validation pipeline (`pnpm -r type-check`, `pnpm -r lint`, `pnpm -r build`).
- Continue using the existing configuration location (`~/.config/openchamber/settings.json` and sibling files) so the desktop build never forks its own config schema.
- The desktop runtime is strictly local/offline: it must **not** run any user authentication flow.

## Detailed Stage Specs

- [Stage 1 – Bootstrap & Build Pipeline](./stage-1-bootstrap.md)
- [Stage 2 – Native Runtime API Parity](./stage-2-runtime-parity.md)
- [Stage 3 – Platform Polish & Ops Readiness](./stage-3-polish.md)

---

## Status Summary

- **Stage 1** – Complete. `pnpm desktop:dev` and `pnpm desktop:build` now run without Node helpers and settings persist to `~/.config/openchamber`. (Refer to `stage-1-bootstrap.md` for the original checklist.)
- **Stage 2** – Partially done. Native files/git/terminal commands exist, but the Git push/commit metadata, terminal reconnect events, and prompt-enhancer config commands still lag the web runtime (see `stage-2-runtime-parity.md` for the current status notes).
- **Stage 3** – Not started. Auto-update, keychain migration, packaging scripts, structured logs, and automated QA are still open items (covered in `stage-3-polish.md`).

## Stage 1 – Bootstrap & Build Pipeline

Objective: build a self-sufficient Tauri shell (no Node sidecar) that serves the packaged `@openchamber/ui` bundle, hosts minimal HTTP endpoints in Rust, and orchestrates the external OpenCode CLI. See `docs/tauri/stage-1-bootstrap.md` for the authoritative checklist.

Key workstreams:

1. **Workspace/tooling wiring** – add `desktop:*` scripts (dev/build/lint/type-check/start-cli/stop-cli) in the root package, wire them into `pnpm -r` commands, and document prerequisites. `conductor-deploy.sh` gains “Start Desktop App” and “Build Desktop App” actions that wrap these scripts.
2. **Tauri config & Cargo setup** – create `src-tauri/tauri.conf.json`, align `Cargo.toml`, enable required plugins (fs, dialog, notification, http), and constrain builds to macOS arm64.
3. **Rust entrypoint + embedded HTTP layer** – implement `tauri::Builder` startup that dynamically selects an available port, launches the lightweight Axum (or equivalent) server exposing the initial `/api/*` routes, and starts/stops the OpenCode CLI for dev sessions.
4. **Frontend bridge** – point `packages/desktop/src/api/*.ts` to the embedded HTTP endpoints so the UI can boot without native IPC while keeping `runtime.platform === 'desktop'`.
5. **Validation** – ensure `pnpm -r type-check|lint|build` succeed, verify `.app` output launches, and confirm settings edits update `~/.config/openchamber/settings.json`.

Deliverable: `pnpm desktop:dev` boots the CLI + Tauri app with the UI fully loading from the embedded Rust server; `pnpm desktop:build` emits a standalone `.app` bundle.

---

## Stage 2 – Native Runtime API Parity

Objective: replace every Stage 1 HTTP proxy with native Rust commands + IPC listeners so the desktop runtime can operate offline while matching the web server’s behavior byte-for-byte. See `docs/tauri/stage-2-runtime-parity.md` for detailed tasks.

Highlights:

1. **IPC contract** – mirror the `RuntimeAPIs` types and register Tauri commands per namespace (`terminal`, `git`, `files`, `settings`, `permissions`, `notifications`, prompt enhancer).
2. **Filesystem/Git/Terminal** – implement Rust versions of `/api/fs/*`, `/api/git/*`, `/api/terminal/*` using safe path resolution, the system `git` CLI, and PTY management with auto-reconnect after macOS sleep.
3. **Settings & permissions** – keep writing to `~/.config/openchamber/settings.json`, surface directory approvals via Tauri dialogs, and push results to the UI stores immediately.
4. **Notifications & diagnostics** – drive macOS Notification Center directly and emit structured logs for parity with the Express diagnostics.

Deliverable: when Stage 2 completes, DevTools shows all runtime calls resolved through `tauri.invoke`, unplugging the network does not break git/terminal/files/settings, and prompt-enhancer requests are fully satisfied by Rust endpoints.

---

## Stage 3 – Platform Polish & Packaging

Objective: harden the desktop runtime for day-to-day use: durable storage, signed binaries, auto-update plumbing (manual channel publishing), and deterministic QA. See `docs/tauri/stage-3-polish.md`.

Focus areas:

1. **Auto-update + release channels** – publish both `.dmg` and zipped `.app` artifacts to Bohdan’s manual storage, expose `stable`/`canary` feeds, and integrate Tauri’s updater with the existing Config overlay.
2. **Secure storage** – migrate secrets into macOS Keychain via new Tauri commands, recording migrations in `settings.migrations`.
3. **Packaging/codesign** – add signing placeholders, create `desktop:dist:dev` and `desktop:dist:release` scripts, and document the manual Apple credentials required during `conductor-deploy.sh` runs.
4. **QA & observability** – add Playwright + `tauri-driver` smoke tests, log collection hooks, and a manual release checklist (cold start, git flows, terminal resume, permissions, notifications) gating artifact publication.

Deliverable: signed/notarized `.dmg` + zipped `.app` artifacts with accompanying validation evidence, ready for manual distribution. No CI automation is needed yet.

---

## Next Steps

1. Assign agents to Stage 1 tasks in order (1.1 → 1.5) until the desktop shell builds/launches successfully.
2. Once Stage 1 is green, begin Stage 2 in parallel streams (Files/Git/Terminal) because their implementations are isolated, referencing `docs/tauri/stage-2-runtime-parity.md` for exact instructions.
3. Reserve Stage 3 work for the final polish pass before public release; see `docs/tauri/stage-3-polish.md` for packaging checklist.
