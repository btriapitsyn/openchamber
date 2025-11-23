# Sessions Sidebar Redesign Requirements

## Goal

Redesign the sessions left sidebar with beautiful, minimalistic, and professional design incorporating sessions list and worktrees functionality.

## Header Modifications

### Enhance Button (+)

- Trigger dropdown with two options:
  - Create Session
  - Create Worktree (automatically creates new session in the worktree)

Make directory name to be part of clicable area of a directory selection button

### Session Creation Form

- Always require worktree selection
- Rename existing "without linked worktree" option to "Main" as default option

## Session Organization

### Grouping Structure

- **Main Group**: Sessions where `session.directory === project_root`
- **Worktree Groups**: Sessions where `session.directory === worktree.path`, grouped by worktree
- **Group Header**: Display branch name from `git worktree list --porcelain`
- **Empty Worktrees**: Display as empty groups to indicate session creation availability
- **Session Order**: By date (most recent first) within each group
- **Collapse/Expand**: Worktree groups and sessions with subsessions can be collapsed/expanded
- **State Persistence**: Collapse/expand state persisted across sessions

## Session Management

### Removal Logic

- **Session removal**: Remove only session and its subsessions
- **Worktree removal**: Remove worktree and all associated sessions/subsessions
- No longer remove worktree or branch when removing individual sessions

## Session Item Display

Each session item must include:

- Session name
- Date display (today, yesterday, or actual date)
- Conditional badge for shared sessions (when applicable)
- Three-dot menu with dropdown
- Hover effect with highlight (matching dropdown item style)
- Expandable accordion for subsessions (parentID matches session ID)
- Active streaming indicator badge (for both background and currently selected sessions)
- Selected session highlight (simple visual highlight)
- Modified lines count: `+{session.summary.additions}/-{session.summary.deletions}` (e.g., +55/-58)
  - Hide if summary is null or both additions and deletions are 0

## Technical Requirements

### Styling

- Use existing project variables (themes, typography sizes)
- Maintain current text/color system

### Updates

- Refresh session list after each assistant streaming completion to detect newly created subsessions
- Instant refresh on worktree deletion or session deletion
- Don't rely solely on manual refresh

### Session Directory Querying

**API Endpoint:** `GET /session?directory={path}`

**Available Backend:**
- `listWorktrees(projectDirectory)` - returns all git worktrees (web & desktop)
- Uses `git worktree list --porcelain` command
- Returns worktree objects with path, branch, head

**Implementation Strategy:**
1. Check if project is git repository before attempting worktree operations
2. If git repo: Call `listWorktrees(projectDirectory)` and filter for paths containing `/.openchamber/`
3. Query `/session?directory={project_root}` → main project sessions
4. Query `/session?directory={worktree.path}` for each `.openchamber/` worktree → worktree sessions
5. Merge results, deduplicate by `session.id`

**Error Handling:**
- If not git repository or worktree query fails: Display only main group using project root
- No failure needed - gracefully fall back to single-group display

**Note:** Sessions form separate pools (main vs worktrees). Each directory must be queried explicitly.

**Important:** Worktree operations and worktree session creation must NOT modify the workspace project directory variable. The directory selected via directory picker remains the project root until explicitly changed by user. Worktree paths are used only for session queries and for setting directory for new sessions attached to a worktree, not for changing the active workspace directory value.

## Design Constraints

### Header

- Keep directory display and selection button
- Maintain session creation button
- Preserve directory picker logic (custom for web, native for desktop)
- Redesign appearance only if necessary

### Spacing

- Minimize wasted space
- Keep padding minimal but functional
- Maximize utilization of available space
- Avoid excessive airiness between elements
