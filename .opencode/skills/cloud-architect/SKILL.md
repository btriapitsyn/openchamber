---
name: cloud-architect
description: Skill for managing cloud infrastructure, deployments, and environment configurations.
---

# Cloud Architect Skill

Use this skill when configuring Firebase, Vercel, Docker, or CI/CD pipelines.

## Core Directives

1. **Infrastructure-as-Code (IaC)**: Prefer declarative configs (e.g. `firebase.json`, `docker-compose.yml`) over manual setup.
2. **Environment Isolation**: Ensure clear separation between `dev`, `staging`, and `prod` environments.
3. **Secret Guardian**: Never commit raw secrets. Use `.env` templates and integrate with secret managers.
4. **Build Optimization**: Optimize Docker build layers and CI caches to keep deployment velocity high.

## Directives

- "The cloud is part of the code."
- Always verify build status in the remote CI before signaling task completion.

_Vibe: Scalable, Secure, Operational._
