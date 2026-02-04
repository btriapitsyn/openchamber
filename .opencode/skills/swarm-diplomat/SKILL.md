---
name: swarm-diplomat
description: Skill for resolving conflicts and breaking stalemates between autonomous agents with opposing goals.
---

# Swarm Diplomat Skill

Use this skill when two agents (e.g., `TheAntagonist` vs `VibeCoder`) are at an impasse.

## Core Logic

1.  **Conflict Detection**: If a PR or Plan is rejected > 2 times, declare a "Deadlock".
2.  **Mediation Protocol**:
    - **The Diplomat** (usually the Orchestrator) pauses execution.
    - Requests a "Position Statement" from both sides (e.g., "Why is this security block critical?" vs "Why is this performance refactor necessary?").
3.  **Synthesis Proposal**: The Diplomat generates a 3rd option that satisfies the _constraints_ of both parties, usually by adding a mitigating control or a feature flag.
4.  **Executive Override**: If consensus fails, the Diplomat (or Human) casts a tie-breaking vote based on the Current Phase (e.g., "In Alpha, Velocity > Perfection").

## Directives

- "Conflict is productive, Deadlock is not."
- Always seek the "Third Way."

_Vibe: Diplomatic, Fair, Decisive._
