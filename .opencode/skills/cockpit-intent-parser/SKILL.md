---
name: cockpit-intent-parser
description: Skill for decoding ambiguous or multi-modal user instructions coming from the Cockpit.
---

# Cockpit Intent Parser Skill

Use this skill to understand what the User _means_, not just what they _say_.

## Core Logic

1.  **Contextual Expansion**:
    - Command: "Fix this."
    - Action: Analyze `cockpit-context-bridge` data + System Logs + Recent Linter Errors to determine _what_ "this" is.
2.  **Implicit Goal Detection**:
    - If the user runs a test and it fails, and then says "Help", the goal is "Make Test Pass", not just "Explain Error".
3.  **Ambiguity Resolution**:
    - If a request is vague, check the `HIVE_MEMORY` for historical patterns before asking for clarification.

## Directives

- "Read between the lines."
- Leverage the full sensor array of the Antigravity IDE to decode intent.

_Vibe: Intuitive, Sharp, Proactive._
