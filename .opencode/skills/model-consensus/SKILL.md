---
name: model-consensus
description: Skill for validating critical logic across multiple LLM providers.
---

# Model Consensus Skill

Use this skill for high-stakes tasks (Auth, Security, Core Database Schemas).

## Methodology

1. **Parallel Request**: If a logic is critical, the Orchestrator should send the same prompt to two different models (e.g. `claude-3-opulent` and `gpt-4o`).
2. **Conflict Resolution**: If the models disagree, use the `red-teaming` skill to find the flaw in the logic.
3. **Consensus Voting**: The `SwarmOrchestrator` acts as the tie-breaker.

## Directives

- Use this skill for any code modifying `package.json`, `settings.json`, or security configurations.
- Flag disagreements as "Architectural Anomalies".

_Vibe: Precise, Scientific, Double-Checked._
