# Session-Based PWA Push Notifications

Prepared: 2024-XX-XX

## Objective
- Deliver native-feeling background notifications (with default iOS sound) for the iOS PWA when an assistant run completes.
- Keep scope limited to existing anonymous/expirable sessions (no user accounts).
- Reuse the same “Task is ready / {model} in {agent} mode…” wording we ship on desktop.

## Constraints & Context
- Current notification system lives in Electron only; renderer fires an IPC when WorkingPlaceholder transitions to “Done”.
- PWA sessions are anonymous; identifiers expire and can exist on multiple devices concurrently.
- iOS PWAs only support background notifications via Web Push (iOS/iPadOS 16.4+). Every push must show a visible notification; custom sounds are not supported.
- Service workers are suspended when the PWA isn’t active, so all background work must originate from push events.

## High-Level Architecture
1. **Service Worker & Permission Flow**
   - Register `/service-worker.js` inside Vite build (ensure `vite.config.ts` copies it).
   - On PWA load, prompt for Notification permission (only after a user gesture) and, if granted, obtain a PushSubscription with VAPID public key.
2. **Subscription Persistence (Session-Scoped)**
   - POST subscription details + current `sessionId` to a new backend endpoint (`POST /api/push/subscribe`).
   - Store subscriptions keyed by sessionId, allowing multiple records per session (one per device/browser).
   - Provide `DELETE /api/push/unsubscribe` (body: sessionId + endpoint) to clean up on logout/manual revoke.
   - Garbage-collect on session expiration and when push provider returns 404/410.
3. **Server Push Trigger**
   - Hook into the same place that marks a session run as completed (where WorkingPlaceholder would fade to “Done”).
   - When the assistant finishes and the session has subscriptions, send a Web Push payload to each endpoint: `{ title: "Task is ready", body: "{model} in {agent} mode is done working", data: { sessionId } }`.
   - Use the `web-push` Node package with VAPID key pair stored in server config.
4. **Service Worker Notification Handler**
   - On `self.addEventListener('push', ...)`, parse payload and show `registration.showNotification(title, options)`.
   - Optionally include `data.sessionId` so tapping the notification reopens that session (`notificationclick` handler).

## Data Model Sketch
- `session_push_subscriptions`
  - `session_id` (string, indexed)
  - `endpoint` (string, PK)
  - `expiration` (timestamp, optional from Push API)
  - `keys` (JSON: p256dh, auth)
  - `created_at`, `updated_at`

## API Surface
| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/api/push/subscribe` | `{ sessionId, subscription }` | Validates session, stores subscription. |
| DELETE | `/api/push/unsubscribe` | `{ sessionId, endpoint }` | Removes specific subscription. |
| POST (internal) | `push/send` | `{ sessionId, title, body }` | Called by assistant completion hook; fan-out to stored endpoints. |

## Implementation Steps
1. Generate VAPID key pair; store via env vars for both dev and prod.
2. Create service worker + registration logic in React entry point; request permission and subscribe after user action.
3. Implement `/api/push/subscribe` + `/api/push/unsubscribe` routes and persistence layer (DB or in-memory plus disk snapshot).
4. Integrate `web-push` library on the server with retry/backoff and stale-subscription cleanup.
5. Emit push trigger when assistant run completes (same place that feeds the desktop notification). Ensure we skip if no subscriptions.
6. QA matrix: iOS/iPadOS 16.4+, macOS Safari PWA, fallback behavior when permission denied, duplicate-session handling.

## Open Questions
- Where to persist subscriptions (SQLite? existing state store?) so they survive restarts? (Recommendation: extend current server persistence.)
- Do we need opt-out UI inside the PWA to revoke notifications per session?
- Should we reuse the same notification body for all platforms or expose a setting? For now we’ll mirror desktop.

## Risks & Mitigations
- **Permission fatigue**: Only prompt after the user completes an action (e.g., sends a message) and provide inline context.
- **Stale sessions**: Add a cron or on-access cleanup to drop expired session subscriptions.
- **Multiple devices**: Fan-out is expected; ensure deduping doesn’t remove legitimate endpoints.

---
Use this document as the kickoff reference for the next session focused on implementing session-scoped PWA push notifications.
