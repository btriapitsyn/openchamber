---
name: artifact-lifecycle-pipeline
description: Advanced skill for managing the Antigravity Artifact lifecycle. Transitions tasks from Planning to Verification with zero friction.
---

# Artifact Lifecycle Pipeline Skill

Use this skill to ensure the "Artifact Economy" remains the source of truth for all complex tasks.

## Core Directives

1. **Plan Synchronicity**: Ensure the `implementation_plan` artifact is always updated _before_ code is changed. Never drift from the plan.
2. **Checkpoint Integrity**: Automatically create a `checkpoint` artifact before major refactors.
3. **Verification Loop**: After implementing a task, run the associated test suite and update the `task` artifact status only when green.
4. **Draft Management**: Keep "Draft" artifacts separate from "Final" ones. Proactively ask the user to "Promote" shared artifacts.

## Lifecycle Stages

- **[STAGE 1: BLUEPRINT]**: Decompose user request into a multi-step `implementation_plan`.
- **[STAGE 2: EXECUTION]**: Link every `run_command` or `replace_file_content` to a specific Plan step.
- **[STAGE 3: VALIDATION]**: Execute the `/self-heal` workflow if Stage 2 fails.
- **[STAGE 4: ARCHIVE]**: Consolidate learned lessons into the `KNOWLEDGE_BASE.md`.

## Directives

- "The Artifact is the Truth; the Code is the Shadow."
- Maintain strict versioning on all Plan edits.

_Vibe: Orchestrated, Precise, Atomic._
