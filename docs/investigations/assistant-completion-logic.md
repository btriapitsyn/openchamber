# Assistant Completion Detection Logic

The UI detects "work complete" in `packages/ui/src/hooks/useAssistantStatus.ts` using the following primary signal:

## definitive Completion Signal
The assistant is considered "done" when the **last assistant message** contains a **`step-finish` part** with the reason **"stop"**.

```typescript
// useAssistantStatus.ts
const hasStopFinish = (lastAssistant.parts ?? []).some(
    (part) => isStepFinishPart(part) && getStepFinishReason(part) === 'stop'
);
```

## Secondary Signals (Context)
The UI also checks for:
-   **Active Tools:** If a tool is `running` or `pending`.
-   **Streaming Text:** If a text part has no `time.end`.
-   **Reasoning:** If a reasoning block has no `time.end`.

If any of these are active, the status is "working" (streaming/tooling/thinking). If none are active AND `hasStopFinish` is present, it transitions to "idle" (Done).

## Proposed Rust Implementation
We can replicate the definitive signal in the Tauri backend without maintaining full session state:

1.  **Intercept `message.updated` events** in `sse.rs`.
2.  **Inspect Payload:** Look for the `parts` array.
3.  **Check for Stop:** Scan for a part where `type == "step-finish"` and `reason == "stop"`.
4.  **Deduplicate:** Store the `message_id` of the last notified completion to prevent spamming notifications if the server sends multiple updates for the same completed message.
5.  **Trigger Notification:** If it's a new completion, invoke `notify_agent_completion`.

This approach is robust because "step-finish: stop" is the protocol's explicit signal that the turn is over.
