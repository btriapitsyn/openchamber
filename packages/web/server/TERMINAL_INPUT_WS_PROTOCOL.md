# Terminal Input WS Protocol

## Goal
Reduce terminal input latency by replacing per-keystroke HTTP requests with a persistent WebSocket input channel, while keeping SSE output and HTTP endpoints as compatibility fallback.

## Scope
- Input path: WebSocket (`/api/terminal/input-ws`)
- Output path: SSE (`/api/terminal/:sessionId/stream`)
- HTTP input fallback remains: `POST /api/terminal/:sessionId/input`

## Framing
- Text frame: terminal keystroke payload (hot path)
  - Examples: `"\r"`, `"\u001b[A"`, `"\u0003"`
- Binary frame: control envelope
  - Byte 0: tag (`0x01` = JSON control)
  - Bytes 1..N: UTF-8 JSON payload

## Control Messages
- Bind active socket to terminal session:
  - client -> server: `{"t":"b","s":"<sessionId>","v":1}`
- Keepalive ping:
  - client -> server: `{"t":"p","v":1}`
  - server -> client: `{"t":"po","v":1}`
- Server control responses:
  - ready: `{"t":"ok","v":1}`
  - bind ok: `{"t":"bok","v":1}`
  - error: `{"t":"e","c":"<code>","f":true|false}`

## Multiplexing Model
- Single shared socket per client runtime.
- Socket has one mutable `boundSessionId`.
- Client sends bind control when active terminal changes.
- Keystroke frames apply to currently bound session.
- Client keeps socket open and sends periodic keepalive pings so the channel stays ready for next input.
- Client primes/opens this socket when the Terminal tab is opened (not per keystroke).

## Security
- UI auth session required when UI password is enabled.
- Origin validation enforced for cookie-authenticated browser upgrades.
- Invalid/malformed frames are rate-limited and may close socket.

## Fallback Behavior
- On WS unavailable/error/close, client falls back to HTTP input immediately.
- Existing terminal behavior remains functional during mixed-version rollout.
