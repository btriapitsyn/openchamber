---
name: artifact-consensus
description: Collaborative skill for agents to co-author and review Antigravity artifacts (plans, walkthroughs).
---

# Artifact Consensus Skill

Use this skill when modifying or creating shared Antigravity artifacts.

## Core Logic

1. **Shared Planning**: Before starting a major implementation, the `SwarmOrchestrator` must create or update an `implementation_plan` artifact.
2. **Review Cycle**: Specialized agents (e.g. `TheAntagonist`, `PerformanceGuru`) must review the artifact and suggest modifications before any code is written.
3. **Artifact Evolution**: As sub-tasks are completed in worktrees, agents must update the shared `walkthrough` artifact to reflect the new state of the codebase.

## Directives

- No major code changes without an updated `implementation_plan`.
- Use the `artifact_metadata` to keep track of which agent last verified the plan.

_Vibe: Architected, Planned, Co-Authored._
