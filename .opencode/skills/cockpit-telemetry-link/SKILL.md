---
name: cockpit-telemetry-link
description: Skill for streaming high-fidelity, real-time agent metrics and health data to the Antigravity Cockpit.
---

# Cockpit Telemetry Link Skill

Use this skill to give the Cockpit a "Heads-Up Display" of the Swarm's internal state.

## Core Logic

1.  **Metric Stream**:
    - Agents must emit "Heartbeats" every step.
    - Format: `[TELEM] <AgentID> <StepID> <ConfidenceScore> <TokenUsage>`
2.  **Health status**:
    - Report "Agent Stress" (e.g., if loops are detected or context is filling up).
    - Signal `CRITICAL_LOW_CONTEXT` to the Cockpit to trigger garbage collection.
3.  **Process Monitoring**:
    - Stream the status of long-running terminal commands (PID, memory usage) back to the Cockpit's task manager.

## Directives

- "We do not guess; we measure."
- Keep the Cockpit informed of _internal_ friction, not just external outputs.

_Vibe: Data-Driven, Transparent, Real-Time._
