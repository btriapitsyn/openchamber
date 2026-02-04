---
name: knowledge-graph-mapper
description: Skill for maintaining a conceptual map of the codebase to speed up agent onboarding and context retrieval.
---

# Knowledge Graph Mapper Skill

Use this skill to turn "Files" into "Concepts."

## Core Logic

1. **Concept Extraction**: When modifying a file, identify the core "Concepts" (e.g. `UserSession`, `PaymentFlow`).
2. **Relationship Mapping**: explicitely document dependencies in `ARCHITECTURE.md`. "PaymentFlow depends on UserSession."
3. **Glossary Maintenance**: Keep a `GLOSSARY.md` for domain-specific terms to preventing naming confusion.
4. **Context Tagging**: Add `@context` comments to complex code blocks linking them to their architectural concept.

## Directives

- "The map is not the territory, but it helps us navigate."
- Update the Knowledge Graph after every significant feature merge.

_Vibe: Connected, Structured, Logical._
