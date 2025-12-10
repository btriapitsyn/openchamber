# VS Code Extension Plan

Chat UI sidebar panel for VS Code that connects to OpenCode backend.

## Goals

- Sidebar webview panel with OpenChamber chat UI
- Reuse `@openchamber/ui` components (ChatView, stores, hooks)
- Auto-detect VS Code theme (light/dark) and adapt
- Use workspace folder as OpenCode directory
- Support `@file` mentions via VS Code workspace API

## Package Structure

```
packages/vscode/
├── src/
│   ├── extension.ts              # Extension entry, registers webview
│   ├── ChatViewProvider.ts       # WebviewViewProvider for sidebar
│   ├── bridge.ts                 # Webview <-> Extension host messaging
│   └── theme.ts                  # VS Code theme detection
├── webview/
│   ├── main.tsx                  # Webview React entry
│   ├── App.tsx                   # Minimal App (chat-only, no layout)
│   └── api/
│       ├── index.ts              # createVSCodeAPIs()
│       ├── files.ts              # File listing via extension host
│       └── settings.ts           # Theme/config from VS Code
├── package.json                  # Extension manifest
├── tsconfig.json
├── tsconfig.webview.json
└── vite.config.ts                # Webview bundler
```

## Implementation Tasks

### Phase 1: Extension Scaffold

1. Create `packages/vscode/` directory structure
2. Create `package.json` with extension manifest
   - Sidebar view contribution
   - Commands (new session)
   - Configuration (API URL)
3. Create `tsconfig.json` for extension host (Node.js)
4. Create `tsconfig.webview.json` for webview (browser)
5. Create `vite.config.ts` for webview bundling
6. Add workspace reference in root `pnpm-workspace.yaml`

### Phase 2: Extension Host

1. `src/extension.ts` - activate/deactivate, register provider
2. `src/ChatViewProvider.ts` - WebviewViewProvider implementation
   - Generate HTML with CSP
   - Handle webview lifecycle
   - Pass workspace folder to webview
3. `src/bridge.ts` - Message handler for webview requests
   - `files:list` - list directory contents
   - `files:search` - fuzzy file search
   - `workspace:folder` - get workspace root
4. `src/theme.ts` - Detect VS Code color theme kind

### Phase 3: Webview Runtime

1. `webview/main.tsx` - React entry point
2. `webview/App.tsx` - Simplified app shell
   - No MainLayout/Header/Sidebar
   - Just ChatView + essential providers
   - Theme sync with VS Code
3. `webview/api/index.ts` - createVSCodeAPIs()
   - RuntimeAPIs implementation
   - IPC bridge to extension host
4. `webview/api/files.ts` - FilesAPI via postMessage
5. `webview/api/settings.ts` - SettingsAPI (theme from VS Code)

### Phase 4: Theme Integration

1. Listen to `vscode.window.onDidChangeActiveColorTheme`
2. Map VS Code theme kind to OpenChamber light/dark
3. Post theme changes to webview
4. Apply theme CSS variables dynamically

### Phase 5: File Context Support

1. Implement `files:list` in extension host using `vscode.workspace.fs`
2. Implement `files:search` using `vscode.workspace.findFiles`
3. Wire up to ChatInput `@file` autocomplete

### Phase 6: Build & Package

1. Add build scripts to `packages/vscode/package.json`
2. Add root-level scripts (`vscode:dev`, `vscode:build`, `vscode:package`)
3. Configure `.vscodeignore` for clean packaging
4. Test extension in VS Code Extension Host

## Dependencies

### Extension Host (Node.js)
- `@types/vscode` - VS Code API types
- `esbuild` - Bundle extension.ts

### Webview (Browser)
- `@openchamber/ui` (workspace) - Shared UI components
- `vite` + `@vitejs/plugin-react` - Bundle React app
- `@opencode-ai/sdk` - OpenCode API client

## Extension Manifest Highlights

```json
{
  "contributes": {
    "views": {
      "explorer": [{
        "type": "webview",
        "id": "openchamber.chatView",
        "name": "OpenChamber"
      }]
    },
    "commands": [{
      "command": "openchamber.newSession",
      "title": "OpenChamber: New Chat Session"
    }],
    "configuration": {
      "properties": {
        "openchamber.apiUrl": {
          "type": "string",
          "default": "http://localhost:47339"
        }
      }
    }
  }
}
```

## Reused from @openchamber/ui

| Module | Status |
|--------|--------|
| `components/chat/*` | Reuse all |
| `components/views/ChatView` | Reuse |
| `stores/useSessionStore` | Reuse |
| `stores/useConfigStore` | Reuse |
| `stores/useUIStore` | Partial (no sidebar state) |
| `hooks/useEventStream` | Reuse |
| `hooks/useMessageSync` | Reuse |
| `lib/opencode/client` | Reuse |
| `lib/theme/*` | Reuse (CSS generation) |
| `components/layout/*` | Skip |
| `components/views/GitView` | Skip |
| `components/views/DiffView` | Skip |
| `components/views/TerminalView` | Skip |

## Not Needed (handled by VS Code)

- Terminal API (VS Code integrated terminal)
- Git API (VS Code SCM)
- Notifications API (VS Code notifications)
- Permissions API (VS Code handles sandbox)
- Directory picker (workspace folder used)

## Decisions

- **View location**: Explorer sidebar
- **Sidebar icon**: Reuse from `packages/web/public/` (tab icon)
- **Marketplace icon**: Reuse from `packages/desktop/src-tauri/icons/app-icon-checkpoint.svg`
- **Publisher**: `fedaykindev` (dev.azure.com/fedaykindev, artmore@protonmail.com)
