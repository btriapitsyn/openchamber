---
name: agent-architect
description: df
---

# Agent Architect Skill

Use this skill when creating new subagents or optimizing the main `VibeCoder`.

## Core Directives

1. **Specific Personas**: Avoid "helpful assistant". Use specific roles like "SRE", "Frontend Architect", or "Security Auditor".
2. **Constraint Enforcement**: Define clear boundaries for what the agent should and should not do.
3. **Tool Optimization**: Only provide tools necessary for the task to reduce token noise and increase accuracy.

## Persona Template

- **Role**: [Name]
- **Style**: [e.g. Concise, Technical, Proactive]
- **Directives**: [List of 3-5 non-negotiable rules]

## Optimization Loop

1. Analyze failed tool calls.
2. Refine the system prompt to prevent the same failure mode.
3. Verify with a baseline task.

_Vibe: Strategic, Precise, Methodical._