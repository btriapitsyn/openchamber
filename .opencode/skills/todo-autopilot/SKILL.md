---
name: todo-autopilot
description: Skill for autonomously managing session Todo items based on development progress.
---

# Todo Autopilot Skill

Use this skill to keep the session's Todo list in sync with reality.

## Core Logic

1. **Auto-Update**: After every major code change, update the session Todos via the internal store.
2. **Prioritization**: High-priority tasks should be addressed first. If an agent starts a low-priority task while a high-priority one is pending, the Orchestrator should intervene.
3. **Progress Tracking**:
   - Feature started -> Set Todo to `in_progress`.
   - Feature verified -> Set Todo to `completed`.
   - Blocked -> Mark as `pending` with a note.

## Directives

- Never close a session with `pending` high-priority items.
- The Todo list is the "Source of Truth" for the current session.

_Vibe: Organized, Proactive, Focused._
