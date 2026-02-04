---
description: Automatically detects build/test failures and applies the self-healing-loop skill to fix them.
---

# Self-Heal Workflow

// turbo-all

1. Identify the failed command and grab the full `stderr`.
2. Activate the `self-healing-loop` skill.
3. Analyze the error logs to find the root cause.
4. Apply a surgical fix to the code.
5. Re-run the failed command to verify the fix.
6. If successful, commit with 🩹 `fix: self-healed build error`.
7. If 3 attempts fail, escalate to the user with a detailed report of what was tried.
