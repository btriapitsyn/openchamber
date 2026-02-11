# PR Checklist: Desktop Reliability

## Phase A: In-Place Recovery

- [ ] Startup succeeds and opens a window with existing `opencode` process noise.
- [ ] Closing last window removes desktop-owned `openchamber-server`.
- [ ] Closing last window removes desktop-owned OpenCode process tree (wrappers/subprocesses).
- [ ] Relaunch prunes stale runtime session artifacts.

## Phase B: Clean-Room Deterministic

- [ ] Fresh launch opens a desktop window from a clean slate.
- [ ] Last-window close leaves no desktop-owned sidecar/OpenCode listeners.
- [ ] Startup recovers when remembered port is occupied by stale `openchamber-server`.
- [ ] Startup does not hang indefinitely on unreachable/unhealthy candidate host.

## Phase C: External OpenCode Safety

- [ ] External OpenCode mode (`OPENCODE_SKIP_START=true`) does not kill external process.
- [ ] Desktop cleanup does not kill VS Code extension helper processes.
- [ ] Desktop cleanup does not kill non-desktop web runtime processes.

## Phase D: Reopen + Logs

- [ ] Launching desktop a second time opens a new window in the existing process (no second long-running desktop process).
- [ ] Relaunch after close works without manual cleanup.
- [ ] Logs clearly show port fallback and cleanup events.
