# OpenChamber

A complementary web interface for the OpenCode AI coding agent, designed to work alongside the excellent OpenCode TUI.

## About

OpenChamber is an open-source, self-hosted control surface for the OpenCode TUI (Terminal User Interface). Built with deep appreciation for the OpenCode team's excellent architecture and API design, this project wouldn't exist without their foundational work.

### Why OpenChamber?

This isn't a replacement for the TUI - it's a companion tool that extends OpenCode's accessibility:

- **Cross-device continuity**: Start a session in the TUI on your workstation, continue on your iPad or phone via the web interface, then seamlessly return to the terminal - all using the same session history
- **Remote accessibility**: Access your OpenCode instance from anywhere through a web browser
- **Personal tool**: Designed for individual developers' self-hosting needs, not enterprise deployment
- **Unified experience**: Both TUI and OpenChamber share the same OpenCode API backend, ensuring consistent session management and message history

### Use Cases

- Access OpenCode from mobile devices (iPad, tablets, phones) while away from your development machine
- Continue coding sessions across different devices and interfaces
- Provide a familiar chat-like interface for those who prefer web UIs
- Enable OpenCode access on devices where terminal access isn't practical

## Features

- **Session handoff**: Seamlessly continue sessions between TUI and OpenChamber
- **File attachments**: Drag and drop files directly into the chat interface
- **Directory selection**: Navigate and select working directories visually
- **Real-time streaming**: Live updates of AI responses and tool executions with stable terminal WebSocket connection
- **Multiple AI providers**: Support for various models and agents
- **Tool execution display**: Syntax highlighting, diffs, and execution visualization
- **Git identity management**: Profile-based Git identity switching with comprehensive operation support
- **AI commit message generation**: Auto-generate commit messages using OpenCode AI agents
- **AI prompt enhancement**: Refine and optimize prompts with configurable rules and live preview
- **Slash commands**: Complete slash commands management interface and configuration
- **Integrated terminal**: Full terminal emulation with auto-reconnect and xterm.js rendering
- **Advanced diff visualization**: Optimized sidebar with improved diff rendering and git change tracking
- **Built-in themes**: 15 carefully crafted themes with custom syntax highlighting (Catppuccin, Gruvbox, Rosé Pine, Ayu, Kanagawa, Solarized, One Dark, and more)
- **Font customization**: Support for multiple programming fonts including Paper Mono, JetBrains Mono, Fira Code, Cascadia Code
- **Typography control**: Semantic typography system with adjustable sizes for different content types
- **Mobile-optimized interface**: Responsive design with utilities panel and edge-swipe gestures
- **Section-based navigation**: Modular interface with dedicated sections for agents, commands, Git identities, providers, sessions, prompt enhancer, and settings

## Tech Stack

### Frontend
- React 19.1.1 with TypeScript 5.8.3
- Vite 7.1.2 for fast development and building
- Tailwind CSS v4.0.0 (latest)
- shadcn/ui components (canary)
- Zustand 5.0.8 for state management with persistence
- FlowToken 1.0.40 for animated text rendering
- Xterm.js 5.3.0 for terminal emulation

### Backend & Integration
- @opencode-ai/sdk ^1.0.11 for OpenCode integration
- Express 5.1.0 for production server
- node-pty 1.0.0 for terminal sessions
- simple-git 3.28.0 for Git operations
- Electron 38.2.0 for desktop runtime

## Installation

### For Users

Install and run OpenChamber globally via npm:

```bash
npm install -g openchamber

# Quick start (default port 3000)
openchamber

# Common options
openchamber --port 8080              # Custom port
openchamber --daemon                 # Background mode
openchamber --ui-password mySecret   # Password-protect UI

# Management
openchamber status                   # Check running instances
openchamber stop                     # Stop server
openchamber --help                   # See all commands and options
```

## UI Authentication

You can gate the browser UI behind a single password supplied when the server starts:

- Set the password via `openchamber serve --ui-password <secret>` or the `OPENCHAMBER_UI_PASSWORD` environment variable.
- The guard applies to all `/api/**` requests exposed through the web deployment; the Electron app remains password-free.
- Browser clients see a lightweight unlock screen and receive an `HttpOnly` session cookie on success; sessions expire automatically after periods of inactivity.

### For Development

```bash
# Clone the repository
git clone https://github.com/yourusername/openchamber.git
cd openchamber

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run CLI interface
npm run cli

# Launch desktop app locally (prebuilt web bundle required)
npm run start:electron

# Package signed macOS distributables (DMG + ZIP)
npm run package:electron
```

## Prerequisites

- OpenCode CLI installed and running (`opencode api`)
- Node.js 16.0.0+ (LTS recommended)
- Modern web browser

## Desktop Application (macOS)

The Electron 38.2.0 desktop build wraps the Express+OpenCode runtime so the UI bundles with its own backend:

1. `npm run build:package` generates the production web assets (`dist/`) and compiles Electron entry points (`dist-electron/`).
2. `npm run start:electron` runs the desktop app locally and automatically starts `opencode serve` on a free port. The OpenCode process is terminated when the desktop app exits.
3. `npm run package:electron` produces notarisation-ready DMG and ZIP artifacts in `release/`. These bundles embed the OpenChamber, Express proxy, and OpenCode process management.

The launcher reads the PATH of your login shell (e.g. `~/.zshrc`) and merges it with common install prefixes, so the bundled app will usually find the `opencode` CLI automatically. If your setup is still non-standard, set `OPENCODE_BINARY` to the absolute path of the CLI to override detection.

The renderer continues to talk to `/api` just like the web deployment because the embedded Express server proxies requests into the OpenCode process.

## Project Structure

```
src/
├── components/
│   ├── chat/           # Chat interface components
│   │   ├── message/    # Message rendering and parts
│   │   └── [components] # ChatContainer, ChatInput, StreamingAnimatedText, etc.
│   ├── layout/         # Main layout components (Header, Sidebar, RightSidebar, SettingsDialog)
│   ├── providers/      # React context providers (ThemeProvider)
│   ├── right-sidebar/  # Right sidebar utilities tabs
│   │   ├── GitTab      # Git operations and commit workflow
│   │   ├── DiffTab     # File diff visualization
│   │   ├── TerminalTab # Terminal emulation
│   │   └── PromptRefinerTab # Prompt enhancement preview
│   ├── sections/       # Main application sections
│   │   ├── agents/     # AI agents management
│   │   ├── commands/   # Slash commands configuration
│   │   ├── git-identities/ # Git identity profiles
│   │   ├── prompt-enhancer/ # AI prompt refinement settings
│   │   ├── providers/  # AI providers setup
│   │   ├── sessions/   # Session management
│   │   └── settings/   # Application settings
│   ├── session/        # Session management dialogs (DirectoryTree, DirectoryExplorerDialog)
│   └── ui/             # shadcn/ui components and utilities
├── constants/          # Application constants (sidebar config, etc.)
├── hooks/              # Custom React hooks
├── lib/
│   ├── opencode/       # OpenCode SDK integration
│   ├── theme/          # Theme system with 15 built-in themes
│   └── [utilities]     # Various utility modules (gitApi, terminalApi, promptApi, etc.)
├── stores/             # Zustand state management stores
├── types/              # TypeScript type definitions
└── styles/             # Global styles and fonts
```

## Development

The project uses:
- **Tailwind CSS v4.0.0** with the new @import syntax
- **shadcn/ui canary** version for v4 compatibility
- **TypeScript 5.8.3** for full type safety
- **ESLint 9.33.0** for code linting
- **Vite 7.1.2** for fast development and building
- **Zustand 5.0.8** for state management with persistence
- **FlowToken 1.0.40** for animated text rendering
- **@opencode-ai/sdk ^1.0.11** for OpenCode integration

## Self-Hosting

OpenChamber is designed for personal self-hosting:

1. Run on your development workstation alongside OpenCode CLI
2. Access from any device on your network
3. Configure reverse proxy for secure remote access
4. No user management needed - it's your personal tool

## Acknowledgments

This project exists thanks to the OpenCode team's excellent work on:
- The robust and well-designed OpenCode API
- The powerful TUI that serves as the primary interface
- The thoughtful architecture that enables tools like this to exist

Special thanks to the OpenCode community for creating such an extensible and developer-friendly platform.

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues.

## License

MIT
