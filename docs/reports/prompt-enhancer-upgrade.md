# Prompt Enhancer Upgrade Summary

## Scope

- Enabled persistent configuration editing for Prompt Enhancer presets, covering add/remove of groups & options.
- Delivered consistent sidebar UX with direct creation buttons and per-group delete actions.
- Added server + desktop persistence and dynamic runtime integration for refined prompt generation.
- Added preview tooling that exposes the full assembled prompt, project context, and repository diff with opt-in controls.
- Centralized all prompt templates and instructions in dedicated configuration files for easy customization.
- Enhanced UI protection for built-in options to prevent accidental modification during app updates.

## Key Implementation Details

### Backend & Persistence

- `server/index.js` exposes `GET/PUT /api/config/prompt-enhancer`, storing data under `~/.openchamber/prompt-enhancer-config.json`.
- Created `server/prompt-templates.js` centralizing all prompt instructions:
  - `BASE_INSTRUCTIONS` - core instructions always included
  - `CONDITIONAL_INSTRUCTIONS` - context-dependent instructions (project context, repository diff, diff digest)
  - `buildSystemPrompt()` - system prompt for AI that generates refined prompts
- Fixed proxy middleware to exclude `/api/config/prompt-enhancer` from OpenCode proxying (server/index.js:1524-1562).
- Fixed Electron `.asar` packaging using `fs.readFileSync()` instead of `createRequire()` for defaults loading.
- Added `prompt-enhancer-defaults.json` to `electron-builder.yml` files list for proper bundling.

### State Management & Data Flow

- Created Zustand store (`src/stores/usePromptEnhancerConfig.ts`) with dynamic group management, remote/desktop sync, and sanitization.
- Normalized all group IDs to lowercase for consistency between client and server (CORE_PROMPT_ENHANCER_GROUP_IDS).
- Added deduplication logic in both client and server config sanitization to prevent duplicate groups.
- Implemented `getDefaultPromptEnhancerConfig()` export for runtime default config access.

### UI & UX

- Prompt Enhancer UI updates (`src/components/sections/prompt-enhancer/*`, `src/components/right-sidebar/PromptRefinerTab.tsx`) support configurable group order, multi-select sets, and cloning.
- Sidebar UX unified across sections (Agents, Commands, Git Profiles, Prompt Enhancer) with uppercase section headers for clear visual hierarchy.
- Added "Built-in" badge and read-only protection for default option instructions to prevent override during updates.
- Built-in options cannot be deleted; only custom options show delete action in dropdown menu.
- Applied consistent `rounded` border-radius to all input fields matching button styling.
- Removed redundant desktop sync buttons from settings header (desktop uses same server persistence).
- Right sidebar now offers checkboxes for including project context and live repository diffs; previews mirror these selections and surface diff payloads when available.

## Verification Steps

### Build & Package

1. `pnpm run build` to ensure TypeScript + Vite compile.
2. `pnpm run package:electron` to verify `.asar` packaging includes `prompt-enhancer-defaults.json`.
3. Launch packaged Electron app to confirm no "Cannot find module" errors for defaults file.

### API & Persistence

4. Run `pnpm run start` and hit `GET /api/config/prompt-enhancer` to confirm persisted config loads.
5. Verify both dev (`pnpm run dev`) and production modes can save/load config via `/api/config/prompt-enhancer`.
6. Check `~/.openchamber/prompt-enhancer-config.json` file exists after first save and contains normalized lowercase IDs.

### UI Functionality

7. In UI, add/remove custom groups & options; verify sidebar updates immediately and copy refinements succeed.
8. Verify built-in options show "Built-in" badge and have disabled instruction field with explanatory tooltip.
9. Confirm built-in options cannot be deleted (no delete action in dropdown menu).
10. Toggle "Include project context" and "Include repository diff" in the Prompt Refiner, open the prompt preview, and confirm both sections appear with expected content (or clear empty-state messaging when no changes exist).
11. Check sidebar section headers ("DEFAULT GROUPS", "CUSTOM GROUPS", etc.) are uppercase and visually distinct across all sections (Prompt Enhancer, Agents, Git Identities).

### Prompt Customization

12. Edit `server/prompt-templates.js` BASE_INSTRUCTIONS and restart server to verify changes apply.
13. Edit `prompt-enhancer-defaults.json` option instructions and reload config to verify UI reflects changes.
14. Confirm no duplicate groups appear after config reset or server restart.

## Configuration Files

### Prompt Template Customization

All prompt-related text for the enhancer is centralized in two files:

**`prompt-enhancer-defaults.json`** - UI configuration and option instructions:
- Group definitions (label, helperText, summaryHeading, multiSelect)
- Option sets (id, label, summaryLabel, description, instruction)
- Group order and default selections
- User can override via `~/.openchamber/prompt-enhancer-config.json`

**`server/prompt-templates.js`** - Core prompt logic (not editable via UI):
- `BASE_INSTRUCTIONS` - always included in refined prompts
- `CONDITIONAL_INSTRUCTIONS` - added based on user selections (projectContext, repositoryDiff, diffDigest)
- `buildSystemPrompt()` - system prompt for AI that structures refined output

Changes to either file require server restart (`pnpm run start` or Electron app restart) to take effect.

### Update Merge Behavior

When app updates with new defaults:

**User customizations preserved:**
- Group labels, helper text, summaryHeading
- Custom groups and their options
- Selected default options

**Automatically merged:**
- New built-in options added to existing groups
- Updated instructions for built-in options (overrides user edits)

**Protected from deletion:**
- Built-in options cannot be removed via UI
- Core groups (implementationmode, scope, testing, etc.) always present
