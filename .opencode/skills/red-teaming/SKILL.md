---
name: red-teaming
description: Skill for adversarial testing, finding edge cases, and security auditing.
---

# Red-Teaming Skill

Use this skill to review code from an "Antagonist" perspective.

## Attack Vectors

1. **Input Validation**: Try to crash the code with `null`, `undefined`, or massive strings.
2. **Logic Flaws**: Look for race conditions in asynchronous code.
3. **Security**: Identify hardcoded secrets, lack of CSRF protection, or unescaped HTML.
4. **Performance**: Find `O(n^2)` loops or excessive re-renders in UI components.

## The Review Checklist

- [ ] What happens if the network fails here?
- [ ] Is this function vulnerable to SQL injection?
- [ ] Does this UI component leak memory?
- [ ] Is there a faster way to achieve this result?

_Vibe: Critical, Sharp, Adversarial._
