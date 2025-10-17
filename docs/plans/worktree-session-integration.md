---
title: Worktree-Aware Session Creation
status: draft
authors:
  - assistant
created: 2025-02-19
summary: >
  Extend session creation flow to optionally create or reuse git worktrees,
  tie sessions to those directories, and gracefully handle missing worktrees.
---

## Objectives

- Detect when a chosen working directory is inside a git repository.
- Offer inline worktree configuration during session creation (no extra wizard steps).
- Allow users to create new git worktrees with custom names and optional matching branches.
- Enable reuse of existing worktrees.
- Persist worktree-aware sessions so fresh installs or cleared caches still reconcile state.
- Block activation of sessions whose worktree directories were removed externally, while keeping deletion available.

## High-Level UX

### Session Creation Form

1. **Worktree detection**  
   After the user picks a base directory, check `git rev-parse --is-inside-work-tree`.
2. **Inline controls (visible only when inside a repo)**  
   - Checkbox `Use git worktree`.
   - When enabled:
     - Radio options:
       - `Create new worktree` (default)
       - `Use existing worktree`
     - **Create new**:
       - Text input `Worktree name` (live-sanitised: lowercase, spaces/periods → `-`).
       - Checkbox `Create branch with same name` (defaults to checked).
       - Dropdown `Base branch` – populated from repo branches; default = resolved origin HEAD (fall back to `main`/`master` if resolution fails).
       - Preview text showing final path `repo/.openchamber/<slug>` and branch name.
     - **Use existing**:
       - Dropdown listing current worktrees (e.g. from `git worktree list`).
       - When selected, preview shows the resolved path; creation inputs are disabled.
3. **Submit logic**
   - If worktree controls disabled → behave like current flow (use chosen directory as-is).
   - If `Use existing` → verify chosen path; set session directory to that worktree.
   - If `Create new` → run `git worktree add`:
     - Base command: `git worktree add <repo>/.openchamber/<slug>`
     - If “create branch” checked → `-b <slug> <baseBranch>`
     - Else → attach to `<baseBranch>` directly.
   - On success, new session’s directory equals the newly created worktree path.

### Session List / Sidebar

- Session entries show as usual.
- On hydration, for each session directory:
  - Check existence (`fs.existsSync`) and optionally confirm via `git worktree list`.
  - If missing:
    - Mark session internally as `orphaned`.
    - In UI, display it greyed-out / non-interactive.
    - Clicking highlights a tooltip/toast: “Worktree directory not found. Remove via menu.”
    - Menu `⋯` still offers “Delete session”.
  - If present: fully interactive.

## Backend / Platform Work

1. **Git utilities**
   - `gitIsRepo(path)`
   - `gitListWorktrees(path)` → returns array `{ path, branch, name }`
   - `gitResolveDefaultBranch(path)` → via `git symbolic-ref refs/remotes/origin/HEAD`
   - `gitCreateWorktree(path, { name, baseBranch, createBranch })`
2. **API surface**
   - New endpoints (desktop + web server):
     - `GET /git/info` → whether repo, default branch, list of worktrees, branch list.
     - `POST /git/worktrees` → create new worktree.
3. **Persistence**
   - Extend session metadata with optional `worktreeName` and `worktreePath`.
   - On startup, backend rehydrates data from disk or re-scans repository, so reinstalling the app doesn’t lose awareness.

## Client Implementation Steps

1. **Enhance Session creation modal** (React):
   - Add worktree section with described controls.
   - Sanitize input via helper `sanitizeSlug`.
   - Debounce backend lookups (worktree list, branches).
2. **Wire into SessionStore**
   - Store additional fields.
   - Update creation flow to call new API.
3. **Missing worktree handling**
   - During session list hydration, mark orphaned sessions.
   - Update UI components to disable selection and show tooltip.
4. **Optional future work**
   - Offer “Re-create worktree” action from the overflow menu.
   - Show badges identifying worktree-backed sessions.

## Edge Cases

- Worktree name clashes: surface inline validation (“Worktree already exists; select from dropdown or choose another name”).
- Reuse existing worktrees: ensure we don’t re-run `git worktree add`.
- Repo without remotes: dropdown should include local branches; default could fall back to current HEAD.
- Non-git directories: worktree controls stay hidden.

## Open Questions

- Should we support custom base directory instead of `.openchamber/`? (Initial scope uses `.openchamber/<slug>`.)
- Do we auto-clean orphaned worktrees on session deletion? (Likely yes; handle via backend.)
- How to handle worktree branch divergence warnings? (Out of scope for first iteration.)
