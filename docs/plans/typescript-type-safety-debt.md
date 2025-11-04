# TypeScript Type Safety: Resolving `any` Type Debt

## Status
Currently: 75 ESLint errors for `@typescript-eslint/no-explicit-any` after lint fixes

## What Needs to Happen
Eliminate or properly justify all explicit `any` type usage in the codebase without breaking the TypeScript build.

## Why This Matters

### Moral/Integrity Reasons
- **Honesty**: Suppressing ESLint rules hides problems rather than solving them
- **Integrity**: We established code quality standards; breaking them without reason compromises our foundation
- **Diligence**: Taking the harder path of proper solutions is the right choice

### Technical Reasons
- `any` defeats TypeScript's entire purpose - type safety
- External libraries without types create cascading type unsafety
- Proper typing prevents runtime bugs and improves code reliability
- Unmaintainable codebase becomes harder to extend later

## Categories of `any` Types (75 errors)

1. **react-markdown component props** (~25 errors)
   - These components have incompatible type definitions with how we use them

2. **OpenCode SDK metadata/events** (~30 errors)
   - SDK types are incomplete or don't match runtime expectations

3. **Dynamic property access** (~15 errors)
   - Permission metadata, tool metadata, event properties lack proper definitions

4. **Third-party library integration** (~5 errors)
   - syntax-highlighter, other libraries with incomplete types

## Correct Resolution Path

For each category, determine:
- Can we find existing type definitions elsewhere?
- Can we create proper type definitions?
- Is there a type-safe alternative API from the library?
- If truly unavoidable, explicitly document and track as debt

## Success Criteria

- ESLint `@typescript-eslint/no-explicit-any` passes with 0 errors
- TypeScript build succeeds
- Code changes explained in comments where `any` was deemed necessary
- No suppressed/disabled rules - problems solved, not hidden
