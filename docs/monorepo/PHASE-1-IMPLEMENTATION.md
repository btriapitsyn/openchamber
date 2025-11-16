# Phase 1 Implementation — Checklists & Patterns

**Goal:** Monorepo + DI + web parity. Desktop stubs compile, not run.
**Tooling:** pnpm workspaces only. Keep `pnpm-lock.yaml`; no `package-lock.json`.

## Step 1 — Monorepo + APIs
- [ ] Root workspace config (package.json workspaces, pnpm-workspace.yaml, base tsconfig with paths + refs).
- [ ] Create `packages/{ui,web,desktop}` (desktop includes `src-tauri` skeleton folder, no code needed yet).
- [ ] Move current `src/` to `packages/ui/src`; keep legacy `src/` as deprecated (not used by web build).
- [ ] `App` in `packages/ui` accepts `apis` prop and wraps `MainLayout` in `RuntimeAPIProvider`.
- [ ] Add `RuntimeAPIContext` and `useRuntimeAPIs` hook.
- [ ] Define API contracts once in `packages/ui/src/lib/api/types.ts` (terminal, git, files, settings, permissions, notifications).
- [ ] Adjust aliases: root paths + per-package `@/*`; keep consistent in tsconfig + vite (and tests if present).

## Step 2 — Web Runtime
- [ ] Move Express server to `packages/web/server` and CLI to `packages/web/bin`; keep CLI and `ui-auth` web-only; update static paths if needed.
- [ ] Web API adapters in `packages/web/src/api/`:
  - [ ] terminal: wraps existing terminal server endpoints (keep SSE reconnect semantics).
  - [ ] git: thin facade around existing `gitApi.ts` (no copy-paste; reuse names and logic).
  - [ ] files: list/search only via `/api/fs/list` and `/api/fs/search` (no read/write yet).
  - [ ] settings: wraps `/api/config/settings` (JSON load/save).
  - [ ] permissions: web no-op/success.
  - [ ] notifications: simple console/log or Web Notifications.
  - [ ] index: `createWebAPIs()` returns all + `isDesktop:false`.
- [ ] Web entry `packages/web/src/main.tsx`: render `<App apis={createWebAPIs()} />`.
- [ ] Web build config: alias `@`, proxy `/api` to server, ensure assets served.
- [ ] OpenCode SDK client stays shared in `packages/ui/lib/opencode/client.ts` (no runtime split).
- [ ] Validate: `pnpm -C packages/web type-check && pnpm -C packages/web build`; dev server smoke test (UI unchanged, assets present).

## Step 3 — Desktop Stubs
- [ ] Create `packages/desktop/src/api/*` stubs: all methods throw "not implemented"; `subscribe` returns noop; `isDesktop:true` in index.
- [ ] Desktop entry `packages/desktop/src/main.tsx`: render `<App apis={createDesktopAPIs()} />`.
- [ ] `src-tauri` skeleton files exist (Cargo.toml/lib.rs/main.rs placeholders), no functionality required.
- [ ] Validate: `pnpm -C packages/desktop type-check && pnpm -C packages/desktop build` (compile-only).

## Step 4 — Wiring, Refactors, Validation
- [ ] Components to `useRuntimeAPIs`: TerminalTab, GitTab, DiffTab.
- [ ] Utilities/stores: `useDirectoryStore`, `useGitIdentitiesStore`, `persistence.ts`, `appearanceAutoSave.ts` use injected APIs (register helper; no hooks inside stores).
- [ ] Global checks: `pnpm -r type-check && pnpm -r lint && pnpm -r build` (Node 20; use pnpm cache in CI).
- [ ] Web manual parity: terminal, git, settings persistence, prompt enhancer, sessions/directories, no console errors, assets served.
- [ ] CI workflow: run the three commands above across workspaces.

## Patterns (no long code dumps)
- **Git API facade:** import existing `gitApi` functions; expose them through `createGitAPI()` without duplicating logic or renaming.
- **Files API:** use `/api/fs/list` and `/api/fs/search` (list/search only). Add read/write only after backend endpoints exist.
- **OpenCode SDK:** stays shared in `packages/ui/lib/opencode/client.ts`; do not fork per runtime.
- **Store injection:** expose a `registerRuntimeAPIs(apis)` helper used at app bootstrap; stores import from that module, avoiding hooks.
- **Assets:** after moves, confirm public/icons/fonts paths in built web output; adjust static serving in server if paths changed.

## Success Checklist (Phase 1)
- [ ] Web unchanged in behavior; no console errors.
- [ ] Monorepo builds; type-check/lint clean.
- [ ] Desktop stubs compile (runtime throws expected).
- [ ] Assets intact; settings/terminal/git OK on web.
- [ ] Git API single-sourced; aliases consistent.
