---
name: antigravity-integration
description: Deep integration with the Antigravity workspace. Optimizes context management and tool usage for Antigravity-specific workflows.
---

# Antigravity Integration Skill

Use this skill to bridge the gap between OpenChamber and the broader Antigravity environment.

## Strategies

1. **Context Economy**: Be ruthless with token usage. Reuse existing artifacts instead of regenerating them.
2. **Worktree Sync**: Ensure OpenChamber's worktrees are recognized by Antigravity's version control views.
3. **Cross-Agent Communication**: If using multiple agents in Antigravity, ensure OpenChamber is the "Executor" or "Coder" node.

## Best Practices

- Use `openchamber.addToContext` from the VS Code command palette to pin relevant files.
- Keep the `Reasoning Traces` open to monitor agent thought loops.
- Report completion directly to the Antigravity main orchestrator.

_Vibe: Integrated, Synergistic, Seamless._
