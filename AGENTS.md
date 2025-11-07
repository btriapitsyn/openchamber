# OpenChamber - Agent Technical Reference

## Core Purpose

Complementary web interface for OpenCode AI coding agent. Provides cross-device continuity, remote accessibility, and unified chat interface sharing OpenCode API backend for consistent session management.

## Tech Stack

- **React 19.1.1**: Modern React with concurrent features
- **TypeScript 5.8.3**: Full type safety across codebase
- **Vite 7.1.2**: Build tool with HMR and development proxy
- **Tailwind CSS v4.0.0**: Latest version using new `@import` syntax
- **Zustand 5.0.8**: Primary state management with persistence
- **@opencode-ai/sdk ^1.0.11**: Official OpenCode SDK with typed endpoints and SSE helpers
- **@phosphor-icons/react 2.1.10**: Icon system throughout interface
- **@radix-ui primitives**: Accessible component foundations
- **FlowToken 1.0.40**: Animated text rendering for streaming content

## Architecture Overview

### Core Components
- **Chat Interface** (`src/components/chat/`): ChatContainer, MessageList, ChatMessage, StreamingAnimatedText (FlowToken), ChatInput, FileAttachment, ModelControls, PermissionCard, PermissionRequest, ServerFilePicker, StreamingTextDiff
- **Session Management** (`src/components/session/`): SessionList, SessionSwitcherDialog (desktop `CommandDialog` + mobile `MobileOverlayPanel` with shared search/directory/create controls), DirectoryTree, DirectoryExplorerDialog
- **Layout** (`src/components/layout/`): MainLayout, Header, Sidebar, SidebarContextSummary, RightSidebar, SettingsDialog
- **Sections** (`src/components/sections/`): AgentsPage, CommandsPage, GitIdentitiesPage, ProvidersPage, SessionsPage, SettingsPage, PromptEnhancerPage with corresponding sidebars
- **Right Sidebar Tabs** (`src/components/right-sidebar/`): GitTab, DiffTab, TerminalTab, TerminalViewport, PromptRefinerTab
- **UI Components** (`src/components/ui/`): CommandPalette, HelpDialog, ConfigUpdateOverlay, ContextUsageDisplay, ErrorBoundary, MemoryDebugPanel, MobileOverlayPanel, ThemeDemo, ThemeSwitcher, shadcn/ui primitives
- **Theme System** (`src/lib/theme/`): TypeScript-based themes with CSS variable generation
- **Hooks & Utilities** (`src/hooks/`, `src/lib/`): `useChatScrollManager`, `useEventStream`, `useFontPreferences`, `useKeyboardShortcuts`, `useMarkdownDisplayMode`, typography helpers, streaming diagnostics

### State Management
- **ConfigStore** (`src/stores/useConfigStore.ts`): Application configuration and server connection
- **SessionStore** (`src/stores/useSessionStore.ts`): Chat sessions and message handling
- **DirectoryStore** (`src/stores/useDirectoryStore.ts`): Working directory context
- **UIStore** (`src/stores/useUIStore.ts`): Interface state and user preferences
- **FileStore** (`src/stores/fileStore.ts`): File attachments and server file management
- **MessageStore** (`src/stores/messageStore.ts`): Message state and streaming lifecycle management with temp→real ID swap
- **ContextStore** (`src/stores/contextStore.ts`): Context usage tracking and token management
- **PermissionStore** (`src/stores/permissionStore.ts`): Permission handling and requests
- **AgentsStore** (`src/stores/useAgentsStore.ts`): Agent configuration and management, OpenCode restart logic
- **CommandsStore** (`src/stores/useCommandsStore.ts`): Slash commands management
- **GitIdentitiesStore** (`src/stores/useGitIdentitiesStore.ts`): Git identity profiles and switching
- **TerminalStore** (`src/stores/useTerminalStore.ts`): Terminal session state management
- **PromptEnhancerConfig** (`src/stores/usePromptEnhancerConfig.ts`): Prompt refinement configuration and persistence

### OpenCode SDK Integration
- **OpencodeService client** (`src/lib/opencode/client.ts`): Wrapper around `@opencode-ai/sdk` with directory-aware API calls
  - SDK methods: `session.*` (list, create, get, delete, update), `message.*` (list, get, stream), `agent.*`, `provider.*`, `config.*`, `project.*`, `path.*`
  - AsyncGenerator SSE streaming for real-time message updates with 2 retry attempts and 500ms→8s backoff
  - Automatic `directory` query parameter injection for all SDK calls
  - `getSystemInfo()` - derives home directory from multiple sources (path info, project worktree, sessions, localStorage)
- **Event Stream hook** (`src/hooks/useEventStream.ts`): Real-time SSE connection management for message streaming and permission handling

### OpenChamber Backend Services
Custom Express server endpoints (NOT part of OpenCode SDK):
- **Git operations** (`src/lib/gitApi.ts`): Simple-git wrapper via `/api/git/*` endpoints
  - `getGitStatus`, `getGitDiff`, `checkIsGitRepository`, `getBranches`, `createCommit`, `stageFiles`, `unstageFiles`, `discardChanges`
  - Server implementation: `server/index.js` git routes
- **Terminal sessions** (`src/lib/terminalApi.ts`): Node-pty wrapper via `/api/terminal/*` endpoints
  - `createTerminalSession`, `connectTerminalStream` (SSE with reconnect logic), `sendTerminalInput`, `closeTerminal`, `resizeTerminal`
  - Server implementation: `server/index.js` terminal routes with WebSocket-like SSE streaming
- **Prompt enhancement** (`src/lib/promptApi.ts`): AI-powered prompt refinement via `/api/prompt-enhance/*` endpoints
  - `enhancePrompt`, `getEnhancementPreview` - uses OpenCode agents internally for prompt generation
  - Server implementation: `server/index.js` prompt routes

## Development Constraints

**CRITICAL**: DO NOT run dev servers (`npm run dev`, `npm start`, or any command that starts a live server). User manages deployment separately.

### Code Validation Commands
Validate changes without starting servers:

```bash
# TypeScript compilation check - catches syntax and type errors
npm run build

# Alternative: TypeScript check only (faster, no bundle)
npx tsc --noEmit

# Lint check for code quality issues
npm run lint
```

**Success indicators:**
- Build completes without errors → code is syntactically valid and type-safe
- Lint passes → code follows project style standards
- If errors appear → address them before completing task

### Production Architecture (Reference Only)
- **Express server** (`server/index.js`): Automatic OpenCode process management, health monitoring, API proxy, static file serving
- **Build output**: `dist/` (Vite bundle) + `dist-electron/` (Electron build)
- **Deployment**: User handles via `conductor-deploy.sh` script

## Key Patterns

### Section-Based Navigation
- Modular section architecture with dedicated pages and sidebars for different features
- Sections: Agents, Commands, Git Identities, Providers, Sessions, Settings, Prompt Enhancer
- Each section has independent state management and routing
- Consistent sidebar patterns with context-aware navigation

### File Attachments
- Drag-and-drop upload with 10MB limit (`src/components/chat/FileAttachment.tsx`)
- Data URL encoding for transmission
- Type validation with fallbacks
- Integrated into message parts via `useFileStore.addAttachedFile()` (`src/stores/fileStore.ts`)

### Theme System
- TypeScript-based themes with comprehensive color definitions (`src/lib/theme/themes/`)
- Runtime CSS variable generation (`src/lib/theme/cssGenerator.ts`)
- Component-specific theming (markdown, chat, tools, terminal)
- Tailwind CSS v4 integration with `@theme` directives
- Built-in themes only (custom theme support removed)

### Typography System
- Semantic typography system with 6 CSS variables for font sizes (`src/lib/typography.ts`)
- Theme-independent typography scales for consistent text sizing across semantic roles
- CSS variables: `--text-markdown`, `--text-code`, `--text-ui-header`, `--text-ui-label`, `--text-meta`, `--text-micro`
- Typography utilities organized by semantic role: `typography.semanticMarkdown`, `typography.uiLabel`, etc.
- **CRITICAL**: Always use semantic typography classes or utilities, never hardcoded font sizes

### Markdown & Animation
- FlowToken-backed `StreamingAnimatedText` renders assistant content with `sep="diff"`, 0.10s fade-in, and animation can be disabled via `shouldAnimate` (`src/components/chat/StreamingAnimatedText.tsx`)
- Semantic markdown presets ensure uniform line-height, heading weights, and list indentation across desktop and mobile (`src/components/chat/message/markdownPresets.tsx`)
- User markdown uses a soft-break remark plugin so Shift+Enter keeps line breaks intact

### Streaming Architecture
- SDK-managed SSE via `@opencode-ai/sdk` ^1.0.11 (AsyncGenerator stream with 2 retry attempts, 500ms→8s backoff) for stable delivery
- Temporary `temp_*` IDs are replaced with server-issued message IDs, preserving optimistic UI without breaking Claude responses (`src/stores/messageStore.ts`)
- Pending-user guards and role preservation inside `useSessionStore` prevent assistant echoes; message lifecycles tracked through `messageStreamStates` (`src/stores/useSessionStore.ts`)
- Empty-response detection surfaces single toasts and exposes diagnostics via `window.__opencodeDebug` helpers (`src/lib/debug.ts`)

### Git Identity Management
- Profile-based Git identity switching with comprehensive operation support (`src/stores/useGitIdentitiesStore.ts`)
- Context-aware identity application for commits and operations
- Persistent identity storage with secure credential management

## Development Guidelines

### Lint & Type Safety Guardrails
- Never land code that introduces new ESLint or TypeScript errors. Run `npm run lint` and `npx tsc --noEmit` (or `npm run build`) before finalizing changes.
- Adding `eslint-disable` (any rule) requires prior agreement in this document. Inline waivers must be the last resort and accompanied by a comment explaining the blocked typing path.
- Do **not** use `any` or `unknown` casts as a quick escape hatch. When an upstream API lacks types, build a narrow adapter/interface that covers the exact fields you touch. Resorting to `any` requires prior approval in this doc plus an explanatory comment that justifies why typing is impossible right now; a bare TODO does **not** count.
- Refactors or new features must keep the existing lint/type baselines green. If a pending task can’t meet that bar, pause and escalate instead of papering over errors.

### Theme Integration Requirements
- **Check theme definitions** before adding any color or font size to new components
- **Typography system**: Always use theme-defined typography classes or utilities, never hardcoded font sizes
- **Color consistency**: Reference existing theme colors in `src/lib/theme/themes/` instead of adding new ones
- **Component theming**: Ensure new components support both light and dark themes
- **CSS variables**: Use theme-generated CSS variables for dynamic styling

### Code Standards
- **Functional components**: Exclusive use of function components with hooks
- **Custom hooks**: Logic extraction for reusability
- **Type-first development**: Comprehensive TypeScript usage
- **Component composition**: Prefer composition over inheritance

## External Dependencies

### Core Integrations
- **@opencode-ai/sdk ^1.0.11**: Official OpenCode SDK (typed API access + AsyncGenerator SSE streaming)
- **Express 5.1.0**: Production server with proxy middleware
- **Tailwind CSS v4**: Styling with new `@import` syntax
- **Zustand 5.0.8**: State management with persistence
- **FlowToken 1.0.40**: Animated text rendering for streaming content

### UI Components
- **@phosphor-icons/react 2.1.10**: Icon system throughout interface
- **@radix-ui primitives**: Accessible component foundations (dialog, dropdown-menu, scroll-area, select, separator, slot, toggle, tooltip)
- **shadcn/ui**: Compatible UI components for Tailwind v4
- **react-markdown 10.1.0**: Markdown rendering with remark plugins
- **Sonner 2.0.7**: Toast notifications
- **CMD+K 1.1.1**: Command palette functionality

### Development & Build
- **Vite 7.1.2**: Build tool with HMR and development proxy
- **TypeScript 5.8.3**: Full type safety across codebase
- **ESLint 9.33.0**: Code linting and quality enforcement

## Feature Implementation Map

### Directory & File System (Custom Backend Service)
- **DirectoryTree component**: `src/components/session/DirectoryTree.tsx` - Tree navigation with inline creation UI
- **DirectoryExplorerDialog**: `src/components/session/DirectoryExplorerDialog.tsx` - Modal picker with hidden files toggle
- **SessionSwitcher directory controls**: shared height (44px) search input, directory selector, and new-session action stay aligned in both modal and overlay layouts; mobile `+` button is a square primary button sized to the selector.
- **Directory store**: `src/stores/useDirectoryStore.ts` - Working directory state and home path
- **Backend API**: `src/lib/opencode/client.ts` + `server/index.js` - Custom filesystem endpoints (not OpenCode SDK)
  - `listLocalDirectory()` → `/api/fs/list` - List directory contents with file type detection
  - `getFilesystemHome()` → `/api/fs/home` - Get user home directory path
  - `getSystemInfo()` - Derive home directory from multiple sources (OpenCode SDK path/project info + localStorage)

### Session Switcher UX
- **Component**: `src/components/session/SessionSwitcherDialog.tsx`
- **Date groups**: Collapsible sections with left-aligned `[caret][trash][label]` headers; labels show `Date (N sessions)` and remain expanded when searching.
- **Mobile parity**: Switcher reuses `MobileOverlayPanel` for browsing, creation, and deletion flows; search, directory picker, and square new-session button share a consistent 44px height.
- **Badges**: Git worktree chips and shared session chips consume theme status tokens (`--status-success*`, `--status-info*`) for text, icon, border, and background to stay on palette across themes.
- **Actions**: Top-right controls mirror desktop behavior, with copy/share state, worktree metadata, and streaming indicators available per session row.

### Settings & Configuration System
- **SettingsDialog**: `src/components/layout/SettingsDialog.tsx` - Unified settings modal with tab navigation for all configuration sections
- **Sidebar sections config**: `src/constants/sidebar.ts` - Central configuration for all settings tabs (Agents, Commands, Providers, Git Identities, Prompt Enhancer, Settings)

#### Appearance Tab
- **SettingsPage**: `src/components/sections/settings/SettingsPage.tsx` - Wrapper for main settings interface
- **AppearanceSettings**: `src/components/sections/settings/AppearanceSettings.tsx` - Main appearance component with:
  - **Theme Preferences**: Theme mode (system/light/dark), light theme selector, dark theme selector
  - **Markdown Reading Mode**: Compact/Comfort density presets with live preview
  - **Interface Font**: UI font selection (Inter, IBM Plex Sans, etc.) with mobile overlay panels
  - **Code Font**: Monospace font selection (JetBrains Mono, Fira Code, Paper Mono, etc.) with preview
  - **Typography Sizes** (desktop only): Advanced controls for 6 semantic typography variables with preset scales, custom sliders, and live preview
  - **Automatic Persistence**: Changes sync immediately across desktop and web via shared settings JSON
- **Related hooks**: `useMarkdownDisplayMode` (`src/hooks/useMarkdownDisplayMode.ts`), `useFontPreferences` (`src/hooks/useFontPreferences.ts`), `useTypographySizes` (`src/hooks/useTypographySizes.ts`)
- **Related utilities**: `src/lib/markdownDisplayModes.ts` (mode variables), `src/lib/fontOptions.ts` (font definitions), `src/lib/typographyPresets.ts` (scale presets), `src/lib/appearancePersistence.ts` (desktop save logic)

#### Agents Configuration Tab
- **AgentsPage**: `src/components/sections/agents/AgentsPage.tsx` - Agent editor with prompt, model, and permission controls
- **AgentsSidebar**: `src/components/sections/agents/AgentsSidebar.tsx` - Agent list navigation
- **ModelSelector**: `src/components/sections/agents/ModelSelector.tsx` - Provider/model dropdown selector
- **Agents store**: `src/stores/useAgentsStore.ts` - Agent CRUD and OpenCode restart

#### Commands Configuration Tab
- **CommandsPage**: `src/components/sections/commands/CommandsPage.tsx` - Slash command editor with agent/model/template fields
- **CommandsSidebar**: `src/components/sections/commands/CommandsSidebar.tsx` - Command list with creation UI
- **AgentSelector**: `src/components/sections/commands/AgentSelector.tsx` - Agent dropdown for command assignment
- **Commands store**: `src/stores/useCommandsStore.ts` - Command CRUD and execution state

#### Providers Configuration Tab
- **ProvidersPage**: `src/components/sections/providers/ProvidersPage.tsx` - Provider/model management interface
- **ProvidersSidebar**: `src/components/sections/providers/ProvidersSidebar.tsx` - Provider navigation sidebar
- **Config store**: `src/stores/useConfigStore.ts` - Providers, models, and credentials

#### Git Identities Configuration Tab
- **GitIdentitiesPage**: `src/components/sections/git-identities/GitIdentitiesPage.tsx` - Profile editor with color/icon customization
- **GitIdentitiesSidebar**: `src/components/sections/git-identities/GitIdentitiesSidebar.tsx` - Profile selector sidebar
- **Git store**: `src/stores/useGitIdentitiesStore.ts` - Profile management and persistence

#### Prompt Enhancer Configuration Tab
- **PromptEnhancerPage**: `src/components/sections/prompt-enhancer/PromptEnhancerPage.tsx` - Main configuration interface
- **PromptEnhancerSidebar**: `src/components/sections/prompt-enhancer/PromptEnhancerSidebar.tsx` - Quick settings sidebar
- **PromptEnhancerSettings**: `src/components/sections/prompt-enhancer/PromptEnhancerSettings.tsx` - Detailed configuration
- **PromptPreviewContent**: `src/components/sections/prompt-enhancer/PromptPreviewContent.tsx` - Live preview rendering
- **PromptRefinerTab**: `src/components/right-sidebar/PromptRefinerTab.tsx` - Real-time preview in right sidebar utilities panel
- **Config store**: `src/stores/usePromptEnhancerConfig.ts` - Enhancement rules and persistence
- **Backend API**: `src/lib/promptApi.ts` + `server/index.js` - Custom prompt enhancement service using OpenCode agents internally

### Git Operations (Custom Backend Service)
- **GitTab**: `src/components/right-sidebar/GitTab.tsx` - Staged files, commit workflow, AI-powered commit message generation
- **DiffTab**: `src/components/right-sidebar/DiffTab.tsx` - File-level diff viewer with syntax highlighting
- **Git identities store**: `src/stores/useGitIdentitiesStore.ts` - Profile management for multi-identity workflows
- **Backend API**: `src/lib/gitApi.ts` + `server/index.js` - Simple-git wrapper for repository operations (not OpenCode SDK)

### Terminal (Custom Backend Service)
- **TerminalTab**: `src/components/right-sidebar/TerminalTab.tsx` - Tab container with auto-reconnect logic
- **TerminalViewport**: `src/components/right-sidebar/TerminalViewport.tsx` - Xterm.js integration with FitAddon auto-resize
- **Terminal store**: `src/stores/useTerminalStore.ts` - Session state and reconnection tracking
- **Terminal theme**: `src/lib/terminalTheme.ts` - Theme→Xterm.js color palette mapping
- **Backend API**: `src/lib/terminalApi.ts` + `server/index.js` - Node-pty wrapper with SSE streaming (not OpenCode SDK)

### OpenCode Process Management
- **Header component**: `src/components/layout/Header.tsx` (`handleReloadConfiguration`) - Config reload button with restart
- **Agents store**: `src/stores/useAgentsStore.ts` (`reloadOpenCodeConfiguration`) - OpenCode restart orchestration
- **Production server**: `server/index.js` - Process management and health checks

### Streaming & Diagnostics
- **Message store**: `src/stores/messageStore.ts` - temp_* ID swap, lifecycle tracking
- **Session store**: `src/stores/useSessionStore.ts` - `messageStreamStates`, pending-user guards
- **Debug utilities**: `src/lib/debug.ts` - `window.__opencodeDebug` helpers for empty response diagnostics
- **Event stream hook**: `src/hooks/useEventStream.ts` - SSE connection management

### Theme System
- **Built-in themes**: `src/lib/theme/themes/` - 15 theme definitions (default-dark, default-light, catppuccin, gruvbox, rosepine, etc.)
- **CSS generator**: `src/lib/theme/cssGenerator.ts` - Runtime CSS variable injection
- **Syntax theme**: `src/lib/theme/syntaxThemeGenerator.ts` - Code highlighting color mapping
- **Theme provider**: `src/components/providers/ThemeProvider.tsx` - Theme context and application

### Font System
- **Font options**: `src/lib/fontOptions.ts` - Available fonts including Paper Mono
- **Font styles**: `src/styles/fonts.ts` - Font loading and registration
- **Font preferences hook**: `src/hooks/useFontPreferences.ts` - User font selection persistence

### Mobile & UX
- **MobileOverlayPanel**: `src/components/ui/MobileOverlayPanel.tsx` - Responsive sidebar panels
- **Edge swipe hook**: `src/hooks/useEdgeSwipe.ts` - Gesture navigation for utilities panel
- **Scroll manager**: `src/hooks/useChatScrollManager.ts` - Auto-scroll with user override detection
