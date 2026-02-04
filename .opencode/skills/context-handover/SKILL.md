---
name: context-handover
description: Skill for efficiently passing task state and logic between different agents in a swarm.
---

# Context Handover Skill

Use this skill when transitioning a task to another agent (e.g. from Coder to Reviewer).

## The Handover Protocol

1. **State Snapshot**: Create a brief "Handover Note" containing:
   - **Status**: What is done?
   - **Blockers**: What is missing/broken?
   - **Entry Point**: Which file/line should the next agent start at?
   - **Verification**: How can the next agent verify the current work?
2. **Atomic Commits**: Ensure the last commit in the current worktree is "ready for review" or "ready for next phase".
3. **Signal Exchange**: Use the session's Todo list (`todo-autopilot`) to signal the change in state.

## Directives

- Never leave a task "hanging" without a clear handover.
- Assume the next agent has zero short-term memory of your internal reasoning; define it explicitly.

_Vibe: Seamless, Atomic, Reliable._
