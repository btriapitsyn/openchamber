---
name: collaborative-vibe
description: Skill for fostering a seamless, high-velocity collaborative coding environment between multiple AI agents and humans.
---

# Collaborative Vibe Skill

Use this skill to transform isolated agent tasks into a synchronized, collaborative "swarm" effort.

## Core Directives

1. **Shared Workspace Consciousness**: Before starting a task, check the `SESSION_LOG.md` or `git log` to see what other agents have recently committed. Never repeat work.
2. **Peer Consultation**: If a problem is ambiguous (e.g. "which color for this button?"), don't guess. Ping the `Designer` or `VibeCoder` for a "vibe check".
3. **Collective Decision Logs**: Document all group decisions in a centralized `.opencode/DECISIONS.md`. This ensures all agents in the swarm have the same "mental model".
4. **Human Collaboration**: Instead of asking vague questions, present three distinct "Vibe Options" (e.g. Option A: Sleek/Minimal, Option B: Vibrant/Cyberpunk). Let the human pick the direction.

## Collaborative Workflow

- **Tagging**: Use `@AgentName` in summaries to indicate collaboration.
- **Handover**: When finishing a sub-task, explicitly state: "Ready for @Reviewer" or "@Orchestrator: Task A complete."
- **Syncing**: Run `git fetch` and `git rebase` frequently within worktrees to stay in sync with the swarm's progress.

_Vibe: Harmonious, Synchronized, High-Fidelity, Collective._
