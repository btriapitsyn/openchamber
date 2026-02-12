# Desktop Reliability Test Plan

This plan validates startup resilience and process cleanup behavior after reliability hardening.

## Scope

- Prevent "desktop launches but no windows" startup hangs.
- Ensure desktop-owned sidecar/OpenCode processes are cleaned on last-window close.
- Ensure stale sessions are pruned on next startup.
- Preserve behavior for externally managed OpenCode servers.
- Preserve behavior when VS Code extension and web runtime are active at the same time.

## Prerequisites

- macOS machine with OpenChamber desktop build from this branch.
- Terminal tools available: `lsof`, `ps`, `pgrep`, `curl`.
- Desktop binary path known, for example:
  - `/Applications/OpenChamber.app/Contents/MacOS/openchamber-desktop`
- Keep external OpenCode on `http://127.0.0.1:2606` alive during tests (exclude from termination steps).

## Handy Commands

```bash
pgrep -fl "openchamber-desktop|openchamber-server|opencode serve"
lsof -nP -iTCP -sTCP:LISTEN | grep -E "openchamber|opencode" || true
ps -ef | grep -E "openchamber-server|opencode serve" | grep -v grep
ls -la ~/.config/openchamber/runtime
```

## Test Phases

### Phase A: In-Place Recovery (use existing processes)

Use this first if the machine already has many `opencode` processes. This validates real-world recovery.

#### A1. Startup with pre-existing process noise

1. Do not kill existing processes.
2. Launch desktop.
3. Confirm window appears.
4. Capture process and listener state.

Expected:
- App opens a window (no headless hang).
- Startup does not block indefinitely on unhealthy existing listeners.

#### A2. Last-window close cleanup under noisy state

1. With desktop open, capture:
   - `pgrep -fl "openchamber-desktop|openchamber-server|opencode serve"`
   - `lsof -nP -iTCP -sTCP:LISTEN | grep -E "openchamber|opencode" || true`
2. Close the last desktop window.
3. Wait 3-5 seconds.
4. Capture same commands again.

Expected:
- Desktop-owned `openchamber-server` is gone.
- Desktop-owned `opencode serve` process tree is gone.
- Unrelated non-desktop processes are not broadly killed.

#### A3. Stale-session pruning on relaunch

1. Relaunch desktop after A2.
2. Observe startup behavior and runtime files:
   - `ls -la ~/.config/openchamber/runtime`
3. Close desktop again and re-check runtime directory.

Expected:
- Stale session records are pruned.
- Relaunch remains fast and reliable.

### Phase B: Clean-Room Deterministic Tests

Run this after Phase A for a strict baseline.

#### B0. Clean slate

```bash
pkill -TERM -f "openchamber-desktop|openchamber-server" || true
pkill -TERM -f "opencode serve --hostname=127.0.0.1 --port=0" || true
sleep 2
pkill -KILL -f "openchamber-desktop|openchamber-server" || true
pkill -KILL -f "opencode serve --hostname=127.0.0.1 --port=0" || true
```

Verify no listeners remain:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E "openchamber|opencode" || true
```

Expected for B0 cleanup:
- No `openchamber` listeners remain.
- No desktop-managed `opencode serve --port=0` listeners remain.
- External `opencode` on `127.0.0.1:2606` may remain and should not be terminated.

#### B1. Baseline launch opens window

1. Launch desktop.
2. Verify a window appears.
3. Verify sidecar is running.

Expected:
- Desktop opens normally.
- Sidecar exists while window is open.

#### B2. Last-window close cleans desktop-owned processes

1. While running, record process/listener state.
2. Close last window.
3. Wait 3-5 seconds.
4. Re-check process/listener state.

Expected:
- No desktop-owned sidecar remains.
- No desktop-owned OpenCode wrapper/subprocess tree remains.

#### B3. Process-tree cleanup coverage

1. Launch desktop and trigger a workflow that uses OpenCode.
2. Capture process tree snapshot:
   - `ps -ef | grep -E "openchamber-server|opencode serve" | grep -v grep`
3. Close last window.
4. Re-check snapshot command.

Expected:
- Desktop-spawned OpenCode wrappers/subprocesses are removed.

#### B4. Stale sidecar on remembered port

1. Launch desktop and note sidecar port from `lsof`.
2. Simulate crash of desktop process only:
   - `pkill -9 -f openchamber-desktop`
3. Confirm stale sidecar still exists.
4. Launch desktop again.

Expected:
- Desktop recovers and opens window.
- No persistent no-window state.

#### B5. Health timeout fallback

1. Create a non-responsive listener on a likely candidate port.
2. Launch desktop.

Expected:
- Startup does not hang forever.
- Desktop falls back/recovers and opens window.

### Phase C: External OpenCode Safety

#### C1. External server is not killed

1. Start external OpenCode manually:
   - `~/.opencode/bin/opencode serve --hostname=127.0.0.1 --port=4096`
2. Launch desktop in external mode:
   - `OPENCODE_SKIP_START=true OPENCODE_PORT=4096 /Applications/OpenChamber.app/Contents/MacOS/openchamber-desktop`
3. Close last desktop window.
4. Verify external process on `4096` is still alive.

Expected:
- External OpenCode remains running.
- Cleanup only affects desktop-owned processes.

### Phase C2: Coexistence with VS Code plugin and web runtime

1. Start/keep VS Code open with OpenChamber extension enabled.
2. Optionally keep web runtime active (for example, `openchamber-server` via web flow).
3. Launch desktop, perform a simple interaction, then close last desktop window.
4. Verify VS Code extension still functions and any web runtime process remains healthy.

Suggested checks:

```bash
pgrep -fl "opencode .*eslintServer|openchamber-server|opencode serve"
lsof -nP -iTCP -sTCP:LISTEN | grep -E "openchamber|opencode" || true
```

Expected:
- Desktop-owned sidecar/OpenCode from this desktop session are cleaned up.
- VS Code extension helper processes (for example `eslintServer --stdio`) are not killed.
- Non-desktop web runtime/OpenCode instances continue running.

### Phase D: Reopen Regression

1. Close last window and ensure app exits.
2. Relaunch desktop.

Expected:
- Relaunch is clean.
- No stale session prevents window creation.

## Optional Log Verification

```bash
log stream --style compact --predicate 'process == "openchamber-desktop" OR process == "openchamber-server"'
```

Look for expected events:
- port fallback / stale cleanup
- sidecar shutdown request accepted
- stale session pruning activity

## Pass Criteria

- All phase checks pass.
- No recurring no-window startup state.
- No desktop-owned sidecar/OpenCode process leaks after last-window close.
- External OpenCode mode remains safe.
