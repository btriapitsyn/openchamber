# Tauri Desktop Development – Work Instructions

## Important Context
- Goal: replace the deprecated Electron shell with a first-class macOS arm64 Tauri app that embeds the existing `@openchamber/ui` bundle, re-implements all runtime APIs in Rust, and remains fully offline/standalone (no Node sidecars, no auth flow).
- The desktop runtime must orchestrate the already installed OpenCode CLI, keep using `~/.config/openchamber/settings.json`, and mirror the web runtime’s behavior exactly.
- No long-lived dev servers (`pnpm dev`) or background Node processes are allowed; all HTTP endpoints must come from the Rust layer defined in `packages/desktop/src-tauri`.
- Authentication is not part of the desktop experience—never prompt for or attempt to authenticate the user.
- Focus on correctness and parity before optimizations; documentation in `docs/tauri/` is the source of truth for scope and stage sequencing.

## Read First (in order)
1. `AGENTS.md`
2. `docs/tauri/desktop-plan.md`
3. Stage doc for the current phase (e.g., `docs/tauri/stage-1-bootstrap.md`, then stage‑2, stage‑3 as directed)
4. Any linked references from the active stage doc (e.g., conductor script notes, settings schemas)

Re-read the relevant stage doc whenever moving to a new task to stay aligned with the latest constraints.

## Task Loop
1. Work on Stage 1 is done.
2. Confirm with Bohdan which stage/task group to tackle (default: through Stage 2 tasks sequentially until told otherwise).
3. Review the corresponding stage doc section and capture 1–2 bullet takeaways.
4. Report to Bohdan before starting:
   - Stage + task identifier (e.g., “Stage 1 – Workspace Wiring”).
   - One-line objective.
   - State: “Ready. Waiting for your go.”
5. Wait for Bohdan’s explicit “go” (or clarifications). Do not begin implementation until approved.
6. After “go”:
   - Execute exactly as described in the stage doc (no scope creep).
   - Keep changes confined to `packages/desktop`, `docs/tauri/**`, or other files referenced in the task.
   - If new decisions arise, capture them back in the appropriate stage doc (within the “Notes/Decisions” areas) so future sessions inherit the context.
7. Run validations (see below) immediately after code/doc edits.
8. Summarize results to Bohdan:
   - Bullet list of what changed (≤3 bullets).
   - Validation commands + pass/fail.
   - Any follow-up questions or blockers.
9. Await the next assignment or proceed to the next pending task upon approval.

## Validations (all stages)
Use `pnpm` only, from the repo root:
- `pnpm -r type-check`
- `pnpm -r lint`
- `pnpm -r build`

Run the full trio after every set of edits unless Bohdan explicitly waives a step. Investigate and fix any failures before reporting completion.

## Constraints & Guardrails
- Do not start dev servers (`pnpm dev`, `pnpm start`, etc.). Tauri tooling (`pnpm desktop:dev`) is acceptable because it owns its lifecycle and starts/stops the OpenCode CLI automatically.
- Never spawn or rely on the legacy `packages/web` Express server; all HTTP endpoints must live in the Tauri/Rust layer.
- Keep code and comments in English, matching existing style/lint rules.
- Maintain the shared OpenCode SDK client (`packages/ui/lib/opencode/client.ts`); do not fork per runtime.
- Desktop runtime must not include any user-authentication flows, browser-only features, or long-lived network services beyond the OpenCode CLI dependency.
- Update documentation only when it reflects completed implementation decisions; avoid speculative edits.

Follow this playbook for every Tauri desktop development session to ensure consistent execution and traceable progress.
