# OpenCode SDK Reference Guide
## For AI Agent Development

This document contains essential SDK information for developing openchamber.

## Installation
```bash
npm install @opencode-ai/sdk
```

## Basic Client Setup
```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"
import type { 
  Session, 
  Message, 
  Part,
  Provider,
  Agent,
  Config,
  App
} from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:4096"
})
```

## Core API Methods

### Session Management
```typescript
// List all sessions
const sessions: Session[] = await client.session.list()

// Create new session
const session: Session = await client.session.create({
  parentID?: string,  // optional
  title?: string      // optional
})

// Get specific session
const session: Session = await client.session.get({ id: string })

// Delete session
const success: boolean = await client.session.delete({ id: string })

// Update session title
const session: Session = await client.session.update({ 
  id: string, 
  title?: string 
})

// Get session messages
const messages: { info: Message, parts: Part[] }[] = 
  await client.session.messages({ id: string })

// Send chat message
const message: Message = await client.session.chat({
  id: string,           // session ID
  providerID: string,   // e.g., "anthropic"
  modelID: string,      // e.g., "claude-3-5-sonnet-20241022"
  parts: Part[]         // message parts
})

// Abort current operation
const success: boolean = await client.session.abort({ id: string })

// Initialize session with model
const success: boolean = await client.session.init({
  id: string,
  messageID: string,
  providerID: string,
  modelID: string
})
```

### Configuration
```typescript
// Get config
const config: Config = await client.config.get()

// Get providers
const result: {
  providers: Provider[],
  default: { [key: string]: string }
} = await client.config.providers()
```

### App Management
```typescript
// Get app info
const app: App = await client.app.get()

// Initialize app
const success: boolean = await client.app.init()
```

### Real-time Events (Server-Sent Events)
```typescript
// Subscribe to events
const eventStream = await client.event.subscribe()

for await (const event of eventStream) {
  console.log("Event:", event.type, event.properties)
  // Handle different event types:
  // - server.connected
  // - session.message.part
  // - session.message.complete
  // - session.abort
  // etc.
}
```

### Authentication
```typescript
// Set provider credentials
const success: boolean = await client.auth.set({
  id: string,        // provider ID
  type: "api",       // auth type
  key: string        // API key
})
```

### File Operations
```typescript
// Search text in files
const results = await client.find.text({ 
  pattern: string 
})

// Find files by name
const files: string[] = await client.find.files({ 
  query: string 
})

// Read file content
const content: {
  type: "raw" | "patch",
  content: string
} = await client.file.read({ 
  path: string 
})

// Get file status
const files: File[] = await client.file.status()
```

### Agent Management
```typescript
// List available agents
const agents: Agent[] = await client.agent.list()
```

## Type Definitions

### Part Type
```typescript
type Part = {
  type: "text" | "code" | "image" | "file" | "thinking"
  text?: string
  language?: string
  path?: string
  // ... other properties based on type
}
```

### Message Structure
```typescript
interface Message {
  id: string
  sessionID: string
  role: "user" | "assistant" | "system"
  createdAt: string
  providerID?: string
  modelID?: string
  // ... other properties
}
```

### Session Structure
```typescript
interface Session {
  id: string
  title?: string
  parentID?: string
  createdAt: string
  updatedAt: string
  shareID?: string
  // ... other properties
}
```

### Provider Structure
```typescript
interface Provider {
  id: string
  name: string
  models: Model[]
  // ... other properties
}
```

## Error Handling
```typescript
try {
  const session = await client.session.get({ id: "invalid" })
} catch (error) {
  // Handle errors appropriately
  console.error("Failed to get session:", error.message)
}
```

## WebSocket Events Pattern
The SDK handles WebSocket connections internally. Events come through the SSE endpoint:

1. `server.connected` - Initial connection established
2. `session.message.part` - Streaming message parts
3. `session.message.complete` - Message finished
4. `session.abort` - Operation aborted
5. `session.error` - Error occurred

## Important Notes for Implementation

1. **Always check if server is running** before making requests
2. **Handle reconnection** for dropped WebSocket connections
3. **Stream responses** using the event system for real-time updates
4. **Type imports** should come from `@opencode-ai/sdk`
5. **Server default port** is 4096 but can be configured

## Server Startup
```typescript
import { createOpencodeServer } from "@opencode-ai/sdk"

// Programmatically start server
const server = await createOpencodeServer({
  host: "127.0.0.1",
  port: 4096
})

console.log(`Server running at ${server.url}`)

// Later: close server
server.close()
```

## OpenAPI Spec
The full OpenAPI 3.1 specification is available at:
`http://localhost:4096/doc`

This can be used to verify exact request/response formats.