# OpenChamber Monorepo Refactoring - Complete Roadmap

**Session Start:** Nov 16, 2025  
**Status:** Planning Phase Complete ✅  
**Next:** Phase 1 Implementation Ready  

---

## Deliverables Created (This Session)

### 1. Codebase Audit ✅
**File:** `docs/monorepo/docs/monorepo/AUDIT.md`

**What it contains:**
- Complete API patterns analysis (6 APIs identified)
- Current architecture breakdown
- Settings file persistence deep-dive
- Electron coupling analysis (9 APIs, only 1 truly platform-specific)
- Component-to-API mapping
- Express server endpoint inventory (59 endpoints)
- Type safety assessment
- OpenCode SDK integration review

**Key finding:** Codebase is well-structured and minimal Electron coupling. Ready for monorepo refactoring.

---

### 2. Refined Architecture Plan ✅
**File:** `docs/monorepo/docs/monorepo/REFINED-ARCHITECTURE.md`

**What it contains:**
- Executive summary + key principles
- **Part 1:** Complete API abstraction layer design
  - Terminal API interface (7 methods)
  - Git API interface (30+ methods)
  - Files API interface (4 methods)
  - Settings API interface (2 methods)
  - Permissions API interface (4 methods)
  - Notifications API interface (1 method)
  - RuntimeAPIs unified container
  
- **Part 2:** Monorepo directory structure (complete)
  - packages/ui/ (shared frontend)
  - packages/web/ (Node.js + Express)
  - packages/desktop/ (Tauri future)

- **Part 3:** Implementation phases
  - Phase 1: Foundation (3-4 weeks)
  - Phase 2: Desktop Tauri (4-5 weeks future)

- **Part 4:** Critical implementation details
  - Settings API unification pattern
  - Files API design
  - Web/desktop entry points
  - Minimal component refactoring (6 files)

- **Part 5:** Workspace configuration (3 files)
  - Root package.json
  - tsconfig.json shared
  - pnpm-workspace.yaml

- **Part 6:** Build & type safety validation
- **Part 7:** 5 critical questions (answered)
- **Part 8:** Success criteria (10 points)
- **Part 9:** Risk mitigation matrix

---

### 3. Detailed Phase 1 Implementation Tasks ✅
**File:** `docs/monorepo/docs/monorepo/PHASE-1-IMPLEMENTATION.md`

**What it contains:**

**Week 1: Monorepo Setup & API Interfaces (Tasks 1.1-1.6)**
- Create monorepo root configuration
- Create packages directory structure
- Move UI to packages/ui
- Create Runtime API interfaces (complete types.ts with 350+ lines)
- Create RuntimeAPIContext
- Update App.tsx

**Week 2: Web Runtime Implementation (Tasks 2.1-2.9)**
- Create web package structure
- Implement 6 API adapters:
  - Terminal (with SSE + reconnect logic)
  - Git (52 functions wrapped)
  - Files (new endpoint wrapper)
  - Settings (fetch-based)
  - Permissions (web stubs)
  - Notifications (web stubs)
- Create web main.tsx entry point
- Create web vite config
- Validation checklist

**Week 3: Desktop Runtime Stubs (Tasks 3.1-3.6)**
- Create desktop package structure
- Create 6 API stubs (throw "not implemented" Phase 2)
- Create desktop main.tsx entry point
- Create minimal Cargo.toml
- Validation checklist

**Week 4: Testing, Validation & Documentation (Tasks 4.1-4.7)**
- Global type checking
- Web feature validation (15-point checklist)
- Refactor components to use useRuntimeAPIs (8 files, detailed pattern)
- Update CI/CD for monorepo
- Clean up old files (strategy)
- Documentation updates
- Final validation checklist (15 points)

**Additional:** Effort estimates per task, risk matrix, Phase 2 roadmap

---

### 4. Architecture Summary ✅
**File:** `docs/monorepo/ARCHITECTURE-SUMMARY.md`

**What it contains:**
- Quick overview of before/after
- 3 key architectural decisions explained
- What stays the same (100% components, stores, styles)
- What changes (new files, modified files, removed files)
- 6 API abstractions explained
- Phase 1 & Phase 2 scope
- Success criteria (7 points)
- Risk mitigation table
- Documentation structure
- Next steps roadmap
- FAQ for common questions

---

## Complete Documentation Map

```
docs/
├── docs/monorepo/AUDIT.md                              # ✅ Codebase analysis
├── ARCHITECTURE-SUMMARY.md               # ✅ Executive overview
├── plans/
│   ├── docs/monorepo/REFINED-ARCHITECTURE.md          # ✅ Full design doc
│   ├── docs/monorepo/PHASE-1-IMPLEMENTATION.md        # ✅ Detailed tasks
│   └── [Phase 2 planning - future]       # To be created
└── [Additional notes - future]
```

---

## Key Metrics

| Metric | Value |
|--------|-------|
| Total documentation pages | 50+ |
| API interfaces defined | 6 |
| API methods total | 100+ |
| Files to refactor (Phase 1) | 8 |
| New files to create (Phase 1) | 20+ |
| Components modified | 3 |
| Stores modified | 2 |
| Utilities modified | 3 |
| Web API implementations | 6 |
| Desktop API stubs | 6 |
| Phase 1 estimated effort | 60 hours (~3-4 weeks) |
| Phase 2 estimated effort | 80+ hours (~4-5 weeks) |

---

## Decision Log

### ✅ Confirmed Decisions

1. **Monorepo structure:** packages/ui + packages/web + packages/desktop
2. **API abstraction:** RuntimeAPIContext + useRuntimeAPIs hook pattern
3. **Settings persistence:** Already unified via JSON file, just abstract it
4. **OpenCode SDK:** Keep it, don't switch to generated client
5. **Web version in Phase 1:** 100% functional, identical to before
6. **Desktop Phase 2:** Tauri, not Electron continuation
7. **File search API:** Use `/api/files/search` endpoint, not OpenCode SDK

### 📋 Questions Answered (Your Clarifications)

1. **Settings persistence for web:** ✅ Yes, already saving to server
2. **File search strategy:** ✅ Use `/api/files/search` endpoint
3. **Permissions API:** ✅ Create it (macOS sandbox + directory access)
4. **Notifications API:** ✅ Create it
5. **Window control:** ✅ Keep as desktop-only, don't abstract
6. **OpenCode SDK on Tauri:** ✅ Yes, works via HTTP calls

---

## Architecture Highlights

### Dependency Injection Pattern
```typescript
// Components don't import APIs
const { terminal, git, settings } = useRuntimeAPIs();
// API implementations injected at app startup
```

### Unified Interfaces
```typescript
interface TerminalAPI { /* same for web & desktop */ }
// Web impl: createTerminalAPI() → fetch-based
// Desktop impl: createTerminalAPI() → invoke-based
```

### Settings Unification
```
Both web & desktop → ~/.config/.openchamber/settings.json
Web: via /api/config/settings endpoint
Desktop: via Electron IPC (Phase 1), then Tauri (Phase 2)
```

---

## Validation Points

**During Phase 1, validate:**
- ✅ `pnpm -r type-check` passes
- ✅ `pnpm -r lint` passes
- ✅ `pnpm -r build` succeeds
- ✅ Web dev server starts
- ✅ Web features work identically
- ✅ Settings persist
- ✅ Desktop stubs compile
- ✅ No console errors
- ✅ Component refactoring correct
- ✅ No circular dependencies

---

## Handoff to Implementation

**For Phase 1 Implementation Agent:**

1. Read in this order:
   - ARCHITECTURE-SUMMARY.md (overview)
   - docs/monorepo/REFINED-ARCHITECTURE.md (design)
   - docs/monorepo/PHASE-1-IMPLEMENTATION.md (tasks)

2. Execute tasks in order (Week 1 → Week 2 → Week 3 → Week 4)

3. Validate each week before starting next

4. Reference docs/monorepo/AUDIT.md for codebase questions

5. Keep documentation updated as you go

---

## Critical Success Factors

1. **No breaking changes** — Web must work identically
2. **Type safety** — `tsc --noEmit` always passes
3. **Component isolation** — Only 8 files need refactoring
4. **API contracts** — Interfaces are fixed; implementations can vary
5. **Documentation** — Every decision documented for Phase 2

---

## What's NOT in Scope (Phase 1)

❌ Rust implementation (Phase 2)  
❌ Desktop functionality (Phase 2)  
❌ Electron removal (Phase 2)  
❌ CI/CD optimization (Phase 2)  
❌ Distribution packaging (Phase 2)  
❌ Web deployment changes (unchanged)  

---

## What IS in Scope (Phase 1)

✅ Monorepo structure  
✅ API abstraction layer  
✅ Web runtime fully functional  
✅ Desktop stubs compiling  
✅ Component refactoring (8 files)  
✅ Documentation complete  
✅ Zero breaking changes  

---

## Timeline

| Phase | Duration | Status | Deliverables |
|-------|----------|--------|---|
| Planning | 6 hours | ✅ Complete | 4 docs, architecture finalized |
| Phase 1 | 3-4 weeks | ⏳ Ready | Monorepo + web runtime |
| Phase 2 | 4-5 weeks | 📋 Planned | Tauri desktop app |
| Phase 3 | Ongoing | 📋 Future | Distribution, CI/CD, mobile |

---

## Success Definition

**Phase 1 succeeds when:**

1. ✅ All 4 deliverables created (docs)
2. ✅ Architecture reviewed and approved
3. ✅ Monorepo builds cleanly
4. ✅ Web version works identically
5. ✅ Desktop stubs compile
6. ✅ All type checks pass
7. ✅ No breaking changes
8. ✅ Documentation complete for Phase 2

---

## Next Action Items (For You)

1. **Review this roadmap** — Understand scope and plan
2. **Confirm readiness** — Are assumptions correct?
3. **Allocate resources** — Agents for Phase 1 execution
4. **Set deadline** — Target completion date for Phase 1
5. **Plan Phase 2** — Schedule when Phase 1 completes

---

## Questions Before Starting?

Before Phase 1 execution begins, confirm:

1. Is the monorepo structure correct?
2. Are the 6 APIs sufficient?
3. Should any other files be refactored?
4. Any concerns about the dependency injection pattern?
5. Timeline realistic for your needs?

---

## Reference

- **OpenCode SDK:** https://opencode.ai/
- **Tauri 2.x:** https://v2.tauri.app/
- **pnpm workspaces:** https://pnpm.io/workspaces
- **Dependency Injection pattern:** Common in React via Context

---

**Status: Ready to begin Phase 1 Implementation** 🚀

All planning complete. Documentation comprehensive. Architecture sound.

Next: Agent executes docs/monorepo/PHASE-1-IMPLEMENTATION.md tasks.

