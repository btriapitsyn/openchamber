# Missing Assistant Message Text via Streaming Events

## Problem Statement

For certain assistant messages the WebUI displays only the avatar and header
("Assistant") without any message body. Debug traces show the streaming
lifecycle completing, but no textual parts are ever registered in the store.
The event log contains something similar to the following:

```
message_updated → completed
parts_received: 0
```

When inspecting the same session via the REST API
(`GET /session/{id}/message/{messageID}`), the server response also reports
zero text parts—for example, only `step-start` / `step-finish` markers. The
OpenCode TUI (CLI) uses the same SSE stream and does not perform any fallback
fetch either, so it ends up with the same data when the server never sends a
text part.

## Observations

- The issue is **not caused by the WebUI dropping streaming parts**. All
  SSE payloads arriving at the browser match the backend state: no text part
  exists on the server once the assistant message is marked completed.
- Relying solely on SSE means a single lost text payload (because the backend
  did not emit it) leaves the UI with a permanently empty message.
- The TUI behaves identically because it also depends entirely on SSE events and
  never re-fetches completed messages.

## Proposed Mitigation (Deferred)

Introduce a targeted fallback path in the WebUI:

1. **Detect empty assistant completions** – after receiving a `message.updated`
   event with `role === 'assistant'`, `status/completed` true, and `parts.length === 0`.
2. **Delay briefly** (e.g. 100–200 ms) to allow any late-arriving parts to land.
3. **Issue a single REST call** (`GET /session/{id}/message/{messageID}`) if the
   message is still empty.
4. **Populate the store with the fetched parts** when the backend returns text,
   or show an explicit “assistant responded without content” marker if the
   message remains empty.

Reasons to postpone implementation:

- The backend may eventually address the missing text parts at the source.
- The fallback adds extra network chatter and potential race conditions if not
  carefully scoped.

## Follow-Up

Revisit this mitigation once we have clarity on the backend behaviour or after
collecting more occurrences. If the server cannot guarantee text delivery solely
through SSE, the WebUI fallback becomes necessary to avoid blank assistant
messages in production.
