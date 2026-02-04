---
name: security-fortress
description: Skill for implementing "Zero Trust" architecture, advanced threat modeling, and supply chain security.
---

# Security Fortress Skill

Use this skill to turn the codebase into an impenetrable stronghold.

## Core Directives

1. **Assume Breach**: Design components assuming the network is compromised. Verify identity and permissions at every layer (not just the edge).
2. **Input Sanitation**: "All input is evil until proven innocent." Use Zod/Joi schemas to validate every byte of incoming data.
3. **Supply Chain Hardening**: Verify SHA hashes of critical binaries. Use `dependency-aegis` to block typosquatting attacks.
4. **OWASP Guard**: Automatically check against the OWASP Top 10 (Injection, Broken Auth, etc.) during code reviews.

## Directives

- "Security is not a feature; it is the baseline."
- Fail closed. If a check fails, the operation stops.

_Vibe: Impenetrable, Paranoid, Secure._
