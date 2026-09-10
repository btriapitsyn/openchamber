# Dictation module

Server-authoritative speech-to-text for the chat composer, plus local
text-to-speech. The client streams 16 kHz mono PCM16 chunks (base64) over a
WebSocket while the user speaks. Local and OpenAI-compatible providers buffer
each segment and transcribe it on commit. FunASR streams PCM upstream and
returns provisional text while recording, followed by corrected sentences.

Parakeet is an offline model trained on whole utterances. Its buffered path
avoids repeatedly decoding a growing recording. FunASR's incremental path
uses the server's streaming model instead of repeatedly submitting that buffer.
The composer inserts the completed dictation on stop.

Local TTS (Kokoro and Piper/VITS via sherpa-onnx OfflineTts) runs in the same
worker process and is exposed as `POST /api/dictation/tts/speak` (JSON
`{text, speakerId?, speed?, model?, language?, languageSample?}` → WAV bytes; 503 with
`reasonCode` while the model is downloading). TTS models live in the same
catalog/downloader as STT models (`local/model-catalog.js`
`LOCAL_TTS_MODEL_CATALOG`) and are managed by the same status/download/delete
routes.

Each TTS catalog entry declares the `languages` it speaks. With
`language: 'auto'` the service detects the language of `languageSample` — the
whole message the chunk belongs to, sent by the client with every chunk — or
of `text` when no sample is given
(`../tts/language-detect.js`, script plus function-word scoring, no
dependencies) and keeps the caller's model when it speaks that language;
otherwise it switches to the catalog model for the language, downloading it on
first use like any other model, and starts from that model's default speaker
(`defaultSpeakerByLanguage`) instead of the caller's speaker id. A language no
catalog model covers keeps the caller's model, so text is always spoken. The
response carries `X-Speech-Model` and `X-Speech-Language`.

## Ownership

- `runtime.js` — registers `GET /api/dictation/status`,
  `POST /api/dictation/models/:modelId/download`, and the
  `/api/dictation/ws` WebSocket endpoint (auth-gated the same way as the
  terminal WS: UI session token or `oc_url_token`, plus origin check).
  Created from the startup pipeline (`startup-pipeline-runtime.js`) before
  the generic OpenCode proxy so routes are not shadowed.
- `stream-manager.js` — `DictationStreamManager`, one per WS connection.
  Chunk reordering by `seq` + ack, resampling to the provider rate, segment
  splitting, silence suppression by PCM peak, partial-transcript
  concatenation, adaptive finalization timeout.
- `service.js` — provider resolution and readiness. Providers:
  - `local` (default): sherpa-onnx Parakeet TDT in a forked worker process.
    Models auto-download in the background on first use; while missing, the
    stream fails with `reasonCode: 'model_download_in_progress'` and the
    status route reports per-model install/download state.
  - `openai-compatible`: buffered per-segment transcription against any
    OpenAI-compatible `/v1/audio/transcriptions` endpoint
    (`openai-compatible-session.js`, reuses `../tts/stt.js`).
  - `funasr-websocket`: real-time FunASR over `ws://` or `wss://`
    (`funasr-websocket-session.js`). It negotiates the FunASR `binary`
    subprotocol, streams raw 16 kHz PCM16, and forwards `2pass-online`
    partials plus `2pass-offline` finals. An optional API key is sent in an
    Authorization header, never embedded in the endpoint URL.
    One upstream connection belongs to one client segment. Cleared segments
    retire their own connection without discarding earlier committed work.
- `local/` — worker process + client (IPC, idle shutdown TTL), sherpa
  recognizer engine and segment session (one decode per committed segment),
  model catalog and downloader. The native `sherpa-onnx-node` addon is only
  ever loaded inside the worker process.
- `audio.js` — PCM16 helpers: format parsing, peak, WAV wrapping, streaming
  linear resampler.

## WebSocket protocol (JSON text frames)

Client → server: `start {dictationId, format, options}`,
`chunk {dictationId, seq, audio}`, `finish {dictationId, finalSeq}`,
`cancel {dictationId}`, `ping`.

Server → client: `ready`, `ack {ackSeq}`, `partial {text}`,
`finish_accepted {timeoutMs}`, `final {text}`,
`error {error, retryable, reasonCode?}`, `pong`.

`options` in `start` carries the client-selected provider config:
`{ provider: 'local' | 'openai-compatible' | 'funasr-websocket', language?,
localModel?, openaiCompatible?: { baseUrl, model, apiKey },
funasrWebsocket?: { url, apiKey, protocol?: 'python' | 'cpp-2pass' | 'cpp-offline' } }`.

The Voice settings protocol selector must match the running FunASR server;
it does not change or detect the upstream implementation. The non-secret
`sttFunasrProtocol` instance setting follows the registry-owned save/load and
runtime-switch paths. The store starts with `python`; a snapshot that omits
or rejects the field leaves the current selection unchanged, including when
switching to a server that does not expose it. The protocol stays beside the
endpoint in `settings.json`, not per-surface profile preferences. The API key stays
in client-local storage and is sent only with the dictation start options.

## Segmentation

A dictation is one segment unless it runs long. Past `segmentMinSeconds`
(60 s) the manager commits on the first silent chunk, so cuts land at a pause
rather than mid-word; `segmentMaxSeconds` (90 s) is a hard cap for speech with
no pause in it. Client chunks are ~1 s, so "silent chunk" is roughly a second
of silence.

The bounds exist because Parakeet is a full-attention conformer: decode cost
and peak memory grow quadratically with segment length. Measured on Parakeet
v3 int8 with 2 threads: 60 s took 2.1 s and +90 MB, 180 s took 9.3 s and
+490 MB, 300 s took 21.3 s and +1.5 GB. Committed segments decode while the
user is still speaking, so only the tail is left to transcribe on stop.

## Invariants

- Never load `sherpa-onnx-node` in the main server process.
- Local and OpenAI-compatible sessions transcribe on commit and emit final
  segment text. FunASR also emits non-final text for the current segment.
  The manager concatenates segment text in recording order, including when
  completed segments arrive out of order.
- The stream manager acks only the highest contiguous seq; the client is
  expected to retain unacked segments for retry/replay.
- Silence-only segments (peak < 300) are cleared, never committed, so
  Whisper-style providers do not hallucinate on silence.
- Model files live under `~/.config/openchamber/speech-models`.

## FunASR upstream completion

The session adapter accepts an explicit server protocol. These profiles are
not interchangeable, and the adapter does not guess from a first response.

- `python` is the default. It requires the maintained Python server's
  `is_end: true` acknowledgement after the client sends
  `is_speaking: false, is_end: true`. A VAD sentence with `is_final: true`
  is not the end of the client segment. Older servers without the end ACK
  are not supported by this profile.
- `cpp-2pass` uses `is_final: true` as the flush boundary. A
  `2pass-offline` result with `is_final: false` is a corrected sentence,
  not completion.
- `cpp-offline` requests `mode: offline` and accepts the one-shot
  `mode: offline` response, including `is_final: false`. The inspected C++
  service can also return empty text after some internal failures, which
  the adapter cannot distinguish from a successful empty transcription.

Online text is appended as deltas without trimming each fragment. Offline
text replaces the current provisional tail and appends to the corrected
sentences. An empty correction clears that tail; a textless terminal ACK
preserves corrected text. Empty terminal results still complete a segment.
An explicit error or failed Python ACK fails the dictation instead of
reporting empty success.

Every handler captures its connection's segment ID. A missing `wav_name`
can only refer to that connection; an explicit different ID is ignored.
Clear closes the active connection and drops its in-flight messages. It does
not cancel already-running model computation. Prior committed connections
keep draining independently, and duplicate terminal messages cannot consume
another segment.

At most eight active, draining or closing connections are retained. PCM
queued during a handshake and WebSocket send buffering are each capped at
320,000 bytes, ten seconds of 16 kHz mono PCM16. A connection attempt has a
ten-second deadline; committed work has a five-minute upper bound, in
addition to the manager's adaptive timeout. Closing connections have a
one-second grace before termination. Limit, connection and parsing failures
close the session and produce an error; the adapter does not retry or infer
missing text. The client may start a new dictation after the error.
