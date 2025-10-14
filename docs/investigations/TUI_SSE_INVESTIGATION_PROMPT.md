# OpenCode TUI SSE Investigation Prompt

You are investigating the OpenCode TUI / CLI codebase. Focus on how it handles
Server-Sent Events coming from the OpenCode API and how it recovers message
content when the stream finishes without any text parts.

## Goals
1. Identify every module that subscribes to `/api/event` (or the equivalent SSE
   endpoint) and listens for `message.part.*`, `message.delta`, `message.updated`,
   `message.step*`, or other message-related events.
2. Explain the control flow from the moment an assistant reply starts streaming
   until it is rendered in the TUI. Cover:
   - Creation of the EventSource (or fetch loop).
   - Dispatching of SSE payloads into the store/state management layer.
   - Any deduplication or filtering for pending user messages.
3. Determine whether the TUI performs a fallback fetch when it sees a
   `step-finish`/`message.updated` event but has no textual parts recorded.
   - If yes, list the function(s) responsible for the refetch and the REST
     endpoint(s) they call (e.g. `GET /session/{id}/message/{messageID}`).
   - If no, describe any alternative mechanism that guarantees text content is
     eventually present (for instance, delayed deltas, tool outputs, etc.).
4. Note any heuristics that might differ from the OpenChamber implementation, including
   role derivation, message completion detection, or special handling for empty
   assistant messages.

## Deliverables
- File paths and brief descriptions for the relevant source files.
- A concise step-by-step narrative of the streaming lifecycle in the TUI.
- An explicit answer on whether the TUI implements a REST fallback (and how).
- Any recommendations for porting the behaviour to the OpenChamber, if applicable.

Please return the findings in markdown with headings so we can integrate them
into our docs and implementation notes.
