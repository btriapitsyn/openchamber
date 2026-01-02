# OpenChamber - AI Agent & Contributor Reference

Technical reference for AI coding agents and human contributors working on this project.

## Core Purpose

Web and desktop interface for OpenCode AI coding agent. Provides cross-device continuity, remote accessibility, and a unified chat interface using the OpenCode API backend.

## Tech Stack

- **React 19.1.1**: Modern React with concurrent features
- **TypeScript 5.8.3**: Full type safety
- **Vite 7.1.2**: Build tool with HMR and proxy
- **Tailwind CSS v4.0.0**: Latest `@import` syntax
- **Zustand 5.0.8**: State management with persistence
- **@opencode-ai/sdk**: Official OpenCode SDK with typed endpoints and SSE
- **@remixicon/react**: Icon system
- **@radix-ui primitives**: Accessible component foundations

## Architecture Overview (Monorepo)

Workspaces:
- `packages/ui` - Shared UI components and stores
- `packages/web` - Web runtime, Express server, CLI
- `packages/desktop` - Tauri desktop app with native APIs
- `packages/vscode` - VS Code extension with webview UI

### Core Components (UI)
In `packages/ui/src/components/chat/`: ChatContainer, ChatEmptyState, ChatErrorBoundary, ChatInput, ChatMessage, FileAttachment, MarkdownRenderer, MessageList, ModelControls, PermissionCard, PermissionRequest, ServerFilePicker, StreamingTextDiff, AgentMentionAutocomplete, CommandAutocomplete, FileMentionAutocomplete.
In `packages/ui/src/components/chat/message/`: MessageBody, MessageHeader, ToolOutputDialog, DiffViewToggle, FadeInOnReveal; parts/ (AssistantTextPart, ReasoningPart, ToolPart, UserTextPart, etc.)
In `packages/ui/src/components/layout/`: MainLayout, Header, Sidebar, SidebarContextSummary, VSCodeLayout.
In `packages/ui/src/components/views/`: ChatView, GitView, DiffView, TerminalView, SettingsView.
In `packages/ui/src/components/sections/`: subsections agents/, commands/, git-identities/, openchamber/, providers/, shared/.
In `packages/ui/src/components/session/`: DirectoryTree, DirectoryExplorerDialog, SessionDialogs, SessionSidebar.
In `packages/ui/src/components/ui/`: CommandPalette, HelpDialog, ConfigUpdateOverlay, ContextUsageDisplay, ErrorBoundary, MemoryDebugPanel, MobileOverlayPanel, FireworksAnimation, OpenChamberLogo, OpenCodeIcon, ProviderLogo, ScrollShadow, OverlayScrollbar, plus Radix-based primitives (button, dialog, input, select, etc.)

In `packages/ui/src/components/terminal/`: TerminalViewport
In `packages/ui/src/components/onboarding/`: OnboardingScreen
In `packages/ui/src/components/providers/`: ThemeProvider

### State Management (UI)
In `packages/ui/src/stores/`: contextStore, fileStore, messageStore, permissionStore, sessionStore, useAgentsStore, useCommandsStore, useConfigStore, useDirectoryStore, useFileSearchStore, useGitIdentitiesStore, useGitStore, useSessionStore, useTerminalStore, useUIStore

### OpenCode SDK Integration (UI)
In `packages/ui/src/lib/opencode/`: client.ts wrapper around `@opencode-ai/sdk` with directory-aware API calls, SDK methods (session.*, message.*, agent.*, provider.*, config.*, project.*, path.*), AsyncGenerator SSE streaming (2 retry attempts, 500ms->8s backoff), automatic directory parameter injection.

In `packages/ui/src/hooks/`: useEventStream.ts for real-time SSE connection management.

### Web Runtime (server/CLI)
Express server and CLI in `packages/web`: API adapters in `packages/web/src/api`, server in `packages/web/server/index.js` (git/terminal/config), UI bundle imported from `@openchamber/ui`.

### Desktop Runtime (Tauri)
Native desktop app in `packages/desktop`: Tauri backend in `src-tauri/` (Rust), frontend API adapters in `src/api/` (settings, permissions, diagnostics, files, git, terminal, notifications, tools, updater), bridge layer in `src/lib/` for Tauri IPC communication.

### VS Code Extension Runtime
Extension in `packages/vscode`: Extension entry in `src/` (ChatViewProvider, bridge, theme), webview API adapters in `webview/api/` (bridge, editor, files, permissions, settings, tools), bootstrap script in `webview/main.tsx` that loads shared UI.

## Development Commands

### Code Validation
Always validate changes:

```bash
bun run type-check   # TypeScript validation
bun run lint         # ESLint checks
bun run build        # Production build
```

### Building
```bash
bun run build                 # Build all packages
bun run desktop:build         # Build desktop app
bun run vscode:build          # Build VS Code extension
```

## Communication & Output Discipline (MANDATORY)
- Default to brevity. Responses must be as short as possible (until you suggesting plan) while remaining correct.
- Do not narrate internal reasoning, step-by-step thinking, or deliberation.

## Key Patterns

### Settings View Architecture
Full-screen settings view (`SettingsView.tsx`) with tabbed navigation. Desktop: sidebar + page side-by-side with resizable sidebar. Mobile: drill-down pattern (sidebar → page with back button). Tabs: OpenChamber, Agents, Commands, Providers, Git Identities.

Each settings section has a sidebar (`*Sidebar.tsx`) and page (`*Page.tsx`) in `packages/ui/src/components/sections/`.

**Shared boilerplate components** in `packages/ui/src/components/sections/shared/`:
- `SettingsSidebarLayout` - wrapper with bg, scroll, header/footer slots
- `SettingsSidebarHeader` - "Total X" + add button
- `SettingsSidebarItem` - list item with title, metadata, selection, optional actions dropdown
- `SettingsPageLayout` - centered max-w-3xl scrollable container
- `SettingsSection` - section with optional title, description, divider

Use these as reference when adding new settings sections. See `index.ts` for usage examples.

### File Attachments
Drag-and-drop upload with 10MB limit (`FileAttachment.tsx`), Data URL encoding, type validation with fallbacks, integrated via `useFileStore.addAttachedFile()`.

### Theme System
In `packages/ui/src/lib/theme/`: TypeScript-based themes (Flexoki Light and Dark), CSS variable generation, component-specific theming, Tailwind CSS v4 integration.

### Typography System
In `packages/ui/src/lib/`: Semantic typography with 6 CSS variables, theme-independent scales. **CRITICAL**: Always use semantic typography classes, never hardcoded font sizes.

### Streaming Architecture
SDK-managed SSE with AsyncGenerator, temp->real session ID swap (optimistic UI), pendingAssistantParts buffering, empty-response detection via `window.__opencodeDebug`.

## Development Guidelines

### Lint & Type Safety

- Never land code that introduces new ESLint or TypeScript errors
- Run `bun run lint` and `bun run type-check` before finalizing changes
- Adding `eslint-disable` requires justification in a comment explaining why typing is impossible
- Do **not** use `any` or `unknown` casts as escape hatches; build narrow adapter interfaces instead
- Refactors or new features must keep existing lint/type baselines green

### Theme Integration

- Check theme definitions before adding colors or font sizes to new components
- Always use theme-defined typography classes, never hardcoded font sizes
- Reference existing theme colors instead of adding new ones
- Ensure new components support both light and dark themes
- Use theme-generated CSS variables for dynamic styling

### Code Standards

- **Functional components**: Exclusive use of function components with hooks
- **Custom hooks**: Extract logic for reusability
- **Type-first development**: Comprehensive TypeScript usage
- **Component composition**: Prefer composition over inheritance

## Feature Implementation Map

### Directory & File System
`packages/ui/src/components/session/`: DirectoryTree, DirectoryExplorerDialog
`packages/ui/src/stores/`: DirectoryStore
Backend: `packages/web/server/index.js` with `listLocalDirectory()`, `getFilesystemHome()`

### Session Switcher
`SessionSwitcherDialog.tsx`: Collapsible date groups, mobile parity with MobileOverlayPanel, Git worktree and shared session chips, streaming indicators.

### Settings & Configuration
`packages/ui/src/components/sections/`: AgentsPage, CommandsPage, GitIdentitiesPage, ProvidersPage, SessionsPage, OpenChamberPage
`packages/ui/src/components/sections/shared/`: Boilerplate components for new sections
Related stores: useAgentsStore, useCommandsStore, useConfigStore, useGitIdentitiesStore

### Git Operations
`packages/ui/src/components/views/`: GitView, DiffView
`packages/ui/src/stores/`: useGitIdentitiesStore
Backend: `packages/ui/src/lib/gitApi.ts` + `packages/web/server/index.js` (simple-git wrapper)

### Terminal
`packages/ui/src/components/views/`: TerminalView
`packages/ui/src/components/terminal/`: TerminalViewport (ghostty-web with FitAddon)
`packages/ui/src/stores/`: useTerminalStore
Backend: `packages/web/server/index.js` (bun-pty wrapper with SSE)

### Theme System
`packages/ui/src/lib/theme/`: themes (2 definitions), cssGenerator, syntaxThemeGenerator
`packages/ui/src/components/providers/`: ThemeProvider

### Mobile & UX
`packages/ui/src/components/ui/`: MobileOverlayPanel
`packages/ui/src/hooks/`: useEdgeSwipe, useChatScrollManager
