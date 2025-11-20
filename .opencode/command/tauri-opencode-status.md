SSE Fix Applied:
- Root Cause: `/global/event` returns a wrapper `GlobalEvent` (`{ directory, payload }`), but UI expects unwrapped `Event`.
- Fix: `sse.rs` now checks for and extracts the "payload" field before emitting.
- Verification: Logs should now show `Emitting event: message.updated` (or similar) instead of `unknown`.
- Logging: Debug logging remains enabled for this run to confirm the fix.