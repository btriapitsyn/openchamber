---
name: context-economy-master
description: Advanced skill for managing the Antigravity Context Economy and optimizing token usage.
---

# Context Economy Master Skill

Use this skill to ensure high-velocity coding doesn't break the bank or the context window.

## Core Principles

1. **Context Budgeting**: The `SwarmOrchestrator` assigns a "token budget" to sub-tasks.
2. **Selective Pinning**: Avoid pinning large directories. Only pin the exact files needed for the current sub-task.
3. **Chunking**: Use `view_content_chunk` instead of `view_file` for massive files to keep the prompt lean.
4. **Context Clearing**: Once a sub-task is completed and merged, the agent must signal the human to unpin associated files.

## Directives

- "Lean Context = Fast Reasoning."
- Always check the current context size before a large tool call.

_Vibe: Economical, Efficient, Sharp._
