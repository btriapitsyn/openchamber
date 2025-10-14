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
- **Real-time streaming**: Live updates of AI responses and tool executions
- **Multiple AI providers**: Support for various models and agents
- **Tool execution display**: Syntax highlighting, diffs, and execution visualization
- **Dark/Light themes**: Custom Dune-inspired design for comfortable viewing

## Tech Stack

- React 19 with TypeScript
- Vite
- Tailwind CSS v4 (latest)
- shadcn/ui components (canary)
- Zustand for state management
- Electron 31 for the desktop runtime
- @opencode-ai/sdk

## Installation

### For Users (Coming Soon)

Once published, you'll be able to install OpenChamber as a simple npm package:

```bash
# Install globally
npm install -g openchamber

# Run the web interface
openchamber
```

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

# Launch desktop app locally (prebuilt web bundle required)
npm run start:electron

# Package signed macOS distributables (DMG + ZIP)
npm run package:electron
```

## Prerequisites

- OpenCode CLI installed and running (`opencode api`)
- Node.js 18+ 
- Modern web browser

## Desktop Application (macOS)

The Electron desktop build wraps the Express+OpenCode runtime so the UI bundles with its own backend:

1. `npm run build:package` generates the production web assets (`dist/`) and compiles Electron entry points (`dist-electron/`).
2. `npm run start:electron` runs the desktop app locally and automatically starts `opencode serve` on a free port. The OpenCode process is terminated when the desktop app exits.
3. `npm run package:electron` produces notarisation-ready DMG and ZIP artifacts in `release/`. These bundles embed the OpenChamber, Express proxy, and OpenCode process management.

The launcher reads the PATH of your login shell (e.g. `~/.zshrc`) and merges it with common install prefixes, so the bundled app will usually find the `opencode` CLI automatically. If your setup is still non-standard, set `OPENCODE_BINARY` to the absolute path of the CLI to override detection.

The renderer continues to talk to `/api` just like the web deployment because the embedded Express server proxies requests into the OpenCode process.

## Project Structure

```
src/
├── components/
│   ├── chat/           # Chat components
│   ├── session/        # Session management
│   ├── layout/         # Layout components
│   └── ui/            # shadcn/ui components
├── hooks/             # Custom React hooks
├── lib/
│   ├── opencode/      # OpenCode SDK integration
│   └── utils.ts       # Utilities
├── stores/            # Zustand stores
└── types/             # TypeScript types
```

## Development

The project uses:
- **Tailwind CSS v4** with the new @import syntax
- **shadcn/ui canary** version for v4 compatibility
- **mise** for Node.js version management

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
