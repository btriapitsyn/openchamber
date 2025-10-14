# OpenChamber - Agent Technical Reference

## Core Purpose

Complementary web interface for OpenCode AI coding agent. Provides cross-device continuity, remote accessibility, and unified chat interface sharing OpenCode API backend for consistent session management.

## Tech Stack

- **React 19.1.1**: Modern React with concurrent features
- **TypeScript 5.8.3**: Full type safety across codebase
- **Vite 7.1.2**: Build tool with HMR and development proxy
- **Tailwind CSS v4.0.0**: Latest version using new `@import` syntax
- **Zustand 5.0.8**: Primary state management with persistence
- **@opencode-ai/sdk 0.15.0**: Official OpenCode SDK with typed endpoints and SSE helpers
- **@phosphor-icons/react 2.1.10**: Icon system throughout interface
- **@radix-ui primitives**: Accessible component foundations
- **FlowToken 1.0.40**: Animated text rendering for streaming content

## Architecture Overview

### Core Components
- **Chat Interface** (`src/components/chat/`): ChatContainer, MessageList, ChatMessage, StreamingAnimatedText (FlowToken), ChatInput, FileAttachment, ModelControls, PermissionCard, PermissionRequest, ServerFilePicker, StreamingTextDiff
- **Session Management** (`src/components/session/`): SessionList, DirectoryTree
- **Layout** (`src/components/layout/`): MainLayout, Header, NavigationBar, Sidebar, SidebarContextSummary
- **Sections** (`src/components/sections/`): AgentsPage, CommandsPage, GitIdentitiesPage, ProvidersPage, SessionsPage, SettingsPage with corresponding sidebars
- **UI Components** (`src/components/ui/`): CommandPalette, HelpDialog, ConfigUpdateOverlay, ContextUsageDisplay, ErrorBoundary, MemoryDebugPanel, MobileOverlayPanel, ThemeDemo, ThemeSwitcher, shadcn/ui primitives
- **Theme System** (`src/lib/theme/`): TypeScript-based themes with CSS variable generation
- **Hooks & Utilities** (`src/hooks/`, `src/lib/`): `useChatScrollManager`, `useEventStream`, `useFontPreferences`, `useKeyboardShortcuts`, `useMarkdownDisplayMode`, typography helpers, streaming diagnostics

### State Management
- **ConfigStore** (`src/stores/useConfigStore.ts`): Application configuration and server connection
- **SessionStore** (`src/stores/useSessionStore.ts`): Chat sessions and message handling
- **DirectoryStore** (`src/stores/useDirectoryStore.ts`): Working directory context
- **UIStore** (`src/stores/useUIStore.ts`): Interface state and user preferences
- **FileStore** (`src/stores/fileStore.ts`): File attachments and server file management
- **MessageStore** (`src/stores/messageStore.ts`): Message state and streaming lifecycle management
- **ContextStore** (`src/stores/contextStore.ts`): Context usage tracking and token management
- **PermissionStore** (`src/stores/permissionStore.ts`): Permission handling and requests
- **AgentsStore** (`src/stores/useAgentsStore.ts`): Agent configuration and management
- **CommandsStore** (`src/stores/useCommandsStore.ts`): Slash commands management
- **GitIdentitiesStore** (`src/stores/useGitIdentitiesStore.ts`): Git identity profiles and switching
- **SettingsStore** (`src/stores/useSettingsStore.ts`): User preferences and settings

### OpenCode Integration
- **Client Service** (`src/lib/opencode/client.ts`): Directory-aware API calls with SDK-provided AsyncGenerator SSE streaming
- **Event Stream** (`src/hooks/useEventStream.ts`): Real-time message updates and permission handling

## Build & Deploy Process

### Development
```bash
npm run dev          # Start Vite dev server with API proxy
npm run cli          # Run CLI interface
```

### Production
```bash
npm run build        # TypeScript compilation + Vite build
npm run start        # Start Express production server
npm run build:package # Build for distribution
```

### Production Server Features
- Automatic OpenCode process management with port discovery
- Health monitoring and automatic restart
- API proxy middleware for OpenCode backend
- Custom theme storage endpoints
- Static file serving with fallback

## Key Patterns

### Section-Based Navigation
- Modular section architecture with dedicated pages and sidebars for different features
- Sections: Agents, Commands, Git Identities, Providers, Sessions, Settings
- Each section has independent state management and routing
- Consistent sidebar patterns with context-aware navigation

### File Attachments
- Drag-and-drop upload with 10MB limit
- Data URL encoding for transmission
- Type validation with fallbacks
- Integrated into message parts via `useFileStore.addAttachedFile()`

### Theme System
- TypeScript-based themes with comprehensive color definitions
- Runtime CSS variable generation (`src/lib/theme/cssGenerator.ts`)
- Component-specific theming (markdown, chat, tools)
- Tailwind CSS v4 integration with `@theme` directives
- Built-in themes only (custom theme support removed)

### Typography System
- Semantic typography system with 6 CSS variables for font sizes (`src/lib/typography.ts`)
- Theme-independent typography scales for consistent text sizing across semantic roles
- CSS variables: `--text-markdown`, `--text-code`, `--text-ui-header`, `--text-ui-label`, `--text-meta`, `--text-micro`
- Typography utilities organized by semantic role: `typography.semanticMarkdown`, `typography.uiLabel`, etc.
- **CRITICAL**: Always use semantic typography classes or utilities, never hardcoded font sizes

### Markdown & Animation
- FlowToken-backed `StreamingAnimatedText` renders assistant content with `sep="diff"`, 0.10s fade-in, and animation can be disabled via `shouldAnimate`
- Semantic markdown presets ensure uniform line-height, heading weights, and list indentation across desktop and mobile
- User markdown uses a soft-break remark plugin so Shift+Enter keeps line breaks intact

### Streaming Architecture
- SDK-managed SSE via `@opencode-ai/sdk` 0.15.0 (AsyncGenerator stream with 2 retry attempts, 500ms→8s backoff) for stable delivery
- Temporary `temp_*` IDs are replaced with server-issued message IDs, preserving optimistic UI without breaking Claude responses
- Pending-user guards and role preservation inside `useSessionStore` prevent assistant echoes; message lifecycles tracked through `messageStreamStates`
- Empty-response detection surfaces single toasts and exposes diagnostics via `window.__opencodeDebug` helpers

### Git Identity Management
- Profile-based Git identity switching with comprehensive operation support
- Context-aware identity application for commits and operations
- Persistent identity storage with secure credential management

## Development Guidelines

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
- **@opencode-ai/sdk 0.15.0**: Official OpenCode SDK (typed API access + AsyncGenerator SSE streaming)
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

## Recent Changes

### Git Identity Management & Profile Switching
- Added comprehensive Git identity management with profile switching capabilities
- Integrated Git operations with identity context for proper attribution

### Slash Commands Management System
- Added complete slash commands management interface and configuration
- Enhanced command execution and customization capabilities

### Theme System Simplification
- Removed custom theme support, retaining only built-in themes
- Streamlined theme management and reduced complexity

### Directory Creation & Navigation
- Added directory creation UI in DirectoryTree picker
- Improved file system navigation and management

### OpenCode Process Management
- Added full OpenCode restart functionality to header config reload button
- Enhanced process management and automatic recovery

### Tool Card Layout & UX Improvements
- Fixed tool card layout shift issues
- Improved mobile UX with consistent headers and better popup handling

### Streaming Stability & SDK Upgrade
- Upgraded `@opencode-ai/sdk` to 0.15.0 and migrated to SDK-provided AsyncGenerator SSE handling with capped retries
- Removed custom message IDs from API calls, added temp→real ID swap to prevent Claude empty responses
- Added `window.__opencodeDebug` helpers and single-toast empty-response detection for diagnostics

### Font Integration & UI Customization
- Added Paper Mono font integration into font options
- Enhanced UI customization capabilities

### Documentation & Onboarding
- Added onboarding guides and iOS adaptation documentation
- Improved project context and workflow documentation
