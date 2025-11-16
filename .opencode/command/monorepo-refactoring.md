---
description: OpenChamber monorepo refactoring Phase 1 - work instructions
---

# Monorepo Refactoring Phase 1 - Work Instructions

## Important Context

**This is a hobby project, not yet released. There are NO users, NO legacy debt, NO migration requirements, NO time pressure.**

This means:
- Do refactoring properly, not semi-optimally
- Replace things that don't fit the new architecture, don't try to keep them "just in case"
- Prioritize clean design over backward compatibility
- Remove old patterns entirely if the new approach is better
- Build it right the first time

You have all the time in the world and complete freedom to restructure correctly without constraints. Make it great.

## Do this now

1. Read these documents in order:
   - `docs/monorepo/README.md`
   - `docs/monorepo/ARCHITECTURE-SUMMARY.md`
   - `docs/monorepo/REFINED-ARCHITECTURE.md`
   - `docs/monorepo/PHASE-1-IMPLEMENTATION.md`
   - `docs/monorepo/AUDIT.md` (reference as needed)

2. Open `docs/monorepo/PHASE-1-TASKS.md`

3. Find the first task with status `⏳ Pending` (or `🔄 In Progress` if continuing work)

4. Report to Bohdan:
   - Brief summary of what you learned from docs
   - Next task number and one-line description
   - Example: "Task 1.1: Create root package.json, tsconfig.json, pnpm-workspace.yaml"
   - State: "Ready. Waiting for your go."

5. Wait for Bohdan to say "go" or to discuss/clarify something

6. Once Bohdan says "go":
   - Follow detailed instructions in `PHASE-1-IMPLEMENTATION.md` for that task
   - Run validation checks
   - Update task status in `PHASE-1-TASKS.md` to `✅ Complete`
   - When done, repeat from step 3

## Constraints

- `tsc --noEmit` must pass
- `npm run lint` must pass
- No `npm run dev` or long-running servers
- All code in English
- Production-ready quality
