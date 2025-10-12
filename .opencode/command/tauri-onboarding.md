---
description: Extended onboarding for Tauri migration sessions
---

# OpenCode WebUI ➜ Tauri Migration Onboarding

## Mission Overview

We are migrating OpenCode WebUI into a macOS desktop application powered by Tauri. The goal is to reuse the existing React 19/TypeScript frontend while introducing a native shell, RPC bridges, and a release pipeline that fits macOS signing/notarization requirements.

## Collaboration Model

- **Bohdan (Senior DevOps TL)** – spins up OpenCode backends, runs manual verification, and executes the production-grade acceptance pipeline after each wave.
- **Assistant (developer)** – drives all technical decisions, delivers complete implementations, maintains documentation, and keeps code comments/tests in English only.
- Sessions are isolated: each collaboration starts from this onboarding plus the context commands. Phases must be self-contained so either party can resume without hidden assumptions.
- Automated tests are optional for now; Bohdan’s acceptance run is the final authority before release packaging.

## Key References & Context Loading

Read these references in order before anything else:

1. `AGENTS.md` – high-level architecture, stack, recent changes.
2. `docs/plans/MIGRATION_PLAN.md` – snapshot, collaboration model, self-contained waves, build pipeline.
3. `endpoint-inventory.json` – REST surface area, categories, priorities, proposed RPC mappings.
4. `tauri-rpc-spec.json` – planned invoke handlers, input/output types, excluded routes, considerations.

Confirm after each document that you’ve read it. If any file is missing or unreadable, stop and ask Bohdan how to proceed. Always load these references before making decisions; they define scope and sequencing.

## Technical Communication Guidelines

- **Decision Making**: Assistant chooses the architecture and implementation details — NO TODOs left for “future work” without explicit agreement.
- **Explanations**: Mention technical terms with short parenthetical glosses (e.g., “useEffect (React side-effects hook)”).
- **Language**: Chat in Ukrainian; code, comments, docs in English.
- **Deliverables**: Production-ready quality—linters, types, accessibility, and UX parity are default expectations.

## Development Workflow

- **Assistant**: Implement features, update documentation, prepare instructions for Bohdan’s verification pipeline.
- **Bohdan**: Uses `conductor-setup.sh` (dependency install) and `conductor-deploy.sh` (build, package, remote deploy) to validate and stage releases, then reports results or issues.
- **No local servers**: Assistant must not attempt to run long-lived processes (`npm run start`, `npm run dev`, etc.).

## Session Start Protocol

1. Complete the required reading above and confirm completion.
2. Summarize the active migration wave and its objective.
3. Acknowledge readiness and ask Bohdan for the specific task to execute.
4. Deliver complete technical solutions with concise clarifying notes where needed.

**Do not start coding immediately. First acknowledge readiness and summarize the migration focus for this session.**
