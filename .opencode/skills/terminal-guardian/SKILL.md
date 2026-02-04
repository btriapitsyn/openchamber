---
name: terminal-guardian
description: Expert skill for managing terminal processes, fixing port conflicts, and detecting hung builds.
---

# Terminal Guardian Skill

Use this skill when dealing with long-running processes or terminal errors.

## Core Directives

1. **Port Cleanup**: If a command fails with "Port already in use", find the PID (`netstat -ano | findstr :<port>`) and kill it (`taskkill /F /PID <pid>`).
2. **Hang Detection**: If a build process takes 2x the normal time, terminate it, clear cache (e.g., `node_modules/.cache`), and retry.
3. **Environment Sync**: Ensure `.env` files are updated before starting dev servers.
4. **Log Analysis**: Search terminal buffers (via `useTerminalStore`) for "Deprecation", "Critical", or "Out of memory" errors.

## Automation Snippets

- **Kill Port (Windows)**: `netstat -ano | findstr :3000` -> `taskkill /F /PID <PID>`
- **Clear Bun Cache**: `bun pm cache rm`
- **Clear NPM Cache**: `npm cache clean --force`

_Vibe: Protective, Janitorial, Robust._
