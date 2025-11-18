# Stage 3 – Platform Polish, Distribution & Ops Readiness

**Objective:** once the desktop runtime achieves feature parity, harden it for distribution: automatic updates, secure secret handling, signed artifacts, and deterministic QA workflows. This stage is required before public release even though there are currently no external users.

## 1. Auto-Update & Release Channeling

1. **Update source of truth** – Publish artifacts to the same storage used by `conductor-deploy.sh` (e.g., Bohdan’s manual bucket). Document the final URL template here once chosen.
2. **Updater wiring** – Enable Tauri’s updater with a JSON manifest served from that bucket. The manifest must describe both the `.dmg` installer (primary distribution) and the bare `.app` bundle (used later for headless/background updates, though not in scope now).
3. **Release channels** – Support `stable` and `canary` feeds keyed by `OPENCHAMBER_UPDATE_CHANNEL`. Conductor will upload to the desired channel manually; no CI automation is required.
4. **UI integration** – Surface update availability via `ConfigUpdateOverlay` by extending `useConfigStore` to read the updater status exposed by the Tauri backend.

## 2. Secure Storage & Credentials

1. **Secrets inventory** – Identify every UI feature that writes secrets today (provider API keys, git identities). Source references:
   - `packages/ui/src/stores/useProvidersStore.ts`
   - `packages/ui/src/stores/useGitIdentitiesStore.ts`
2. **Keychain bridge** – Add `tauri-plugin-os-api` (or `keyring` crate) and implement commands:
   - `store_secret(key, value)`
   - `read_secret(key)`
   - `delete_secret(key)`
   Keys should include the workspace path plus the logical id (e.g., `~/projects/openchamber::gitIdentity::<id>`).
3. **Migration path** – On first desktop launch, read existing plaintext secrets (if any) from `~/.config/openchamber/settings.json` or the old electron store, write them into Keychain, and remove them from disk. Document the migration flag inside the settings file (`settings.migrations.desktopKeychain = true`).

## 3. Packaging, Codesign & Notarization

1. **Signing identities** – Add placeholders to `tauri.conf.json` for:
   - `macOSDevelopmentTeamID`
   - `signingIdentity` (set to `-` locally to skip signing).
   Document the environment variables Bohdan must export before running `conductor-deploy.sh` to produce signed/notarized builds.
2. **Artifact formats** – Always emit **both** a `.dmg` installer (primary distribution) and a plain `.app` bundle zipped for future headless deployment scenarios.
3. **Build scripts** –
   - `pnpm desktop:dist:dev` → unsigned `.app` + `.dmg` for local testing.
   - `pnpm desktop:dist:release` → signed + notarized `.dmg` / zipped `.app` (requires Apple Developer credentials).
4. **Conductor integration** – Extend `conductor-deploy.sh` with optional “Build Desktop App” and “Start Desktop App” steps only (already defined in Stage 1). For Stage 3, add upload helpers that copy the `.dmg` and `.zip` artifacts to the manual bucket and print the URLs; no CI automation is expected.

## 4. Observability & Diagnostics

1. **Structured logs** – Pipe Rust logs to a file under `~/Library/Logs/OpenChamber/desktop.log` and expose a “Download logs” button in the existing UI diagnostics drawer (see `packages/ui/src/components/sections/settings/SettingsPage`).
2. **Crash reporting** – Decide whether to integrate with Sentry (Tauri plugin available) or rely on manual log uploads. Document the choice and steps for enabling/disabling telemetry.

## 5. QA Automation & Manual Checklist

1. **Playwright harness** – Add an integration test package (`packages/desktop-tests`) that uses `@playwright/test` plus `tauri-driver` to validate: cold start, session create, git commit, terminal streaming, file explorer search, notifications.
2. **Matrix** – Document a manual smoke checklist inside this file covering:
   - Fresh install → login/config load.
   - Switching themes / typography updates `settings.json`.
   - Permission prompts when selecting new workspace roots.
   - Git workflows (status/diff/commit/push).
   - Terminal persistence across suspend/resume.
3. **Release gate** – No desktop build is published unless Playwright + `pnpm -r build` + manual checklist all pass. Capture pass/fail artifacts in `/release/desktop/` for auditing.

## 6. Confirmed Constraints

- Distribution targets are `.dmg` (primary) plus a zipped `.app` kept alongside it for future headless updates.
- Desktop runtime continues to depend on the externally installed OpenCode CLI; bundling the CLI binary is explicitly out of scope for this effort.
- `conductor-deploy.sh` remains a personal helper script—its new desktop actions simply start the CLI + Tauri dev mode or build/upload artifacts for manual testing. No CI workflows are required at this stage.
