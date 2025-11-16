# OpenChamber Monorepo — Refined Architecture (Reference)

**Status:** Ready for Phase 1 (web parity, desktop stubs)

## Principles (keep it simple)
1) Share everything by default (UI/state/logic are runtime-agnostic).
2) Inject APIs at app start (DI via context), never import runtime clients directly.
3) One settings source of truth (`~/.config/.openchamber/settings.json`).
4) Keep existing server/SDK; only reorganize in Phase 1.
5) Platform-specific code isolated; desktop stubbed until Phase 2.

## API Surface (defined once in `packages/ui`)
- Terminal: create/write/resize/close + subscribe (SSE/reconnect semantics preserved).
- Git: full set via existing `gitApi.ts`; use a thin facade, no copy-paste.
- Files: Phase 1 list/search via existing `/api/fs/list` and `/api/fs/search`; no read/write endpoints yet.
- Settings: load/save on shared JSON file.
- Permissions: directory access/bookmark contracts; web = no-op, desktop later.
- Notifications: basic notify; web = console/log or Web Notifications; desktop later.

## Dependency Injection Pattern
- Context: `RuntimeAPIProvider` + `useRuntimeAPIs()`.
- `App` accepts `apis` prop; wraps `MainLayout` inside provider.
- Components use hook; stores/utilities get APIs via explicit registration helper (no hooks inside stores).

## Package Layout
```
packages/
  ui/        # shared React UI (SPA build for Phase 1)
  web/       # Node+Express runtime + API adapters
  desktop/   # Tauri runtime stubs (TS) + src-tauri skeleton (Phase 2)
```
- Root: workspace config (pnpm or npm), base tsconfig, shared scripts.
- Assets: ensure icons/fonts/public are reachable from web build after moves.

## Phase 1 Scope (do now)
- Create monorepo scaffolding and move current UI/server into packages.
- Add API contracts + DI context; wire `App` and ~6 touch-points to `useRuntimeAPIs`.
- Web runtime: adapters that wrap existing server/SDK; git via facade of `gitApi.ts` (reuse existing function names).
- CLI and `ui-auth` live only in web runtime; desktop does not bundle them.
- OpenCode SDK client remains shared in `packages/ui/lib/opencode/client.ts`; not split by runtime; used as-is in web and desktop webview.
- Files API: list/search only via `/api/fs/list` and `/api/fs/search` until backend adds read/write.
- Desktop: compile-time stubs throwing; no runtime expectations.
- UI built as SPA (not lib) for Phase 1 to reduce risk.

## Phase 2 Scope (later)
- Implement Tauri invoke adapters + Rust backends (pty, git2, fs, settings, permissions, notifications).
- Remove Electron; ship desktop app; add CI for multi-platform builds.

## Validation Targets
- `pnpm -r type-check && pnpm -r lint && pnpm -r build` clean.
- Web feature parity: terminal, git, settings, prompt enhancer; assets served; no console errors.
- Desktop stubs compile.
- Aliases consistent (root + package tsconfig/vite/test runners).

## Open Questions (now answered)
- Permissions scope: directory access + bookmarks only for now.
- Files scope: search-only in Phase 1 unless backend endpoints exist.
- Desktop stubs: must compile (throwing is fine), not empty dirs.
- Workspace manager: choose pnpm or npm; keep lockfile consistent; don’t mix.
- Express location: keep under `packages/web/server`; no separate server package needed in Phase 1.
- SDK usage: stay in `src/lib/opencode/client.ts`; inject via DI, no direct component imports.

## Notes to avoid regressions
- Do not mix legacy `src/` in web build; treat as deprecated only.
- Keep git API single-sourced from existing implementation.
- Keep OpenCode SDK client shared (do not fork per runtime).
- After moves, verify public/assets paths and CLI/server static serving.
