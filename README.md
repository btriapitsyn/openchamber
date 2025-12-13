# OpenChamber

Web and desktop interface for the [OpenCode](https://opencode.ai) AI coding agent. Works alongside the OpenCode TUI.

The OpenCode team is actively working on their own desktop app. I still decided to release this project as a fan-made alternative.

It was entirely built with OpenCode tool - first with the TUI version, then with the first usable version of OpenChamber, which I then used to build the rest.

The whole project was built entirely with AI coding agents under my supervision. It started as a hobby project and proof of concept that AI agents can create genuinely usable software.

![OpenChamber Chat](docs/references/chat_example.png)

<details>
<summary>More screenshots</summary>

![Tool Output](docs/references/tool_output_example.png)
![Settings](docs/references/settings_example.png)
![Web Version](docs/references/web_version_example.png)
![VS Code Extension](docs/references/vscode_extension.png)
<p>
<img src="docs/references/pwa_chat_example.png" width="45%" alt="PWA Chat">
<img src="docs/references/pwa_terminal_example.png" width="45%" alt="PWA Terminal">
</p>

</details>

## Why use OpenChamber?

- **Cross-device continuity**: Start in TUI, continue on tablet/phone, return to terminal - same session
- **Remote access**: Use OpenCode from anywhere via browser
- **Familiarity**: A visual alternative for developers who prefer GUI workflows

## Features

- Integrated terminal
- Git operations with identity management and AI commit message generation
- Beautiful themes (Flexoki Light/Dark) with dynamic CSS variable system
- Mobile-optimized with edge-swipe gestures, terminal control and optimizations all around
- Git worktrees operations with isolating sessions within them
- Memory optimizations with LRU eviction
- Rich permission cards with syntax-highlighted operation previews
- Smart tool visualization (inline diffs, file trees, results highlighting)
- Per-agent permission mode control (ask, allow, full) adjustable per-session
- Familiar diff viewer like you're used to in VSCode
- Built-in OpenCode agent/command management

## Installation

### VS Code Extension

Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=fedaykindev.openchamber) or search "OpenChamber" in Extensions.

### CLI (Web Server)

```bash
pnpm add -g openchamber

openchamber                          # Start on port 3000
openchamber --port 8080              # Custom port
openchamber --daemon                 # Background mode
openchamber --ui-password secret     # Password-protect UI
openchamber stop                     # Stop server
```

### Desktop App (macOS)

Download from [Releases](https://github.com/btriapitsyn/openchamber/releases).

## Prerequisites

- [OpenCode CLI](https://opencode.ai) installed and running (`opencode serve`)
- Node.js 20+

## Development

```bash
git clone https://github.com/btriapitsyn/openchamber.git
cd openchamber
pnpm install

pnpm run dev:web:full    # Web development
pnpm run desktop:dev     # Desktop development (Tauri)
pnpm run build           # Production build
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Tech Stack

React 19, TypeScript, Vite 7, Tailwind CSS v4, Zustand, Radix UI, @opencode-ai/sdk, Express, Tauri (desktop)

## Acknowledgments

Independent project, not affiliated with OpenCode team.

**Special thanks to:**

- [OpenCode](https://opencode.ai) - For the excellent API and extensible architecture
- [Flexoki](https://github.com/kepano/flexoki) - Beautiful color scheme by [Steph Ango](https://stephango.com/flexoki)
- [Tauri](https://github.com/tauri-apps/tauri) - Desktop application framework
- [David Hill](https://x.com/iamdavidhill) - who inspired me to release this without [overthinking](https://x.com/iamdavidhill/status/1993648326450020746?s=20)
- My wife, who created a beautiful firework animation for the app while testing it for the first time

## License

MIT
