# Sessions Sidebar Redesign Requirements

## Goal

Redesign the sessions left sidebar with beautiful, minimalistic, and professional design incorporating sessions list and worktrees functionality.

## Header Modifications

### Enhance Button (+)

- Trigger dropdown with two options:
  - Create Session
  - Create Worktree

Make directory name to be part of clicable area of a directory selection button

### Session Creation Form

- Always require worktree selection
- Include main (non-linked) worktree as default option

## Session Organization

### Grouping Structure

- **Main Group**: Sessions without linked worktrees (using project root)
- **Worktree Groups**: Sessions grouped under their respective worktrees

### Invalid Sessions

- Display sessions with non-existent directories as inactive/non-selectable
- Allow removal of invalid sessions

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
- Active streaming indicator
- Modified lines count (+312/-46) from session summary
  - Source: `/session` endpoint at `http://127.0.0.1:4101/doc`, check the correct value we should use, this has to be investigated

## Technical Requirements

### Styling

- Use existing project variables (themes, typography sizes)
- Maintain current text/color system

### Updates

- Refresh session list after each assistant streaming completion. This will allow to detect newly created subsessions by assistant
- Don't rely solely on manual refresh

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
