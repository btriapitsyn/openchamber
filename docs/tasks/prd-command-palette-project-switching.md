# PRD: Command Palette Project Switching

## Introduction

Add project entries to the command palette (Ctrl+K) so users can quickly switch between projects by typing a project name. Currently, project switching requires using the ProjectRail sidebar or the session sidebar dropdown — there's no keyboard-driven way to jump between projects. This adds projects as searchable items in the existing command palette fuzzy finder.

## Goals

- Allow switching projects from the command palette by typing a project name
- Leverage the existing `cmdk` fuzzy matching — no custom search logic needed
- Show projects only when the user has 2+ projects (consistent with ProjectRail visibility)
- Keep the active project visually indicated

## User Stories

### US-001: Show projects in command palette

**Description:** As a user with multiple projects, I want to see my projects listed in the command palette so that I can switch to one by typing its name and pressing Enter.

**Acceptance Criteria:**

- [ ] A "Projects" group appears in the command palette when the user has 2+ projects
- [ ] Each project is listed with its label (or derived directory name) and path
- [ ] The currently active project shows a checkmark indicator
- [ ] Selecting a project calls `setActiveProject` and closes the palette
- [ ] The projects group does NOT appear when there is only 0 or 1 project
- [ ] `cmdk` built-in filtering works on project names (user can type to narrow results)
- [ ] Typecheck/lint passes

## Functional Requirements

- FR-1: Read projects from `useProjectsStore` (`projects`, `activeProjectId`)
- FR-2: Render a "Projects" `<CommandGroup>` between the "Actions" and "Theme" groups, separated by `<CommandSeparator>`
- FR-3: Each project renders as a `<CommandItem>` with a folder icon, the project label, and the path shown as secondary text
- FR-4: The active project shows a `<RiCheckLine>` icon on the right (same pattern as theme selection)
- FR-5: Clicking/selecting a project item calls `setActiveProject(project.id)` then closes the palette
- FR-6: The "Projects" group is only rendered when `projects.length >= 2`

## Non-Goals

- No ability to add/remove/rename projects from the command palette
- No project-scoped session search from the palette
- No custom fuzzy matching — rely on `cmdk` default filtering
- No keyboard shortcut specifically for project switching (just use Ctrl+K then type)

## Technical Considerations

- The `CommandPalette.tsx` component already imports most of the needed primitives (`CommandGroup`, `CommandItem`, `CommandSeparator`, etc.)
- `useProjectsStore` provides `projects`, `activeProjectId`, and `setActiveProject` — all needed state and actions
- Use `RiFolderLine` from Remixicon for the project icon (consistent with codebase icon usage)
- The project label comes from `project.label` falling back to the last segment of `project.path`

## Success Metrics

- User can switch projects in under 3 keystrokes after opening the palette (Ctrl+K → type first letters → Enter)
- No regression in command palette performance or existing functionality
