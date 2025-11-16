# OpenChamber Monorepo Summary (Concise)

**Status:** Ready for Phase 1 (web parity, desktop stubs)

## What & Why
- Split into monorepo: `packages/ui` (shared React), `packages/web` (Node+Express), `packages/desktop` (Tauri, later).
- Introduce dependency-injected runtime APIs; UI decoupled from platform.
- Keep web behavior identical; prepare for Tauri without breaking web.

## Key Decisions
- DI hook: `RuntimeAPIProvider` + `useRuntimeAPIs()` for components.
- Unified API contracts defined once in `packages/ui` (terminal, git, files, settings, permissions, notifications).
- Settings remain single JSON source (`~/.config/.openchamber/settings.json`).
- Web imports shared UI; desktop ships stubs in Phase 1.

## What Changes (Phase 1)
- New structure: `packages/{ui,web,desktop}` with root workspace config.
- UI root `App` accepts `apis` prop; 6 small component/store refs use `useRuntimeAPIs`.
- Web runtime wraps existing server APIs; git API via thin facade over current `gitApi.ts`.
- Files API limited to `search` unless backend adds read/write/list.

## What Stays the Same
- All React components, hooks, stores (except small API wiring), themes, SDK usage, Express code paths.
- Legacy `src/` retained as deprecated; web should import from `@openchamber/ui`.

## Phase 1 Scope
- Restructure + API abstraction only; no feature changes.
- Desktop stubs compile but throw on use (expected).
- Lib build for UI deferred; SPA build used for web.

## Phase 2 (Future)
- Implement Tauri + Rust backends (terminal/git/files/settings/permissions/notifications).
- Remove Electron code after Tauri works.

## Success Criteria (Phase 1)
- Web unchanged functionally; all settings/terminal/git actions OK.
- Monorepo builds; `tsc --noEmit`, lint pass.
- Desktop stubs compile; no runtime expectation.
- Assets still served; no console errors.

## Risks & Mitigations
- Asset paths break → verify public/icons/fonts after moves.
- Git API drift → do not copy; wrap existing `gitApi.ts`.
- Alias misconfig → align root + package tsconfig/vite; update tests if any.
- Mixing old/new sources → build web from `@openchamber/ui` only; legacy noted as deprecated.

## Next Steps
- Follow `PHASE-1-IMPLEMENTATION.md` weekly checklist.
- Confirm toolchain choice (pnpm vs npm workspaces) and update locks accordingly.
