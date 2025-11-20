Notification Logic Expanded:
- Now triggers if `message.updated` has `status: "completed"` OR `step-finish` part.
- Retained `message.part.updated` trigger.
- Removed verbose per-event logging, kept completion trigger log.
- Verification: `pnpm -r build` passed. App ready for testing.