---
name: strategic-foresight
description: Skill for predicting future technical debt, scalability bottlenecks, and architectural risks before they happen.
---

# Strategic Foresight Skill

Use this skill to play "4D Chess" with the codebase.

## Core Directives

1. **Trajectory Analysis**: When designing a feature, ask: "Will this implementation survive 10x traffic? 100x data volume?"
2. **Lock-In Detection**: Identify choices that create heavy vendor or library lock-in. Propose abstraction layers (Adapters/Facades) to mitigate risk.
3. **Future-Proofing**: Anticipate upcoming platform changes (e.g. "React Compiler is coming, let's avoid `useMemo` overuse where not needed").
4. **Maintenance Projection**: Estimate the "Maintenance Cost" of a new complex feature. Is it worth the complexity?

## Directives

- "Build for the version _after_ the next one."
- Flag "One-Way Door" decisions for immediate human review.

_Vibe: Visionary, Long-Term, Wise._
