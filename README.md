# OpenCode WebUI

A modern web-based interface for OpenCode AI coding agent.

## Tech Stack

- React 18 with TypeScript
- Vite
- Tailwind CSS v4 (latest)
- shadcn/ui components (canary)
- Zustand for state management
- @opencode-ai/sdk

## Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

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

## License

MIT