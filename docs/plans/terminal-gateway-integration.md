# Terminal Gateway Integration Plan

## Background
- The right-sidebar terminal currently depends on a custom `node-pty` + WebSocket bridge living inside the OpenChamber web server.
- Deployments have been unstable: native module rebuilds often mismatch the runtime, daemon restarts kill the stream, and reverse proxy disconnections force the UI into constant reconnect loops.
- Even after recent fixes, Firefox still reports `NS_ERROR_WEBSOCKET_CONNECTION_REFUSED` because the in-process transport is fragile under CLI restarts and missing keepalives.

## Goal
Replace the custom transport with a battle-tested terminal gateway that stays alive independently of the main UI, prioritizing reliability over per-session niceties.

## Proposed Solution
- Ship `ttyd` (terminal WebSocket gateway) binaries for macOS and Linux as part of the OpenChamber distribution (CLI + Electron) so every install is self-contained and offline-friendly.
  - Binaries are fetched during our release packaging, version-pinned, and stored under a deterministic `resources/bin/<platform>` layout.
  - Runtime selection is based on `process.platform`, and Windows remains unsupported.
- Proxy `/terminal` requests from OpenChamber to the gateway so the browser never talks cross-origin.
- Embed the gateway in the right sidebar via an iframe (or use `@xterm/addon-attach` if we want to stream it into our existing component later).

## Why This Approach
- Eliminates our custom PTY maintenance (build scripts, reconnection state, native ABI churn).
- `ttyd` already manages heartbeat, buffering, and clean shutdown of orphan sessions.
- Decouples terminal lifecycle from the OpenChamber daemon—CLI restarts or API downtime no longer collapse the shell.
- Still allows future enhancements (multiple shells, per-session directories) by spawning additional gateway instances rather than modifying UI code.

## Implementation Outline
1. **Bundle terminal gateway assets**
   - Extend release tooling (CLI and Electron) to download pinned `ttyd` binaries for macOS (arm64 + x64) and Linux (x64, optionally arm64) and stash them in `resources/bin/<platform>/<version>/ttyd`.
   - Record checksums and metadata in a manifest so runtime integrity checks can confirm the binary before launching.
   - Exclude Windows packaging paths; builds should clearly signal unsupported platforms.
2. **Runtime process management**
   - Add a launcher in the Node bootstrap that picks the correct binary, passes the working directory/shell flags, and supervises the child process lifecycle (restart on crash, terminate on shutdown).
   - Surface configuration via environment variables (override binary path, port, shell) while defaulting to the embedded assets.
   - Keep authentication disabled initially but wire the hook for shared-secret/JWT once requirements settle.
3. **Back-end proxy**
   - Extend Express server to proxy `/terminal` (and WebSocket upgrades) to the supervised gateway port (e.g., `127.0.0.1:7681`).
   - Ensure proxy forwards the necessary headers and upgrades (`http-proxy-middleware` handles WS).
4. **Front-end integration**
   - Replace the existing `TerminalTab` component with a minimal wrapper rendering an iframe pointed at `/terminal`.
   - Remove node-pty stores/hooks used for streaming chunks; preserve only the UI chrome (directory label, status badge optional).
5. **Operational docs**
   - Document the bundled binary layout, supported platforms (macOS/Linux only), and override options in `docs/guides`.
   - Note deployment/runtime expectations: no external service required, but operators can opt into custom credentials or binaries if needed.

## Open Questions
- Do we need auth in front of `/terminal` for shared deployments? (If yes, leverage `ttyd --credential` or forward OpenChamber session cookies).
- Should we support multiple concurrent shells? (Initial scope targets a single shared terminal; revisit after stable integration.)
- Do we need additional architecture targets beyond macOS/Linux x64/arm64 for self-hosted ARM boards? (Determine based on deployment feedback.)

## Next Steps
1. Build tooling to fetch/package the `ttyd` binaries for macOS/Linux and expose a runtime manifest.
2. Implement the server-side launcher/proxy integration and retire legacy `node-pty` code paths.
3. Update the React terminal tab to iframe `/terminal` and drop old state stores/hooks.
4. Document bundled gateway behavior, overrides, and platform support.
