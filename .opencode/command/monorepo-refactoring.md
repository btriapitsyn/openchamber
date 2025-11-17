---
description: OpenChamber monorepo refactoring Phase 1 - work instructions
---

# Monorepo Refactoring Phase 1 - Work Instructions

## Important Context
- Active development phase, not released project; no users; no deadlines; no backward-compat pressure.
- Prefer correctness and clean design over keeping legacy patterns.
- Remove/replace things that don’t fit the target architecture.

## Read First (in order)
1) `docs/monorepo/README.md`
2) `docs/monorepo/ARCHITECTURE-SUMMARY.md`
3) `docs/monorepo/REFINED-ARCHITECTURE.md`
4) `docs/monorepo/PHASE-1-IMPLEMENTATION.md`
5) `docs/monorepo/AUDIT.md` (reference as needed)

## Task Loop
1) Open `docs/monorepo/PHASE-1-TASKS.md`.
2) Pick the first task marked `⏳ Pending` (or continue a `🔄 In Progress`).
3) Report to Bohdan:
   - Brief doc takeaways (1–2 bullets).
   - Task number + one-line description (e.g., "Task 1.1: Create root workspace config").
   - State: "Ready. Waiting for your go."
4) Wait for Bohdan to say "go" or clarify.
5) After "go":
   - Execute the task per `PHASE-1-IMPLEMENTATION.md`.
   - Run validations (see below).
   - Update `PHASE-1-TASKS.md` status to `✅ Complete` when done.
6) Repeat from step 1.

## Validations (Phase 1)
Use pnpm only.
- Install: `pnpm install`
- Type-check: `pnpm -r type-check`
- Lint: `pnpm -r lint`
- Build: `pnpm -r build`

## Constraints
- Do not run long-lived dev servers (``pnpm dev`).
- Keep all code and comments in English.
- Production-ready quality; no temporary hacks.
- Use DI and thin facades over copy-paste of APIs (especially git/files).
- Keep OpenCode SDK client shared (in `packages/ui/lib/opencode/client.ts`); do not split per runtime.
- Treat legacy root `src/` as deprecated; build UI only from `packages/ui`.
- Keep CLI and `ui-auth` web-only; do not bundle into desktop.
