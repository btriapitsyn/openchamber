# OpenChamber Monorepo Refactoring - Summary

**Status:** Ready for Phase 1 Implementation  
**Created:** Nov 16, 2025  
**By:** Architecture Review

---

## What This Refactoring Does

Transforms OpenChamber from a single-app codebase into a **monorepo with shared UI + multiple runtime targets**:

```
Before:
OpenChamber (single app)
├── React UI (web + desktop Electron)
├── Express server
├── Electron main process
└── Direct coupling

After:
OpenChamber Monorepo
├── packages/ui/ (shared React UI)
├── packages/web/ (Node.js + Express)
├── packages/desktop/ (Tauri - Phase 2)
└── Clean API abstraction layer
```

**Benefits:**
- ✅ 100% UI code sharing between web and desktop
- ✅ Platform differences abstracted away
- ✅ Ready for Tauri migration (Phase 2)
- ✅ Ready for future targets (mobile, CLI)
- ✅ No breaking changes to users

---

## Three Key Architectural Decisions

### 1. **Dependency Injection for APIs**

Instead of importing `terminalApi`, `gitApi` directly:
```typescript
// Components use hook to get APIs
const { terminal, git, settings } = useRuntimeAPIs();
await terminal.create({ cwd: '/path' });
```

Benefits:
- Components don't know which runtime they're on
- Easy to swap implementations (web → desktop → Tauri)
- Easy to mock for testing

### 2. **Unified API Interfaces**

All backends (web/desktop) implement same interfaces:
```typescript
interface TerminalAPI {
  create(options): Promise<TerminalSession>;
  write(sessionId, data): Promise<void>;
  // ...
}
```

Both web (fetch-based) and desktop (invoke-based) implementations satisfy the same contract.

### 3. **Settings File as Single Source of Truth**

Current architecture already works this way:
- Web writes to `~/.config/.openchamber/settings.json` via `/api/config/settings`
- Desktop writes to same file via Electron IPC
- Phase 1 just abstracts it as `SettingsAPI`

---

## What Stays the Same

**100% Unchanged:**
- All React components
- All Zustand stores (except 2 lines in 2 stores)
- All hooks and utilities
- All styling and theme system
- All Tailwind CSS config
- Express server code
- Terminal, git, prompt implementations

**Backward compatible:**
- Old `src/` directory kept (for now)
- Old imports still work (marked as deprecated)
- No breaking changes to public API

---

## What Changes

**New:**
- `packages/` monorepo structure
- `packages/ui/src/lib/api/types.ts` — API interfaces
- `packages/ui/src/contexts/RuntimeAPIContext.tsx` — DI provider
- `packages/web/src/api/` — Web API implementations
- `packages/desktop/src/api/` — Desktop stubs (Phase 2 fills)

**Modified (6 files total):**
- `packages/ui/src/App.tsx` — Accept `apis` prop
- `packages/ui/src/components/right-sidebar/TerminalTab.tsx` — Use hook
- `packages/ui/src/components/right-sidebar/GitTab.tsx` — Use hook
- `packages/ui/src/components/right-sidebar/DiffTab.tsx` — Use hook
- `packages/ui/src/stores/useDirectoryStore.ts` — Use hook
- `packages/ui/src/stores/useGitIdentitiesStore.ts` — Use hook
- `packages/ui/src/lib/persistence.ts` — Use hook
- `packages/ui/src/lib/appearanceAutoSave.ts` — Use hook

**Removed (Phase 2):**
- Old electron code
- Old single-app entry points
- Old coupling logic

---

## API Abstractions (What's Unified)

### Terminal API
- Create/write/resize/close terminal sessions
- SSE streaming with auto-reconnect
- Same for web (fetch) and desktop (invoke)

### Git API (52 functions)
- Status, branches, commits, diff, worktrees, identities
- All operations pass `cwd` parameter
- Same interface for web and desktop

### Files API
- Search files (leverages server `/api/files/search`)
- Read/write file operations
- List directory entries

### Settings API
- Load/save application preferences
- Web: `/api/config/settings` endpoint
- Desktop: Tauri store (Phase 2)
- Single JSON source of truth

### Permissions API
- Directory access requests (macOS sandbox)
- Web: stubs (no-op)
- Desktop: Tauri native (Phase 2)

### Notifications API
- Send notifications
- Web: Web Notifications API
- Desktop: Native notifications (Phase 2)

---

## Phase 1 Scope

**Goal:** Refactor structure + abstract APIs, maintain 100% feature parity.

**Timeline:** 3-4 weeks with agent development

**Deliverables:**
1. Monorepo structure fully set up
2. All API interfaces defined
3. Web runtime fully functional
4. Desktop stubs compiling
5. Zero breaking changes

**What doesn't work:** Desktop (invoke errors expected, Phase 2 fills in)

---

## Phase 2 Scope (Future)

**Goal:** Implement Rust backends + complete Tauri desktop.

**Timeline:** 4-5 weeks

**Deliverables:**
1. Rust terminal, git, files implementations
2. Complete desktop API adapters
3. Desktop app builds and works
4. CI/CD for multi-platform builds

---

## Success Criteria (Phase 1)

✅ Monorepo builds and type-checks cleanly  
✅ Web version works identically to before  
✅ Desktop stubs compile (no runtime execution)  
✅ All components refactored to use APIs  
✅ No console errors or type errors  
✅ Settings persist as before  
✅ All tests pass  

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Break web | Comprehensive testing, feature parity checklist |
| Type errors | `tsc --noEmit` must pass at all times |
| Component refactoring | Small scope (6 files), careful review each |
| Monorepo complexity | Clear documentation, simple build order |
| Desktop stubs incomplete | Expected; Phase 2 fills them |

---

## Documentation Structure

```
docs/
├── AUDIT.md                          # Codebase analysis (completed)
├── plans/
│   ├── REFINED-ARCHITECTURE.md       # Architecture design (completed)
│   └── PHASE-1-IMPLEMENTATION.md     # Detailed tasks (completed)
├── ARCHITECTURE-SUMMARY.md           # This file
└── IMPLEMENTATION-NOTES.md           # Notes for Phase 2
```

---

## Next Steps

1. ✅ **Audit complete** — Understand current structure
2. ✅ **Architecture finalized** — Design is sound
3. ✅ **Tasks documented** — Ready for implementation
4. ⏳ **Phase 1 implementation** — Agent executes tasks
5. ⏳ **Phase 2 Tauri** — After Phase 1 succeeds

---

## Key Contacts & References

- **OpenCode API docs:** https://opencode.ai/docs/server/
- **Tauri 2.x docs:** https://v2.tauri.app/
- **npm/pnpm workspaces:** https://docs.npmjs.com/cli/v10/using-npm/workspaces

---

## Questions to Keep in Mind

1. **Should components still import from `@/lib/*`?**  
   Yes, internal utilities fine. Only API clients go through `useRuntimeAPIs`.

2. **What if a store needs APIs?**  
   Use a context or initialization function, not a hook (stores can't use hooks).

3. **What about Electron after Tauri?**  
   Keep electron/ folder for now, remove in Phase 2 cleanup.

4. **Can we test desktop stubs?**  
   No, they throw errors. Phase 2 testing happens after Rust impl.

5. **Is web fully deployed during Phase 1?**  
   Yes, identically as before. Same server, same endpoints, same features.

---

## How to Use This Documentation

**For Phase 1 Implementation (Agent):**
1. Read REFINED-ARCHITECTURE.md for design principles
2. Follow PHASE-1-IMPLEMENTATION.md task by task
3. Validate each week's work against checklist

**For Phase 2 Planning (Future):**
1. Review REFINED-ARCHITECTURE.md Part 2
2. Create detailed Rust implementation plan
3. Use IMPLEMENTATION-NOTES.md for context

**For Maintenance/Questions:**
1. Check AUDIT.md for codebase structure
2. Check IMPLEMENTATION-NOTES.md for API patterns
3. Reference REFINED-ARCHITECTURE.md for design decisions

---

**Ready to start Phase 1!** 🚀
