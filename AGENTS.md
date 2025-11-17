# OpenChamber - Agent Technical Reference

## Core Purpose

Web interface for OpenCode AI coding agent with cross-device continuity, remote accessibility, unified chat interface sharing OpenCode API backend.

## Tech Stack

- **React 19.1.1**: Modern React with concurrent features
- **TypeScript 5.8.3**: Full type safety
- **Vite 7.1.2**: Build tool with HMR and proxy
- **Tailwind CSS v4.0.0**: Latest `@import` syntax
- **Zustand 5.0.8**: State management with persistence
- **@opencode-ai/sdk ^1.0.65**: Official OpenCode SDK with typed endpoints and SSE
- **@phosphor-icons/react 2.1.10**: Icon system
- **@radix-ui primitives**: Accessible component foundations
- **FlowToken 1.0.40**: Animated text rendering for streaming

## Architecture Overview (Monorepo)

- Workspaces: `packages/ui` (shared UI), `packages/web` (runtime/server/CLI), `packages/desktop` (stub for Phase 2 Tauri). Legacy root `src/` is deprecated.

### Core Components (UI)
In `packages/ui/src/components/`: ChatContainer, MessageList, ChatMessage, StreamingAnimatedText, ChatInput, FileAttachment, ModelControls, PermissionCard, SessionList, SessionSwitcherDialog, DirectoryTree, DirectoryExplorerDialog, MainLayout, Header, Sidebar, RightSidebar, SettingsDialog, AgentsPage, CommandsPage, GitIdentitiesPage, ProvidersPage, SessionsPage, SettingsPage, PromptEnhancerPage, GitTab, DiffTab, TerminalTab, TerminalViewport, PromptRefinerTab, CommandPalette, HelpDialog, ConfigUpdateOverlay, ContextUsageDisplay, ErrorBoundary, MemoryDebugPanel, MobileOverlayPanel, ThemeDemo, ThemeSwitcher

### State Management (UI)
In `packages/ui/src/stores/`: ConfigStore, SessionStore, DirectoryStore, UIStore, FileStore, MessageStore, ContextStore, PermissionStore, AgentsStore, CommandsStore, GitIdentitiesStore, TerminalStore, PromptEnhancerConfig

### OpenCode SDK Integration (UI)
In `packages/ui/src/lib/opencode/`: client.ts wrapper around `@opencode-ai/sdk` with directory-aware API calls, SDK methods (session.*, message.*, agent.*, provider.*, config.*, project.*, path.*), AsyncGenerator SSE streaming (2 retry attempts, 500ms→8s backoff), automatic directory parameter injection, getSystemInfo(). In `packages/ui/src/hooks/`: useEventStream.ts for real-time SSE connection management.

### Web Runtime (server/CLI)
Express server and CLI in `packages/web`: API adapters in `packages/web/src/api`, server in `packages/web/server/index.js` (git/terminal/prompt-enhance/config), prompt templates copied to `packages/web/server/prompt-templates.js` during prebuild, UI bundle imported from `@openchamber/ui`.

### Shared Resources
- Prompt enhancer defaults: `packages/ui/src/assets/prompt-enhancer-config.json` copied to `packages/web/prompt-enhancer-config.json` during prebuild; user overrides persist to `~/.config/openchamber/prompt-enhancer-config.json`.
- Prompt templates: source `packages/ui/shared/prompt-templates.js`, copied into `packages/web/server/prompt-templates.js` for runtime use (not user-editable).

## Development Constraints

**CRITICAL**: DO NOT run dev servers (`pnpm start`, or any command that starts a live server). User manages deployment separately.

### Code Validation Commands
Validate changes without starting servers (monorepo):

```bash
pnpm -r type-check
pnpm -r lint
pnpm -r build
```

**Success indicators:** Build completes without errors → valid/type-safe. Lint passes → follows standards. Errors → address before completing.

### Production Architecture (Reference Only)

- **Web runtime** (`packages/web/server/index.js`): Automatic OpenCode process management, health monitoring, API proxy, static file serving
- **Build output**: `packages/web/dist/` (Vite bundle)
- **Deployment**: User handles via `conductor-deploy.sh` script (web only; desktop stub, Tauri planned)

## Key Patterns

### Section-Based Navigation
Modular section architecture with dedicated pages and sidebars. Sections: Agents, Commands, Git Identities, Providers, Sessions, Settings, Prompt Enhancer. Independent state management and routing. Consistent sidebar patterns with context-aware navigation.

### File Attachments
Drag-and-drop upload with 10MB limit (`FileAttachment.tsx`), Data URL encoding, type validation with fallbacks, integrated via `useFileStore.addAttachedFile()` (`fileStore.ts`)

### Theme System
In `packages/ui/src/lib/theme/`: TypeScript-based themes, CSS variable generation, component-specific theming, Tailwind CSS v4 integration, built-in themes only

### Typography System
In `packages/ui/src/lib/`: Semantic typography with 6 CSS variables, theme-independent scales, typography utilities. **CRITICAL**: Always use semantic typography classes, never hardcoded font sizes

### Markdown & Animation
FlowToken-backed StreamingAnimatedText with diff rendering, semantic markdown presets, soft-break remark plugin

### Streaming Architecture
SDK-managed SSE with AsyncGenerator, temp→real ID swap, pending-user guards, empty-response detection via `window.__opencodeDebug`

### Git Identity Management
Profile-based identity switching, context-aware application, persistent storage with secure credentials

## Development Guidelines

### Lint & Type Safety Guardrails

- Never land code that introduces new ESLint or TypeScript errors. Run `pnpm run lint` and `pnpm exec tsc --noEmit` (or `pnpm run build`) before finalizing changes.
- Adding `eslint-disable` (any rule) requires prior agreement in this document. Inline waivers must be the last resort and accompanied by a comment explaining the blocked typing path.
- Do **not** use `any` or `unknown` casts as a quick escape hatch. When an upstream API lacks types, build a narrow adapter/interface that covers the exact fields you touch. Resorting to `any` requires prior approval in this doc plus an explanatory comment that justifies why typing is impossible right now; a bare TODO does **not** count.
- Refactors or new features must keep the existing lint/type baselines green. If a pending task can’t meet that bar, pause and escalate instead of papering over errors.

### Theme Integration Requirements

- **Check theme definitions** before adding any color or font size to new components
- **Typography system**: Always use theme-defined typography classes or utilities, never hardcoded font sizes
- **Color consistency**: Reference existing theme colors in `themes/` instead of adding new ones
- **Component theming**: Ensure new components support both light and dark themes
- **CSS variables**: Use theme-generated CSS variables for dynamic styling

### Code Standards

- **Functional components**: Exclusive use of function components with hooks
- **Custom hooks**: Logic extraction for reusability
- **Type-first development**: Comprehensive TypeScript usage
- **Component composition**: Prefer composition over inheritance



## Feature Implementation Map

### Directory & File System
In `packages/ui/src/components/session/`: DirectoryTree, DirectoryExplorerDialog. SessionSwitcher with 44px shared height controls. In `packages/ui/src/stores/`: DirectoryStore. Backend API: `packages/ui/src/lib/opencode/client.ts` + `packages/web/server/index.js` with `listLocalDirectory()`, `getFilesystemHome()`, `getSystemInfo()`

### Session Switcher UX
Component: `SessionSwitcherDialog.tsx`. Collapsible date groups with `[caret][trash][label]` headers. Mobile parity with `MobileOverlayPanel`. Git worktree and shared session chips using theme status tokens. Top-right controls with copy/share, worktree metadata, streaming indicators.

### Settings & Configuration System
In `packages/ui/src/components/layout/`: SettingsDialog. In `packages/ui/src/constants/`: sidebar.ts configuration.

#### Configuration Tabs
In `packages/ui/src/components/sections/`: AgentsPage, CommandsPage, GitIdentitiesPage, ProvidersPage, SessionsPage, SettingsPage, PromptEnhancerPage with corresponding sidebars. In `packages/ui/src/components/right-sidebar/`: PromptRefinerTab. Related stores: useAgentsStore, useCommandsStore, useConfigStore, useGitIdentitiesStore, usePromptEnhancerConfig.

#### Appearance Settings
In `packages/ui/src/components/sections/settings/`: SettingsPage, AppearanceSettings with theme preferences, markdown reading mode, interface/code font selection, typography sizes (desktop), automatic persistence. Related hooks: useMarkdownDisplayMode, useFontPreferences, useTypographySizes. Related utilities: markdownDisplayModes, fontOptions, typographyPresets, appearancePersistence.

### Git Operations
In `packages/ui/src/components/right-sidebar/`: GitTab, DiffTab. In `packages/ui/src/stores/`: useGitIdentitiesStore. Backend API: `packages/ui/src/lib/gitApi.ts` + `packages/web/server/index.js` (Simple-git wrapper)

### Terminal
In `packages/ui/src/components/right-sidebar/`: TerminalTab, TerminalViewport (Xterm.js with FitAddon). In `packages/ui/src/stores/`: useTerminalStore. In `packages/ui/src/lib/`: terminalTheme. Backend API: `packages/ui/src/lib/terminalApi.ts` + `packages/web/server/index.js` (Node-pty wrapper with SSE)

### OpenCode Process Management
In `packages/ui/src/components/layout/`: Header with `handleReloadConfiguration`. In `packages/ui/src/stores/`: useAgentsStore with `reloadOpenCodeConfiguration`. Production server: `packages/web/server/index.js`

### Streaming & Diagnostics
In `packages/ui/src/stores/`: messageStore (temp→real ID swap), useSessionStore (messageStreamStates, pending-user guards). In `packages/ui/src/lib/`: debug.ts (`window.__opencodeDebug`). In `packages/ui/src/hooks/`: useEventStream (SSE connection)

### Theme System
In `packages/ui/src/lib/theme/`: themes (2 definitions - Flexoki Light and Dark), cssGenerator, syntaxThemeGenerator. In `packages/ui/src/components/providers/`: ThemeProvider

### Font System
In `packages/ui/src/lib/`: fontOptions. In `packages/ui/src/styles/`: fonts.ts. In `packages/ui/src/hooks/`: useFontPreferences

### Mobile & UX
In `packages/ui/src/components/ui/`: MobileOverlayPanel. In `packages/ui/src/hooks/`: useEdgeSwipe, useChatScrollManager


# OpenChamber Development Session

## Context Setup

Make sure you have context from AGENTS.md file.
OpenCode API specs available at: http://127.0.0.1:4101/doc

## Team Structure & Expertise

- **Me (Bohdan)**: Professional Senior DevOps TeamLead with strong infrastructure/systems knowledge but limited web development & Node.js TypeScript syntax experience
- **You (Assistant)**: Primary technical advisor and developer - responsible for all technical decisions, complete implementations, and optimal balance between performance and user experience

## Technical Communication Guidelines

- **Decision Making**: You make all technical decisions independently - no half-solutions or "someone else will finish this"
- **Explanations**: When mentioning technical terms (useEffect, hooks, etc.), provide brief 2-3 word explanations in parentheses
- **Completeness**: Always provide complete, production-ready solutions

## Development Workflow

- **Assistant**: Code development, syntax validation, complete feature implementation
- **Bohdan**: Uses `conductor-setup.sh` (dependency install) and `conductor-deploy.sh` (build, package, remote deploy) to validate and stage releases, then reports results or issues.
- **No execution**: Assistant should not attempt to run dev servers or execute code

## Session Start Protocol

1. Read project context from AGENTS.md
2. Confirm understanding of current project state
3. Wait for specific development tasks
4. Provide complete technical solutions with brief explanations when needed
