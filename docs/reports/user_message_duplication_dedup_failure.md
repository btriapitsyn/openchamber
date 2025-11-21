# Investigation: User Message Duplication Persistence

## Objective
Eliminate the visual duplication of user messages in the UI, specifically in scenarios involving optimistic UI updates followed by server confirmation (e.g., sending a message, minimizing the app, and waking it up). The goal is for the optimistic message (client-generated ID) to be seamlessly replaced by the server-confirmed message (server-generated ID).

## The Issue
When a user sends a message:
1.  **Optimistic Creation:** A message is created locally with a temporary ID (e.g., `msg_176...`) and added to the store. Its ID is tracked in `pendingUserMessageIds`.
2.  **Server Processing:** The server processes the request and eventually returns the "real" message with a new ID (e.g., `msg_aa3...`).
3.  **Duplication:** Instead of replacing the optimistic message, the UI displays **both**:
    *   The optimistic message (stuck in "queued" state).
    *   The server message (confirmed).

This duplication is most persistent when the app is minimized/backgrounded during the process, leading to a full `syncMessages` or `loadMessages` event upon wake-up.

## Implemented Deduplication Strategies (in `messageStore.ts`)

We have implemented a robust, multi-layered matching logic in both `loadMessages` and `syncMessages`:

### 1. ID Match (Standard)
Checks if the pending message ID exists in the server response.
*   *Limitation:* Fails because the server assigns a new, random UUID-based ID, which differs from the client's timestamp-based ID.

### 2. Content Match (Primary Deduplication)
Compares the text content of pending messages against server messages.
*   **Logic:** `getMessageText(msg) === getMessageText(serverMsg)`
*   **Enhancements:** Whitespace normalization (`.trim().replace(/\s+/g, ' ')`) to handle formatting differences.
*   **Status:** Implemented but apparently failing to catch the duplicate in the reported scenario.

### 3. Timestamp Match (Fallback)
If content matching fails, we look for "unclaimed" server user messages created within a 2-second window of the pending message.
*   **Logic:** `abs(pendingTime - serverTime) < 2000ms`
*   **Status:** Implemented to catch edge cases (e.g., invisible characters, serialization diffs), but the issue persists.

## Potential Root Causes & Next Steps

Since logic-based filtering (ID/Content/Time) is failing, the issue likely lies outside the matching function itself:

1.  **State Persistence (`zustand/persist`):**
    *   Is `pendingUserMessageIds` being persisted and then rehydrated incorrectly, causing the store to "forget" which messages are pending, thus skipping the deduplication filter entirely?
    *   *Investigation:* Check `partialize` config in `messageStore.ts`.

2.  **Race Conditions:**
    *   Is `pendingUserMessageIds` being cleared *before* the deduplication logic runs? (e.g., by a separate event handler or a race in `_addStreamingPartImmediate`).
    *   If the ID is removed from the pending set, the `filter` in `loadMessages` sees it as a "confirmed" message (just with a different ID) and keeps it.

3.  **Render Cycle / React Key Issues:**
    *   Are we deduplicating correctly in the *store*, but React is holding onto the old component instance due to keying issues? (Unlikely if the store array is updated, but possible).

4.  **"Ghost" Messages:**
    *   Is the optimistic message being added to `state.messages` *without* being added to `pendingUserMessageIds` in some specific reconnect/retry path?

## Action Plan
1.  **Audit State Lifecycle:** trace exactly when and where `pendingUserMessageIds` is modified.
2.  **Debug Persistence:** Verify if pending states survive app restart/rehydration.
3.  **Force Deduplication:** Consider a "brute force" cleanup that scans *all* messages in history for duplicate content within small time windows, regardless of "pending" status (risky but effective).
