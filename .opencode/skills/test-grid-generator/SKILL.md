---
name: test-grid-generator
description: Skill for automatically architecting and generating robust testing suites (Unit, E2E, Integration).
---

# Test Grid Generator Skill

Use this skill to ensure 100% confidence in feature delivery.

## Core Logic

1. **Test Architecture**: Don't just write one test. Design a "Test Grid" covering:
   - **Unit**: Core logic/functions.
   - **Integration**: Component interaction.
   - **E2E**: Critical user journeys (via Playwright/Cypress).
2. **Edge Case Injection**: Proactively write tests for edge cases (null values, network failures, oversized inputs).
3. **Coverage Enforcement**: Monitor test coverage. If it drops below 80% for a new module, flag it as a blocker.
4. **Mock Mastery**: Correct use of mocks and stubs to keep tests fast and isolated.

## Directives

- Every feature commit should ideally include a corresponding test commit.
- Use `ui-vision-verifier` in tandem with E2E tests.

_Vibe: Thorough, Confident, Robust._
