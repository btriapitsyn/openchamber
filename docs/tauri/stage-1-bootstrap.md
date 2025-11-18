# Stage 1 – macOS arm64 Bootstrap & Build Pipeline

**Objective:** ship a self-sufficient Tauri shell that bundles the built `@openchamber/ui` assets, serves every OpenChamber endpoint directly from Rust, and orchestrates the existing OpenCode CLI without spawning any Node/Express sidecars. This stage proves the desktop runtime can mirror the web app’s behavior while remaining entirely within `packages/desktop`.

## Reference Surface

- UI entry: `packages/desktop/src/main.tsx` (injects `RuntimeAPIs` into the browser window).
- Runtime stubs: `packages/desktop/src/api/*.ts` (currently throw `notImplemented`).
- Behavioral reference: Express handlers in `packages/web/server/index.js` and related UI HTTP clients (`packages/ui/src/lib/gitApi.ts`, `packages/ui/src/lib/terminalApi.ts`, etc.). Implementation must be native Rust but match these shapes/responses.
- Persisted config single-source-of-truth: `~/.config/openchamber/settings.json` (and sibling files such as `prompt-enhancer-config.json`).
- External dependency: the already-installed OpenCode CLI binary, which must be launched/stopped by the desktop scripts for dev/testing.
- Authentication constraint: the desktop runtime must **never** run a user authentication flow. Any auth-related UI or API calls should be short-circuited/no-ops so the desktop experience remains local-only.

## Work Breakdown

### 1. Workspace & Tooling Wiring

1. **Root script coverage** – Extend `/package.json` with:
   - `desktop:dev` → build/watch UI (`pnpm -C packages/ui dev`), start the OpenCode CLI (`pnpm desktop:start-cli`), then run `pnpm -C packages/desktop tauri dev`. When the Tauri process exits, run `pnpm desktop:stop-cli`.
   - `desktop:build` → `pnpm -C packages/ui build` followed by `pnpm -C packages/desktop tauri build`.
   - `desktop:lint` / `desktop:type-check` → run existing TS checks plus `cargo fmt -- --check` and `cargo clippy -- -D warnings` inside `packages/desktop/src-tauri`.
   - `desktop:start-cli` / `desktop:stop-cli` – wrapper scripts that respectively start and stop the OpenCode CLI (used both by dev scripts and `conductor-deploy.sh`).
2. **Local CLI availability** – Add `"tauri": "tauri"` to `packages/desktop/package.json` scripts so agents can call `pnpm tauri dev|build` without global installs. Document prerequisites (Rust stable, `tauri-cli`, Xcode CLT) near the top of this file.
3. **Workspace verification** – Confirm `pnpm-workspace.yaml` already includes `packages/desktop` and that no filters exclude it from `pnpm -r` commands.
4. **Conductor helpers** – Update `conductor-deploy.sh` to expose two manual actions:
   - **Start Desktop App:** runs `pnpm desktop:start-cli && pnpm desktop:dev`, shutting the CLI down after exit.
   - **Build Desktop App:** runs `pnpm desktop:build` so Bohdan can produce artifacts locally. No CI automation is required yet.

### 2. Tauri Configuration Files

1. **`tauri.conf.json`** – Create `packages/desktop/src-tauri/tauri.conf.json` with:
   - `package.productName = "OpenChamber"`, `identifier = "ai.opencode.openchamber"`.
   - `build.devPath` resolving to the UI dev server started by Stage 1 scripts. The Rust process must probe for a free port on each launch (use `portpicker`).
   - `build.distDir = "../dist"` (relative path to `packages/ui/dist`).
   - `tauri.bundle.mac.targets = ["app"]`, `targetArch = ["aarch64"]`.
   - Core plugins enabled (`shell`, `dialog`, `fs`, `notification`, `http` if using `tauri-plugin-http`).
2. **`Cargo.toml` alignment** – Update `packages/desktop/src-tauri/Cargo.toml`:
   - `package.name = "openchamber-desktop"`, `version` mirrors `@openchamber/desktop`.
   - Dependencies: `tauri = { version = "^2", features = ["macos-private-api", "shell-open", "notification"] }`, `tauri-plugin-http`, `axum`, `serde`, `serde_json`, `tokio` (`rt-multi-thread`, `macros`), `portpicker`.
   - `[build-dependencies] tauri-build = { version = "^2" }`.

### 3. Rust Entrypoint & Embedded HTTP Layer

1. **Window creation** – Replace `src-tauri/src/main.rs` with the canonical builder that spawns a single window labeled `main`, loads either the dev server or static bundle via `tauri::generate_context!`, and registers a `version` command.
2. **Embedded HTTP endpoints** – Within the `setup` hook, start an Axum (or similar) server bound to `127.0.0.1:<dynamic_port>` that exposes the same REST routes the UI expects (`/api/config/settings`, `/api/git/*`, `/api/fs/*`, etc.). For Stage 1 only the routes required to load the UI shell need to function; Stage 2 fills in the remaining runtime endpoints.
3. **Dynamic port selection** – Use `portpicker::pick_unused_port()` to allocate a port on each launch, inject it into the renderer via window state (`window.emit("desktop:server-info", { port })`).
4. **Settings reuse** – The HTTP handlers read/write `~/.config/openchamber/settings.json`. Set `OPENCHAMBER_DATA_DIR` accordingly before starting Axum.
5. **OpenCode CLI lifecycle** – During `desktop:dev`, launch the existing CLI (path configurable via env, defaulting to `/usr/local/bin/opencode`). Monitor the process and shut it down when Tauri exits.

### 4. Frontend Bridge & Runtime Registration

1. **Runtime detection** – Keep `packages/desktop/src/main.tsx` as the entry that attaches `RuntimeAPIs` and imports `@openchamber/ui/main`.
2. **Temporary HTTP-backed APIs** – Update `packages/desktop/src/api/*.ts` to call the embedded Rust endpoints (same URLs as the web runtime) so no `packages/web` code is imported. These adapters remain until Stage 2 swaps them for direct IPC.
3. **Runtime descriptor** – `createDesktopAPIs` should set `runtime: { platform: 'desktop', isDesktop: true, label: 'tauri-bootstrap' }`.

### 5. Validation Workflow

1. **Monorepo commands** – Ensure `pnpm -r type-check`, `pnpm -r lint`, and `pnpm -r build` invoke the new desktop scripts without extra flags.
2. **Manual smoke checklist** –
   - `pnpm desktop:dev` starts the OpenCode CLI, bootstraps the embedded HTTP server, and opens a Tauri window that functions without any Node processes.
   - `pnpm desktop:build` produces `src-tauri/target/aarch64-apple-darwin/release/OpenChamber.app` that serves the static UI bundle and HTTP endpoints entirely from Rust.
   - Editing appearance settings updates `~/.config/openchamber/settings.json` exactly like the web runtime.
3. **Artifact retention** – `.gitignore` should continue excluding `src-tauri/target/**` and generated UI dist assets.

## Acceptance Criteria

- Tauri dev & build commands run end-to-end on macOS arm64 using only repo scripts and the external OpenCode CLI.
- Desktop shell serves the UI and all HTTP endpoints without launching `packages/web` or any Node processes.
- `~/.config/openchamber/settings.json` remains the sole config file touched.
- Root validation commands remain green.

All prior open questions have been resolved with Bohdan; this doc is authoritative for Stage 1.
