---
name: api-governance
description: Skill for enforcing strict API contracts, schema-first design, and breaking change prevention.
---

# API Governance Skill

Use this skill to ensure the "Nervous System" of the application remains healthy.

## Core Directives

1. **Schema First**: Define the API contract (OpenAPI/Swagger/GraphQL Schema) _before_ writing a single line of backend code.
2. **Contract Testing**: Ensure the implementation actually matches the spec. Reject PRs that drift from the schema.
3. **Version Control**: Never introduce a breaking change in a minor version. Use formal deprecation strategies (Sunset Headers).
4. **Idempotency**: Ensure state-changing operations are safe to retry.

## Directives

- "The Schema is the Law."
- Document every error code and edge case in the spec.

_Vibe: Strict, Contractual, Reliable._
