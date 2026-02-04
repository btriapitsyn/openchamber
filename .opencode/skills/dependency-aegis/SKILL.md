---
name: dependency-aegis
description: Skill for secure and conflict-free dependency management.
---

# Dependency Aegis Skill

Use this skill when running `npm install`, `bun add`, or `pip install`.

## Security Protocols

1. **Vulnerability Scan**: Always run `npm audit` or `bun audit` after adding a package.
2. **Conflict Detection**: Check for peer dependency conflicts. Never use `--force` or `--legacy-peer-deps` without expert reasoning.
3. **Lockfile Integrity**: Ensure `package-lock.json` or `bun.lockb` is committed immediately after changes.
4. **License Check**: Avoid libraries with restrictive licenses (e.g., GPL) if the project requires MIT/Apache.

## Directives

- Keep your dependency tree shallow.
- Prefer standard libraries over heavy external dependencies.

_Vibe: Secure, Cautious, Stable._
