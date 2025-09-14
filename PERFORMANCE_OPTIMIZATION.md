# OpenCode WebUI Performance Optimization Strategy

## Problem Statement

The OpenCode WebUI currently stores all messages from all visited sessions in browser memory without any cleanup mechanism. This leads to:
- Browser tab becoming sluggish over time
- Memory exhaustion with heavy usage
- Poor performance when switching between sessions with large message histories
- File attachments (base64 encoded) amplifying memory consumption

## Solution Architecture

### Core Strategy: Two-Level Memory Management

1. **Session-Level LRU Cache**: Maximum 5 sessions in memory
2. **Message-Level Viewport Window**: 50 messages per session around current viewport
3. **Special Streaming State**: Temporary exemption from limits during active AI responses

## Implementation Details

### Memory Limits Configuration

```typescript
const MEMORY_LIMITS = {
  MAX_SESSIONS: 5,                    // LRU cache for sessions
  VIEWPORT_MESSAGES: 30,               // Messages around viewport during normal state
  STREAMING_BUFFER: Infinity,         // No limit during active streaming
  BACKGROUND_STREAMING_BUFFER: 100,   // Limit for background sessions
  ZOMBIE_TIMEOUT: 10 * 60 * 1000      // 10 minutes zombie stream protection
}
```

### Session Memory State Structure

```typescript
interface SessionMemoryState {
  messages: MessageWithParts[]
  viewportAnchor: number               // Index of message at viewport center
  isStreaming: boolean
  streamStartTime: number
  lastAccessedAt: number              // For LRU tracking
  backgroundMessageCount: number       // New messages while session in background
  isZombie?: boolean                  // Timeout protection flag
}
```

## Behavioral Rules

### 1. Active Session (Currently Viewing)

**During Streaming:**
- No message limit - accumulate all incoming messages
- Real-time updates displayed immediately
- No eviction during active response generation

**After Streaming Completes or User Sends Message:**
- Trim to 50 messages around viewport
- Viewport anchoring: 25 messages before + 25 after current position
- Adjust window if near conversation boundaries

### 2. Background Session (Still Streaming)

**Key Principle:** Never abort server-side computation on session switch

**Behavior:**
- Continue receiving streaming updates in background
- Soft limit of 150 messages (3x normal)
- Track new message count for UI indicator
- If exceeds limit: drop oldest messages, keep newest
- Zombie protection: Stop accepting updates after 10 minutes

**UI Indicators:**
- Pulsing dot showing active streaming
- Badge with count of new messages
- Warning icon for zombie streams

### 3. Background Session (Idle)

**Memory Management:**
- Subject to LRU eviction when opening 6th session
- Maintain only last 50 messages
- Quick restore: fetch additional messages on return if needed

## Implementation Phases

### Phase 1: Message Pagination & Viewport Window
- Implement viewport tracking in `useSessionStore`
- Add message window trimming logic
- Create `trimToViewportWindow()` function
- Add scroll position tracking

### Phase 2: Session LRU Cache
- Add `lastAccessedAt` timestamp to session state
- Implement LRU eviction when exceeding 5 sessions
- Create `evictLeastRecentlyUsed()` function
- Update session access timestamps on switch

### Phase 3: Background Streaming Management
- Track streaming state per session
- Implement background message limits
- Add zombie stream detection
- Create UI indicators for background activity

### Phase 4: Optimizations
- Implement virtual scrolling for large message lists
- Add "Clear Cache" manual control
- Optimize file attachment handling (store references, not data URLs)
- Add performance metrics monitoring

## Technical Implementation Details

### Message Window Algorithm

```typescript
function trimToViewportWindow(sessionId: string, targetSize: number = 50) {
  const session = getSession(sessionId)
  if (session.messages.length <= targetSize) return
  
  // Find viewport center (or use last message if not set)
  const anchor = session.viewportAnchor || session.messages.length - 1
  
  // Calculate window boundaries
  let start = Math.max(0, anchor - Math.floor(targetSize / 2))
  let end = Math.min(session.messages.length, start + targetSize)
  
  // Adjust if we're at the boundaries
  if (end === session.messages.length && end - start < targetSize) {
    start = Math.max(0, end - targetSize)
  }
  
  // Trim messages
  session.messages = session.messages.slice(start, end)
  
  // Update viewport anchor to new relative position
  session.viewportAnchor = anchor - start
}
```

### LRU Eviction Algorithm

```typescript
function evictLeastRecentlyUsed() {
  const sessions = Array.from(sessionCache.entries())
  
  // Skip currently active and streaming sessions
  const evictable = sessions.filter(([id, state]) => 
    id !== currentSessionId && !state.isStreaming
  )
  
  if (evictable.length === 0) return // Nothing to evict
  
  // Find least recently used
  const lru = evictable.reduce((oldest, current) => 
    current[1].lastAccessedAt < oldest[1].lastAccessedAt ? current : oldest
  )
  
  // Remove from cache
  sessionCache.delete(lru[0])
}
```

### Streaming Update Handler

```typescript
function handleStreamingUpdate(sessionId: string, part: Part) {
  const session = getSession(sessionId)
  
  // Active session - no limits
  if (sessionId === currentSessionId) {
    addMessagePart(part)
    return
  }
  
  // Background streaming - apply soft limits
  if (session.messages.length >= MEMORY_LIMITS.BACKGROUND_STREAMING_BUFFER) {
    session.messages.shift() // Remove oldest
  }
  
  addMessagePart(part)
  session.backgroundMessageCount++
  
  // Zombie detection
  const streamDuration = Date.now() - session.streamStartTime
  if (streamDuration > MEMORY_LIMITS.ZOMBIE_TIMEOUT && !session.isZombie) {
    session.isZombie = true
    console.warn(`Zombie stream detected: ${sessionId}`)
  }
}
```

## Edge Cases & Handling

### 1. Rapid Session Switching
- Don't abort streams on switch
- Apply memory cleanup only to non-streaming sessions
- Update lastAccessedAt timestamps

### 2. Long Running Streams
- Zombie detection after 10 minutes
- Visual warning to user
- Stop accepting new parts but don't abort

### 3. Network Disconnection
- Maintain current state
- Show connection lost indicator
- Attempt reconnection without losing messages

### 4. File Attachments
- Future optimization: Store only file metadata
- Load file content on-demand when viewing
- Clear data URLs after message send

## Success Metrics

1. **Memory Usage**: Browser tab memory should stabilize and not grow unbounded
2. **Performance**: Session switching should remain fast (<100ms)
3. **User Experience**: No lost messages or unexpected behavior
4. **Resource Efficiency**: No wasted API computations from aborted streams

## Future Enhancements

1. **Virtual Scrolling**: Render only visible messages in DOM
2. **Persistent Cache**: Optional IndexedDB storage for offline access
3. **Compression**: Compress message content in memory
4. **Intelligent Prefetching**: Predict and preload likely next sessions
5. **File Streaming**: Stream large file attachments instead of base64 encoding

## Testing Strategy

1. **Memory Profiling**: Chrome DevTools heap snapshots
2. **Stress Testing**: Create sessions with 1000+ messages
3. **Concurrent Streaming**: Test multiple background streams
4. **Network Simulation**: Test with slow/intermittent connections
5. **Edge Case Validation**: Rapid switching, long streams, large files

## Testing the Implementation

### Debug Panel Access
Press `Cmd/Ctrl + Shift + M` to open the Memory Debug Panel which shows:
- Total messages in memory
- Cached sessions count
- Messages per session
- Streaming indicators
- Manual trim and eviction controls

### Key Behaviors
1. **Initial Load**: Sessions load only the last 30 messages
2. **Scroll to Load**: Scrolling near the top loads 30 more messages seamlessly
3. **Always Start at Bottom**: Sessions open showing the most recent messages
4. **Subtle Loading**: Small spinner appears when fetching older messages
5. **Transparent Experience**: No visible message counts or load buttons in production

## Migration Path

Since this changes fundamental storage behavior:
1. Version check in localStorage
2. Clear old message cache on first load
3. Inform users of performance improvements
4. Provide manual cache clear option

## References

- Original issue: Browser sluggishness with heavy usage
- Session store: `/src/stores/useSessionStore.ts`
- OpenCode client: `/src/lib/opencode/client.ts`
- LRU Cache algorithm: https://en.wikipedia.org/wiki/Cache_replacement_policies#LRU
- Virtual scrolling: Consider `react-window` or `react-virtualized`