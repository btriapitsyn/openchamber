# PRD: Session Pause & Resume

## Introduction

Add the ability to pause an active AI session and resume it later, even after a reboot. When a session is paused, the AI's current operation is stopped and the session is bookmarked with a visual "paused" indicator. The user can later click "Resume" to automatically re-send the last user message and pick up where the AI left off, including restoring in-progress tool calls and partial results from the conversation history.

## Goals

- Allow users to freeze an active AI session mid-work so they can reboot or step away
- Persist enough context (last user message, in-progress tool state, partial results) that the session can be meaningfully resumed
- Provide a clear visual indicator in both the chat UI and session sidebar for paused sessions
- Offer a one-click resume that automatically re-sends the last prompt to continue work
- Keep the pause button alongside the existing stop button (not replacing it)

## User Stories

### US-001: Pause button in chat input area

**Description:** As a user, I want a pause button next to the stop button while the AI is working, so that I can freeze the session for later.

**Acceptance Criteria:**

- [ ] A pause button (using `RiPauseLine` from Remixicon) appears next to the existing stop button when the AI is actively working (`canAbort` is true)
- [ ] Clicking pause: (1) calls `abortCurrentOperation()` to stop the AI, (2) marks the session as "paused" in the session store
- [ ] The pause button is visually distinct from the stop button (stop is red/error, pause uses a neutral/warning color)
- [ ] After pausing, the input area shows a "Resume" button instead of the send button
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-002: Paused session state management

**Description:** As a developer, I need a store mechanism to track which sessions are paused, persist this across reloads, and store the context needed for resuming.

**Acceptance Criteria:**

- [ ] Add `pausedSessions` Map to sessionStore (Map<sessionId, PausedSessionInfo>) where PausedSessionInfo contains: `{ pausedAt: number, lastUserMessageId: string, lastUserMessageText: string, providerID: string, modelID: string, agentName?: string }`
- [ ] `pausedSessions` is persisted via zustand/persist (survives reboot)
- [ ] Add `pauseSession(sessionId)` action that: captures the last user message info, provider/model, and agent from the current session state, then calls `abortCurrentOperation()`, then stores a PausedSessionInfo entry
- [ ] Add `resumeSession(sessionId)` action that: retrieves the PausedSessionInfo, removes it from the Map, and re-sends the stored message using `sendMessage()` with the captured provider/model/agent
- [ ] Add `unpauseSession(sessionId)` action that just removes the paused state without re-sending (manual clear)
- [ ] Add `isSessionPaused(sessionId)` selector
- [ ] Typecheck/lint passes

### US-003: Paused indicator in session sidebar

**Description:** As a user, I want to see which sessions are paused in the sidebar so I can find and resume them after a reboot.

**Acceptance Criteria:**

- [ ] Sessions marked as paused show a pause icon badge (small `RiPauseLine`) in the session sidebar list item
- [ ] The pause badge is visible without hovering
- [ ] The badge uses a distinct color (e.g. `var(--status-warning)` or similar theme token) to stand out
- [ ] Paused sessions are not sorted differently — they stay in their normal position
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-004: Resume button and paused session banner

**Description:** As a user, when I open a paused session, I want a clear banner showing it's paused and a one-click way to resume.

**Acceptance Criteria:**

- [ ] When viewing a paused session, a banner appears above the chat input (below the message list) saying "Session paused" with the pause timestamp (relative, e.g. "2 hours ago")
- [ ] The banner has a "Resume" button that calls `resumeSession()` to re-send the last message
- [ ] The banner has a "Dismiss" button (or X) that calls `unpauseSession()` to clear the paused state without resuming
- [ ] After clicking Resume, the paused state is cleared and the AI starts working on the re-sent message
- [ ] The regular send button is disabled while the paused banner is shown (user should use Resume or Dismiss first)
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-005: Persist in-progress tool calls and partial results for context

**Description:** As a user, when I resume a paused session, I want the AI to have context about what it was doing when paused, including any in-progress tool calls and partial output.

**Acceptance Criteria:**

- [ ] When pausing, capture a summary of the last assistant message's in-progress state: active tool names, tool states (pending/running), and any partial text output
- [ ] Store this summary in `PausedSessionInfo` as `contextSummary: string` (human-readable description of what was in progress)
- [ ] When resuming, prepend the context summary to the re-sent message as a system note, e.g. "Continue from where you left off. When paused, you were: [contextSummary]"
- [ ] The context summary is shown in the paused banner so the user can see what was happening
- [ ] Typecheck/lint passes

## Functional Requirements

- FR-1: Add a pause button (with `RiPauseLine` icon) next to the stop button in `ChatInput.tsx` when `canAbort` is true
- FR-2: Clicking pause must abort the current AI operation and store the session's paused state with all context needed for resumption
- FR-3: Paused state must persist in localStorage via zustand/persist and survive app restarts
- FR-4: Paused sessions must show a visual pause badge in `SessionSidebar.tsx`
- FR-5: Opening a paused session must show a banner with pause time, context summary, Resume button, and Dismiss button
- FR-6: Resume must re-send the original last user message with the same provider/model/agent configuration
- FR-7: Resume must include a context summary of in-progress work so the AI can pick up where it left off
- FR-8: Dismiss/unpause must clear the paused state without sending any message
- FR-9: The send button must be disabled while the paused banner is visible

## Non-Goals

- No automatic resume on app startup (user must manually click Resume)
- No serialization of the AI's internal state or tool execution mid-stream — we rely on re-sending the message with context
- No changes to the OpenCode server or SDK — this is purely a UI-side feature
- No pause/resume for multiple concurrent sessions in one action
- No notification system for paused sessions

## Design Considerations

- Reuse existing icon patterns: `RiPauseLine` for pause, `RiPlayLine` for resume (from `@remixicon/react`)
- Pause button placement: inside the `actionButtons` area of ChatInput, alongside the existing stop button
- Banner component: simple horizontal bar similar to the existing `MobileSessionStatusBar` pattern
- Follow existing theme token patterns — use `var(--status-warning)` for paused state color
- Keep the pause/resume flow simple: one click to pause, one click to resume

## Technical Considerations

- The `pauseSession` action needs access to both the messageStore (for last user message and in-progress parts) and the contextStore (for provider/model/agent) — use the composed `useSessionStore` facade
- Messages are NOT persisted in localStorage (they're fetched from the server), so we need to store the last user message text explicitly in `PausedSessionInfo`
- In-progress tool state comes from the assistant message parts — iterate backwards through parts looking for `ToolPart` with `state.status === 'running'` or `'pending'`
- The context summary should be constructed at pause time, not resume time, since streaming state is ephemeral
- AbortController cleanup is already handled by `abortCurrentOperation()` — no additional cleanup needed

## Success Metrics

- User can pause a working session and resume after a full app restart
- Resume re-sends the exact same prompt with context, letting the AI continue effectively
- Paused sessions are immediately identifiable in the sidebar
- No regression in existing stop/abort behavior
- No increase in localStorage usage beyond ~1KB per paused session

## Open Questions

- Should we limit the number of sessions that can be paused simultaneously? (Suggest: no limit for MVP)
- Should the context summary include partial text output from the assistant, or just tool call info? (Suggest: both, truncated to ~500 chars)
