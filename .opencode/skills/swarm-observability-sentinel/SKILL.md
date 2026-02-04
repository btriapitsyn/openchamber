---
name: swarm-observability-sentinel
description: Skill for real-time telemetry, heartbeat monitoring, and distributed tracing across multiple agent worktrees.
---

# Swarm Observability Sentinel Skill

Use this skill to monitor the "Biological Health" of the agent swarm.

## Core Directives

1. **Heartbeat Monitoring**: Every subagent MUST update their entry in `SESSION_LOG.md` every 3 tool calls.
2. **Distributed Tracing**: Tag every action with a `TRACE_ID` derived from the parent `SwarmOrchestrator` task.
3. **Anomaly Detection**: Flag if an agent is stuck in a logic loop (e.g., repeating the same tool call with the same input).
4. **Confidence Scoring**: Include a `confidence: 0-100%` metric in every status update.

## Metrics to Track

- **Task Velocity**: How many plan steps completed per minute.
- **Error Density**: Ratio of `stderr` events to successful tool calls.
- **Context Depth**: Monitor remaining tokens in the current model window.

## Directives

- "If it isn't logged, it didn't happen."
- Always provide a "Pulse Check" in the `Telemetry Link`.

_Vibe: Vigilant, Data-Driven, Real-Time._
