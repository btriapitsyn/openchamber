# Backend-Side Notification Trigger Plan

## Problem
When the Tauri desktop app is minimized on macOS, the `WKWebView` (frontend) is throttled or suspended by the OS to save power. This causes the HTTP connection (EventSource) between the frontend and the backend to time out or close.

Since the frontend logic (`WorkingPlaceholder.tsx`) is responsible for triggering the "Task Completed" notification upon receiving a specific event, no notification is sent if the app is backgrounded during a long-running task.

## Constraint
We have proven that the **Rust backend process** stays awake (thanks to `NSProcessInfo` assertions), but the **JavaScript frontend** cannot be reliably forced to stay awake/connected without using private APIs that crash the app.

## Solution: Backend-Driven Notifications
Move the responsibility of detecting task completion and triggering the notification from the **Frontend (JS)** to the **Backend (Rust)**.

The Rust proxy already handles the `/api/event` stream. It acts as a "dumb pipe" today. We will make it "smart" enough to peek at the stream content and fire the notification itself.

## Implementation Strategy

### 1. Stream Inspection in `proxy_to_opencode`
- Modify `packages/desktop/src-tauri/src/main.rs`.
- Identify when a request is for the event stream (`/api/event`).
- Instead of just piping the `reqwest::Response` body directly to `axum::Response`, we need to wrap the body stream.

### 2. Stream Parser (The "Peeker")
- Create a `StreamBody` wrapper that implements `Stream`.
- As chunks of bytes pass through from `opencode` CLI to the frontend:
    - Clone or inspect the chunk buffer.
    - Search for the Server-Sent Event (SSE) signature for task completion.
    - Example pattern: `event: message.updated` ... `status: "completed"`.
    - **Performance Note:** This must be efficient to avoid adding latency. We only need to scan for specific substrings.

### 3. Trigger Logic
- When the completion pattern is detected:
    - Invoke the existing `notify_agent_completion` logic directly from Rust code (refactoring it out of the Tauri command handler into a shared helper function).
    - Ensure we don't double-notify (though the frontend de-duplication logic usually handles this, if the frontend is dead, it won't matter).

### 4. Notification Payload
- The notification title/body might need to be generic ("Assistant Task Completed") since parsing the full JSON from the stream to get specific context might be complex/expensive in the proxy layer.
- Alternatively, we can parse just enough to get the `title` if available in the completion event.

## Technical Challenges
- **Hyper/Axum Body Streams:** Handling the stream types correctly in Rust (pinning, polling) can be tricky.
- **Partial Chunks:** An SSE event might be split across two network chunks. A robust implementation needs a small buffer or a state machine to handle split markers (e.g., using a crate like `eventsource-stream` or a simple sliding window).
- **Compression:** If the upstream `opencode` CLI sends gzipped responses, the proxy needs to handle that (though typically local loopback is uncompressed).

## Success Criteria
1.  User starts a long task.
2.  User minimizes the app immediately.
3.  The frontend connection *may* die (as expected).
4.  The task completes in the `opencode` CLI.
5.  The Rust proxy sees the completion event in the stream.
6.  A native macOS notification fires ("Task Completed").
7.  User clicks notification -> App focuses -> Frontend "Soft Refreshes" -> Latest state is shown.

## Next Steps
1.  Refactor `notify_agent_completion` in `notifications.rs` to be callable from `main.rs` directly.
2.  Implement the stream inspection middleware/wrapper in `main.rs`.
3.  Test with minimization scenario.
