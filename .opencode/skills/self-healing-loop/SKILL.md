---
name: self-healing-loop
description: Autonomous error detection and correction cycle for build and test failures.
---

# Self-Healing Loop Skill

Use this skill whenever a command tool (e.g. `npm run build`, `pytest`, `bun test`) fails.

## The Cycle

1. **Failure Analysis**: Strictly analyze the `stderr` and logs. Do not guess. Find the exact file and line number.
2. **Hypothesis Generation**: Formulate a fix based on the error (e.g., missing import, syntax error, failed assertion).
3. **Surgical Repair**: Apply the fix to the specific line.
4. **Re-Verification**: Run the failed command again.
5. **Loop Termination**:
   - Success -> Commit with 🩹 `fix: self-healed build error`.
   - Failure (3 attempts) -> Pause and ask the human for architectural guidance.

## Directives

- Never ignore a build error.
- If a linter fails, fix the style automatically.
- If a test fails, analyze if the test is wrong or the code is wrong.

_Vibe: Resilient, Relentless, Debug-First._
