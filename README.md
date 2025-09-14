# OpenCode WebUI

A complementary web interface for the OpenCode AI coding agent, designed to work alongside the excellent OpenCode TUI.

## About

OpenCode WebUI is an open-source, self-hosted web interface that complements the OpenCode TUI (Terminal User Interface). Built with deep appreciation for the OpenCode team's excellent architecture and API design, this project wouldn't exist without their foundational work.

### Why OpenCode WebUI?

This isn't a replacement for the TUI - it's a companion tool that extends OpenCode's accessibility:

- **Cross-device continuity**: Start a session in the TUI on your workstation, continue on your iPad or phone via the web interface, then seamlessly return to the terminal - all using the same session history
- **Remote accessibility**: Access your OpenCode instance from anywhere through a web browser
- **Personal tool**: Designed for individual developers' self-hosting needs, not enterprise deployment
- **Unified experience**: Both TUI and WebUI share the same OpenCode API backend, ensuring consistent session management and message history

### Use Cases

- Access OpenCode from mobile devices (iPad, tablets, phones) while away from your development machine
- Continue coding sessions across different devices and interfaces
- Provide a familiar chat-like interface for those who prefer web UIs
- Enable OpenCode access on devices where terminal access isn't practical

## Features

- **Session handoff**: Seamlessly continue sessions between TUI and WebUI
- **File attachments**: Drag and drop files directly into the chat interface
- **Directory selection**: Navigate and select working directories visually
- **Real-time streaming**: Live updates of AI responses and tool executions
- **Multiple AI providers**: Support for various models and agents
- **Tool execution display**: Syntax highlighting, diffs, and execution visualization
- **Dark/Light themes**: Custom Dune-inspired design for comfortable viewing

## Tech Stack

- React 18 with TypeScript
- Vite
- Tailwind CSS v4 (latest)
- shadcn/ui components (canary)
- Zustand for state management
- @opencode-ai/sdk

## Installation

### For Users (Coming Soon)

Once published, you'll be able to install OpenCode WebUI as a simple npm package:

```bash
# Install globally
npm install -g opencode-webui

# Run the web interface
opencode-webui
```

### For Development

```bash
# Clone the repository
git clone https://github.com/yourusername/opencode-webui.git
cd opencode-webui

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Prerequisites

- OpenCode CLI installed and running (`opencode api`)
- Node.js 18+ 
- Modern web browser

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

OpenCode WebUI is designed for personal self-hosting:

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