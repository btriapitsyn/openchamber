Perfect. Here is an extensive copy-paste runbook to verify issue #407 end-to-end:

VS Code plugin still works
managed local OpenCode is secured with Basic Auth
env password precedence works
rotation behavior is correct
no stale extension artifacts
I optimized this so you can run it step-by-step with minimal editing.

Prep

Use 2 terminals:
Terminal A: run VS Code extension host
Terminal B: checks (curl, settings, process/port)
Repo root assumed: /Users/iivashko/projects/openchamber
0) Clean start (both terminals closed first)

Terminal B:

zsh
pkill -f "Extension Development Host" || true
pkill -f "openchamber-server" || true
pkill -f "/Applications/OpenChamber.app" || true
unset OPENCODE_SERVER_PASSWORD
echo "OPENCODE_SERVER_PASSWORD=${OPENCODE_SERVER_PASSWORD:-<empty>}"

Expected:

OPENCODE_SERVER_PASSWORD=<empty>
1) Build latest extension/webview artifacts

Terminal B:

zsh
cd /Users/iivashko/projects/openchamber
bun run vscode:build

Expected:

Build succeeds.
2) Launch VS Code dev extension host (managed mode, no env)

Terminal A:

zsh
cd /Users/iivashko/projects/openchamber
unset OPENCODE_SERVER_PASSWORD
bun run vscode:dev

Expected:

Extension Development Host opens.
3) Confirm you are running local dev extension + fresh webview

In Dev Host logs / webview console, confirm:

Loading development extension at /Users/iivashko/projects/openchamber/packages/vscode
[OpenChamber] VS Code webview build: <today/new timestamp>
Expected:

Not old date; not marketplace-stale bundle.
4) Discover managed server port for direct auth checks

Terminal B:

zsh
SERVER_PID="$(pgrep -f openchamber-server | head -n1)"
echo "SERVER_PID=$SERVER_PID"
PORT="$(lsof -Pan -p "$SERVER_PID" -iTCP -sTCP:LISTEN | awk 'NR>1 {split($9,a,":"); print a[length(a)]; exit}')"
echo "PORT=$PORT"
BASE_URL="http://127.0.0.1:$PORT"
echo "BASE_URL=$BASE_URL"

Expected:

Non-empty SERVER_PID, PORT, BASE_URL.
5) Read persisted managed password from settings (without printing full secret)

Terminal B:

zsh
PASS="$(python3 - <<'PY'
import json, os
p=os.path.expanduser("~/.config/openchamber/settings.json")
o=json.load(open(p))
v=(o.get("_internalOpencodeServerPassword") or "").strip()
print(v)
PY
)"
echo "PASS_LEN=${#PASS}"
python3 - <<'PY'
import json, os, hashlib
p=os.path.expanduser("~/.config/openchamber/settings.json")
o=json.load(open(p))
v=(o.get("_internalOpencodeServerPassword") or "").strip()
h=hashlib.sha256(v.encode()).hexdigest()[:12] if v else ""
print("PASS_SHA12=", h)
PY

Expected:

PASS_LEN > 0
PASS_SHA12 non-empty
6) Basic Auth enforcement checks (managed/no env)

Terminal B:

zsh
echo "No auth -> expect 401"
curl -sS -o /dev/null -w "%{http_code}\n" "$BASE_URL/config"
echo "Wrong auth -> expect 401"
curl -sS -o /dev/null -w "%{http_code}\n" -u "x:wrong-password" "$BASE_URL/config"
echo "Correct auth -> expect 200"
curl -sS -o /dev/null -w "%{http_code}\n" -u "x:$PASS" "$BASE_URL/config"

Expected:

401
401
200
7) Plugin behavior checks (managed/no env)

In Extension Dev Host:

Open OpenChamber.
Wait ~15s.
Send 2 messages quickly.
Switch tabs and return.
Reload window (Developer: Reload Window), send again.
Expected:

No “Failed to construct Response” popup.
No “thinking then nothing”.
Message appears immediately without resize.
Streaming works after reload.
8) Managed password rotation check (no env) Goal: restart managed runtime and verify password rotates.

Terminal B (capture old hash):

zsh
OLD_SHA="$(python3 - <<'PY'
import json, os, hashlib
p=os.path.expanduser("~/.config/openchamber/settings.json")
o=json.load(open(p))
v=(o.get("_internalOpencodeServerPassword") or "").strip()
print(hashlib.sha256(v.encode()).hexdigest()[:12] if v else "")
PY
)"
echo "OLD_SHA=$OLD_SHA"

Restart dev host:

Stop Terminal A process (Ctrl+C)
Start again in Terminal A:
zsh
cd /Users/iivashko/projects/openchamber
unset OPENCODE_SERVER_PASSWORD
bun run vscode:dev

Terminal B (new hash + validate old secret fails, new succeeds):

zsh
NEW_PASS="$(python3 - <<'PY'
import json, os
p=os.path.expanduser("~/.config/openchamber/settings.json")
o=json.load(open(p))
print((o.get("_internalOpencodeServerPassword") or "").strip())
PY
)"
NEW_SHA="$(python3 - <<'PY'
import json, os, hashlib
p=os.path.expanduser("~/.config/openchamber/settings.json")
o=json.load(open(p))
v=(o.get("_internalOpencodeServerPassword") or "").strip()
print(hashlib.sha256(v.encode()).hexdigest()[:12] if v else "")
PY
)"
echo "NEW_SHA=$NEW_SHA"
SERVER_PID="$(pgrep -f openchamber-server | head -n1)"
PORT="$(lsof -Pan -p "$SERVER_PID" -iTCP -sTCP:LISTEN | awk 'NR>1 {split($9,a,":"); print a[length(a)]; exit}')"
BASE_URL="http://127.0.0.1:$PORT"
echo "old hash != new hash -> expect different"
echo "$OLD_SHA vs $NEW_SHA"
echo "new auth -> expect 200"
curl -sS -o /dev/null -w "%{http_code}\n" -u "x:$NEW_PASS" "$BASE_URL/config"

Expected:

OLD_SHA != NEW_SHA
New password works (200)
9) Env-authoritative mode check Goal: env password wins; works across reload/restart.

Stop Terminal A, then start with env:

Terminal A:

zsh
cd /Users/iivashko/projects/openchamber
export OPENCODE_SERVER_PASSWORD='my-fixed-env-password'
echo "ENV_SET=$OPENCODE_SERVER_PASSWORD"
bun run vscode:dev

Terminal B (direct auth checks):

zsh
SERVER_PID="$(pgrep -f openchamber-server | head -n1)"
PORT="$(lsof -Pan -p "$SERVER_PID" -iTCP -sTCP:LISTEN | awk 'NR>1 {split($9,a,":"); print a[length(a)]; exit}')"
BASE_URL="http://127.0.0.1:$PORT"
echo "wrong auth -> expect 401"
curl -sS -o /dev/null -w "%{http_code}\n" -u "x:wrong-password" "$BASE_URL/config"
echo "env auth -> expect 200"
curl -sS -o /dev/null -w "%{http_code}\n" -u "x:my-fixed-env-password" "$BASE_URL/config"

In Dev Host:

Send message
Reload window
Send again
Expected:

Works before/after reload
No auth breakage
No disappearing message bug
10) Persisted value policy check in env mode

Terminal B:

zsh
python3 - <<'PY'
import json, os
p=os.path.expanduser("~/.config/openchamber/settings.json")
o=json.load(open(p))
v=(o.get("_internalOpencodeServerPassword") or "").strip()
print("persisted=", v)
PY

Expected (per your stated policy):

persisted=my-fixed-env-password
11) Final baseline checks

Terminal B:

zsh
cd /Users/iivashko/projects/openchamber
bun run type-check
bun run lint
bun run build

Expected:

All pass.
Pass criteria summary

Auth enforced: 401/401/200 in managed mode.
Managed no-env restart rotates password.
Env mode is authoritative and stable across reload/restart.
VS Code chat/streaming renders immediately (no resize trick).
No repeated auth failures in logs.
About other console errors you asked about:

Usually unrelated to your plugin task:
punycode deprecation
SQLite experimental warning
Copilot MCP 404 / decode errors
local-network-access iframe warning
Acceptable transient plugin runtime signal:
one startup Global SSE ... 503 that recovers and does not loop forever.
If you want, after you run this I can give you a PR-ready results template where you only fill PASS/FAIL + evidence line.