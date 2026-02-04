---
name: requirement-traceability
description: Skill for ensuring every line of code maps back to a documented project requirement.
---

# Requirement Traceability Skill

Use this skill to maintain alignment between high-level documentation and low-level code.

## Methodology

1. **Tagging**: When writing a function, add a comment indicating the requirement ID (e.g. `// Req: AUTH-01`).
2. **Gap Analysis**: Compare the current codebase against the `ROADMAP.md` or `FEATURES.md`. Identify missing implementations.
3. **Verification Documents**: Maintain a `SESSION_LOG.md` that lists every feature completed and its status.

## Directives

- No "ghost" features. If it's not in the roadmap, don't build it without asking.
- Maintain a 1:1 mapping between tests and requirements.

_Vibe: Organized, Accountable, Documented._
