---
description: Tauri desktop — OpenCode SSE/REST integration and client regeneration instructions
---

# Tauri OpenCode Integration – Work Instructions

## Important Context
- Objective: move OpenCode API usage (SSE + key REST calls) into the Rust/Tauri runtime so WebView sleep does not break streaming; UI should consume desktop events/commands instead of browser SSE on desktop.
- OpenCode API runs locally (`opencode serve`), no tokens/auth flows; directory is passed via `?directory=`.
- Keep `@openchamber/ui` as-is; desktop runtime should provide events/REST via IPC, not by starting web servers.
- Do **not** start long-lived dev servers (`pnpm dev`); Tauri tooling is fine.

## Read First (in order)
1. `AGENTS.md`
2. `docs/tauri-opencode/plan.md`
3. Active stage/task notes from Bohdan (if provided)

## Regenerate Rust OpenCode client
- Manual only when API changes **and** Bohdan asks for it.
- Internal path crate `packages/opencode-client/` (no publish). Keep only `Cargo.toml`, `src/apis/*`, `src/models/*`, `src/lib.rs`; omit docs/tests.
- Full command lives in `docs/tauri-opencode/plan.md` → use it only when explicitly requested.

## Current Code State (baseline)
- Rust SSE runner: `packages/desktop/src-tauri/src/opencode/sse.rs` (backoff 0.5s→8s, Last-Event-ID, bounded buffer, status emits). Started from `src/main.rs`.
- Facade stub for REST: `packages/desktop/src-tauri/src/opencode/mod.rs` (directory injection, timeout); not yet wired to Tauri commands/UI.
- Path dependency: `packages/desktop/src-tauri/Cargo.toml` points to `../../opencode-client`.
- Plan doc: `docs/tauri-opencode/plan.md` tracks phases (Phase 1 done; Phase 2 in progress).

## Task Loop
1. Align with Bohdan on the next phase/task (default: continue Phase 2 SSE polish, then Phase 3 IPC, Phase 5 REST commands).
2. Re-read relevant section in `docs/tauri-opencode/plan.md`.
3. Report intent (task + one-line goal) and wait for “go”.
4. After “go”, implement scoped changes only:
   - SSE polish: buffer replay to new subscribers, heartbeat/status refinements.
   - Desktop events IPC: expose `events.subscribe/unsubscribe`, use in `useEventStream`, avoid browser SSE on desktop.
   - REST commands: wrap facade via Tauri commands (prompt/command/shell/abort/etc.) with directory injection, timeouts/retries.
5. Run validations (see below).
6. Summarize changes (≤3 bullets), validations (pass/fail), and next questions.

## Validations
From repo root:
- `pnpm -r type-check`
- `pnpm -r lint`
- `pnpm -r build`

## Constraints & Guardrails
- No `pnpm dev`/`pnpm start`; Tauri (`pnpm desktop:dev`) is acceptable.
- Do not reintroduce browser SSE on desktop when desktop events are available.
- Keep code/comments in English and follow existing lint/type rules.
- Do not publish the OpenCode client crate; it’s path-only in this repo.
