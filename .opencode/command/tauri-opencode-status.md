Optimistic UI Fix Applied:
- Problem: First message in new session disappeared because `loadMessages` sync overwrote the optimistic update.
- Fix: `messageStore.ts` now merges pending/optimistic messages with the server response during sync.
- Result: User messages persist immediately, even if the server hasn't indexed them by the time the initial sync happens.
- Cleanup: Removed debug logging from `sse.rs`.
- Verification: `pnpm -r build` passed. App ready for testing.