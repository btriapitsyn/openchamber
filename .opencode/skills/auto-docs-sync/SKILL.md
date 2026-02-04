---
name: auto-docs-sync
description: Expert skill for keeping project documentation in perfect sync with the codebase.
---

# Auto-Docs Sync Skill

Use this skill whenever a feature implementation is completed.

## Core Logic

1. **Change Detection**: Analyze the diff of the recent commit.
2. **Docs Update**:
   - Update `README.md` if any user-facing APIs changed.
   - Update `ARCHITECTURE.md` if the system design changed.
   - Update `CHANGELOG.md` with a summary of the changes.
3. **Drafting**: Present the documentation updates as an "Information Overlay" for the user to review.

## Directives

- No code is "Done" until the docs reflect it.
- Use consistent formatting and link to the relevant implementation files.

_Vibe: Thorough, Professional, Up-to-Date._
