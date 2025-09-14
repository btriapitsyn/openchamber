# OpenCode WebUI - Agent Technical Reference

## System Overview

OpenCode WebUI is a complementary web interface for the OpenCode ecosystem, designed to work alongside the OpenCode TUI (Terminal User Interface). Built with deep respect for the OpenCode team's architecture, this project leverages their well-designed API to provide web-based access to OpenCode sessions.

**Architecture**: Single-page React application with Zustand state management, real-time event streaming, and seamless integration with the OpenCode API.

**Core Purpose**: Extend OpenCode accessibility beyond the terminal, enabling cross-device session continuity and remote access while maintaining full compatibility with the TUI. Users can start a session in the terminal, continue on a mobile device via the web interface, and return to the terminal - all using the same session history.

**Key Philosophy**: This is NOT a replacement for the TUI but a companion tool that showcases the power of OpenCode's architecture. The ability to create this WebUI is a testament to the thoughtful API design and modular architecture decisions made by the OpenCode team.

## Technology Stack & Dependencies

### Core Framework
- **React 18.3.1**: Modern React with concurrent features
- **TypeScript 5.5.3**: Full type safety across codebase
- **Vite 7.1.5**: Build tool with HMR and development proxy

### UI & Styling
- **Tailwind CSS v4 (@next)**: Latest version using new `@import` syntax
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

## Security Considerations

### Authentication & Authorization
- **No built-in authentication**: Relies entirely on OpenCode CLI for authentication and authorization
- **File system access**: All file operations go through OpenCode backend with its security model
- **Session isolation**: Each user session is isolated through OpenCode's session management
- **API key management**: Provider API keys managed through OpenCode CLI configuration

### Data Handling Security
- **File attachments**: 10MB size limit with client-side validation
- **Data URL encoding**: Files converted to base64 data URLs for transmission
- **Memory-only storage**: File data not persisted to disk, cleared after message send
- **Type validation**: MIME type checking with fallback handling
- **Duplicate prevention**: File deduplication by name and size

### Network Security
- **CORS configuration**: Development proxy handles CORS for local development
- **HTTPS requirements**: Production deployments should use HTTPS for secure communication
- **WebSocket/SSE security**: Event streaming secured through same-origin policy
- **API communication**: All communication goes through OpenCode's secure API layer

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

### Advanced Theme Architecture

**Theme Structure** (`src/lib/theme/themes/`):
- **TypeScript-based themes**: Full type safety with comprehensive color definitions
- **Hierarchical color system**: Primary, surface, interactive, status, and syntax colors
- **Component-specific overrides**: Markdown, chat, and tool-specific theming
- **Runtime theme switching**: Dynamic CSS variable generation and application

**Theme Files**:
- `default-dark.ts`: Warm dark theme with golden accents
- `default-light.ts`: Warm light theme with golden accents
- `index.ts`: Theme exports and registration

### Color System Architecture

**Primary Colors** (`colors.primary`):
```typescript
primary: {
  base: '#edb449',           // Golden accent (dark theme)
  hover: '#d4a03f',
  active: '#ba8e36',
  foreground: '#151313',     // Dark text on golden
  muted: '#edb44980',
  emphasis: '#f0c060'
}
```

**Surface Colors** (`colors.surface`):
```typescript
surface: {
  background: '#151313',     // Dark background
  foreground: '#cdccc3',     // Light text
  muted: '#1f1d1b',          // Slightly lighter dark
  mutedForeground: '#9b9a93',
  elevated: '#252321',       // Elevated surfaces
  elevatedForeground: '#d4d3ca',
  overlay: '#00000080',
  subtle: '#2a2826'
}
```

**Interactive Colors** (`colors.interactive`):
```typescript
interactive: {
  border: '#3a3836',
  borderHover: '#4a4846',
  borderFocus: '#edb449',
  selection: '#edb44930',
  selectionForeground: '#cdccc3',
  focus: '#edb449',
  focusRing: '#edb44950',
  cursor: '#edb449',
  hover: '#2a2826',
  active: '#323030'
}
```

**Status Colors** (`colors.status`):
```typescript
status: {
  error: '#e06c75',
  errorForeground: '#ffffff',
  errorBackground: '#e06c7520',
  errorBorder: '#e06c7550',
  // warning, success, info with similar structure
}
```

### Syntax Highlighting System

**Base Syntax Colors** (`colors.syntax.base`):
```typescript
syntax: {
  base: {
    background: '#1a1817',     // Code block background
    foreground: '#cdccc3',     // Default text
    comment: '#7d7c75',        // Muted gray
    keyword: '#c678dd',        // Purple
    string: '#98c379',         // Green
    number: '#d19a66',         // Orange
    function: '#61afef',       // Blue
    variable: '#e06c75',       // Red
    type: '#56b6c2',           // Cyan
    operator: '#abb2bf'        // Gray
  }
}
```

**Advanced Token System** (`colors.syntax.tokens`):
- **Comment variants**: `commentDoc`, `commentBlock`
- **String handling**: `stringEscape`, `stringInterpolation`, `stringRegex`
- **Keyword types**: `keywordControl`, `keywordImport`, `keywordReturn`
- **Function variants**: `functionCall`, `functionBuiltin`, `method`
- **Variable types**: `variableBuiltin`, `variableProperty`, `parameter`
- **Type system**: `typePrimitive`, `typeInterface`, `className`
- **Markup support**: `tag`, `tagAttribute`, `tagAttributeValue`

### Component-Specific Theming

**Markdown Colors** (`colors.markdown`):
```typescript
markdown: {
  heading1: '#edb449',
  heading2: '#edb449dd',
  heading3: '#edb449bb',
  heading4: '#cdccc3',
  link: '#61afef',
  linkHover: '#71bfff',
  inlineCode: '#98c379',
  inlineCodeBackground: '#2a282620',
  blockquote: '#9b9a93',
  blockquoteBorder: '#3a3836',
  listMarker: '#edb44999'
}
```

**Chat Colors** (`colors.chat`):
```typescript
chat: {
  userMessage: '#cdccc3',
  userMessageBackground: '#252321',
  assistantMessage: '#cdccc3',
  assistantMessageBackground: '#1f1d1b',
  timestamp: '#7d7c75',
  divider: '#3a3836'
}
```

**Tool Colors** (`colors.tools`):
```typescript
tools: {
  background: '#1f1d1b30',
  border: '#3a383650',
  headerHover: '#2a282650',
  icon: '#9b9a93',
  title: '#cdccc3',
  description: '#7d7c75',
  edit: {
    added: '#98c379',
    addedBackground: '#98c37915',
    removed: '#e06c75',
    removedBackground: '#e06c7515',
    lineNumber: '#4a4846'
  }
}
```

### CSS Variable Generation

**Dynamic CSS Generation** (`src/lib/theme/cssGenerator.ts`):
- **Runtime theme compilation**: Converts TypeScript themes to CSS variables
- **Inheritance resolution**: Smart color inheritance and manipulation
- **Tailwind integration**: Automatic Tailwind CSS variable mapping
- **Component overrides**: Component-specific color application

**Generated CSS Variables**:
```css
/* Core semantic colors */
--background: #151313 !important;
--foreground: #cdccc3 !important;
--primary: #edb449 !important;
--primary-foreground: #151313 !important;

/* Extended theme variables */
--primary-base: #edb449;
--primary-hover: #d4a03f;
--primary-active: #ba8e36;
--surface-background: #151313;
--surface-muted: #1f1d1b;
--interactive-border: #3a3836;
--interactive-focus: #edb449;

/* Syntax highlighting */
--syntax-background: #1a1817;
--syntax-keyword: #c678dd;
--syntax-string: #98c379;
--syntax-function: #61afef;

/* Component specific */
--markdown-heading1: #edb449;
--chat-user-message-bg: #252321;
--tools-background: #1f1d1b30;
```

### Theme Application System

**Runtime Theme Switching**:
- **DOM manipulation**: Dynamic `<style>` injection
- **CSS variable override**: `!important` declarations for Tailwind compatibility
- **Class management**: Automatic `dark`/`light` class application
- **Cleanup**: Proper style element removal and replacement

**Theme Persistence**:
- **localStorage**: User theme preferences
- **System detection**: Automatic light/dark mode detection
- **Fallback handling**: Graceful degradation for missing theme data

### Configuration System

**Theme Metadata** (`metadata`):
```typescript
metadata: {
  id: 'default-dark',
  name: 'Dark',
  description: 'Default dark theme with warm colors',
  author: 'OpenCode Team',
  version: '1.0.0',
  variant: 'dark',
  tags: ['dark', 'warm', 'default'],
  wcagCompliance: {
    AA: true,
    AAA: false
  }
}
```

**Configuration Options** (`config`):
```typescript
config: {
  fonts: {
    sans: 'system-ui, -apple-system, BlinkMacSystemFont...',
    mono: '"SF Mono", Monaco, "Cascadia Code"...',
    heading: 'system-ui, -apple-system...'
  },
  radius: {
    none: '0',
    sm: '0.125rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
    full: '9999px'
  },
  transitions: {
    fast: '150ms ease',
    normal: '250ms ease',
    slow: '350ms ease'
  }
}
```

### Tailwind CSS v4 Integration

**Inline Theme Configuration** (`src/index.css`):
```css
@theme {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  /* ... additional mappings */
}
```

**Dynamic Variable Override**:
- **Runtime CSS injection**: Theme variables override Tailwind defaults
- **Priority handling**: `!important` ensures theme variables take precedence
- **Component compatibility**: Seamless integration with shadcn/ui components

### Theme Development Workflow

**Theme Creation Process**:
1. **Define color palette**: Primary, surface, and accent colors
2. **Configure syntax highlighting**: Base colors and token variants
3. **Set component colors**: Markdown, chat, and tool-specific theming
4. **Add configuration**: Fonts, radius, and transitions
5. **Test compatibility**: Ensure WCAG compliance and cross-browser support

**Theme Validation**:
- **TypeScript validation**: Full type checking for theme objects
- **Color contrast**: Automatic WCAG compliance checking
- **Syntax completeness**: Validation of required color properties
- **Runtime testing**: Theme switching and CSS variable generation

**Theme Distribution**:
- **Built-in themes**: Included with the application
- **User themes**: JSON-based theme files in `~/.config/opencode-webui/themes/`
- **Theme sharing**: Export/import functionality for custom themes
- **Version compatibility**: Theme versioning and migration support

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
- `Cmd/Ctrl + X` - Command palette
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

### Development flow:
- Agent: working with code, check syntaxt, do not try to run things like dev server.
- User: testing stuff, by having opencode api and npm dev server running and watching and testing agents changes on the go and provide feedback.

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
