# UI Session Password Gate Plan

## Goals
- Protect the browser-delivered OpenChamber UI and `/api/**` proxy behind a single CLI-supplied password.
- Keep OpenCode API behaviour untouched once a session is authenticated.
- Leave the Electron build frictionless (no password prompts, no cookie gating).
- Support per-browser-session access with automatic expiry (no logout control).

## Requirements Recap
- Password defined once via CLI flag (e.g. `--ui-password secret`) or equivalent env var; defaults to disabled.
- Password guard affects HTTP traffic served by `server/index.js` only.
- `/auth/session` endpoints remain reachable while locked; `/health` stays public for monitoring.
- Browser clients authenticate once per session; credentials never touch OpenCode APIs.
- Electron continues to bootstrap the embedded server without password enforcement.

## Architecture Overview
```
Browser ── login form ──▶ POST /auth/session (password)
            ▲                              │
            │                              ▼
        cookie oc_ui_session ◀── signed token store (in-memory Map)
```
- Signed session tokens stored in-memory, keyed by UUID, carrying created/lastSeen timestamps.
- Express middleware enforces authentication on `/api/**` routes before requests hit OpenCode.
- Middleware skipped when the password feature is disabled or the path matches `/health` or `/auth/session*`.

## Server Changes
1. **Argument Parsing**
   - Extend `parseArgs` to accept `--ui-password` (string).
   - Honour `OPENCHAMBER_UI_PASSWORD` env var as fallback.
   - Propagate value via `startWebUiServer({ uiPassword })`.
2. **Electron Path**
   - `ensureServer` passes `uiPassword: null` to disable auth for desktop builds.
   - Renderer fetches continue untouched.
3. **Session Store**
   - New module `server/lib/ui-auth.js` managing:
     - Password hashing: derive `crypto.scrypt` hash+salt at startup for constant-time compare.
     - Token issuance: `uuid.v4()` plus metadata, `HttpOnly` cookie writer.
     - Expiry sweep (interval, default 12h session lifetime, extend on activity).
4. **Middleware Wiring**
   - Insert before all `/api` handlers and proxy wiring.
     - If password disabled, fall through immediately.
     - Extract cookie `oc_ui_session`; validate token; refresh lastSeen on success.
     - On failure, clear the cookie and return `401 { locked: true }`.
5. **Auth Routes**
   - `POST /auth/session` `{ password }`:
     - Validate constant-time; on success set cookie (`Secure` when HTTPS), respond `200`.
   - `GET /auth/session`:
     - For web boot to detect guard; returns `{ authenticated: true }` or `401 { locked: true }`.
6. **Proxy Guard**
   - Reuse middleware or a thin wrapper on `/api` router to enforce token presence before `createProxyMiddleware`.

## Frontend Changes
1. **Environment Detection**
   - In `src/main.tsx`, detect desktop via `window.electron` (preload API) or user agent; skip login UI when inside Electron.
2. **Auth Gate**
   - Add `SessionAuthGate` component managing status and UI state.
   - On mount, call `GET /auth/session`; block rendering until authenticated.
3. **Login Screen**
   - Minimal component with password input and inline error messaging.
   - Submit via `POST /auth/session`; re-focus field on failure.
4. **Global Gate**
   - Wrap `<App />` within the gate; render login screen until `authenticated` true.
   - Automatically bypass when running inside the desktop runtime.
5. **API Calls**
   - No changes required; cookie automatically attached.

## Security Considerations
- Use `HttpOnly`, `SameSite=Strict`, `Secure` (when `NODE_ENV === 'production'` or request is HTTPS) cookie attributes.
- Constant-time password comparison to reduce timing leakage.
- Session tokens random UUID + 32 bytes secret; rotate on login to prevent fixation.
- Memory-only store means restart invalidates sessions (acceptable trade-off, matches CLI-supplied password lifecycle).
- Optional future enhancement: rate limiting on `/auth/session` to mitigate brute force.

## Rollout Steps
1. Implement server utilities and middleware (unit tests optional but recommended for hashing/token logic).
2. Add frontend auth gate and login UI.
3. Update `README.md` + `docs/guides` with new flag usage and deployment guidance.
4. Validate manually:
   - Start server with and without `--ui-password`.
   - Confirm `curl /api/agent` returns 401 pre-login, 200 post-login.
   - Ensure Electron build launches without prompt.
5. Optional: script integration tests hitting `/auth/session` to confirm cookie flow.

## Unresolved Questions
- None
