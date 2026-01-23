# GitHub Features Plan (PRD-ish)

Goal: implement GitHub-powered workflows (PR panel + start sessions from Issue/PR) on top of the existing GitHub auth foundation.

Non-goals (for this phase)
- Rebuild auth/token storage (already implemented)
- Rebuild worktree lifecycle/cleanup (already implemented)
- Add hard context size caps/fallback logic (explicitly out of scope)

## Existing Primitives (MUST reuse)

These already exist; do not reinvent.

GitHub auth + connected user
- UI: `packages/ui/src/components/sections/openchamber/GitHubSettings.tsx`
- Runtime API: `GitHubAPI` in `packages/ui/src/lib/api/types.ts`
- Web endpoints: `packages/web/server/index.js` (`/api/github/*`)
- Desktop Tauri commands: `packages/desktop/src-tauri/src/commands/github.rs`
- VS Code bridge + storage: `packages/vscode/src/bridge.ts`, `packages/vscode/src/githubAuth.ts`

Projects and directories
- Projects store (one project == one repo path): `packages/ui/src/stores/useProjectsStore.ts`
- Active project selection is already used across the app; use it to scope all GitHub operations.

Worktree sessions
- Worktree creation and session wiring:
  - `packages/ui/src/lib/worktreeSessionCreator.ts`
  - Reuse `createWorktreeSession()` and `createWorktreeSessionForBranch(projectDirectory, branchName)`.
- Worktree cleanup/delete behavior is already present in session deletion flow:
  - `packages/ui/src/components/session/SessionDialogs.tsx`

“Synthetic parts” / hidden context in chat
- SDK supports `TextPartInput.synthetic?: boolean`:
  - `node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts`
- UI filters synthetic parts out of rendering:
  - `packages/ui/src/lib/messages/synthetic.ts`
- Existing “seed new session from assistant answer” uses a hidden preface part:
  - `packages/ui/src/stores/useSessionStore.ts` (`createSessionFromAssistantMessage`)
  - `packages/ui/src/lib/opencode/client.ts` (`sendMessage({ prefaceText })`)

Git tab layout
- Git view where PR panel will be inserted:
  - `packages/ui/src/components/views/GitView.tsx`
- Changes + Commit already exist; History is below.

## Guiding Principles

- One directory/project == one git repo. All GitHub actions are scoped to the active project.
- Do not show synthetic context to the user; only show the human prompt.
- If the user lacks permission for an operation (merge, create branch, etc), degrade to “Open in GitHub”.
- Prefer server-side Octokit for web runtime; for desktop/vscode, implement equivalent runtime commands/bridge handlers.
- Keep UI consistent with existing patterns (provider OAuth, worktree sessions, commit message generation).

## Feature A: Git Tab PR Panel (Create / Status / Merge)

Status: implemented.

### Intent
While working on a feature branch, show PR status and actions inside the Git tab, without leaving the app.

### Placement
Implemented between Commit and History in `packages/ui/src/components/views/GitView.tsx`.

### Visibility Rules
- Show only if:
  - repo is detected (`isGitRepo === true`)
  - branch is not the “base branch”

Base branch source (reuse existing config):
- `activeProject.worktreeDefaults.baseBranch` from `packages/ui/src/stores/useProjectsStore.ts`
- fallback default: `main`

### UI States
1) GitHub not connected
- Show CTA: “Connect GitHub” (link to Settings -> OpenChamber -> GitHub).

2) Connected but repo not resolvable to GitHub
- Show “Open remote in browser” if remote URL exists.
- Show error text explaining remote must be GitHub.

3) PR does not exist for current branch
- Show create form:
  - base branch (default: baseBranch)
  - title (default from branch name)
  - draft toggle
  - description textarea
  - “Generate description” button (AI)
  - “Create PR” button

4) PR exists
- Show summary:
  - state (draft/open/merged)
  - PR number + title
  - checks summary
  - mergeability (if available)
  - “Open in GitHub”
- If user has merge permission and PR is mergeable:
  - merge method dropdown (merge/squash/rebase)
  - “Merge” button
- If PR is draft:
  - “Ready” button (mark ready for review)
  - Merge disabled until ready
- If cannot merge:
  - disable merge button + show “Open in GitHub”

### AI “Generate description”
Implemented as a PR-specific generator (separate prompt/endpoint/command).

Inputs:
- base branch ref (prefers `origin/<base>` when available)
- head branch ref
- committed range diff: `git diff <base>...<head>` (file list from `git diff --name-only <base>...<head>`)

Output:
- `title` (<= 80 chars, no commit-style prefixes)
- `body` (GFM markdown sections: Summary/Testing/Notes)

### Required GitHub API Calls
- Resolve repo from git remote URL (origin)
- Find PR by head branch
- Create PR
- Get PR details + checks
- Merge PR
- Mark PR ready for review (GraphQL)

Checks logic (implemented):
- prefer GitHub Actions check-runs (`/commits/{sha}/check-runs`)
- fallback to classic commit statuses (`/commits/{sha}/status`)

### Implementation Notes
- Web runtime should use server endpoints + Octokit (token stays server-side).
- Desktop/vscode should use their runtime handlers (similar to GitHub auth) to avoid exposing token.

Implemented code pointers
- UI section: `packages/ui/src/components/views/git/PullRequestSection.tsx`
- Web server endpoints:
  - `GET /api/github/pr/status`
  - `POST /api/github/pr/create`
  - `POST /api/github/pr/merge`
  - `POST /api/github/pr/ready`
- PR description generator:
  - `POST /api/git/pr-description`
  - Desktop: `generate_pr_description`
  - VS Code: `api:git/pr-description`

## Feature B: Start Session From GitHub Issue

### Intent
Create a new session seeded with issue context, without polluting chat with large issue bodies/comments.

### Entry Point
Session kebab menu in `packages/ui/src/components/session/SessionSidebar.tsx`.

Add new item:
- “New session from GitHub issue…”

### Modal UI
Issue picker modal:
- list issues for current repo (open by default)
- search by title/number
- direct input:
  - full URL
  - `#123` or `123`
- checkbox: “Create in worktree”

### Worktree option
If enabled:
- create a worktree session (reuse `createWorktreeSessionForBranch`)
- branch naming convention:
  - `issue-<number>-<slug>` (slug derived from title)
- base branch:
  - `activeProject.worktreeDefaults.baseBranch`

If disabled:
- create normal session in project root directory.

### Session Bootstrap (message)
Send a single user message with:
1) Visible text part: concise prompt, e.g.
   - “Review the issue, clarify requirements, propose plan, then implement.”
2) Hidden synthetic parts: issue payload
   - issue title/body
   - labels, assignees, author
   - comments (ordered)
   - metadata (repo, number, url)

This must use SDK-supported `TextPartInput.synthetic = true` so it is not rendered.
Do not invent a new hidden-context mechanism.

### Required GitHub API Calls
- List issues
- Get issue by number
- List issue comments

## Feature C: Start Session From GitHub PR (with worktree checkout)

### Intent
Create a session seeded with PR context, with optional worktree checkout of PR branch (including forks).

### Entry Point
Session kebab menu in `packages/ui/src/components/session/SessionSidebar.tsx`.

Add new item:
- “New session from GitHub PR…”

### Modal UI
PR picker modal:
- list open PRs
- search by title/number
- direct input:
  - full URL
  - `#123` or `123`
- checkbox: “Create session in PR worktree”

### Worktree behavior
If enabled:
- if PR is from same repo:
  - fetch head branch
  - create worktree from that branch (reuse `createWorktreeSessionForBranch`)
- if PR is from fork:
  - add temporary remote (derived from PR head repo clone URL)
  - fetch `<head.ref>`
  - create worktree

Fallbacks:
- if fetch/remote fails or permission denied:
  - still create a normal session with PR context
  - show toast with “Open in GitHub” action

### Session Bootstrap (message)
Same synthetic-parts approach as Issues.

Hidden parts should include:
- PR title/body
- PR comments + review comments
- changed files list
- optionally full diff (explicitly no caps)
- checks/status summary

Visible prompt text should instruct:
- review PR intent
- identify risks
- propose changes
- optionally implement changes in checked-out branch/worktree

### Required GitHub API Calls
- List PRs
- Get PR
- List issue comments for PR
- List review comments
- List files
- Get checks/status

## Cross-cutting: “Synthetic Parts” Sending API

Current behavior:
- `opencodeClient.sendMessage()` supports `prefaceText` which becomes a separate `TextPartInput`.
- There is no first-class way (yet) to mark arbitrary parts as `synthetic: true` from callsites.

Required change (shared for Features B/C):
- Extend `opencodeClient.sendMessage()` (in `packages/ui/src/lib/opencode/client.ts`) to support synthetic parts.

Recommended minimal API change:
- allow `prefaceTextSynthetic?: boolean` (default true when used for hidden context)
- allow `additionalParts?: Array<{ text: string; synthetic?: boolean; files?: ... }>`
- ensure generated `TextPartInput` includes `synthetic` when requested

This should reuse the existing filtering/rendering logic (no new UI hacks).

## Cross-cutting: Repo Resolution

Need a single helper to map current project repo -> GitHub owner/repo.

Inputs:
- project directory root
- git remote URL (origin)

Behavior:
- support common GitHub URL formats:
  - `git@github.com:OWNER/REPO.git`
  - `https://github.com/OWNER/REPO.git`
  - `https://github.com/OWNER/REPO`

Output:
- `{ owner, repo }` or null

Use this for all GitHub feature endpoints.

## Cross-cutting: Permission / Fallback Rules

- Merge button enabled only if merge endpoint succeeds or mergeability indicates allowed.
- If not allowed:
  - show “Open in GitHub” as primary action
- For PR worktrees from forks:
  - if remote add/fetch fails => create normal session + “Open in GitHub”

## Work Breakdown (Suggested Order)

Phase 1: Shared plumbing
1) Repo resolution helper (remote URL -> owner/repo)
2) New message sending helper supporting `synthetic: true` parts
3) GitHub endpoints/commands for issue + PR fetch (read-only)

Phase 2: Session bootstrap flows
4) Issue picker modal + session bootstrap
5) PR picker modal + session bootstrap
6) PR worktree checkout (fork support)

Phase 3: Git tab PR panel
7) PR detect/status in Git tab
8) Create PR from branch
9) AI generate PR description
10) Merge (with fallback)

## Open Questions (for later)

- PR description generator prompt format: do we want the exact same “highlights” UI as commit gen, or a single-shot body generation?
- Worktree naming collision strategy for PR-based worktrees (owner/ref collisions) beyond current `sanitizeWorktreeSlug`.
