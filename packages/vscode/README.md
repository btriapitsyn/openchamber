# OpenChamber VS Code Extension

AI coding assistant for VS Code using the OpenCode API, adapted from the OpenChamber web/desktop UI. Designed for a narrow side-panel layout (no built-in terminal/git/notifications) with session navigation, chat, and model metadata.

## Features
- Chat UI with streaming and session history
- Workspace-aware OpenCode process manager and API proxy
- Filesystem browsing/search limited to the VS Code workspace
- Context usage display and model metadata fetch via the extension host

## Development
```bash
pnpm install
pnpm -C packages/vscode run build            # build extension + webview
pnpm -C packages/vscode exec vsce package --no-dependencies
```

## Local Install
- After packaging, install the VSIX: `code --install-extension packages/vscode/openchamber-*.vsix`
- Or in VS Code: Extensions panel → “Install from VSIX…” and select the file.

## Publishing
CI workflow `.github/workflows/vscode-extension.yml` packages and (when secrets are set) publishes to VS Code Marketplace (`VSCE_PAT`) and Open VSX (`OVSX_PAT`). Trigger via tags `v*` or manual dispatch.
