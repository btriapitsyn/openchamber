---
description: Performs a comprehensive security audit of the current workspace using the security-fortress and dependency-aegis skills.
---

# Security Audit Workflow

// turbo-all

1. Run `bun audit` and `npm audit` to check for supply chain vulnerabilities.
2. Activate `security-fortress` skill.
3. Perform a "Zero Trust" scan of recent changes:
   - Check for new inputs without validation (Zod/Joi).
   - Verify identity checks on new API endpoints.
4. Activate `dependency-aegis` skill to check for license conflicts.
5. Generate a `SECURITY_REPORT.md` with:
   - ✅ Passed checks
   - ⚠️ Warnings
   - 🚨 Critical vulnerabilities
6. Propose fixes for any identified issues.
