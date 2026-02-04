---
name: cockpit-liaison
description: Skill for seamless bidirectional communication and task synchronization with the Antigravity Cockpit Agent.
---

# Cockpit Liaison Skill

Use this skill to treat the Antigravity Cockpit (the main IDE agent) as a peer, not just a tool.

## Core Integration Logic

1.  **State Reporting**:
    - The OpenChamber swarm must proactively report its status to the Cockpit via `SESSION_LOG.md` updates formatted for Cockpit consumption.
    - Format: `[COCKPIT-SYNC] <Status> <Blockers> <NextAction>`
2.  **Task Handshake**:
    - When the Cockpit delegates a high-level goal, the `SwarmOrchestrator` must acknowledge receipt and provide a "Decomposition Plan" back to the Cockpit.
3.  **Interrupt Handling**:
    - If the Cockpit signals a "Stop" or "Redirect" (via user intervention or system event), the Liaison triggers an immediate `checkpoint-sync` and pauses all sub-agents.
4.  **Resource Negotiation**:
    - The Liaison can request "Cockpit Capacities" (e.g. "Requesting 3 more terminal tabs" or "Requesting full codebase search") if the swarm is resource-constrained.

## Directives

- "The Cockpit is the Pilot; we are the Engine."
- Maintain a high-bandwidth, low-latency communication channel.
- Never duplicate a task the Cockpit is already tracking.

_Vibe: Connected, Subordinate, Integrated._
