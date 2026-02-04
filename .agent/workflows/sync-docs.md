---
description: Ensures that documentation (README, ARCHITECTURE, CHANGELOG) stays in sync with code changes using the auto-docs-sync skill.
---

# Sync Docs Workflow

// turbo-all

1. Analyze the `git diff` of the current branch against `main`.
2. Activate `auto-docs-sync` skill.
3. Check `README.md` for outdated API or setup instructions.
4. Check `ARCHITECTURE.md` for structural changes.
5. Generate entries for `CHANGELOG.md` based on semantic commit history.
6. Check `AGENTS.md` and `ANTIGRAVITY_MANUAL.md` for new agent capabilities or skills.
7. Present the cumulative changes as a single Documentation Artifact for approval.
