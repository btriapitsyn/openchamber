# Worktree Implementation Testing Plan

## Goal

Verify that OpenChamber worktree creation/removal/listing is fully backward-compatible with OpenCode expectations, while supporting OpenChamber extensions.

## Preconditions

- Use a disposable git repository for destructive checks.
- Ensure at least one remote (`origin`) exists.
- For fork PR checks, ensure a second remote/fork URL is available.

## Test Matrix

### 1. Legacy-compatible create flow

1. Create a worktree without specifying branch or worktree name.
2. Confirm response contains `name`, `branch`, `directory`.
3. Confirm branch follows OpenCode-compatible naming (`opencode/<name>`).
4. Confirm directory is created under OpenCode-style worktree storage root.
5. Confirm worktree appears in `GET /api/git/worktrees`.

Expected:

- Creation succeeds.
- Listing includes the new worktree with branch name.

### 2. New branch mode with explicit branch name

1. Create with `mode=new`, `branchName=feature/test-explicit`, `worktreeName=wt-explicit`.
2. Confirm local branch is exactly `feature/test-explicit`.
3. Confirm worktree folder uses provided name (or OpenCode uniqueness suffix when needed).

Expected:

- Branch and worktree name are honored.

### 3. New branch mode with explicit start ref

1. Create with `mode=new`, `branchName=feature/from-remote`, `startRef=origin/main`.
2. Verify new branch is based on `origin/main`.

Expected:

- Branch head matches chosen start ref.

### 4. Existing branch mode (local)

1. Ensure local branch `feature/existing-local` exists.
2. Create with `mode=existing`, `existingBranch=feature/existing-local`.

Expected:

- Worktree attaches to existing local branch.

### 5. Existing branch mode (remote)

1. Ensure remote branch exists (for example `origin/feature/existing-remote`).
2. Create with `mode=existing`, `existingBranch=origin/feature/existing-remote`.

Expected:

- Worktree is created on a local branch derived from that remote branch.
- Branch can be pushed.

### 6. Validation endpoint behavior

1. Call `POST /api/git/worktrees/validate` for a valid payload.
2. Call it with:
   - missing branch in existing mode,
   - duplicate branch already checked out,
   - invalid start ref,
   - incomplete remote config.

Expected:

- Returns `{ ok: true }` for valid payloads.
- Returns `{ ok: false, errors[] }` with specific codes for invalid payloads.

### 7. PR worktree (same repository)

1. Pick an open PR whose head branch is in the same repo.
2. Create session with "Create in PR worktree" enabled.
3. Make a commit in the worktree and run `git push`.

Expected:

- Worktree uses PR head branch.
- Upstream is configured.
- Push succeeds to PR branch.

### 8. PR worktree (fork repository)

1. Pick an open PR from a fork.
2. Create session with "Create in PR worktree" enabled.
3. Confirm dedicated PR remote exists (deterministic `pr-<owner>-<repo>` naming).
4. Make a commit and push.

Expected:

- Worktree is created from fork PR head branch.
- Upstream points to fork remote branch.
- Push succeeds.

### 9. Branch already in use (hard fail, no alias)

1. Ensure branch `feature/in-use` is currently checked out in another worktree.
2. Attempt PR/new worktree creation targeting `feature/in-use`.

Expected:

- Validation fails with `branch_in_use`/`branch_exists` semantics.
- Creation is blocked.
- No alias branch is created.

### 10. Delete behavior with local-branch toggle

1. Delete a worktree with `deleteLocalBranch=false`.
2. Verify worktree is removed and local branch still exists.
3. Recreate and delete with `deleteLocalBranch=true`.
4. Verify both worktree and local branch are removed.

Expected:

- Toggle behavior is respected exactly.

### 11. Setup commands are non-blocking

1. Configure long-running setup command (for example `sleep 20` / platform equivalent).
2. Create a worktree with setup command configured.
3. Measure create response time.

Expected:

- Create returns quickly (does not wait for setup command completion).
- Setup failures do not retroactively fail worktree creation.

## Regression Checks

Run:

1. `bun run type-check`
2. `bun run lint`
3. `bun run build`

Expected:

- All checks pass.

## Notes for QA Reports

- Record payload used for create/validate/delete calls.
- Record exact git command outputs for push/upstream checks.
- Record any mismatches between listed branch and actual checked-out branch.
