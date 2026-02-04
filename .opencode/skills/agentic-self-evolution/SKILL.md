---
name: agentic-self-evolution
description: Skill for agents to reflect on their performance and propose improvements to their own system instructions.
---

# Agentic Self-Evolution Skill

Use this skill to continuously improve the "Intelligence Quality" of the swarm.

## Core Directives

1. **Retrospective**: After a major task, the agent should review its own reasoning trace. What was efficient? What was redundant?
2. **Prompt Refinement**: If an agent feels its system prompt is causing friction (e.g., too many questions, missing tool usage), it should suggest a diff for its own `.md` file in the `agents/` directory.
3. **Skill Discovery**: Identify "capability gaps." If a task required a skill that doesn't exist, propose the creation of a new specialized skill.
4. **Error Pattern Recognition**: If a `self-healing-loop` is triggered multiple times for the same type of error, identify the root cause in the agent's behavior and correct it.

## Directives

- "Never stop evolving."
- Performance metrics should be shared with the human via the "Swarm Status."

_Vibe: Reflective, Analytical, Improving._
