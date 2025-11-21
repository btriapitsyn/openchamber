---
title: Desktop UI truncation of long assistant replies
status: open
date: 2025-11-21
---

## Summary
Long assistant replies in the desktop app still truncate mid-stream with flicker. The backend/Rust bridge delivers full text, but the UI applies empty/shrinking `message.updated` events after the stop marker, overwriting content. The web app is unaffected (same server). Not currently reproduced in the dev build, only in the installed release build.

## What we confirmed
- Rust SSE bridge receives full payload: `message.part.updated` with `text_len ~2168` plus `step-finish reason=stop` (logs with `OPENCHAMBER_SSE_DEBUG=1`).
- Immediately after stop, multiple `message.updated` arrive with `status=pending` and **zero parts/text**; these are emitted to the UI and appear to clobber the streamed message, causing truncation and flicker.
- Web path is fine; this is desktop-only (IPC/consumer behavior difference), not a server truncation.

## Current mitigations in code (still insufficient)
- UI (`useEventStream`):
  - Ignore empty `message.updated` (no parts, no completion).
  - Skip assistant `message.updated` that shrink text beyond a 50-char tolerance unless the update includes a stop marker.
  - Desktop-only completion is delayed unless a stop marker is seen; cancel delay if more parts arrive.
  - Removed drift resync polling (reduces flicker).
- Optional tracing:
  - Rust: `OPENCHAMBER_SSE_DEBUG=1` logs part/update text lengths/previews.
  - UI: `localStorage.openchamber_stream_debug="1"` logs `[STREAM-TRACE]` for parts/updates.

## Remaining gap
- Despite the guards, empty/shrinking updates are still applied, or completion is still triggered without a valid stop + content, resulting in truncation and flicker.

## Next actions (proposed)
1) Desktop completion should require explicit `step-finish reason=stop`; ignore any assistant `message.updated` that reduces text length (no tolerance) unless it includes stop + non-empty text.
2) Optionally filter out empty `message.updated` at the Rust bridge to reduce noisy overwrites (desktop only).
3) Use the tracing toggles above to capture failing sequences and verify whether shrinking/empty updates are still being applied after the new rules.

## 2025-11-21 mitigation update
- `useEventStream` (desktop runtime) now requires a real `step-finish reason=stop` before completing assistant replies and drops any shrink events unless the update carries the stop marker plus non-empty text.
- `loadMessages` and `syncMessages` now preserve any locally completed assistant response when the server copy is shorter; desktop refetches or periodic syncs keep the longer streamed version instead of replacing it with the truncated server snapshot.
- Assistant text now renders only after `message.updated` reports `completed`; before displaying the new block we capture whether the chat was pinned and, if so, immediately scroll so the top of the reply lands at ~45% of the viewport—no incremental markdown diffing is involved anymore.
- The Tauri SSE bridge filters assistant `message.updated` events with zero parts before they reach the UI to avoid clobbering stored text.
- Keep tracing toggles enabled during validation to confirm no more empty/shrinking updates arrive after completion.

