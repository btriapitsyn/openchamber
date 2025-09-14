# OpenCode WebUI - Agent Technical Reference

## System Overview

OpenCode WebUI is a complementary web interface for the OpenCode ecosystem, designed to work alongside the OpenCode TUI (Terminal User Interface). Built with deep respect for the OpenCode team's architecture, this project leverages their well-designed API to provide web-based access to OpenCode sessions.

**Architecture**: Single-page React application with Zustand state management, real-time event streaming, and seamless integration with the OpenCode API.

**Core Purpose**: Extend OpenCode accessibility beyond the terminal, enabling cross-device session continuity and remote access while maintaining full compatibility with the TUI. Users can start a session in the terminal, continue on a mobile device via the web interface, and return to the terminal - all using the same session history.

**Key Philosophy**: This is NOT a replacement for the TUI but a companion tool that showcases the power of OpenCode's architecture. The ability to create this WebUI is a testament to the thoughtful API design and modular architecture decisions made by the OpenCode team.

## Technology Stack & Dependencies

### Core Framework
- **React 19.1.1**: Modern React with concurrent features
- **TypeScript**: Full type safety across codebase
- **Vite 7.1.2**: Build tool with HMR and development proxy

### UI & Styling
- **Tailwind CSS v4**: Latest version using new `@import` syntax in `src/index.css`
- **shadcn/ui (canary)**: UI components compatible with Tailwind v4
- **Radix UI primitives**: Accessible component foundations
- **Lucide React**: Icon system throughout interface

### State Management
- **Zustand 5.0.8**: Primary state management with persistence
- **Store pattern**: Four main stores handling different concerns

### Integration
- **@opencode-ai/sdk 0.7.1**: Official OpenCode SDK for backend communication
- **EventSource**: Real-time server-sent events for streaming updates

### Development
- **Vite proxy**: `/api` routes proxy to `localhost:4096` during development
- **Express proxy server**: `proxy-server.js` for production deployment
- **ESLint**: Code quality enforcement

## Project Structure Analysis

```
src/
├── components/
│   ├── chat/          # Core chat interface components
│   │   ├── ChatContainer.tsx    # Main chat area container
│   │   ├── ChatInput.tsx        # Message input with file attachment
│   │   ├── ChatMessage.tsx      # Message rendering with tool display
│   │   ├── FileAttachment.tsx   # File upload and display
│   │   ├── ModelControls.tsx    # Provider/model/agent selection
│   │   └── PermissionRequest.tsx # Runtime permission dialogs
│   ├── session/       # Session management UI
│   │   ├── SessionList.tsx      # Sidebar session navigation
│   │   ├── DirectoryNav.tsx     # Directory selection interface
│   │   └── DirectoryTree.tsx    # File tree navigation
│   ├── layout/        # Application layout structure
│   │   ├── MainLayout.tsx       # Primary layout with responsive sidebar
│   │   └── Header.tsx           # Top navigation bar
│   ├── ui/            # shadcn/ui components and custom UI
│   │   ├── CommandPalette.tsx   # Keyboard-driven command interface
│   │   ├── HelpDialog.tsx       # Keyboard shortcuts reference
│   │   └── [shadcn components]  # Standard UI primitives
│   └── providers/
│       └── ThemeProvider.tsx    # Dark/light/system theme management
├── stores/            # Zustand state management
├── hooks/             # Custom React hooks
├── lib/               # Utilities and integrations
├── types/             # TypeScript type definitions
└── [config files]
```

## State Management Architecture

### Store Responsibilities

#### 1. ConfigStore (`useConfigStore.ts`)
**Purpose**: Application configuration and OpenCode server connection management.

**Key State**:
- `providers: Provider[]` - Available AI providers from server
- `agents: Agent[]` - Configured OpenCode agents
- `currentProviderId/ModelId/AgentName` - Active selections
- `isConnected/isInitialized` - Connection status flags

**Critical Functions**:
- `initializeApp()` - Server connection and initial data loading
- `loadProviders()` - Fetch available providers and models
- `loadAgents()` - Load configured agents from server
- `checkConnection()` - Health check using `/config` endpoint

**Persistence**: Persists user preferences (provider, model, agent selections) across sessions.

#### 2. SessionStore (`useSessionStore.ts`)
**Purpose**: Chat session management and message handling.

**Key State**:
- `sessions: Session[]` - All available sessions
- `currentSessionId: string | null` - Active session
- `messages: Map<string, MessageWithParts[]>` - Session messages by ID
- `permissions: Map<string, Permission[]>` - Runtime permission requests
- `attachedFiles: AttachedFile[]` - Files pending upload
- `streamingMessageId: string | null` - Currently streaming message

**Critical Functions**:
- `sendMessage()` - Send user message with optional file attachments
- `addStreamingPart()` - Real-time message part updates from EventSource
- `completeStreamingMessage()` - Mark streaming complete, clear loading state
- `respondToPermission()` - Handle permission dialogs (allow/deny/always)

**Message Processing**:
```typescript
interface MessageWithParts {
  info: Message;    // Metadata (id, role, timestamp, provider info)
  parts: Part[];    // Content parts (text, tool, file, reasoning)
}
```

#### 3. DirectoryStore (`useDirectoryStore.ts`)
**Purpose**: Working directory context for all operations.

**Key State**:
- `currentDirectory: string` - Active working directory
- Directory changes propagate to all API calls via `opencodeClient.setDirectory()`

#### 4. UIStore (`useUIStore.ts`)
**Purpose**: Interface state and user preferences.

**Key State**:
- `theme: 'light' | 'dark' | 'system'` - Theme selection
- `isSidebarOpen: boolean` - Sidebar visibility state
- `isCommandPaletteOpen: boolean` - Command palette state
- Responsive breakpoint tracking (`isMobile`)

## OpenCode SDK Integration

### Client Configuration (`lib/opencode/client.ts`)

**OpencodeService Class**: Singleton service wrapping the official SDK.

**Key Features**:
- Directory-aware API calls - all requests include current working directory
- Development proxy support - uses `/api` prefix in dev mode
- EventSource streaming for real-time updates
- Health checking via `/config` endpoint (no dedicated health endpoint)

**Critical Methods**:
```typescript
// Session management
listSessions(): Promise<Session[]>
createSession(params?: {title?: string}): Promise<Session>
sendMessage(params: SendMessageParams): Promise<Message>

// Real-time events
subscribeToEvents(onMessage, onError?, onOpen?): () => void

// Configuration
getProviders(): Promise<{providers: Provider[], default: {[key: string]: string}}>
listAgents(): Promise<Agent[]>
```

**URL Configuration**:
- Development: `/api` (proxied to `localhost:4096`)
- Production: `VITE_OPENCODE_URL` or `http://localhost:4096`

### Event Streaming Architecture

**Implementation**: `hooks/useEventStream.ts` manages WebSocket-like communication via EventSource.

**Key Event Types**:
- `message.part.updated` - Streaming message content updates
- `message.updated` - Message completion signals
- `permission.updated` - Runtime permission requests
- `session.abort` - Operation cancellation
- `server.connected` - Connection status changes

**Event Processing Pattern**:
```typescript
switch (event.type) {
  case 'message.part.updated':
    // Add streaming content to active message
    // Skip user messages (already shown locally)
    if (messageInfo?.role !== 'user') {
      addStreamingPart(sessionId, messageId, part);
    }
    break;
}
```

## Component Architecture Patterns

### ChatMessage Component (`components/chat/ChatMessage.tsx`)

**Complexity**: Most complex component (~1084 lines) handling multiple content types.

**Key Features**:
- **Multi-part rendering**: Text, tool execution, files, reasoning
- **Tool display system**: Expandable tool execution with syntax highlighting
- **Diff visualization**: Side-by-side diff display for edit operations
- **Code highlighting**: Custom Dune theme integration
- **Provider logos**: Dynamic logo loading with fallback

**Tool Part Structure**:
```typescript
interface ToolPart {
  id: string;
  tool: string;
  state: {
    status: 'pending' | 'running' | 'completed' | 'error';
    input?: any;
    output?: string;
    metadata?: any;
    time: { start: number; end?: number };
  };
}
```

**Diff Rendering**: Custom algorithm for proper line alignment in edit tools.

### File Attachment System

**Flow**: `ChatInput` → drag/drop → `useSessionStore.addAttachedFile()` → data URL conversion → display in `FileAttachment` → include in API call.

**Constraints**:
- 10MB file size limit
- Data URL encoding for transmission
- Type validation with fallbacks
- Duplicate prevention by name/size

**Integration**: Files included as additional parts in `sendMessage()` API calls.

## Theme System

### Dune Arrakis Theme Implementation

**CSS Custom Properties** (`src/index.css`):
- **OKLCH Color Space**: Modern color specification for better perceptual uniformity
- **Dual themes**: Light (desert sun) and dark (desert night) variants
- **Semantic variables**: `--background`, `--foreground`, `--primary`, etc.

**Theme Values**:
```css
/* Dark Theme - Dune Arrakis */
--background: oklch(0.16 0.01 30);     /* #151313 */
--foreground: oklch(0.85 0.02 90);     /* #cdccc3 */
--primary: oklch(0.77 0.17 85);        /* #edb449 - golden sand */

/* Light Theme - Desert sun */
--background: oklch(0.97 0.02 85);     /* Warm sand */
--primary: oklch(0.65 0.2 55);         /* Desert orange */
```

**Code Highlighting**: Custom themes in `lib/codeTheme.ts` matching the Dune aesthetic.

### Tailwind CSS v4 Integration

**Configuration**: No separate config file - uses inline `@theme` directive in `src/index.css`.

**Key Features**:
- CSS custom properties integration
- Custom scrollbar styling
- Responsive design utilities
- Component-specific styling patterns

## Development Workflows

### Vite Development Setup

**Proxy Configuration** (`vite.config.ts`):
```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:4096',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, '')
    }
  }
}
```

**Purpose**: Avoid CORS issues during development by proxying API calls.

### Build Process
- TypeScript compilation with strict checking
- Vite bundling with code splitting
- External node modules excluded from bundle
- Production proxy server for API forwarding

### Keyboard Shortcuts (`useKeyboardShortcuts.ts`)
- `Cmd/Ctrl + K` - Command palette
- `Cmd/Ctrl + N` - New session  
- `Cmd/Ctrl + H` - Help dialog
- `Escape` - Close modals/cancel operations

## Recent Feature Additions

### File Attachments
- **Implementation**: Complete drag-and-drop file upload system
- **Storage**: In-memory data URLs with size/type validation
- **Display**: Integrated file preview in chat interface
- **API Integration**: Files sent as additional message parts

### Enhanced Tool Display
- **Expandable interface**: Click to show/hide tool details
- **Syntax highlighting**: Language detection for tool outputs
- **Diff visualization**: Side-by-side view for edit operations
- **Popup dialogs**: Full-screen view for large outputs

### Command Palette
- **Keyboard-driven**: Fast access to all major actions
- **Context-aware**: Shows relevant sessions and options
- **Theme switching**: Quick theme toggles
- **Session navigation**: Recent session access

## API Integration Patterns

### Directory Context
**All API calls include current directory**:
```typescript
query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
```

### Error Handling
- **Graceful degradation**: UI remains functional during network issues
- **User feedback**: Error states displayed in relevant components
- **Retry mechanisms**: Automatic reconnection for event streams

### Streaming Architecture
- **Optimistic updates**: User messages shown immediately
- **Real-time updates**: Server events update UI incrementally
- **Completion detection**: Multiple mechanisms to detect message completion

## Type System

### Key Type Definitions (`types/`)

**Message Structure**:
```typescript
interface Message {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  time: { created: number; completed?: number };
  // Assistant messages include provider info
  providerID?: string;
  modelID?: string;
}

interface Part {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'text' | 'tool' | 'file' | 'reasoning';
  // Content varies by type
}
```

**Tool System**:
```typescript
interface ToolPart extends Part {
  tool: string;
  state: ToolStateUnion; // Discriminated union by status
}
```

## Performance Considerations

### State Management
- **Map-based storage**: Efficient message lookups by session ID
- **Selective persistence**: Only essential state persisted across sessions
- **Event deduplication**: Prevents duplicate message processing

### Rendering Optimization  
- **Component memoization**: React.memo used for expensive renders
- **Virtual scrolling**: Not yet implemented but planned for long sessions
- **Code splitting**: Dynamic imports for heavy components

### Memory Management
- **File handling**: Data URLs cleared after message send
- **Event cleanup**: EventSource properly closed on unmount
- **Timeout handling**: Automatic cleanup of stale streaming states

## Development Guidelines

### Code Organization
- **Functional components**: Exclusive use of function components with hooks
- **Custom hooks**: Logic extraction for reusability
- **Type-first development**: Comprehensive TypeScript usage
- **Component composition**: Prefer composition over inheritance

### Testing Strategy
- **Unit testing**: Not yet implemented (planned)
- **Integration testing**: Manual testing with OpenCode CLI
- **E2E testing**: Not yet implemented (planned)

### Error Boundaries
- **Not implemented**: Currently relies on React's default error handling
- **Planned**: Global error boundary with user-friendly error states

## Deployment Architecture

### Development
- **Vite dev server**: `npm run dev`
- **API proxy**: Automatic proxy to OpenCode CLI server
- **Hot reload**: Full HMR support for rapid development

### Production
- **Static build**: `npm run build` generates optimized bundle
- **Proxy server**: `proxy-server.js` handles API forwarding
- **Environment variables**: `VITE_OPENCODE_URL` for API configuration

## Future Considerations

### Planned Features
- **Directory tree navigation**: Visual file system browsing
- **Session search**: Find sessions by content or metadata
- **Export functionality**: Download session transcripts
- **Collaborative features**: Multi-user session support

### Technical Debt
- **Error boundaries**: Need comprehensive error handling
- **Testing coverage**: Minimal test infrastructure
- **Performance optimization**: Virtual scrolling for long sessions
- **Accessibility**: Full ARIA support needed

### Scalability Concerns
- **Memory usage**: Large sessions may impact performance
- **API rate limits**: No current throttling implementation
- **Concurrent sessions**: Multiple session support not optimized

## Agent Development Notes

When working with this codebase:

1. **State changes**: Always use store actions, never directly mutate state
2. **API calls**: Use `opencodeClient` service, not direct SDK calls
3. **Event handling**: Be aware of event deduplication in `useEventStream`
4. **File handling**: Understand data URL limitations for large files
5. **Theme integration**: Use CSS custom properties, not hardcoded colors
6. **Type safety**: Leverage discriminated unions for complex state

**Critical Dependencies**: Changes to `@opencode-ai/sdk`, Tailwind v4, or React 19 may require significant updates.

**Development Flow**: Always test with actual OpenCode CLI server running - the WebUI works in tandem with the OpenCode API backend.

**Session Continuity**: The WebUI and TUI share the same session storage through the OpenCode API, enabling seamless handoff between interfaces. This is a key feature that demonstrates the power of OpenCode's architecture.