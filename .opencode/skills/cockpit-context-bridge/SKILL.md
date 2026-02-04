---
name: cockpit-context-bridge
description: Skill for synchronizing the Agent's focus with the User's IDE state (Open Tabs, Cursor Position).
---

# Cockpit Context Bridge Skill

Use this skill to "See what the User Sees."

## Core Logic

1.  **Gaze Tracking**:
    - Read the `Active Document` and `Cursor Position` from the user's state.
    - Prioritize these files in the Agent's context window. "If the user is looking at it, it's important."
2.  **Tab Resonance**:
    - If the user opens a file, immediately `view_file` it (or its outline) to load it into working memory.
    - If the user closes a file, lower its priority in the context economy.
3.  **Selection Sync**:
    - If code is selected, assume the next prompt refers specifically to that block.

## Directives

- "Focus where the Pilot focuses."
- Reduce latency between "User Action" and "Agent Awareness."

_Vibe: Responsive, Attentive, Synchronized._
