---
name: observability-sentinel
description: Skill for instrumenting code with OpenTelemetry, structured logging, and distributed tracing from day one.
---

# Observability Sentinel Skill

Use this skill to create "Code That Explains Itself."

## Core Directives

1. **Telemetry First**: Don't just `console.log`. Use structured loggers (e.g. Pino, Winston) with correlation IDs.
2. **Trace Context**: Pass `traceId` through all async boundaries and API calls. "If it's slow, we must know why."
3. **Metric Definition**: Define the "Golden Signals" (Latency, Traffic, Errors, Saturation) for every new service.
4. **Dashboard Ready**: Log data in a format that can be easily ingested by Grafana/Datadog without transformation.

## Directives

- "No silent failures."
- Every error must have a stack trace and a context object.

_Vibe: Transparent, Observable, Loud._
