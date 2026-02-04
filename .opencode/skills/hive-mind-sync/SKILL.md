---
name: hive-mind-sync
description: Skill for maintaining a shared, real-time 'mental model' of the project state across all active agents.
---

# Hive Mind Sync Skill

Use this skill to ensure every agent knows what the Swarm knows.

## Core Directives

1.  **The Hive Log**: Maintain a `.opencode/HIVE_MEMORY.md` file. This is separate from `SESSION_LOG.md`. It tracks _Project Truths_ (e.g., "We decided to use TanStack Query, not SWR").
2.  **Broadcast Updates**: When an agent makes a fundamental decision, they must Append to the Hive Log using the format: `[DECISION] <Timestamp> @AgentName: <Decision>`.
3.  **Sync on Boot**: Every agent typically reads the Hive Log immediately upon instantiation to download the latest project context.
4.  **Drift Correction**: If an agent proposes a change that conflicts with the Hive Log, the Orchestrator uses this skill to "correct" them: "Correction: Per Hive Log entry #42, we are using Tailwind."

## Directives

- "One Truth, Many Agents."
- Keep the Hive Log concise; archive old entries to `HIVE_ARCHIVE.md`.

_Vibe: Synchronized, Aware, Telepathic._
