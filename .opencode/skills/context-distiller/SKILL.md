---
name: context-distiller
description: Advanced skill for managing long conversation context and token economy.
---

# Context Distiller Skill

Use this skill when a session reaches >20 messages or token limits are approached.

## Core Logic

1. **State Partitioning**: Identify "Cold Context" (old decisions/features already implemented) and "Hot Context" (current task).
2. **Summarization**: Use the `summarize` CLI command or the `/summarize` slash command periodically to condense Cold Context.
3. **Artifact pinning**: Ensure critical architectural decisions are moved to an `ARCHITECTURE.md` file rather than living in chat history.
4. **Context Clearing**: Proactively suggest clearing the session if the current task is completed, saving the necessary state to the workspace.

## Directives

- Never let the agent "forget" a decision simply because it fell out of the context window.
- If the model starts hallucinating or repeating, it's time to Distill.

_Vibe: Clean, Concise, Long-Term._
