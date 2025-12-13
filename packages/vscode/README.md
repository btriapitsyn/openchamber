# OpenChamber VS Code Extension

AI coding assistant for VS Code powered by the OpenCode API. Embeds the OpenChamber chat interface in VS Code's secondary sidebar.

![VS Code Extension](../../docs/references/vscode_extension.png)

## Features

- Chat UI in secondary sidebar
- Session management with history
- File attachments via native VS Code file picker (10MB limit)
- Auto-start `opencode serve` if not running
- Workspace-isolated opencode instances (different workspaces get unique opencode instances)
- Adapts to VS Code's light/dark/high-contrast themes

## Commands

| Command | Description |
|---------|-------------|
| `OpenChamber: New Chat Session` | Create new chat session |
| `OpenChamber: Focus Chat` | Focus chat panel in secondary sidebar |
| `OpenChamber: Restart API Connection` | Restart OpenCode API process |
| `OpenChamber: Show in Secondary Side Bar` | Toggle chat panel visibility |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `openchamber.apiUrl` | `http://localhost:47339` | OpenCode API server URL |

## Requirements

- OpenCode CLI installed and available in PATH (or set via `OPENCODE_BINARY` env var)
- VS Code 1.85.0+

## Development

```bash
pnpm install
pnpm -C packages/vscode run build            # build extension + webview
pnpm -C packages/vscode exec vsce package --no-dependencies
```

## Local Install

- After packaging: `code --install-extension packages/vscode/openchamber-*.vsix`
- Or in VS Code: Extensions panel → "Install from VSIX…" and select the file
