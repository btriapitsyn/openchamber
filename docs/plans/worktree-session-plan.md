# Worktree-Aware Session Workflow – Implementation Plan

## 1. Goals & Scope
- Allow users to create or reuse Git worktrees (`project_dir/.openchamber/<name>`) when starting a new session.
- Surface worktree context across the UI (session list badge, metadata).
- Provide voluntary cleanup: archive worktree on demand or during session deletion.
- Respect recent bulk deletion changes (`SessionStore.deleteSessions`, date-group UI).

## 2. High-Level Architecture
1. **Metadata plumbing**
   - Extend session store state with a `worktreeMetadata` map keyed by `sessionId` (branch, path, status flags).
   - Persist metadata in session storage (`persist(...)` partial) and hydrate from backend response once API supports it; until then store only client-side.
   - Update composed store (`useSessionStore`) selectors to expose `getWorktreeMetadata(sessionId)` and `setWorktreeMetadata`.

2. **Worktree management service**
   - Create `src/lib/git/worktreeService.ts` to wrap `gitApi` helpers (`createCommit`, etc.) with new endpoints:
     - `createWorktree({ branch, path, baseRef })`
     - `removeWorktree({ branch, path, force })`
     - `listWorktrees()` and `getStatus(path)` (optional caching).
   - Reuse `opencodeClient` additions for filesystem operations (mkdir, list).

3. **Session creation flow**
   - Update create-session dialog to include a “Worktree mode” section:
     - Radio buttons: `No worktree` (default), `Create new`, `Reuse existing`.
     - Fields:
       - New worktree: branch name (validated), base ref dropdown (default `HEAD`), path preview.
       - Reuse: dropdown of `.openchamber/*` directories with resolved branch names.
     - Hook `onSubmit` to orchestrate:
       1. Create/reuse semantics (`worktreeService.createWorktree` or `setDirectory` to existing).
       2. Store metadata locally (`setWorktreeMetadata`).
       3. Call `createSession`.
   - Disable controls during `isLoading`.

4. **Session list UI enhancements**
   - Augment session rows with badge showing branch name when metadata exists; tooltip reveals full path.
   - Ensure date-group bulk delete button accounts for metadata (see §5).

5. **Deletion & archiving**
   - Introduce shared confirmation modal (`SessionDeleteDialog`) used for both single session and date-group deletes.
     - Shows list/count of targeted sessions.
     - Includes `Archive attached worktrees` checkbox when any selected session has metadata.
     - Inline warning (yellow) if any worktree is dirty (computed via pre-fetch of git status).
   - Modify `deleteSession` and `deleteSessions` actions:
     - Accept options `{ archiveWorktree?: boolean }`.
     - When true, perform `removeWorktree` before calling `opencodeClient.deleteSession`.
     - Handle failures gracefully (collect `failedIds`, toast error).
   - Ensure `setDirectory` is reset to project root when an archived session was active.

6. **Reassignment / detaching**
   - Add “Detach worktree” option to session dropdown:
     - Removes metadata and resets directory to root.
     - Optionally leaves worktree on disk (no git action).
   - Consider future support for reattaching via edit flow (not required now).

## 3. Detailed Task Breakdown
- **State & Types**
  1. Add `WorktreeMetadata` interface in `src/types/worktree.ts`.
  2. Update `SessionStore` types (including `SessionStore` interface and persisted slice) with metadata maps and new methods.
  3. Extend `sessionStore` implementation (load/save, trimming metadata on delete).

- **Services & API**
  4. Implement `worktreeService` with functions calling `/api/git/*` endpoints (`git worktree add/remove`, `git status`).
  5. Extend `server/lib/gitApi.ts` & Express routes to expose required operations (if not already present).
  6. Wire new service into `opencodeClient` as needed for path resolution.

- **Create Session UI**
  7. Refactor `SessionList` dialog content into subcomponent `CreateSessionDialog` to keep file manageable.
  8. Add form state (radio selection, branch input, reuse dropdown).
  9. Validate branch names (no whitespace, unique, not existing as branch unless reuse).
  10. Handle async workflow inside `handleCreateSession`: orchestrate worktree creation & session creation; on failure, rollback (`removeWorktree`).

- **Session List Enhancements**
  11. Render badge + tooltip on rows; ensure compatibility with new `shouldAlwaysShowSessionActions`.
  12. Add `Detach worktree` to dropdown; implement handler to update metadata.

- **Deletion Flow**
  13. Introduce `useSessionDeletion` hook managing confirmation dialog state and orchestrating archive calls.
  14. Update single-session delete & bulk delete buttons to use shared dialog.
  15. Expand store delete methods with options & metadata cleanup.
  16. Surface toast messaging summarizing deleted/archived counts.

- **Git Status Warnings**
  17. Extend `worktreeService.getStatus` to inspect uncommitted changes.
  18. Pass warning flags into dialog for inline messaging (no extra prompt).

- **Testing & Validation**
  19. Manual flows: create + new worktree, reuse existing, skip worktree, detach, archive on delete, bulk delete with mix of sessions.
  20. Run `npm run lint` and `npx tsc --noEmit`.

## 4. Open Questions / Follow-ups
- Backend support for storing worktree metadata per session? Currently client-held; future API changes may simplify.
- Need for automatic cleanup of orphaned `.openchamber` directories when metadata missing (out-of-scope now).
- Should we expose base branch selection beyond `HEAD`? For now keep simple; could add advanced dropdown later.

## 5. Rollout Considerations
- Feature flags: wrap UI in optional flag (e.g., `enableWorktreeSessions`) for safe rollout.
- Migration handling: ensure existing sessions start with empty metadata; no breaking changes expected.
- Documentation: Update `docs/` usage guide once implementation stabilized.

## 6. Implementation Summary (2025-11-05)
- Delivered full client-side worktree metadata plumbing with persistent mapping, directory overrides, and smart session selection tied to per-session directories.
- Added worktree creation/reuse UX inside session creation, including sanitized branch/slug handling, automatic upstream setup attempts, and `.openchamber` ignore management.
- Enhanced right-sidebar Git/Diff/Terminal tabs plus message/permission stores so all requests honor the active session directory (worktree or project root) without forcing global OpenCode restarts.
- Implemented robust deletion flow with archive + optional remote-branch removal, remote branch API support, and resilient toast/status feedback for single and bulk operations.
- Refined UI polish: worktree badge/tooltip, mobile overlays for create/delete dialogs, accessible button styling, path wrapping, and removed detach workflow in favor of explicit archive/delete.
