# OpenChamber Monorepo Plan (Short)

**Audience:** Solo dev. **Goal:** One codebase for web now, Tauri desktop later, no web regressions.

## TL;DR (10 points)
1) Adopt monorepo `packages/{ui,web,desktop}`.
2) Shared UI with DI via `RuntimeAPIProvider` + `useRuntimeAPIs()`.
3) API contracts live in `packages/ui` (types file); implementations differ per runtime.
4) Phase 1 desktop = stubs (throw), web stays fully functional.
5) UI built as SPA for Phase 1; library build deferred.
6) Git API: wrap existing `gitApi.ts` (facade), no copy-paste.
7) Files API: Phase 1 only `search` unless backend adds read/write/list endpoints.
8) Assets: verify public/icons/fonts remain served after moves.
9) Aliases: keep root paths + local `@/*` per package; align tsconfig/vite/test runners.
10) CI: `pnpm -r type-check && pnpm -r lint && pnpm -r build` (Node 20, pnpm cache).

## How to Read
- Start: `ARCHITECTURE-SUMMARY.md` (one page).
- Design reference: `REFINED-ARCHITECTURE.md` (principles, structure, decisions).
- Execution: `PHASE-1-IMPLEMENTATION.md` (checklists and patterns, no long code dumps).

## Phase 1 Success
- Web behaves 1:1 with today.
- Monorepo builds; type-check/lint clean.
- Desktop stubs compile (not executable yet).
- Settings/terminal/git work on web without regressions.

## Top Risks + Mitigations
- Missing assets → confirm public/icons/fonts paths in web after moves.
- Git API divergence → use a thin facade over existing `gitApi.ts`.
- Mixing old `src/` with new packages → web imports `@openchamber/ui` only; legacy `src/` kept as deprecated.
- Alias drift → single set of paths in root tsconfig + per-package; update tests/storybook if present.

## Quick Checks
```
pnpm install
pnpm -r type-check
pnpm -r lint
pnpm -r build
```

Ready to work? Jump to `PHASE-1-IMPLEMENTATION.md` and follow the weekly checklist.
