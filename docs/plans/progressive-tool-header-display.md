# Progressive Tool Header Display

## Overview

Replace the current "all tools appear at once" model with a progressive header display that shows one tool header at a time, evolving into a summary when all tools complete.

## Current Behavior

- All tools hidden during execution
- All completed tools appear simultaneously when finished
- Each tool individually expandable/collapsible
- Multiple tool headers visible at once

## Proposed Behavior

### Execution Phase
- **No display**: Tools remain hidden during execution (unchanged)
- **No live updates**: Still only show completed tools (unchanged)

### Progressive Display Phase
When tools complete, show only the most recently completed tool:

**First tool completes:**
```
▶ bash: pnpm install         1.2s
```

**Second tool completes:**
```
▶ edit: package.json         +5/-2  0.8s
```

**Third tool completes:**
```
▶ read: src/config.ts        0.3s
```

### Summary Phase
When every tool/reasoning entry tied to the active user message has completed **and** the chat signals that the assistant text animation can start (reusing existing “animation-ready” logic):

**Collapsed summary:**
```
▶ 3 tools completed • 2.3s
```

**Expanded summary:**
```
▼ 3 tools completed • 2.3s
✅ bash: pnpm install         1.2s
✅ edit: package.json         +5/-2  0.8s  
✅ read: src/config.ts        0.3s
```

## UI/UX Requirements

### Header Styling
- **Consistent appearance**: Summary header must look identical to individual tool headers
- **Same typography**: Use existing `typography-meta` and spacing
- **Same icons**: Chevron right/down for collapsed/expanded states
- **Same hover behavior**: Identical cursor and hover transitions
- **Summary icon**: Summary header uses the `ListChecks` icon

### Header Content Evolution
1. **Individual tool**: `[icon] tool: description          duration`
2. **Summary**: `[icon] N tools completed • total_duration`

### Expansion Behavior
- **Always collapsed**: Headers never auto-expand
- **Manual control**: Only user clicks expand content
- **Summary-controlled**: Summary header governs expansion of the grouped list
- **Individual entries**: Stay collapsed during the progressive phase but retain their normal expand/collapse behavior once rendered inside the summary list

### Visual Layout
- **No indentation**: Expanded summary items use same layout as regular tools
- **No tabs/spacing**: Don't add extra visual hierarchy in expanded state
- **Consistent spacing**: Use existing `my-1` margins between items
- **Reasoning entries**: Thinking/Justification adopt the new tool header/body layout and are included anywhere the plan mentions “tool”

## Interaction Model

### Progressive Phase
- **Single header**: Only one tool header visible at any time
- **Content replacement**: Header content updates when new tool completes
- **No expansion**: Individual tool headers are not expandable during this phase

### Summary Phase
- **Summary header**: Replaces the progressive header when animation-ready fires and more than one entry exists
- **Expandable**: User can click to see the grouped list
- **Complete list**: Shows every grouped entry (tools + reasoning) with their usual collapsed/expanded interactions

## State Management

### Header States
1. **Hidden**: No tools completed yet
2. **Individual**: Showing most recent completed entry (tool or reasoning) while others are pending
3. **Summary**: Showing grouped count and total duration once animation-ready triggers and more than one entry exists

### Expansion States
- **Collapsed**: Default state for all phases
- **Expanded**: Available for summary header and each grouped entry within the summary list

## Grouping Logic

- **Scope**: Group every assistant message (tool executions, Thinking blocks, Justification blocks) whose `info.parentID` matches the user message that triggered the work.
- **Progressive feed**: During execution, show only the most recently completed entry from this group.
- **Summary trigger**: Once the animation-ready signal fires, transition to summary mode. If the group contains exactly one entry, skip summary mode and leave that entry as-is.
- **Summary content**: Header displays `N entries completed • total_duration`. Duration can either be the difference between the earliest start and latest end, or the sum of individual durations—pick one method and apply it consistently.
- **Summary icon**: Use `ListChecks`.

## Visual Examples

### Mobile vs Desktop
- **Same behavior**: Progressive display works identically on mobile
- **Text truncation**: Use existing mobile truncation logic for long descriptions
- **Touch targets**: Maintain existing touch-friendly header heights

### Error Handling
- **Error tools**: Display in summary with error styling (red theme colors)
- **Mixed success/failure**: Summary shows total count regardless of status
- **Individual errors**: Error tools appear in progressive phase like normal tools

## Success Criteria

- [ ] Only one tool header visible during progressive phase
- [ ] Header content updates smoothly when new tools complete
- [ ] Summary header visually identical to tool headers
- [ ] Expanded summary uses same layout as individual tools
- [ ] No auto-expansion at any phase
- [ ] Smooth transition from progressive to summary phase
- [ ] Consistent behavior across mobile/desktop
- [ ] Grouping spans all assistant messages referencing the user parentID (tools + reasoning)

## Edge Cases

### Single Tool
- Progressive phase shows the single entry
- Summary mode is skipped so the entry remains standalone

### No Tools
- No header display (unchanged behavior)

### Rapid Tool Completion
- Header updates should handle quick succession gracefully
- No visual glitches during fast transitions

### Long-Running Tools
- Progressive display works regardless of completion timing
- No assumptions about tool execution order
