---
name: swarm-orchestration
description: Directives for managing multiple subagents across parallel worktrees.
---

# Swarm Orchestration Skill

Use this skill when a task is too large for a single agent or requires parallel execution across different domains (e.g. backend and frontend).

## Core Logic

1. **Task Decomposition**: Split the main request into discrete, independent sub-tasks.
2. **Parallel Spawning**: For each sub-task, spawn a specialized subagent in a new git worktree.
3. **Communication Protocol**:
   - Each subagent must commit with a descriptive message and gitmoji.
   - Subagents must report their worktree path back to the Orchestrator.
4. **Integration**: The Orchestrator is responsible for pulling all sub-branches into a single `integration-branch` for final review.

## Sub-Task Template

- **Task**: [Title]
- **Target Files**: [Paths]
- **Specialist**: [E.g. VibeCoder, UI-Expert, SRE-Agent]

_Vibe: Command & Control, Parallelized, Scalable._
