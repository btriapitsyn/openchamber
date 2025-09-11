# Product Requirements Document (PRD)
## OpenCode WebUI

**Version:** 1.0  
**Date:** September 2025  
**Author:** Bohdan (Team Lead, DevOps Engineer)  
**Project Type:** Self-hosted open-source web application  
**License:** MIT

---

## 1. Executive Summary

OpenCode WebUI is a web-based interface for the OpenCode CLI agent coding tool that replaces the terminal UI (TUI) with a modern, responsive web application. The project enables users to interact with OpenCode through a chat interface accessible from both desktop and mobile devices.

### Key Objectives
- Provide a user-friendly web interface for OpenCode
- Enable mobile access to OpenCode functionality
- Maintain feature parity with essential TUI operations
- Create a self-hosted, open-source solution

---

## 2. Technical Architecture

### 2.1 Technology Stack

**Frontend:**
- React 18+ with TypeScript
- shadcn/ui components (Radix UI + Tailwind CSS)
- @opencode-ai/sdk for API communication
- Vite as build tool
- Zustand for state management

**Backend:**
- OpenCode server (existing solution)
- Node.js runtime environment
- Automatic server spawning capability

### 2.2 System Architecture

```
┌─────────────────────────────────────┐
│         Web Browser                 │
│  ┌─────────────────────────────┐    │
│  │    OpenCode WebUI (React)   │    │
│  └──────────┬──────────────────┘    │
└─────────────┼───────────────────────┘
              │ HTTP/WebSocket
              ▼
┌─────────────────────────────────────┐
│     OpenCode Server (port 4096)     │
│  ┌─────────────────────────────┐    │
│  │      OpenAPI 3.1 Spec       │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│    Local File System & LLM APIs     │
└─────────────────────────────────────┘
```

### 2.3 Deployment Model
- Self-hosted Node.js application
- No multi-tenant support in v1.0
- Optional Docker containerization in future versions

---

## 3. Functional Requirements

### 3.1 MVP Features (Version 1.0)

#### 3.1.1 Chat Interface
- **Text input area** for entering prompts
- **Message display** with full markdown support
  - Code syntax highlighting
  - Tables, lists, and formatting
- **Real-time streaming** of AI responses
- **Abort functionality** to stop ongoing operations
- **Message history** with scroll capability
- **Auto-scroll** to latest messages

#### 3.1.2 Session Management
- **Session list view** showing all available sessions
- **Create new session** with auto-generated or custom names
- **Switch between sessions** seamlessly
- **Session persistence** across page refreshes
- **Active session indicator** in the UI
- **Delete session** capability

#### 3.1.3 Model & Provider Selection
- **Dropdown selector** for choosing AI providers (Anthropic, OpenAI, etc.)
- **Model selection** within each provider
- **Real-time switching** during conversations
- **Current selection display** in the interface
- **Default provider/model** settings

#### 3.1.4 UI/UX Features
- **Dark/Light theme** toggle with system preference detection
- **Responsive design** for mobile devices
  - Touch-optimized controls
  - Hamburger menu for navigation
  - Adaptive layout breakpoints
- **Toast notifications** for system messages
- **Loading states** for all async operations
- **Error handling** with user-friendly messages

#### 3.1.5 Keyboard Shortcuts
- `Ctrl/Cmd + Enter` - Submit prompt
- `Ctrl/Cmd + K` - Open command palette
- `Ctrl/Cmd + N` - New session
- `Ctrl/Cmd + /` - Toggle theme
- `Escape` - Abort current operation

#### 3.1.6 Server Management
- **Auto-start** OpenCode server if not running
- **Connection status** indicator
- **Reconnection logic** for dropped connections
- **Server health monitoring**

### 3.2 Deferred Features (Future Versions)

#### Phase 2 Features
- Configuration file editing (~/.config/opencode/opencode.json)
- Authentication settings management (~/.local/share/opencode/auth.json)
- File browser for project structure
- Agent management interface
- Session sharing via links

#### Phase 3 Features
- Multi-user support with authentication
- Parallel agent execution
- Git integration
- File search and content search
- Symbol search functionality
- Advanced file operations (patches, diffs)

---

## 4. Non-Functional Requirements

### 4.1 Performance
- Initial page load < 3 seconds
- Message response time < 100ms (excluding AI processing)
- Smooth scrolling on mobile devices
- Support for sessions with 1000+ messages

### 4.2 Compatibility
- **Browsers:** Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **Devices:** Desktop, tablets, smartphones
- **Screen sizes:** 320px minimum width
- **OpenCode server:** Compatible with latest version

### 4.3 Security
- No sensitive data in localStorage
- Secure WebSocket connections when using HTTPS
- Input sanitization for all user inputs
- XSS protection for markdown rendering

### 4.4 Accessibility
- WCAG 2.1 Level AA compliance
- Keyboard navigation support
- Screen reader compatibility
- High contrast mode support

---

## 5. User Interface Design

### 5.1 Desktop Layout
```
┌─────────────────────────────────────────────┐
│  Header Bar                                 │
│  [Logo] [Sessions] [Model: Claude] [Theme] │
├─────────────────────────────────────────────┤
│                                             │
│           Chat Message Area                │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ AI: Hello! How can I help you?      │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │ User: Create a React component      │   │
│  └─────────────────────────────────────┘   │
│                                             │
├─────────────────────────────────────────────┤
│  Input Area                                 │
│  [Type your message...        ] [Send] [⚙] │
└─────────────────────────────────────────────┘
```

### 5.2 Mobile Layout
- Collapsed header with hamburger menu
- Full-width message display
- Fixed bottom input area
- Swipe gestures for navigation

### 5.3 Component Library (shadcn/ui)
- **Button** - Primary actions
- **Input/Textarea** - User input
- **Select/Dropdown** - Model selection
- **Dialog/Modal** - Settings, confirmations
- **Toast** - Notifications
- **ScrollArea** - Message history
- **Theme Toggle** - Dark/light mode
- **Card** - Message containers
- **Skeleton** - Loading states

---

## 6. API Integration

### 6.1 Core Endpoints Used

**Session Management:**
- `GET /session` - List all sessions
- `POST /session` - Create new session
- `DELETE /session/:id` - Delete session
- `GET /session/:id/message` - Get message history
- `POST /session/:id/message` - Send new message
- `POST /session/:id/abort` - Abort current operation

**Configuration:**
- `GET /config` - Get configuration
- `GET /config/providers` - Get available providers

**App Management:**
- `GET /app` - Get app info
- `POST /app/init` - Initialize app

**Events:**
- `GET /event` - SSE stream for real-time updates

### 6.2 SDK Usage
```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:4096"
})
```

---

## 7. Development Approach

### 7.1 Implementation Phases

**Phase 1: Foundation (Week 1-2)**
- Project setup with React + TypeScript + Vite
- shadcn/ui integration
- Basic layout and routing
- OpenCode SDK integration

**Phase 2: Core Features (Week 3-4)**
- Chat interface implementation
- Session management
- Message streaming
- Model selection

**Phase 3: Polish (Week 5-6)**
- Mobile responsive design
- Theme implementation
- Keyboard shortcuts
- Error handling

**Phase 4: Testing & Documentation (Week 7)**
- Unit and integration tests
- User documentation
- Deployment guide
- Performance optimization

### 7.2 AI Agent Development Strategy
Since the development will be done by AI agents, the code should be:
- Highly modular with clear separation of concerns
- Well-commented with JSDoc documentation
- Following React best practices and hooks patterns
- Using TypeScript strict mode
- Implementing comprehensive error boundaries

---

## 8. Success Metrics

### 8.1 Technical Metrics
- Zero critical bugs in production
- 90%+ browser compatibility
- < 500ms average response time
- 95%+ uptime

### 8.2 User Experience Metrics
- Successful message sending rate > 99%
- Mobile usability score > 90
- Feature parity with essential TUI functions
- Successful session management operations > 99%

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenCode API changes | High | Version lock SDK, monitor updates |
| WebSocket connection issues | Medium | Implement robust reconnection logic |
| Mobile performance | Medium | Optimize bundle size, lazy loading |
| Browser compatibility | Low | Use polyfills, progressive enhancement |

---

## 10. Repository Structure

```
opencode-webui/
├── src/
│   ├── components/
│   │   ├── chat/
│   │   ├── session/
│   │   ├── ui/           # shadcn components
│   │   └── layout/
│   ├── hooks/
│   ├── lib/
│   │   ├── opencode/     # SDK wrapper
│   │   └── utils/
│   ├── stores/           # Zustand stores
│   ├── styles/
│   └── types/
├── public/
├── docs/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── README.md
└── LICENSE (MIT)
```

---

## 11. Getting Started Guide

### For Developers
```bash
# Clone repository
git clone https://github.com/[username]/opencode-webui.git

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### For End Users
```bash
# Install opencode-webui
npm install -g opencode-webui

# Start the application
opencode-webui

# Access at http://localhost:3000
```

---

## 12. Conclusion

OpenCode WebUI aims to democratize access to the powerful OpenCode AI coding agent by providing an intuitive, modern web interface. By focusing on core functionality in v1.0 and planning for iterative improvements, we can deliver a valuable tool to the developer community while maintaining high quality and usability standards.

The project's open-source nature and self-hosted architecture ensure users maintain full control over their development environment while benefiting from a superior user experience compared to terminal-based interfaces.