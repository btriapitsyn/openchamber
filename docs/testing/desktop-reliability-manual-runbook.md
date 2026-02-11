# Desktop Reliability Manual Runbook

This runbook is designed for manual execution with copy-paste command blocks and explicit expected outcomes.

## Goals

- Verify desktop startup is resilient and does not get stuck in a no-window state.
- Verify last-window close cleans desktop-owned sidecar/OpenCode processes, including child wrappers/subprocesses.
- Verify stale runtime sessions are pruned.
- Verify coexistence with VS Code extension helpers and web runtime.
- Verify external OpenCode mode is preserved and not killed.

## Environment assumptions

- macOS
- Desktop binary: `/Applications/OpenChamber.app/Contents/MacOS/openchamber-desktop`
- OpenCode binary: `~/.opencode/bin/opencode`

## Useful one-off checks

```bash
pgrep -fl "openchamber-desktop|openchamber-server|opencode serve|opencode .*eslintServer"
```

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E "openchamber|opencode" || true
```

```bash
ps -ef | grep -E "openchamber-server|opencode serve|eslintServer" | grep -v grep
```

```bash
ls -la ~/.config/openchamber/runtime
```

## Important precheck before each phase

Run:

```bash
pgrep -fl "openchamber-desktop"
```

Expected:

- Exactly one desktop process while a phase is running.
- Zero desktop processes between phases unless intentionally left running.

If multiple desktop processes are present, close extras before continuing.

### Single-instance handoff check

Run primary instance:

```bash
/Applications/OpenChamber.app/Contents/MacOS/openchamber-desktop
```

With primary still open, run the same command again in another terminal:

```bash
/Applications/OpenChamber.app/Contents/MacOS/openchamber-desktop
```

Expected:

- Second launch does not create a second long-running desktop process.
- Existing primary instance opens a new functional window.
- Sidecar/OpenCode ownership remains in primary instance.

## Phase 0 - Build validation

Run:

```bash
bun run type-check && bun run lint && bun run build
```

Expected:

- All commands exit with code 0.
- Build warnings about chunk size may appear but no errors.

## Phase A - In-place recovery with existing process noise

Do not clean up existing `opencode` processes before this phase.

### A1. Launch desktop with existing noise

Run:

```bash
/Applications/OpenChamber.app/Contents/MacOS/openchamber-desktop
```

Expected:

- Desktop window appears.
- Startup does not remain headless/hung.

### A2. Capture running state

Run:

```bash
pgrep -fl "openchamber-desktop|openchamber-server|opencode serve|opencode .*eslintServer"
```

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E "openchamber|opencode" || true
```

```bash
ps -ef | grep -E "openchamber-server|opencode serve|eslintServer" | grep -v grep
```

Expected:

- `openchamber-desktop` and `openchamber-server` are present.
- At least one `opencode serve` process is present.

### A3. Close last window and verify cleanup

Action:

- Close the last OpenChamber window manually.
- Wait 5 seconds.

Run:

```bash
pgrep -fl "openchamber-desktop|openchamber-server|opencode serve|opencode .*eslintServer"
```

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E "openchamber|opencode" || true
```

```bash
ps -ef | grep -E "openchamber-server|opencode serve|eslintServer" | grep -v grep
```

Expected:

- Desktop-owned `openchamber-server` is gone.
- Desktop-owned `opencode serve` process tree for that session is gone.
- VS Code helper processes (for example `eslintServer --stdio`) may remain and should not be killed.

### A4. Relaunch and check stale session pruning

Run:

```bash
/Applications/OpenChamber.app/Contents/MacOS/openchamber-desktop
```

```bash
ls -la ~/.config/openchamber/runtime
```

Expected:

- Desktop relaunches normally.
- Runtime session artifacts are pruned; stale crashed-session files do not accumulate.

## Phase B - Clean-room deterministic run

### B0. Force clean slate

Run:

```bash
pkill -TERM -f "openchamber-desktop|openchamber-server" || true
```

```bash
pkill -TERM -x opencode || true
```

```bash
sleep 2
```

```bash
pkill -KILL -f "openchamber-desktop|openchamber-server" || true
```

```bash
pkill -KILL -x opencode || true
```

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E "openchamber|opencode" || true
```

Expected:

- No `openchamber` or `opencode` listeners remain.

### B1. Baseline launch from clean state

Run:

```bash
/Applications/OpenChamber.app/Contents/MacOS/openchamber-desktop
```

```bash
pgrep -fl "openchamber-desktop|openchamber-server|opencode serve"
```

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E "openchamber|opencode" || true
```

Expected:

- Desktop window appears.
- Sidecar and one OpenCode server are running.

### B2. Last-window cleanup from clean state

Action:

- Close the last desktop window manually.
- Wait 5 seconds.

Run:

```bash
pgrep -fl "openchamber-desktop|openchamber-server|opencode serve"
```

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E "openchamber|opencode" || true
```

Expected:

- No desktop-owned sidecar/OpenCode listeners remain.

### B3. Stale sidecar recovery after crash

Run:

```bash
/Applications/OpenChamber.app/Contents/MacOS/openchamber-desktop
```

```bash
pkill -9 -f openchamber-desktop
```

```bash
pgrep -fl openchamber-server || true
```

Then relaunch:

```bash
/Applications/OpenChamber.app/Contents/MacOS/openchamber-desktop
```

Expected:

- Even with stale sidecar conditions, relaunch succeeds.
- Desktop opens window and does not get stuck headless.

### B4. Explicit timeout/fallback test for unhealthy remembered port

Set remembered desktop port:

```bash
python3 - <<'PY'
import json, os
p = os.path.expanduser("~/.config/openchamber/settings.json")
os.makedirs(os.path.dirname(p), exist_ok=True)
data = {}
if os.path.exists(p):
    with open(p) as f:
        data = json.load(f)
data["desktopLocalPort"] = 57123
with open(p, "w") as f:
    json.dump(data, f, indent=2)
print("desktopLocalPort set to 57123")
PY
```

Start blocker process on that port in a separate terminal and keep it running:

```bash
python3 - <<'PY'
import socket, time
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("127.0.0.1", 57123))
s.listen(1)
print("Port 57123 blocker running for 120s")
time.sleep(120)
PY
```

In another terminal, run:

```bash
/Applications/OpenChamber.app/Contents/MacOS/openchamber-desktop
```

Expected:

- Startup does not hang forever.
- Desktop falls back/retries and opens a window.

## Phase C - External OpenCode safety

### C1. External server is not killed

Run external OpenCode:

```bash
~/.opencode/bin/opencode serve --hostname=127.0.0.1 --port=4096
```

Launch desktop in external mode:

```bash
OPENCODE_SKIP_START=true OPENCODE_PORT=4096 /Applications/OpenChamber.app/Contents/MacOS/openchamber-desktop
```

Action:

- Close last desktop window manually.
- Wait 5 seconds.

Run:

```bash
lsof -nP -iTCP:4096 -sTCP:LISTEN
```

```bash
pgrep -fl "opencode serve"
```

Expected:

- External OpenCode on `127.0.0.1:4096` remains running.
- Desktop cleanup does not kill external mode process.

## Phase C2 - VS Code plugin + web runtime coexistence

Precondition:

- VS Code open with OpenChamber extension enabled.
- Optional: web runtime active elsewhere.

Run:

```bash
/Applications/OpenChamber.app/Contents/MacOS/openchamber-desktop
```

Baseline checks:

```bash
pgrep -fl "opencode .*eslintServer|openchamber-server|opencode serve"
```

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E "openchamber|opencode" || true
```

Action:

- Close last desktop window manually.
- Wait 5 seconds.

Post-close checks:

```bash
pgrep -fl "opencode .*eslintServer|openchamber-server|opencode serve"
```

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E "openchamber|opencode" || true
```

Expected:

- Desktop-owned sidecar/OpenCode for that desktop session are cleaned.
- VS Code helper processes (like `eslintServer --stdio`) are not killed.
- Non-desktop web/runtime processes remain.

## Phase D - Reopen and logging checks

Optional logs (separate terminal):

```bash
log stream --style compact --predicate 'process == "openchamber-desktop" OR process == "openchamber-server"'
```

Reopen sanity:

```bash
/Applications/OpenChamber.app/Contents/MacOS/openchamber-desktop
```

Action:

- Close last window.

Relaunch:

```bash
/Applications/OpenChamber.app/Contents/MacOS/openchamber-desktop
```

Expected:

- Relaunch works repeatedly without manual cleanup.
- Logs show fallback/cleanup activity where applicable.

## Pass criteria

- No recurring no-window startup state.
- No desktop-owned sidecar/OpenCode process leaks after last-window close.
- External OpenCode mode remains safe.
- VS Code extension helpers and non-desktop runtime processes are preserved.
