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
