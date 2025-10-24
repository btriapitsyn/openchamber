# Terminal Gateway Integration Plan

## Background
- The right-sidebar terminal currently depends on a custom `node-pty` + WebSocket bridge living inside the OpenChamber web server.
- Deployments have been unstable: native module rebuilds often mismatch the runtime, daemon restarts kill the stream, and reverse proxy disconnections force the UI into constant reconnect loops.
- Even after recent fixes, Firefox still reports `NS_ERROR_WEBSOCKET_CONNECTION_REFUSED` because the in-process transport is fragile under CLI restarts and missing keepalives.

## Goal
Replace the custom transport with a battle-tested terminal gateway that stays alive independently of the main UI, prioritizing reliability over per-session niceties.

## Proposed Solution
- Run an external terminal gateway (prefer `ttyd`, acceptable alternative `wetty`) alongside the OpenChamber server.
  - `ttyd` spawns a shell via libuv + `node-pty` equivalent and exposes it over WebSockets with built-in keepalives and reconnection logic.
  - Gateway can be locked to the OpenChamber working directory and configured for single-session access.
- Proxy `/terminal` requests from OpenChamber to the gateway so the browser never talks cross-origin.
- Embed the gateway in the right sidebar via an iframe (or use `@xterm/addon-attach` if we want to stream it into our existing component later).

## Why This Approach
- Eliminates our custom PTY maintenance (build scripts, reconnection state, native ABI churn).
- `ttyd` already manages heartbeat, buffering, and clean shutdown of orphan sessions.
- Decouples terminal lifecycle from the OpenChamber daemon—CLI restarts or API downtime no longer collapse the shell.
- Still allows future enhancements (multiple shells, per-session directories) by spawning additional gateway instances rather than modifying UI code.

## Implementation Outline
1. **Provision terminal gateway**
   - Add `ttyd` as a dependency or document system installation (package manager / static binary).
   - Create a small wrapper script/service to launch `ttyd` with:
     - Shell command `bash` (or `/bin/zsh` to match current behavior).
     - Working directory derived from OpenChamber config.
     - Authentication disabled initially (firewall/network restricted) or protected via shared secret/JWT header.
2. **Back-end proxy**
   - Extend Express server to proxy `/terminal` (and WebSocket upgrades) to `ttyd`’s local port (e.g., `127.0.0.1:7681`).
   - Ensure proxy forwards the necessary headers and upgrades (`http-proxy-middleware` handles WS).
3. **Front-end integration**
   - Replace the existing `TerminalTab` component with a minimal wrapper rendering an iframe pointed at `/terminal`.
   - Remove node-pty stores/hooks used for streaming chunks; preserve only the UI chrome (directory label, status badge optional).
4. **Operational docs**
   - Update deployment scripts to start/stop the gateway alongside OpenChamber (systemd unit or supervisor entry).
   - Document configuration knobs (port, shell, directory) in `docs/guides`.

## Open Questions
- Do we need auth in front of `/terminal` for shared deployments? (If yes, leverage `ttyd --credential` or forward OpenChamber session cookies).
- Should we support multiple concurrent shells? (Initial scope targets a single shared terminal; revisit after stable integration.)

## Next Steps
1. Remove legacy terminal code paths from UI/backend.
2. Add Express proxy and iframe-based terminal tab.
3. Ship deployment instructions for running `ttyd` in dev/prod environments.
