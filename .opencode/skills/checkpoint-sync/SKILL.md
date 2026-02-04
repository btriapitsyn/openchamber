---
name: checkpoint-sync
description: Skill for using Antigravity checkpoints as state-transition markers for collaborative agents.
---

# Checkpoint Sync Skill

Use this skill to create "Safe Points" in the collaborative workflow.

## The Protocol

1. **Phase Checkpoints**: Create a named checkpoint (e.g. `CP: FEATURE_ALPHA_CORE_DONE`) after a sub-task is completed.
2. **State Validation**: Before any agent "starts" from a checkpoint, they must run the `self-healing-loop` to ensure the previous state is stable.
3. **Rollback Strategy**: If the `SwarmOrchestrator` detects a regression, it directs all agents to reset to the last "Consensus Checkpoint".

## Directives

- Never push to `main` without a `VERIFIED` checkpoint marker.
- Use checkpoints to "save" the vibration of the codebase before risky refactors.

_Vibe: Reliable, Stable, Checkpointed._
