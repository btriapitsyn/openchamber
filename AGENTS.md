# OpenCode WebUI - Agent Technical Reference

## Core Purpose

OpenCode WebUI is a complementary web interface for the OpenCode AI coding agent, designed to work alongside the OpenCode TUI. It provides cross-device continuity, remote accessibility, and a unified chat-like interface while sharing the same OpenCode API backend for consistent session management.

## Tech Stack

- **React 19.1.1**: Modern React with concurrent features
- **TypeScript 5.8.3**: Full type safety across codebase
- **Vite 7.1.2**: Build tool with HMR and development proxy
- **Tailwind CSS v4**: Latest version using new `@import` syntax
- **Zustand 5.0.8**: Primary state management with persistence
- **@opencode-ai/sdk 0.7.1**: Official OpenCode SDK for backend communication
- **Radix UI primitives**: Accessible component foundations
- **Lucide React**: Icon system throughout interface

## Architecture Overview

### Core Components
- **Chat Interface** (`src/components/chat/`): ChatContainer, ChatInput, ChatMessage, FileAttachment, ModelControls
- **Session Management** (`src/components/session/`): SessionList, DirectoryNav, DirectoryTree
- **Layout** (`src/components/layout/`): MainLayout, Header
- **UI Components** (`src/components/ui/`): CommandPalette, HelpDialog, shadcn/ui primitives
- **Theme System** (`src/lib/theme/`): TypeScript-based themes with CSS variable generation

### State Management
- **ConfigStore** (`src/stores/useConfigStore.ts`): Application configuration and server connection
- **SessionStore** (`src/stores/useSessionStore.ts`): Chat sessions and message handling
- **DirectoryStore** (`src/stores/useDirectoryStore.ts`): Working directory context
- **UIStore** (`src/stores/useUIStore.ts`): Interface state and user preferences

### OpenCode Integration
- **Client Service** (`src/lib/opencode/client.ts`): Directory-aware API calls with EventSource streaming
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

### File Attachments
- Drag-and-drop upload with 10MB limit
- Data URL encoding for transmission
- Type validation with fallbacks
- Integrated into message parts via `useSessionStore.addAttachedFile()`

### Theme System
- TypeScript-based themes with comprehensive color definitions
- Runtime CSS variable generation (`src/lib/theme/cssGenerator.ts`)
- Component-specific theming (markdown, chat, tools)
- Tailwind CSS v4 integration with `@theme` directives

### Typography System
- Centralized typography with 6 CSS variables for font sizes (`src/lib/typography.ts`)
- Theme-defined typography scales for consistent text sizing
- CSS variables: `--typography-size-xs` through `--typography-size-3xl` and heading sizes
- Typography utilities: `typography.xs` through `typography.3xl` for dynamic styling
- **CRITICAL**: Always use theme-defined typography classes or utilities, never hardcoded font sizes

### Streaming Architecture
- EventSource-based real-time updates
- Optimistic UI updates for user messages
- Event deduplication and error handling
- Message completion detection via multiple mechanisms

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
- **OpenCode SDK**: Backend API communication and session management
- **EventSource**: Real-time server-sent events for streaming
- **Express**: Production server with proxy middleware
- **Tailwind CSS v4**: Styling with new `@import` syntax

### UI Components
- **Radix UI**: Accessible primitive components
- **shadcn/ui**: Compatible UI components for Tailwind v4
- **Lucide React**: Comprehensive icon system
- **react-markdown**: Markdown rendering with remark plugins

## Recent Changes

### Technology Updates
- React upgraded to 19.1.1 (from 18.3.1)
- TypeScript upgraded to 5.8.3 (from 5.5.3)
- Vite upgraded to 7.1.2 (from 7.1.5)
- Tailwind CSS upgraded to v4 with new syntax

### Feature Enhancements
- File attachment system with drag-and-drop support
- Enhanced tool display with syntax highlighting and diff visualization
- Command palette with keyboard shortcuts
- Advanced theme system with runtime switching
- Production server with automatic OpenCode process management

### Architecture Improvements
- Directory-aware API calls throughout the application
- Improved error handling and graceful degradation
- Enhanced state management with better persistence
- Better TypeScript coverage and type safety