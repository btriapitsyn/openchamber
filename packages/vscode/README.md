# OpenChamber VS Code Extension

[![GitHub stars](https://img.shields.io/github/stars/btriapitsyn/openchamber?style=flat&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgZmlsbD0iI2YxZWNlYyIgdmlld0JveD0iMCAwIDI1NiAyNTYiPjxwYXRoIGQ9Ik0yMjkuMDYsMTA4Ljc5bC00OC43LDQyLDE0Ljg4LDYyLjc5YTguNCw4LjQsMCwwLDEtMTIuNTIsOS4xN0wxMjgsMTg5LjA5LDczLjI4LDIyMi43NGE4LjQsOC40LDAsMCwxLTEyLjUyLTkuMTdsMTQuODgtNjIuNzktNDguNy00MkE4LjQ2LDguNDYsMCwwLDEsMzEuNzMsOTRMOTUuNjQsODguOGwyNC42Mi01OS42YTguMzYsOC4zNiwwLDAsMSwxNS40OCwwbDI0LjYyLDU5LjZMMjI0LjI3LDk0QTguNDYsOC40NiwwLDAsMSwyMjkuMDYsMTA4Ljc5WiIgb3BhY2l0eT0iMC4yIj48L3BhdGg%2BPHBhdGggZD0iTTIzOS4xOCw5Ny4yNkExNi4zOCwxNi4zOCwwLDAsMCwyMjQuOTIsODZsLTU5LTQuNzZMMTQzLjE0LDI2LjE1YTE2LjM2LDE2LjM2LDAsMCwwLTMwLjI3LDBMOTAuMTEsODEuMjMsMzEuMDgsODZhMTYuNDYsMTYuNDYsMCwwLDAtOS4zNywyOC44Nmw0NSwzOC44M0w1MywyMTEuNzVhMTYuMzgsMTYuMzgsMCwwLDAsMjQuNSwxNy44MkwxMjgsMTk4LjQ5bDUwLjUzLDMxLjA4QTE2LjQsMTYuNCwwLDAsMCwyMDMsMjExLjc1bC0xMy43Ni01OC4wNyw0NS0zOC44M0ExNi40MywxNi40MywwLDAsMCwyMzkuMTgsOTcuMjZabS0xNS4zNCw1LjQ3LTQ4LjcsNDJhOCw4LDAsMCwwLTIuNTYsNy45MWwxNC44OCw2Mi44YS4zNy4zNywwLDAsMS0uMTcuNDhjLS4xOC4xNC0uMjMuMTEtLjM4LDBsLTU0LjcyLTMzLjY1YTgsOCwwLDAsMC04LjM4LDBMNjkuMDksMjE1Ljk0Yy0uMTUuMDktLjE5LjEyLS4zOCwwYS4zNy4zNywwLDAsMS0uMTctLjQ4bDE0Ljg4LTYyLjhhOCw4LDAsMCwwLTIuNTYtNy45MWwtNDguNy00MmMtLjEyLS4xLS4yMy0uMTktLjEzLS41cy4xOC0uMjcuMzMtLjI5bDYzLjkyLTUuMTZBOCw4LDAsMCwwLDEwMyw5MS44NmwyNC42Mi01OS42MWMuMDgtLjE3LjExLS4yNS4zNS0uMjVzLjI3LjA4LjM1LjI1TDE1Myw5MS44NmE4LDgsMCwwLDAsNi43NSw0LjkybDYzLjkyLDUuMTZjLjE1LDAsLjI0LDAsLjMzLjI5UzIyNCwxMDIuNjMsMjIzLjg0LDEwMi43M1oiPjwvcGF0aD48L3N2Zz4%3D&logoColor=FFFCF0&labelColor=100F0F&color=66800B)](https://github.com/btriapitsyn/openchamber/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/btriapitsyn/openchamber?style=flat&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgZmlsbD0iI2YxZWNlYyIgdmlld0JveD0iMCAwIDI1NiAyNTYiPjxwYXRoIGQ9Ik04OCw2NEEyNCwyNCwwLDEsMSw2NCw0MCwyNCwyNCwwLDAsMSw4OCw2NFpNMTkyLDQwYTI0LDI0LDAsMSwwLDI0LDI0QTI0LDI0LDAsMCwwLDE5Miw0MFoiIG9wYWNpdHk9IjAuMiI%2BPC9wYXRoPjxwYXRoIGQ9Ik0yMjQsNjRhMzIsMzIsMCwxLDAtNDAsMzF2MTdhOCw4LDAsMCwxLTgsOEg4MGE4LDgsMCwwLDEtOC04Vjk1YTMyLDMyLDAsMSwwLTE2LDB2MTdhMjQsMjQsMCwwLDAsMjQsMjRoNDB2MjVhMzIsMzIsMCwxLDAsMTYsMFYxMzZoNDBhMjQsMjQsMCwwLDAsMjQtMjRWOTVBMzIuMDYsMzIuMDYsMCwwLDAsMjI0LDY0Wk00OCw2NEExNiwxNiwwLDEsMSw2NCw4MCwxNiwxNiwwLDAsMSw0OCw2NFptOTYsMTI4YTE2LDE2LDAsMSwxLTE2LTE2QTE2LDE2LDAsMCwxLDE0NCwxOTJaTTE5Miw4MGExNiwxNiwwLDEsMSwxNi0xNkExNiwxNiwwLDAsMSwxOTIsODBaIj48L3BhdGg%2BPC9zdmc%2B&logoColor=FFFCF0&labelColor=100F0F&color=BC5215)](https://github.com/btriapitsyn/openchamber/network/members)
[![GitHub release](https://img.shields.io/github/v/release/btriapitsyn/openchamber?style=flat&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgZmlsbD0iI2YxZWNlYyIgdmlld0JveD0iMCAwIDI1NiAyNTYiPjxwYXRoIGQ9Ik0xMjgsMTI5LjA5VjIzMmE4LD8sMCwwLDEtMy44NC0xbC04OC00OC4xOGE4LDgsMCwwLDEtNC4xNi03VjgwLjE4YTgsOCwwLDAsMSwuNy0zLjI1WiIgb3BhY2l0eT0iMC4yIj48L3BhdGg%2BPHBhdGggZD0iTTIyMy42OCw2Ni4xNSwxMzUuNjgsMThhMTUuODgsMTUuODgsMCwwLDAtMTUuMzYsMGwtODgsNDguMTdhMTYsMTYsMCwwLDAtOC4zMiwxNHY5NS42NGExNiwxNiwwLDAsMCw4LjMyLDE0bDg4LDQ4LjE3YTE1Ljg4LDE1Ljg4LDAsMCwwLDE1LjM2LDBsODgtNDguMTdhMTYsMTYsMCwwLDAsOC4zMi0xNFY4MC4xOEExNiwxNiwwLDAsMCwyMjMuNjgsNjYuMTVaTTEyOCwzMmw4MC4zNCw0NC0yOS43NywxNi4zLTgwLjM1LTQ0Wk0xMjgsMTIwLDQ3LjY2LDc2bDMzLjktMTguNTYsODAuMzQsNDRaTTQwLDkwbDgwLDQzLjc4djg1Ljc5TDQwLDE3NS44MlptMTc2LDg1Ljc4aDBsLTgwLDQzLjc5VjEzMy44MmwzMi0xNy41MVYxNTJhOCw4LDAsMCwwLDE2LDBWMTA3LjU1TDIxNiw5MHY4NS43N1oiPjwvcGF0aD48L3N2Zz4%3D&logoColor=FFFCF0&labelColor=100F0F&color=205EA6)](https://github.com/btriapitsyn/openchamber/releases/latest)
[![Discord](https://img.shields.io/badge/Discord-join.png?style=flat&labelColor=100F0F&color=8B7EC8&logo=discord&logoColor=FFFCF0)](https://discord.gg/ZYRSdnwwKA)
[![Support the project](https://img.shields.io/badge/Support-Project-black?style=flat&labelColor=100F0F&color=EC8B49&logo=ko-fi&logoColor=FFFCF0)](https://ko-fi.com/G2G41SAWNS)

OpenChamber inside VS Code: embeds the OpenChamber chat UI in the activity bar and connects it to the [OpenCode](https://opencode.ai) API.

![VS Code Extension](https://github.com/btriapitsyn/openchamber/raw/HEAD/packages/vscode/extension.jpg)

- Project overview + screenshots: https://github.com/btriapitsyn/openchamber

## Features

### OpenChamber UI

- Smart tool visualization (inline diffs, file trees, results highlighting)
- Rich permission cards with syntax-highlighted operation previews
- Per-agent permission modes (ask/allow/full) per session
- Branchable conversations: start a new session from any assistant response
- Task tracker UI with live progress and tool summaries
- Model selection UX (favorites, recents, and configurable tool output density)
- UI scaling controls (font size and spacing)

### VS Code Integration

- Chat UI in activity bar
- Session management with history
- File attachments via native VS Code file picker (10MB limit)
- Click-to-open files from tool output
- Auto-start `opencode` instance if not running
- Workspace-isolated OpenCode instances (different workspaces get unique instances)
- Adapts to VS Code's light/dark/high-contrast themes

## Commands

| Command | Description |
|---------|-------------|
| `OpenChamber: Focus on Chat View` | Focus chat panel |
| `OpenChamber: Restart API Connection` | Restart OpenCode API process |
| `OpenChamber: Show OpenCode Status` | Provide debug info useful for development or bug report |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `openchamber.apiUrl` | `http://localhost:47339` | OpenCode API server URL. Not required by default. Spawns its own process when not set. |

## Requirements

- OpenCode CLI installed and available in PATH (or set via `OPENCODE_BINARY` env var)
- VS Code 1.85.0+

## Development

```bash
bun install
bun run --cwd packages/vscode build            # build extension + webview
cd packages/vscode && bunx vsce package --no-dependencies
```

## Local Install

- After packaging: `code --install-extension packages/vscode/openchamber-*.vsix`
- Or in VS Code: Extensions panel → "Install from VSIX…" and select the file
